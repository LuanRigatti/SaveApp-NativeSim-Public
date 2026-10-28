import ActivityKit
import AppIntents
import Foundation
import OSLog
import UIKit

let saveAppQuickSaveTarget = "saveapp.quickSave"

private enum SaveAppQuickSaveLog {
  static let logger = Logger(subsystem: "com.luanrigatti.saveapp", category: "quick-save.intent")
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
  case saved
  case alreadySaved
  case invalid
  case failed
}

private actor SaveLinkQuickSaveCoordinator {
  static let shared = SaveLinkQuickSaveCoordinator()
  private static let terminalStatusDisplayNanoseconds: UInt64 = 5_000_000_000

  private var activeActivityIDs = Set<String>()
  private var requestGenerationByActivity: [String: UInt64] = [:]

  func perform(activityID: String, operationID: String) async {
    guard activeActivityIDs.insert(activityID).inserted else {
      SaveAppQuickSaveLog.logger.notice("event=intent.rejected reason=already_processing operation=\(operationID, privacy: .public)")
      return
    }
    let generation = (requestGenerationByActivity[activityID] ?? 0) &+ 1
    requestGenerationByActivity[activityID] = generation
    defer {
      // A prior request can resume from its result-display sleep after a newer tap.
      // Only its own generation may release the in-flight guard.
      if requestGenerationByActivity[activityID] == generation {
        activeActivityIDs.remove(activityID)
      }
    }

    SaveAppQuickSaveLog.logger.notice("event=quick_save.operation.accepted operation=\(operationID, privacy: .public)")
    _ = await updateActivity(activityID: activityID, status: .processing, operationID: operationID)

    let clipboard: ClipboardQuickSaveInput
    switch await readClipboardAfterExplicitAction(operationID: operationID) {
    case .value(let input):
      clipboard = input
    case .empty:
      SaveAppQuickSaveLog.logger.notice("event=quick_save.operation.completed outcome=clipboard_empty operation=\(operationID, privacy: .public)")
      await finish(activityID: activityID, status: .invalid, generation: generation, operationID: operationID)
      return
    case .unavailable:
      // The system may deny or defer pasteboard access. Keep this distinct from
      // an invalid URL so the UI offers a truthful retry state.
      SaveAppQuickSaveLog.logger.error("event=quick_save.operation.failed stage=clipboard_read reason=unavailable operation=\(operationID, privacy: .public)")
      await finish(activityID: activityID, status: .failed, generation: generation, operationID: operationID)
      return
    }

    guard let normalized = SaveLinkQuickSaveSQLite.normalize(clipboard.value) else {
      SaveAppQuickSaveLog.logger.notice("event=clipboard.validation.result=invalid operation=\(operationID, privacy: .public)")
      SaveAppQuickSaveLog.logger.notice("event=quick_save.operation.completed outcome=url_invalid operation=\(operationID, privacy: .public)")
      await finish(activityID: activityID, status: .invalid, generation: generation, operationID: operationID)
      return
    }

    SaveAppQuickSaveLog.logger.notice("event=clipboard.validation.result=http_or_https operation=\(operationID, privacy: .public)")
    do {
      let result = try SaveLinkQuickSaveSQLite.insertOrFindExisting(normalized, operationID: operationID)
      switch result {
      case .inserted:
        SaveAppQuickSaveLog.logger.notice("event=quick_save.operation.completed outcome=sqlite_commit_confirmed operation=\(operationID, privacy: .public)")
        ClipboardQuickSaveMarker.markHandled(changeCount: clipboard.changeCount, operationID: operationID)
        await finish(activityID: activityID, status: .saved, generation: generation, operationID: operationID)
      case .alreadySaved:
        SaveAppQuickSaveLog.logger.notice("event=quick_save.operation.completed outcome=duplicate_confirmed operation=\(operationID, privacy: .public)")
        ClipboardQuickSaveMarker.markHandled(changeCount: clipboard.changeCount, operationID: operationID)
        await finish(activityID: activityID, status: .alreadySaved, generation: generation, operationID: operationID)
      }
    } catch let error as QuickSaveDatabaseError {
      SaveAppQuickSaveLog.logger.error("event=quick_save.operation.failed stage=sqlite_\(error.diagnosticStage, privacy: .public) sqlite_code=\(error.diagnosticSQLiteCode, privacy: .public) operation=\(operationID, privacy: .public)")
      await finish(activityID: activityID, status: .failed, generation: generation, operationID: operationID)
    } catch {
      SaveAppQuickSaveLog.logger.error("event=quick_save.operation.failed stage=sqlite_unexpected operation=\(operationID, privacy: .public)")
      await finish(activityID: activityID, status: .failed, generation: generation, operationID: operationID)
    }
  }

  private func finish(
    activityID: String,
    status: SaveLinkQuickSaveStatus,
    generation: UInt64,
    operationID: String
  ) async {
    let didSubmitResultStatus = await updateActivity(activityID: activityID, status: status, operationID: operationID)
    activeActivityIDs.remove(activityID)
    guard didSubmitResultStatus else {
      SaveAppQuickSaveLog.logger.error("event=quick_save.operation.visual_update_unavailable operation=\(operationID, privacy: .public)")
      return
    }

    // Keep the committed result on screen longer to give ActivityKit time to render it.
    // This is best-effort; ActivityKit does not confirm that a submitted update was displayed.
    SaveAppQuickSaveLog.logger.notice("event=activity.result_display.wait_started operation=\(operationID, privacy: .public)")
    do {
      try await Task.sleep(nanoseconds: Self.terminalStatusDisplayNanoseconds)
    } catch {
      SaveAppQuickSaveLog.logger.notice("event=activity.ready_restore.skipped reason=wait_cancelled operation=\(operationID, privacy: .public)")
      return
    }
    guard requestGenerationByActivity[activityID] == generation,
          !activeActivityIDs.contains(activityID) else {
      SaveAppQuickSaveLog.logger.notice("event=activity.ready_restore.skipped reason=newer_operation operation=\(operationID, privacy: .public)")
      return
    }
    SaveAppQuickSaveLog.logger.notice("event=activity.ready_restore.started operation=\(operationID, privacy: .public)")
    _ = await updateActivity(activityID: activityID, status: .ready, operationID: operationID)
  }

  private func updateActivity(
    activityID: String,
    status: SaveLinkQuickSaveStatus,
    operationID: String
  ) async -> Bool {
    SaveAppQuickSaveLog.logger.notice("event=activity.lookup.started requested_state=\(status.rawValue, privacy: .public) operation=\(operationID, privacy: .public)")
    guard let activity = Activity<LiveActivityAttributes>.activities.first(where: {
            $0.id == activityID && $0.content.state.name == "SaveAppSaveLink"
          }) else {
      SaveAppQuickSaveLog.logger.error("event=activity.lookup.result=not_found operation=\(operationID, privacy: .public)")
      return false
    }

    SaveAppQuickSaveLog.logger.notice("event=activity.lookup.result=found operation=\(operationID, privacy: .public)")
    guard let propsJSON = activity.content.state.props,
          let propsData = propsJSON.data(using: .utf8) else {
      SaveAppQuickSaveLog.logger.error("event=activity.props.result=missing operation=\(operationID, privacy: .public)")
      return false
    }
    guard var props = (try? JSONSerialization.jsonObject(with: propsData)) as? [String: Any] else {
      SaveAppQuickSaveLog.logger.error("event=activity.props.result=decode_failed operation=\(operationID, privacy: .public)")
      return false
    }
    let previousStatus = props["quickSaveStatus"] as? String ?? "unknown"
    SaveAppQuickSaveLog.logger.notice("event=activity.state.transition previous=\(previousStatus, privacy: .public) requested=\(status.rawValue, privacy: .public) operation=\(operationID, privacy: .public)")

    props["quickSaveStatus"] = status.rawValue
    guard let updatedData = try? JSONSerialization.data(withJSONObject: props, options: [.sortedKeys]),
          let updatedProps = String(data: updatedData, encoding: .utf8) else {
      SaveAppQuickSaveLog.logger.error("event=activity.update.result=serialization_failed operation=\(operationID, privacy: .public)")
      return false
    }

    let state = LiveActivityAttributes.ContentState(
      name: activity.content.state.name,
      props: updatedProps
    )
    SaveAppQuickSaveLog.logger.notice("event=activity.update.started state=\(status.rawValue, privacy: .public) operation=\(operationID, privacy: .public)")
    await activity.update(ActivityContent(state: state, staleDate: nil))
    SaveAppQuickSaveLog.logger.notice("event=activity.update.submitted state=\(status.rawValue, privacy: .public) operation=\(operationID, privacy: .public)")
    return true
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
