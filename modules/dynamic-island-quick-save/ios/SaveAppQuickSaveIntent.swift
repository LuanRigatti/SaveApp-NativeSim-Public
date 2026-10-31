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

/// Makes this pod module's App Intents metadata discoverable from the app bundle.
@available(iOS 17.0, *)
public struct ExpoWidgetsQuickSaveAppIntentsPackage: AppIntentsPackage {}

@available(iOS 17.0, *)
struct SaveLinkQuickSaveIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Salvar link do SaveApp"
  static var isDiscoverable = false
  static var openAppWhenRun = false

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
    await SaveLinkQuickSaveCoordinator.shared.perform(activityID: activityID, operationID: operationID)
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

  private var pendingOperations: [String: Task<Void, Never>] = [:]
  private var pendingOperationTickets: [String: UUID] = [:]
  private var pendingActivityUpdates: [String: Task<Void, Never>] = [:]
  private var pendingActivityUpdateTickets: [String: UUID] = [:]
  private var requestGenerationByActivity: [String: UInt64] = [:]

  func perform(activityID: String, operationID: String) async {
    let generation = (requestGenerationByActivity[activityID] ?? 0) &+ 1
    requestGenerationByActivity[activityID] = generation
    let ticket = UUID()
    let previous = pendingOperations[activityID]
    let operation = Task { [self] in
      await previous?.value
      await performSerially(activityID: activityID, operationID: operationID, generation: generation)
    }
    pendingOperations[activityID] = operation
    pendingOperationTickets[activityID] = ticket
    await operation.value
    if pendingOperationTickets[activityID] == ticket {
      pendingOperations.removeValue(forKey: activityID)
      pendingOperationTickets.removeValue(forKey: activityID)
    }
  }

  private func performSerially(activityID: String, operationID: String, generation: UInt64) async {
    SaveAppQuickSaveLog.logger.notice("event=quick_save.operation.accepted operation=\(operationID, privacy: .public)")

    let clipboard: ClipboardQuickSaveInput
    switch await readClipboardAfterExplicitAction(operationID: operationID) {
    case .value(let input):
      clipboard = input
    case .empty:
      SaveAppQuickSaveLog.logger.notice("event=quick_save.operation.completed outcome=clipboard_empty operation=\(operationID, privacy: .public)")
      enqueueActivityStatusSequence(
        activityID: activityID,
        statuses: [.invalid],
        generation: generation,
        operationID: operationID
      )
      return
    case .unavailable:
      // The system may deny or defer pasteboard access. Keep this distinct from
      // an invalid URL so the UI offers a truthful retry state.
      SaveAppQuickSaveLog.logger.error("event=quick_save.operation.failed stage=clipboard_read reason=unavailable operation=\(operationID, privacy: .public)")
      enqueueActivityStatusSequence(
        activityID: activityID,
        statuses: [.failed],
        generation: generation,
        operationID: operationID
      )
      return
    }

    guard let normalized = SaveLinkQuickSaveSQLite.normalize(clipboard.value) else {
      SaveAppQuickSaveLog.logger.notice("event=clipboard.validation.result=invalid operation=\(operationID, privacy: .public)")
      SaveAppQuickSaveLog.logger.notice("event=quick_save.operation.completed outcome=url_invalid operation=\(operationID, privacy: .public)")
      enqueueActivityStatusSequence(
        activityID: activityID,
        statuses: [.invalid],
        generation: generation,
        operationID: operationID
      )
      return
    }

    SaveAppQuickSaveLog.logger.notice("event=clipboard.validation.result=http_or_https operation=\(operationID, privacy: .public)")
    do {
      let result = try SaveAppQuickSaveQueue.enqueue(normalized)
      switch result {
      case .enqueued(let lockScreenHistoryUpdated):
        SaveAppQuickSaveLog.logger.notice("event=quick_save.operation.completed outcome=queue_write_confirmed operation=\(operationID, privacy: .public)")
        ClipboardQuickSaveMarker.markHandled(changeCount: clipboard.changeCount, operationID: operationID)
        guard lockScreenHistoryUpdated else {
          SaveAppQuickSaveLog.logger.error("event=quick_save.operation.visual_update_unavailable reason=history_write_failed operation=\(operationID, privacy: .public)")
          return
        }
        // The queue and recent-link summary are durable before ActivityKit is
        // scheduled. The App Intent returns without waiting for renderer delivery.
        enqueueActivityStatusSequence(
          activityID: activityID,
          statuses: [.processing, .queued],
          generation: generation,
          operationID: operationID
        )
      case .alreadyQueued(let lockScreenHistoryUpdated):
        SaveAppQuickSaveLog.logger.notice("event=quick_save.operation.completed outcome=already_queued operation=\(operationID, privacy: .public)")
        ClipboardQuickSaveMarker.markHandled(changeCount: clipboard.changeCount, operationID: operationID)
        guard lockScreenHistoryUpdated else {
          SaveAppQuickSaveLog.logger.error("event=quick_save.operation.visual_update_unavailable reason=history_write_failed operation=\(operationID, privacy: .public)")
          return
        }
        enqueueActivityStatusSequence(
          activityID: activityID,
          statuses: [.processing, .alreadyQueued],
          generation: generation,
          operationID: operationID
        )
      }
    } catch let error as QuickSaveQueueFailure {
      SaveAppQuickSaveLog.logger.error("event=quick_save.operation.failed stage=queue reason=\(error.diagnosticCode, privacy: .public) operation=\(operationID, privacy: .public)")
      enqueueActivityStatusSequence(
        activityID: activityID,
        statuses: [.failed],
        generation: generation,
        operationID: operationID
      )
    } catch {
      SaveAppQuickSaveLog.logger.error("event=quick_save.operation.failed stage=queue_unexpected operation=\(operationID, privacy: .public)")
      enqueueActivityStatusSequence(
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
  ) {
    let previous = pendingActivityUpdates[activityID]
    let ticket = UUID()
    let update = Task { [weak self] in
      await previous?.value
      guard let self else { return }
      await self.submitActivityStatusSequence(
        activityID: activityID,
        statuses: statuses,
        generation: generation,
        requiresCurrentGeneration: requiresCurrentGeneration,
        operationID: operationID
      )
      if self.pendingActivityUpdateTickets[activityID] == ticket {
        self.pendingActivityUpdates.removeValue(forKey: activityID)
        self.pendingActivityUpdateTickets.removeValue(forKey: activityID)
      }
    }
    pendingActivityUpdates[activityID] = update
    pendingActivityUpdateTickets[activityID] = ticket
  }

  private func submitActivityStatusSequence(
    activityID: String,
    statuses: [SaveLinkQuickSaveStatus],
    generation: UInt64,
    requiresCurrentGeneration: Bool,
    operationID: String
  ) async {
    guard !requiresCurrentGeneration || requestGenerationByActivity[activityID] == generation else {
      SaveAppQuickSaveLog.logger.notice("event=activity.update.skipped reason=newer_operation operation=\(operationID, privacy: .public)")
      return
    }

    for status in statuses {
      guard !requiresCurrentGeneration || requestGenerationByActivity[activityID] == generation else {
        SaveAppQuickSaveLog.logger.notice("event=activity.update.skipped reason=newer_operation operation=\(operationID, privacy: .public)")
        return
      }
      let submitted = await updateActivity(activityID: activityID, status: status, operationID: operationID)
      guard status == .queued || status == .alreadyQueued || status == .invalid || status == .failed else { continue }
      guard submitted else {
        SaveAppQuickSaveLog.logger.error("event=quick_save.operation.visual_update_unavailable operation=\(operationID, privacy: .public)")
        return
      }

      // This timer only restores the ready label after a real terminal result;
      // it is not used to update link times or run while the app is suspended.
      SaveAppQuickSaveLog.logger.notice("event=activity.result_display.wait_started operation=\(operationID, privacy: .public)")
      Task { [weak self] in
        do {
          try await Task.sleep(nanoseconds: Self.terminalStatusDisplayNanoseconds)
        } catch {
          SaveAppQuickSaveLog.logger.notice("event=activity.ready_restore.skipped reason=wait_cancelled operation=\(operationID, privacy: .public)")
          return
        }
        await self?.enqueueReadyRestoreIfCurrent(
          activityID: activityID,
          generation: generation,
          operationID: operationID
        )
      }
      return
    }
  }

  private func enqueueReadyRestoreIfCurrent(activityID: String, generation: UInt64, operationID: String) {
    guard requestGenerationByActivity[activityID] == generation else {
      SaveAppQuickSaveLog.logger.notice("event=activity.ready_restore.skipped reason=newer_operation operation=\(operationID, privacy: .public)")
      return
    }
    SaveAppQuickSaveLog.logger.notice("event=activity.ready_restore.started operation=\(operationID, privacy: .public)")
    enqueueActivityStatusSequence(
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
    SaveAppQuickSaveLog.logger.notice("event=activity.lookup.started requested_state=\(status.rawValue, privacy: .public) operation=\(operationID, privacy: .public)")
    let activities = Activity<LiveActivityAttributes>.activities
    guard !activities.isEmpty else {
      SaveAppQuickSaveLog.logger.error("event=activity.lookup.result=not_found reason=no_activity_available operation=\(operationID, privacy: .public)")
      return false
    }
    let matchingActivities = activities.filter { $0.id == activityID }
    guard !matchingActivities.isEmpty else {
      SaveAppQuickSaveLog.logger.error("event=activity.lookup.result=not_found reason=activity_id_not_found operation=\(operationID, privacy: .public)")
      return false
    }
    guard matchingActivities.count == 1 else {
      SaveAppQuickSaveLog.logger.error("event=activity.lookup.result=not_found reason=activity_id_ambiguous operation=\(operationID, privacy: .public)")
      return false
    }
    guard let activity = matchingActivities.first,
          activity.activityState == .active,
          activity.content.state.name == "SaveAppSaveLink" else {
      SaveAppQuickSaveLog.logger.error("event=activity.lookup.result=not_found reason=state_name_mismatch operation=\(operationID, privacy: .public)")
      return false
    }
    guard let propsJSON = activity.content.state.props,
          let propsData = propsJSON.data(using: .utf8),
          let baseProps = (try? JSONSerialization.jsonObject(with: propsData)) as? [String: Any] else {
      SaveAppQuickSaveLog.logger.error("event=activity.props.result=decode_failed operation=\(operationID, privacy: .public)")
      return false
    }
    let previousStatus = baseProps["quickSaveStatus"] as? String ?? "unknown"
    SaveAppQuickSaveLog.logger.notice("event=activity.state.transition previous=\(previousStatus, privacy: .public) requested=\(status.rawValue, privacy: .public) operation=\(operationID, privacy: .public)")

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
        SaveAppQuickSaveLog.logger.error("event=activity.lookup.result=not_found reason=activity_no_longer_active operation=\(operationID, privacy: .public)")
        return false
      }
      guard let history = SaveAppQuickSaveQueue.lockScreenHistoryForActivityUpdate() else {
        SaveAppQuickSaveLog.logger.error("event=activity.update.result=history_unavailable operation=\(operationID, privacy: .public)")
        return false
      }
      guard !history.showRecentLinks || history.snapshot != nil else {
        SaveAppQuickSaveLog.logger.error("event=activity.update.result=history_unavailable operation=\(operationID, privacy: .public)")
        return false
      }
      guard let state = makeState(
        snapshot: history.snapshot,
        showRecentLinks: history.showRecentLinks,
        removingFaviconsIfOversized: true
      ) else {
        SaveAppQuickSaveLog.logger.error("event=activity.update.result=content_state_invalid_or_too_large operation=\(operationID, privacy: .public)")
        return false
      }

      SaveAppQuickSaveLog.logger.notice("event=activity.update.started state=\(status.rawValue, privacy: .public) history_revision=\(history.snapshot?.revision ?? 0, privacy: .public) operation=\(operationID, privacy: .public)")
      await activity.update(ActivityContent(state: state, staleDate: nil))

      guard let latestHistory = SaveAppQuickSaveQueue.lockScreenHistoryForActivityUpdate() else {
        SaveAppQuickSaveLog.logger.error("event=activity.update.result=reconciliation_unavailable operation=\(operationID, privacy: .public)")
        return false
      }
      let privacyChanged = latestHistory.showRecentLinks != history.showRecentLinks
      let revisionChanged = history.showRecentLinks &&
        latestHistory.snapshot?.revision != history.snapshot?.revision
      if !privacyChanged && !revisionChanged {
        UserDefaults(suiteName: SaveAppQuickSaveQueue.appGroupIdentifier)?
          .set(status.rawValue, forKey: SaveAppQuickSaveQueue.quickSaveActivityStatusKey)
        SaveAppQuickSaveLog.logger.notice("event=activity.update.submitted state=\(status.rawValue, privacy: .public) history_revision=\(history.snapshot?.revision ?? 0, privacy: .public) delivery_confirmation=unavailable operation=\(operationID, privacy: .public)")
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
          SaveAppQuickSaveLog.logger.notice("event=activity.update.submitted state=\(status.rawValue, privacy: .public) history_redacted=true delivery_confirmation=unavailable operation=\(operationID, privacy: .public)")
          return true
        }
      }
    }
    SaveAppQuickSaveLog.logger.error("event=activity.update.result=reconciliation_limit operation=\(operationID, privacy: .public)")
    return false
  }

  @MainActor
  private func readClipboardAfterExplicitAction(operationID: String) -> ClipboardQuickSaveReadResult {
    SaveAppQuickSaveLog.logger.notice("event=clipboard.read.started source=live_activity_intent operation=\(operationID, privacy: .public)")
    let pasteboard = UIPasteboard.general
    let changeCount = pasteboard.changeCount
    let hasURL = pasteboard.hasURLs
    let hasString = pasteboard.hasStrings
    guard hasURL || hasString else {
      SaveAppQuickSaveLog.logger.notice("event=clipboard.read.result=empty type=none operation=\(operationID, privacy: .public)")
      return .empty
    }

    let value: String?
    let kind: ClipboardQuickSaveInput.Kind
    if hasURL, let url = pasteboard.url {
      kind = .url
      value = url.absoluteString
    } else if hasString {
      kind = .string
      value = pasteboard.string
    } else {
      SaveAppQuickSaveLog.logger.error("event=clipboard.read.result=unavailable reason=declared_type_missing_value operation=\(operationID, privacy: .public)")
      return .unavailable
    }
    SaveAppQuickSaveLog.logger.notice("event=clipboard.read.type=\(kind.rawValue, privacy: .public) operation=\(operationID, privacy: .public)")
    guard pasteboard.changeCount == changeCount else {
      SaveAppQuickSaveLog.logger.notice("event=clipboard.read.result=unavailable reason=change_count_changed operation=\(operationID, privacy: .public)")
      return .unavailable
    }
    guard let value else {
      SaveAppQuickSaveLog.logger.error("event=clipboard.read.result=unavailable reason=value_missing operation=\(operationID, privacy: .public)")
      return .unavailable
    }
    guard !value.isEmpty else {
      SaveAppQuickSaveLog.logger.notice("event=clipboard.read.result=empty type=\(kind.rawValue, privacy: .public) operation=\(operationID, privacy: .public)")
      return .empty
    }
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
