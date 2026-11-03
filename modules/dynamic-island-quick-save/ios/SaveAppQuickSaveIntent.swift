import ActivityKit
import AppIntents
import Foundation
import OSLog
import UIKit

let saveAppQuickSaveTarget = "saveapp.quickSave"

private enum SaveAppQuickSaveLog {
  static let logger = Logger(subsystem: "com.luanrigatti.saveapp", category: "quick-save.intent")

  static var executionRole: String {
    switch Bundle.main.bundleURL.pathExtension.lowercased() {
    case "app": return "application"
    case "appex": return "extension"
    default: return "other"
    }
  }
}

private struct SaveAppQuickSaveDiagnosticEvent: Codable {
  let name: String
  let elapsedMilliseconds: Int
  let values: [String: String]
}

private struct SaveAppQuickSaveDiagnosticOperation: Codable {
  let operationID: String
  let startedAt: TimeInterval
  let startedUptime: TimeInterval
  let environment: [String: String]
  var events: [SaveAppQuickSaveDiagnosticEvent]
}

private struct SaveAppQuickSaveDiagnosticArchive: Codable {
  let schemaVersion: Int
  var operations: [SaveAppQuickSaveDiagnosticOperation]
}

/// Stores a small, metadata-only report in the existing App Group so a failed
/// physical-device attempt can be inspected in SaveApp without Xcode or raw logs.
private enum SaveAppQuickSaveDiagnostics {
  static let appGroupIdentifier = "group.com.luanrigatti.saveapp"
  static let userDefaultsKey = "saveapp.dynamic-island.quick-save-diagnostic-report-v1"
  private static let maximumOperations = 6
  private static let maximumEventsPerOperation = 48

  private static let allowedEventFields: [String: Set<String>] = [
    "intent.started": ["processRole", "activityIDPresent"],
    "clipboard.snapshot": ["changeCount", "itemCount", "hasURLs", "hasStrings", "applicationState", "sceneStates"],
    "clipboard.urlRepresentation": ["attempted", "valueAvailable", "schemeClass"],
    "clipboard.stringRepresentation": ["attempted", "valueAvailable"],
    "clipboard.readResult": ["result", "reason", "selectedRepresentation", "changeCountAfter", "changeCountChanged"],
    "quickSave.validation": ["result", "schemeClass"],
    "quickSave.queue": ["result", "historyUpdated"],
    "activity.lookup": ["requestedState", "result", "reason"],
    "activity.update": ["state", "phase", "historyRevision", "result"],
    "activity.readyRestore": ["phase", "reason"],
    "intent.returned": ["result"],
  ]

  static func begin(operationID: String, activityIDPresent: Bool) {
    let info = Bundle.main.infoDictionary ?? [:]
    let role = SaveAppQuickSaveLog.executionRole
    let environment: [String: String] = [
      "processRole": role,
      "runtimeOS": safeVersion(UIDevice.current.systemVersion),
      "target": simulatorTarget,
      "buildConfiguration": buildConfiguration,
      "appVersion": safeVersion(info["CFBundleShortVersionString"] as? String),
      "appBuild": safeVersion(info["CFBundleVersion"] as? String),
      "compiledSDK": safeSDKName(info["DTSDKName"] as? String),
      "xcodeVersion": safeVersion(info["DTXcode"] as? String),
      "xcodeBuild": safeVersion(info["DTXcodeBuild"] as? String),
      "appGroupAvailable": appGroupIsAvailable ? "true" : "false",
    ]

    guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else {
      SaveAppQuickSaveLog.logger.error("event=quick_save.diagnostics.write_failed reason=app_group_unavailable")
      return
    }

    var archive = readArchive(from: defaults)
    let operation = SaveAppQuickSaveDiagnosticOperation(
      operationID: operationID,
      startedAt: Date().timeIntervalSince1970,
      startedUptime: ProcessInfo.processInfo.systemUptime,
      environment: environment,
      events: []
    )
    archive.operations.append(operation)
    archive.operations = Array(archive.operations.suffix(maximumOperations))
    archive.operations[archive.operations.count - 1].events.append(
      SaveAppQuickSaveDiagnosticEvent(
        name: "intent.started",
        elapsedMilliseconds: 0,
        values: ["processRole": role, "activityIDPresent": activityIDPresent ? "true" : "false"]
      )
    )
    write(archive, to: defaults)
  }

  static func record(_ name: String, operationID: String, values: [String: String] = [:]) {
    guard let allowedFields = allowedEventFields[name],
          let defaults = UserDefaults(suiteName: appGroupIdentifier) else { return }
    let safeValues = values.reduce(into: [String: String]()) { result, entry in
      guard allowedFields.contains(entry.key), isSafeValue(entry.key, entry.value) else { return }
      result[entry.key] = entry.value
    }

    var archive = readArchive(from: defaults)
    guard let index = archive.operations.lastIndex(where: { $0.operationID == operationID }) else { return }
    let elapsed = max(0, Int((ProcessInfo.processInfo.systemUptime - archive.operations[index].startedUptime) * 1_000))
    archive.operations[index].events.append(
      SaveAppQuickSaveDiagnosticEvent(name: name, elapsedMilliseconds: elapsed, values: safeValues)
    )
    archive.operations[index].events = Array(archive.operations[index].events.suffix(maximumEventsPerOperation))
    write(archive, to: defaults)
  }

  private static func readArchive(from defaults: UserDefaults) -> SaveAppQuickSaveDiagnosticArchive {
    guard let data = defaults.data(forKey: userDefaultsKey),
          let archive = try? JSONDecoder().decode(SaveAppQuickSaveDiagnosticArchive.self, from: data),
          archive.schemaVersion == 1 else {
      return SaveAppQuickSaveDiagnosticArchive(schemaVersion: 1, operations: [])
    }
    return archive
  }

  private static func write(_ archive: SaveAppQuickSaveDiagnosticArchive, to defaults: UserDefaults) {
    guard let data = try? JSONEncoder().encode(archive) else {
      SaveAppQuickSaveLog.logger.error("event=quick_save.diagnostics.write_failed reason=encoding_failed")
      return
    }
    defaults.set(data, forKey: userDefaultsKey)
  }

  private static func isSafeValue(_ key: String, _ value: String) -> Bool {
    let booleanFields: Set<String> = ["activityIDPresent", "attempted", "valueAvailable", "hasURLs", "hasStrings", "changeCountChanged", "historyUpdated", "appGroupAvailable"]
    if booleanFields.contains(key) { return value == "true" || value == "false" }

    let numericFields: Set<String> = ["changeCount", "itemCount", "changeCountAfter", "historyRevision"]
    if numericFields.contains(key) { return value.range(of: "^-?[0-9]{1,16}$", options: .regularExpression) != nil }

    let enumeratedValues: [String: Set<String>] = [
      "processRole": ["application", "extension", "other"],
      "target": ["simulator", "device"],
      "buildConfiguration": ["debug", "release"],
      "applicationState": ["active", "inactive", "background", "unknown"],
      "schemeClass": ["http", "https", "other", "none"],
      "selectedRepresentation": ["url", "string", "none"],
      "result": ["empty", "unavailable", "completed", "invalid", "queued", "alreadyQueued", "failed", "found", "notFound", "submitted", "started", "skipped", "returned", "historyUnavailable", "reconciliationUnavailable", "reconciliationLimit", "contentStateInvalid"],
      "reason": ["none", "valueMissing", "declaredTypeMissingValue", "changeCountChanged", "activityUnavailable", "activityIDNotFound", "activityAmbiguous", "activityInactive", "propsInvalid", "historyUnavailable", "contentStateInvalid", "newerOperation", "cancelled", "queueError", "reconciliationUnavailable", "reconciliationLimit"],
      "requestedState": ["ready", "processing", "queued", "alreadyQueued", "invalid", "failed"],
      "state": ["ready", "processing", "queued", "alreadyQueued", "invalid", "failed"],
      "phase": ["started", "submitted", "failed", "skipped", "waitStarted", "waitInterrupted"],
    ]
    if key == "sceneStates" {
      let allowedStates: Set<String> = ["foregroundActive", "foregroundInactive", "background", "unattached", "unavailable"]
      let states = value.split(separator: ",").map(String.init)
      return !states.isEmpty && states.allSatisfy { allowedStates.contains($0) }
    }
    if let values = enumeratedValues[key] { return values.contains(value) }

    if ["runtimeOS", "appVersion", "appBuild", "xcodeVersion", "xcodeBuild"].contains(key) {
      return value == "unavailable" || value.range(of: "^[0-9.]{1,32}$", options: .regularExpression) != nil
    }
    if key == "compiledSDK" {
      return value == "unavailable" || value.range(of: "^(iphoneos|iphonesimulator)[0-9.]{1,24}$", options: .regularExpression) != nil
    }
    return false
  }

  private static func safeVersion(_ value: String?) -> String {
    guard let value, value.range(of: "^[0-9.]{1,32}$", options: .regularExpression) != nil else { return "unavailable" }
    return value
  }

  private static func safeSDKName(_ value: String?) -> String {
    guard let value, value.range(of: "^(iphoneos|iphonesimulator)[0-9.]{1,24}$", options: .regularExpression) != nil else { return "unavailable" }
    return value
  }

  private static var appGroupIsAvailable: Bool {
    UserDefaults(suiteName: appGroupIdentifier) != nil &&
      FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) != nil
  }

  private static var simulatorTarget: String {
#if targetEnvironment(simulator)
    return "simulator"
#else
    return "device"
#endif
  }

  private static var buildConfiguration: String {
#if DEBUG
    return "debug"
#else
    return "release"
#endif
  }

  fileprivate static func applicationStateName(_ state: UIApplication.State) -> String {
    switch state {
    case .active: return "active"
    case .inactive: return "inactive"
    case .background: return "background"
    @unknown default: return "unknown"
    }
  }

  fileprivate static func sceneActivationStateName(_ state: UIScene.ActivationState) -> String {
    switch state {
    case .foregroundActive: return "foregroundActive"
    case .foregroundInactive: return "foregroundInactive"
    case .background: return "background"
    case .unattached: return "unattached"
    @unknown default: return "unavailable"
    }
  }
}

/// Makes this pod module's App Intents metadata discoverable from the app bundle.
@available(iOS 17.0, *)
public struct ExpoWidgetsQuickSaveAppIntentsPackage: AppIntentsPackage {}

@available(iOS 17.0, *)
struct SaveLinkQuickSaveIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Salvar link do SaveApp"
  static var isDiscoverable = false
  static var openAppWhenRun = false

#if compiler(>=6.3)
  // ExpoWidgets is linked into both SaveApp and ExpoWidgetsTarget. On iOS 27,
  // explicitly keep this shared-framework intent in the process that owns the
  // ActivityKit activity instead of relying on the system's target heuristic.
  @available(iOS 27.0, *)
  static var allowedExecutionTargets: IntentExecutionTargets { .main }
#endif

  @Parameter(title: "Activity ID")
  var activityID: String?

  init() {}

  init(activityID: String?) {
    self.activityID = activityID
  }

  func perform() async throws -> some IntentResult {
    SaveAppQuickSaveLog.logger.notice("event=intent.execution_context role=\(SaveAppQuickSaveLog.executionRole, privacy: .public)")
    let hasActivityID = activityID?.isEmpty == false
    SaveAppQuickSaveLog.logger.notice("event=intent.perform.entered activity_id_present=\(hasActivityID, privacy: .public)")
    guard let activityID, !activityID.isEmpty else {
      SaveAppQuickSaveLog.logger.error("event=intent.rejected reason=missing_activity_id")
      return .result()
    }

    SaveAppQuickSaveLog.logger.notice("event=intent.activity_id.validated")
    let operationID = String(UUID().uuidString.prefix(8))
    SaveAppQuickSaveLog.logger.notice("event=intent.operation.started operation=\(operationID, privacy: .public)")
    SaveAppQuickSaveDiagnostics.begin(operationID: operationID, activityIDPresent: hasActivityID)
    await SaveLinkQuickSaveCoordinator.shared.perform(activityID: activityID, operationID: operationID)
    SaveAppQuickSaveDiagnostics.record("intent.returned", operationID: operationID, values: ["result": "returned"])
    SaveAppQuickSaveLog.logger.notice("event=intent.perform.returned operation=\(operationID, privacy: .public)")
    return .result()
  }
}

private enum SaveLinkQuickSaveStatus: String {
  case ready
  case processing
  case queued
  case alreadyQueued
  case invalid
  case failed
}

private actor SaveLinkQuickSaveCoordinator {
  static let shared = SaveLinkQuickSaveCoordinator()
  private static let terminalStatusDisplayNanoseconds: UInt64 = 5_000_000_000
  private static let maximumActivityContentStateBytes = 4 * 1_024

  private var pendingOperations: [String: Task<Bool, Never>] = [:]
  private var pendingOperationTickets: [String: UUID] = [:]
  private var pendingActivityUpdates: [String: Task<Bool, Never>] = [:]
  private var pendingActivityUpdateTickets: [String: UUID] = [:]
  private var requestGenerationByActivity: [String: UInt64] = [:]

  func perform(activityID: String, operationID: String) async {
    let generation = (requestGenerationByActivity[activityID] ?? 0) &+ 1
    requestGenerationByActivity[activityID] = generation
    let ticket = UUID()
    let previous = pendingOperations[activityID]
    let operation = Task { [self] in
      await previous?.value
      return await performSerially(activityID: activityID, operationID: operationID, generation: generation)
    }
    pendingOperations[activityID] = operation
    pendingOperationTickets[activityID] = ticket
    let terminalStatusSubmitted = await operation.value
    if pendingOperationTickets[activityID] == ticket {
      pendingOperations.removeValue(forKey: activityID)
      pendingOperationTickets.removeValue(forKey: activityID)
    }

    guard requestGenerationByActivity[activityID] == generation else {
      SaveAppQuickSaveLog.logger.notice("event=activity.ready_restore.skipped reason=newer_operation operation=\(operationID, privacy: .public)")
      return
    }

    guard terminalStatusSubmitted else {
      // A failed terminal update can leave an earlier processing/terminal
      // presentation visible. Do not wait for a result that was not submitted.
      await enqueueReadyRestoreIfCurrent(
        activityID: activityID,
        generation: generation,
        operationID: operationID
      )
      return
    }

    await restoreReadyAfterTerminalDisplayIfCurrent(
      activityID: activityID,
      generation: generation,
      operationID: operationID
    )
  }

  private func performSerially(activityID: String, operationID: String, generation: UInt64) async -> Bool {
    SaveAppQuickSaveLog.logger.notice("event=quick_save.operation.accepted operation=\(operationID, privacy: .public)")

    let clipboard: ClipboardQuickSaveInput
    switch await readClipboardAfterExplicitAction(operationID: operationID) {
    case .value(let input):
      clipboard = input
    case .empty:
      SaveAppQuickSaveDiagnostics.record("quickSave.validation", operationID: operationID, values: ["result": "empty"])
      SaveAppQuickSaveLog.logger.notice("event=quick_save.operation.completed outcome=clipboard_empty operation=\(operationID, privacy: .public)")
      return await enqueueActivityStatusSequence(
        activityID: activityID,
        statuses: [.invalid],
        generation: generation,
        operationID: operationID
      )
    case .unavailable:
      SaveAppQuickSaveDiagnostics.record("quickSave.validation", operationID: operationID, values: ["result": "unavailable"])
      // The system may deny or defer pasteboard access. Keep this distinct from
      // an invalid URL so the UI offers a truthful retry state.
      SaveAppQuickSaveLog.logger.error("event=quick_save.operation.failed stage=clipboard_read reason=unavailable operation=\(operationID, privacy: .public)")
      return await enqueueActivityStatusSequence(
        activityID: activityID,
        statuses: [.failed],
        generation: generation,
        operationID: operationID
      )
    }

    guard let normalized = SaveLinkQuickSaveSQLite.normalize(clipboard.value) else {
      SaveAppQuickSaveDiagnostics.record("quickSave.validation", operationID: operationID, values: ["result": "invalid", "schemeClass": "other"])
      SaveAppQuickSaveLog.logger.notice("event=clipboard.validation.result=invalid operation=\(operationID, privacy: .public)")
      SaveAppQuickSaveLog.logger.notice("event=quick_save.operation.completed outcome=url_invalid operation=\(operationID, privacy: .public)")
      return await enqueueActivityStatusSequence(
        activityID: activityID,
        statuses: [.invalid],
        generation: generation,
        operationID: operationID
      )
    }

    SaveAppQuickSaveLog.logger.notice("event=clipboard.validation.result=http_or_https operation=\(operationID, privacy: .public)")
    SaveAppQuickSaveDiagnostics.record(
      "quickSave.validation",
      operationID: operationID,
      values: ["result": "completed", "schemeClass": URL(string: normalized)?.scheme == "https" ? "https" : "http"]
    )
    do {
      let result = try SaveAppQuickSaveQueue.enqueue(normalized)
      switch result {
      case .enqueued(let lockScreenHistoryUpdated):
        SaveAppQuickSaveDiagnostics.record("quickSave.queue", operationID: operationID, values: ["result": "queued", "historyUpdated": lockScreenHistoryUpdated ? "true" : "false"])
        SaveAppQuickSaveLog.logger.notice("event=quick_save.operation.completed outcome=queue_write_confirmed operation=\(operationID, privacy: .public)")
        ClipboardQuickSaveMarker.markHandled(changeCount: clipboard.changeCount, operationID: operationID)
        guard lockScreenHistoryUpdated else {
          SaveAppQuickSaveLog.logger.error("event=quick_save.operation.visual_update_unavailable reason=history_write_failed operation=\(operationID, privacy: .public)")
          return false
        }
        // The queue and recent-link summary are durable before ActivityKit is
        // awaited. The intent waits for the local update attempt, not rendering.
        let submitted = await enqueueActivityStatusSequence(
          activityID: activityID,
          statuses: [.processing, .queued],
          generation: generation,
          operationID: operationID
        )
        return submitted
      case .alreadyQueued(let lockScreenHistoryUpdated):
        SaveAppQuickSaveDiagnostics.record("quickSave.queue", operationID: operationID, values: ["result": "alreadyQueued", "historyUpdated": lockScreenHistoryUpdated ? "true" : "false"])
        SaveAppQuickSaveLog.logger.notice("event=quick_save.operation.completed outcome=already_queued operation=\(operationID, privacy: .public)")
        ClipboardQuickSaveMarker.markHandled(changeCount: clipboard.changeCount, operationID: operationID)
        guard lockScreenHistoryUpdated else {
          SaveAppQuickSaveLog.logger.error("event=quick_save.operation.visual_update_unavailable reason=history_write_failed operation=\(operationID, privacy: .public)")
          return false
        }
        let submitted = await enqueueActivityStatusSequence(
          activityID: activityID,
          statuses: [.processing, .alreadyQueued],
          generation: generation,
          operationID: operationID
        )
        return submitted
      }
    } catch let error as QuickSaveQueueFailure {
      SaveAppQuickSaveDiagnostics.record("quickSave.queue", operationID: operationID, values: ["result": "failed", "historyUpdated": "false"])
      SaveAppQuickSaveLog.logger.error("event=quick_save.operation.failed stage=queue reason=\(error.diagnosticCode, privacy: .public) operation=\(operationID, privacy: .public)")
      return await enqueueActivityStatusSequence(
        activityID: activityID,
        statuses: [.failed],
        generation: generation,
        operationID: operationID
      )
    } catch {
      SaveAppQuickSaveDiagnostics.record("quickSave.queue", operationID: operationID, values: ["result": "failed", "historyUpdated": "false"])
      SaveAppQuickSaveLog.logger.error("event=quick_save.operation.failed stage=queue_unexpected operation=\(operationID, privacy: .public)")
      return await enqueueActivityStatusSequence(
        activityID: activityID,
        statuses: [.failed],
        generation: generation,
        operationID: operationID
      )
    }
  }

  private func enqueueActivityStatusSequence(
    activityID: String,
    statuses: [SaveLinkQuickSaveStatus],
    generation: UInt64,
    operationID: String,
    requiresCurrentGeneration: Bool = false
  ) async -> Bool {
    let previous = pendingActivityUpdates[activityID]
    let ticket = UUID()
    let update = Task { [weak self] in
      await previous?.value
      guard let self else { return false }
      let submitted = await self.submitActivityStatusSequence(
        activityID: activityID,
        statuses: statuses,
        generation: generation,
        requiresCurrentGeneration: requiresCurrentGeneration,
        operationID: operationID
      )
      await self.clearActivityStatusSequenceIfCurrent(activityID: activityID, ticket: ticket)
      return submitted
    }
    pendingActivityUpdates[activityID] = update
    pendingActivityUpdateTickets[activityID] = ticket
    return await update.value
  }

  private func clearActivityStatusSequenceIfCurrent(activityID: String, ticket: UUID) {
    guard pendingActivityUpdateTickets[activityID] == ticket else { return }
    pendingActivityUpdates.removeValue(forKey: activityID)
    pendingActivityUpdateTickets.removeValue(forKey: activityID)
  }

  private func submitActivityStatusSequence(
    activityID: String,
    statuses: [SaveLinkQuickSaveStatus],
    generation: UInt64,
    requiresCurrentGeneration: Bool,
    operationID: String
  ) async -> Bool {
    guard !requiresCurrentGeneration || requestGenerationByActivity[activityID] == generation else {
      SaveAppQuickSaveLog.logger.notice("event=activity.update.skipped reason=newer_operation operation=\(operationID, privacy: .public)")
      return false
    }

    for status in statuses {
      guard !requiresCurrentGeneration || requestGenerationByActivity[activityID] == generation else {
        SaveAppQuickSaveLog.logger.notice("event=activity.update.skipped reason=newer_operation operation=\(operationID, privacy: .public)")
        return false
      }
      let submitted = await updateActivity(activityID: activityID, status: status, operationID: operationID)
      guard status == .queued || status == .alreadyQueued || status == .invalid || status == .failed else { continue }
      guard submitted else {
        SaveAppQuickSaveLog.logger.error("event=quick_save.operation.visual_update_unavailable operation=\(operationID, privacy: .public)")
        return false
      }
      return true
    }
    return false
  }

  private func restoreReadyAfterTerminalDisplayIfCurrent(
    activityID: String,
    generation: UInt64,
    operationID: String
  ) async {
    SaveAppQuickSaveLog.logger.notice("event=activity.result_display.wait_started operation=\(operationID, privacy: .public)")
    SaveAppQuickSaveDiagnostics.record("activity.readyRestore", operationID: operationID, values: ["phase": "waitStarted", "reason": "none"])
    do {
      try await Task.sleep(nanoseconds: Self.terminalStatusDisplayNanoseconds)
    } catch {
      // If the system cancels the short display wait but the intent can still
      // run, attempt to restore immediately instead of leaving a terminal state.
      SaveAppQuickSaveLog.logger.notice("event=activity.result_display.wait_interrupted outcome=restore_attempted operation=\(operationID, privacy: .public)")
      SaveAppQuickSaveDiagnostics.record("activity.readyRestore", operationID: operationID, values: ["phase": "waitInterrupted", "reason": "cancelled"])
    }
    await enqueueReadyRestoreIfCurrent(
      activityID: activityID,
      generation: generation,
      operationID: operationID
    )
  }

  private func enqueueReadyRestoreIfCurrent(activityID: String, generation: UInt64, operationID: String) async {
    guard requestGenerationByActivity[activityID] == generation else {
      SaveAppQuickSaveDiagnostics.record("activity.readyRestore", operationID: operationID, values: ["phase": "skipped", "reason": "newerOperation"])
      SaveAppQuickSaveLog.logger.notice("event=activity.ready_restore.skipped reason=newer_operation operation=\(operationID, privacy: .public)")
      return
    }
    SaveAppQuickSaveLog.logger.notice("event=activity.ready_restore.started operation=\(operationID, privacy: .public)")
    SaveAppQuickSaveDiagnostics.record("activity.readyRestore", operationID: operationID, values: ["phase": "started", "reason": "none"])
    await enqueueActivityStatusSequence(
      activityID: activityID,
      statuses: [.ready],
      generation: generation,
      operationID: operationID,
      requiresCurrentGeneration: true
    )
  }

  private func updateActivity(
    activityID: String,
    status: SaveLinkQuickSaveStatus,
    operationID: String
  ) async -> Bool {
    let requestedState = status.rawValue
    SaveAppQuickSaveDiagnostics.record("activity.lookup", operationID: operationID, values: ["requestedState": requestedState, "result": "started", "reason": "none"])
    SaveAppQuickSaveLog.logger.notice("event=activity.lookup.started requested_state=\(requestedState, privacy: .public) operation=\(operationID, privacy: .public)")
    let activities = Activity<LiveActivityAttributes>.activities
    guard !activities.isEmpty else {
      SaveAppQuickSaveDiagnostics.record("activity.lookup", operationID: operationID, values: ["requestedState": requestedState, "result": "notFound", "reason": "activityUnavailable"])
      SaveAppQuickSaveLog.logger.error("event=activity.lookup.result=not_found reason=no_activity_available operation=\(operationID, privacy: .public)")
      return false
    }
    let matchingActivities = activities.filter { $0.id == activityID }
    guard !matchingActivities.isEmpty else {
      SaveAppQuickSaveDiagnostics.record("activity.lookup", operationID: operationID, values: ["requestedState": requestedState, "result": "notFound", "reason": "activityIDNotFound"])
      SaveAppQuickSaveLog.logger.error("event=activity.lookup.result=not_found reason=activity_id_not_found operation=\(operationID, privacy: .public)")
      return false
    }
    guard matchingActivities.count == 1 else {
      SaveAppQuickSaveDiagnostics.record("activity.lookup", operationID: operationID, values: ["requestedState": requestedState, "result": "notFound", "reason": "activityAmbiguous"])
      SaveAppQuickSaveLog.logger.error("event=activity.lookup.result=not_found reason=activity_id_ambiguous operation=\(operationID, privacy: .public)")
      return false
    }
    guard let activity = matchingActivities.first,
          activity.activityState == .active,
          activity.content.state.name == "SaveAppSaveLink" else {
      SaveAppQuickSaveDiagnostics.record("activity.lookup", operationID: operationID, values: ["requestedState": requestedState, "result": "notFound", "reason": "activityInactive"])
      SaveAppQuickSaveLog.logger.error("event=activity.lookup.result=not_found reason=state_name_mismatch operation=\(operationID, privacy: .public)")
      return false
    }
    guard let propsJSON = activity.content.state.props,
          let propsData = propsJSON.data(using: .utf8),
          let baseProps = (try? JSONSerialization.jsonObject(with: propsData)) as? [String: Any] else {
      SaveAppQuickSaveDiagnostics.record("activity.lookup", operationID: operationID, values: ["requestedState": requestedState, "result": "notFound", "reason": "propsInvalid"])
      SaveAppQuickSaveLog.logger.error("event=activity.props.result=decode_failed operation=\(operationID, privacy: .public)")
      return false
    }
    SaveAppQuickSaveDiagnostics.record("activity.lookup", operationID: operationID, values: ["requestedState": requestedState, "result": "found", "reason": "none"])
    let previousStatus = baseProps["quickSaveStatus"] as? String ?? "unknown"
    SaveAppQuickSaveLog.logger.notice("event=activity.state.transition previous=\(previousStatus, privacy: .public) requested=\(requestedState, privacy: .public) operation=\(operationID, privacy: .public)")

    func makeState(
      snapshot: QuickSaveLockScreenRecentLinksSnapshot?,
      showRecentLinks: Bool,
      removingFaviconsIfOversized: Bool = false
    ) -> LiveActivityAttributes.ContentState? {
      var props = baseProps
      props["quickSaveStatus"] = status.rawValue
      props["showRecentQuickSaveLinks"] = showRecentLinks
      props["recentQuickSaveLinksRevision"] = snapshot?.revision ?? (baseProps["recentQuickSaveLinksRevision"] as? Int64 ?? 0)
      props["recentQuickSaveLinks"] = showRecentLinks ? snapshot?.activityProps() ?? [] : []

      func encode(_ value: [String: Any]) -> LiveActivityAttributes.ContentState? {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
              let encodedProps = String(data: data, encoding: .utf8) else { return nil }
        return LiveActivityAttributes.ContentState(name: activity.content.state.name, props: encodedProps)
      }

      guard var state = encode(props) else { return nil }
      let encoder = JSONEncoder()
      if let encoded = try? encoder.encode(state),
         encoded.count > Self.maximumActivityContentStateBytes,
         showRecentLinks,
         removingFaviconsIfOversized {
        let compactLinks = (props["recentQuickSaveLinks"] as? [[String: Any]] ?? []).map { link -> [String: Any] in
          var compact = link
          compact.removeValue(forKey: "faviconUri")
          return compact
        }
        props["recentQuickSaveLinks"] = compactLinks
        guard let compactState = encode(props) else { return nil }
        state = compactState
      }
      guard let encodedState = try? encoder.encode(state),
            encodedState.count <= Self.maximumActivityContentStateBytes else { return nil }
      return state
    }

    for attempt in 0..<3 {
      guard activity.activityState == .active else {
        SaveAppQuickSaveDiagnostics.record("activity.update", operationID: operationID, values: ["state": requestedState, "phase": "failed", "result": "activityUnavailable"])
        SaveAppQuickSaveLog.logger.error("event=activity.lookup.result=not_found reason=activity_no_longer_active operation=\(operationID, privacy: .public)")
        return false
      }
      guard let history = SaveAppQuickSaveQueue.lockScreenHistoryForActivityUpdate() else {
        SaveAppQuickSaveDiagnostics.record("activity.update", operationID: operationID, values: ["state": requestedState, "phase": "failed", "result": "historyUnavailable"])
        SaveAppQuickSaveLog.logger.error("event=activity.update.result=history_unavailable operation=\(operationID, privacy: .public)")
        return false
      }
      guard !history.showRecentLinks || history.snapshot != nil else {
        SaveAppQuickSaveDiagnostics.record("activity.update", operationID: operationID, values: ["state": requestedState, "phase": "failed", "result": "historyUnavailable"])
        SaveAppQuickSaveLog.logger.error("event=activity.update.result=history_unavailable operation=\(operationID, privacy: .public)")
        return false
      }
      guard let state = makeState(
        snapshot: history.snapshot,
        showRecentLinks: history.showRecentLinks,
        removingFaviconsIfOversized: true
      ) else {
        SaveAppQuickSaveDiagnostics.record("activity.update", operationID: operationID, values: ["state": requestedState, "phase": "failed", "result": "contentStateInvalid"])
        SaveAppQuickSaveLog.logger.error("event=activity.update.result=content_state_invalid_or_too_large operation=\(operationID, privacy: .public)")
        return false
      }

      SaveAppQuickSaveLog.logger.notice("event=activity.update.started state=\(requestedState, privacy: .public) history_revision=\(history.snapshot?.revision ?? 0, privacy: .public) operation=\(operationID, privacy: .public)")
      SaveAppQuickSaveDiagnostics.record("activity.update", operationID: operationID, values: ["state": requestedState, "phase": "started", "historyRevision": String(history.snapshot?.revision ?? 0)])
      await activity.update(ActivityContent(state: state, staleDate: nil))

      guard let latestHistory = SaveAppQuickSaveQueue.lockScreenHistoryForActivityUpdate() else {
        SaveAppQuickSaveDiagnostics.record("activity.update", operationID: operationID, values: ["state": requestedState, "phase": "failed", "result": "historyUnavailable"])
        SaveAppQuickSaveLog.logger.error("event=activity.update.result=reconciliation_unavailable operation=\(operationID, privacy: .public)")
        return false
      }
      let privacyChanged = latestHistory.showRecentLinks != history.showRecentLinks
      let revisionChanged = history.showRecentLinks &&
        latestHistory.snapshot?.revision != history.snapshot?.revision
      if !privacyChanged && !revisionChanged {
        UserDefaults(suiteName: SaveAppQuickSaveQueue.appGroupIdentifier)?
          .set(status.rawValue, forKey: SaveAppQuickSaveQueue.quickSaveActivityStatusKey)
        SaveAppQuickSaveLog.logger.notice("event=activity.update.submitted state=\(requestedState, privacy: .public) history_revision=\(history.snapshot?.revision ?? 0, privacy: .public) delivery_confirmation=unavailable operation=\(operationID, privacy: .public)")
        SaveAppQuickSaveDiagnostics.record("activity.update", operationID: operationID, values: ["state": requestedState, "phase": "submitted", "historyRevision": String(history.snapshot?.revision ?? 0), "result": "submitted"])
        return true
      }
      SaveAppQuickSaveLog.logger.notice("event=activity.update.reconcile attempt=\(attempt + 1, privacy: .public) privacy_changed=\(privacyChanged, privacy: .public) revision_changed=\(revisionChanged, privacy: .public) operation=\(operationID, privacy: .public)")
      if attempt == 2 && history.showRecentLinks && !latestHistory.showRecentLinks {
        // Privacy revocation takes priority over a revision retry limit: submit
        // one final redacted state instead of leaving an older visible summary.
        guard let redactedState = makeState(
          snapshot: latestHistory.snapshot,
          showRecentLinks: false
        ) else { return false }
        await activity.update(ActivityContent(state: redactedState, staleDate: nil))
        guard let privacyCheck = SaveAppQuickSaveQueue.lockScreenHistoryForActivityUpdate() else {
          return false
        }
        if !privacyCheck.showRecentLinks {
          UserDefaults(suiteName: SaveAppQuickSaveQueue.appGroupIdentifier)?
            .set(status.rawValue, forKey: SaveAppQuickSaveQueue.quickSaveActivityStatusKey)
          SaveAppQuickSaveLog.logger.notice("event=activity.update.submitted state=\(requestedState, privacy: .public) history_redacted=true delivery_confirmation=unavailable operation=\(operationID, privacy: .public)")
          return true
        }
      }
    }
    SaveAppQuickSaveLog.logger.error("event=activity.update.result=reconciliation_limit operation=\(operationID, privacy: .public)")
    SaveAppQuickSaveDiagnostics.record("activity.update", operationID: operationID, values: ["state": requestedState, "phase": "failed", "result": "reconciliationLimit"])
    return false
  }

  @MainActor
  private func readClipboardAfterExplicitAction(operationID: String) -> ClipboardQuickSaveReadResult {
    SaveAppQuickSaveLog.logger.notice("event=clipboard.read.started source=live_activity_intent operation=\(operationID, privacy: .public)")
    let pasteboard = UIPasteboard.general
    let changeCount = pasteboard.changeCount
    let hasURL = pasteboard.hasURLs
    let hasString = pasteboard.hasStrings
    let itemCount = pasteboard.numberOfItems
    let appState = SaveAppQuickSaveDiagnostics.applicationStateName(UIApplication.shared.applicationState)
    let sceneStates = UIApplication.shared.connectedScenes
      .compactMap { ($0 as? UIWindowScene).map { SaveAppQuickSaveDiagnostics.sceneActivationStateName($0.activationState) } }
      .sorted()
      .joined(separator: ",")
    SaveAppQuickSaveDiagnostics.record(
      "clipboard.snapshot",
      operationID: operationID,
      values: [
        "changeCount": String(changeCount),
        "itemCount": String(itemCount),
        "hasURLs": hasURL ? "true" : "false",
        "hasStrings": hasString ? "true" : "false",
        "applicationState": appState,
        "sceneStates": sceneStates.isEmpty ? "unavailable" : sceneStates,
      ]
    )
    guard hasURL || hasString else {
      SaveAppQuickSaveDiagnostics.record("clipboard.readResult", operationID: operationID, values: ["result": "empty", "reason": "none", "selectedRepresentation": "none", "changeCountAfter": String(pasteboard.changeCount), "changeCountChanged": "false"])
      SaveAppQuickSaveLog.logger.notice("event=clipboard.read.result=empty type=none operation=\(operationID, privacy: .public)")
      return .empty
    }

    let value: String?
    let kind: ClipboardQuickSaveInput.Kind
    let url = hasURL ? pasteboard.url : nil
    SaveAppQuickSaveDiagnostics.record(
      "clipboard.urlRepresentation",
      operationID: operationID,
      values: [
        "attempted": hasURL ? "true" : "false",
        "valueAvailable": url == nil ? "false" : "true",
        "schemeClass": url.map { ["http", "https"].contains($0.scheme?.lowercased() ?? "") ? ($0.scheme?.lowercased() ?? "none") : "other" } ?? "none",
      ]
    )
    if let url {
      kind = .url
      value = url.absoluteString
    } else if hasString {
      kind = .string
      let stringValue = pasteboard.string
      value = stringValue
      SaveAppQuickSaveDiagnostics.record(
        "clipboard.stringRepresentation",
        operationID: operationID,
        values: ["attempted": "true", "valueAvailable": stringValue == nil ? "false" : "true"]
      )
    } else {
      SaveAppQuickSaveDiagnostics.record("clipboard.stringRepresentation", operationID: operationID, values: ["attempted": "false", "valueAvailable": "false"])
      SaveAppQuickSaveDiagnostics.record("clipboard.readResult", operationID: operationID, values: ["result": "unavailable", "reason": "declaredTypeMissingValue", "selectedRepresentation": "none", "changeCountAfter": String(pasteboard.changeCount), "changeCountChanged": "false"])
      SaveAppQuickSaveLog.logger.error("event=clipboard.read.result=unavailable reason=declared_type_missing_value operation=\(operationID, privacy: .public)")
      return .unavailable
    }
    if url != nil {
      SaveAppQuickSaveDiagnostics.record("clipboard.stringRepresentation", operationID: operationID, values: ["attempted": "false", "valueAvailable": "false"])
    }
    SaveAppQuickSaveLog.logger.notice("event=clipboard.read.type=\(kind.rawValue, privacy: .public) operation=\(operationID, privacy: .public)")
    let changeCountAfter = pasteboard.changeCount
    let changeCountChanged = changeCountAfter != changeCount
    guard !changeCountChanged else {
      SaveAppQuickSaveDiagnostics.record("clipboard.readResult", operationID: operationID, values: ["result": "unavailable", "reason": "changeCountChanged", "selectedRepresentation": kind.rawValue, "changeCountAfter": String(changeCountAfter), "changeCountChanged": "true"])
      SaveAppQuickSaveLog.logger.notice("event=clipboard.read.result=unavailable reason=change_count_changed operation=\(operationID, privacy: .public)")
      return .unavailable
    }
    guard let value else {
      SaveAppQuickSaveDiagnostics.record("clipboard.readResult", operationID: operationID, values: ["result": "unavailable", "reason": "valueMissing", "selectedRepresentation": kind.rawValue, "changeCountAfter": String(changeCountAfter), "changeCountChanged": "false"])
      SaveAppQuickSaveLog.logger.error("event=clipboard.read.result=unavailable reason=value_missing operation=\(operationID, privacy: .public)")
      return .unavailable
    }
    guard !value.isEmpty else {
      SaveAppQuickSaveDiagnostics.record("clipboard.readResult", operationID: operationID, values: ["result": "empty", "reason": "none", "selectedRepresentation": kind.rawValue, "changeCountAfter": String(changeCountAfter), "changeCountChanged": "false"])
      SaveAppQuickSaveLog.logger.notice("event=clipboard.read.result=empty type=\(kind.rawValue, privacy: .public) operation=\(operationID, privacy: .public)")
      return .empty
    }
    SaveAppQuickSaveDiagnostics.record("clipboard.readResult", operationID: operationID, values: ["result": "completed", "reason": "none", "selectedRepresentation": kind.rawValue, "changeCountAfter": String(changeCountAfter), "changeCountChanged": "false"])
    SaveAppQuickSaveLog.logger.notice("event=clipboard.read.result=completed operation=\(operationID, privacy: .public)")
    return .value(ClipboardQuickSaveInput(value: value, changeCount: changeCount, kind: kind))
  }
}

private enum ClipboardQuickSaveReadResult: Sendable {
  case empty
  case unavailable
  case value(ClipboardQuickSaveInput)
}

private struct ClipboardQuickSaveInput: Sendable {
  enum Kind: String, Sendable {
    case url
    case string
  }

  let value: String
  let changeCount: Int
  let kind: Kind
}

private enum ClipboardQuickSaveMarker {
  static let appGroupIdentifier = "group.com.luanrigatti.saveapp"
  static let userDefaultsKey = "saveapp.dynamic-island.quick-save-clipboard-event-v1"

  static func markHandled(changeCount: Int, operationID: String) {
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else {
      SaveAppQuickSaveLog.logger.error("event=clipboard_marker.result=unavailable operation=\(operationID, privacy: .public)")
      return
    }
    defaults.set(
      [
        "changeCount": changeCount,
        "systemUptime": ProcessInfo.processInfo.systemUptime,
      ],
      forKey: userDefaultsKey
    )
    if defaults.synchronize() {
      SaveAppQuickSaveLog.logger.notice("event=clipboard_marker.result=written operation=\(operationID, privacy: .public)")
    } else {
      SaveAppQuickSaveLog.logger.error("event=clipboard_marker.result=failed reason=synchronization_unconfirmed operation=\(operationID, privacy: .public)")
    }
  }
}
