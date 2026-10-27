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
    guard let activityID, !activityID.isEmpty else {
      SaveAppQuickSaveLog.logger.error("intent.result=failed reason=missing_activity_id")
      return .result()
    }

    SaveAppQuickSaveLog.logger.info("intent.result=started")
    await SaveLinkQuickSaveCoordinator.shared.perform(activityID: activityID)
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

  func perform(activityID: String) async {
    guard activeActivityIDs.insert(activityID).inserted else {
      SaveAppQuickSaveLog.logger.notice("intent.result=ignored reason=already_processing")
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

    await updateActivity(activityID: activityID, status: .processing)
    SaveAppQuickSaveLog.logger.info("quick_save.stage=clipboard_read_started")

    let clipboard: ClipboardQuickSaveInput
    switch await readClipboardAfterExplicitAction() {
    case .value(let input):
      clipboard = input
      SaveAppQuickSaveLog.logger.info("quick_save.stage=clipboard_read_validated")
    case .empty:
      SaveAppQuickSaveLog.logger.notice("quick_save.result=invalid reason=clipboard_empty")
      await finish(activityID: activityID, status: .invalid, generation: generation)
      return
    case .unavailable:
      // The system may deny or defer pasteboard access. Keep this distinct from
      // an invalid URL so the UI offers a truthful retry state.
      SaveAppQuickSaveLog.logger.error("quick_save.result=failed reason=clipboard_unavailable")
      await finish(activityID: activityID, status: .failed, generation: generation)
      return
    }

    guard let normalized = SaveLinkQuickSaveSQLite.normalize(clipboard.value) else {
      SaveAppQuickSaveLog.logger.notice("quick_save.result=invalid reason=url_rejected")
      await finish(activityID: activityID, status: .invalid, generation: generation)
      return
    }

    SaveAppQuickSaveLog.logger.info("quick_save.stage=database_insert_started")
    do {
      let result = try SaveLinkQuickSaveSQLite.insertOrFindExisting(normalized)
      switch result {
      case .inserted:
        let markerWritten = ClipboardQuickSaveMarker.markHandled(changeCount: clipboard.changeCount)
        SaveAppQuickSaveLog.logger.info("quick_save.result=committed marker_written=\(markerWritten, privacy: .public)")
        await finish(activityID: activityID, status: .saved, generation: generation)
      case .alreadySaved:
        let markerWritten = ClipboardQuickSaveMarker.markHandled(changeCount: clipboard.changeCount)
        SaveAppQuickSaveLog.logger.info("quick_save.result=already_saved marker_written=\(markerWritten, privacy: .public)")
        await finish(activityID: activityID, status: .alreadySaved, generation: generation)
      }
    } catch let error as QuickSaveDatabaseError {
      SaveAppQuickSaveLog.logger.error("quick_save.result=failed database_stage=\(error.diagnosticStage, privacy: .public) sqlite_code=\(error.diagnosticSQLiteCode, privacy: .public)")
      await finish(activityID: activityID, status: .failed, generation: generation)
    } catch {
      SaveAppQuickSaveLog.logger.error("quick_save.result=failed database_stage=unexpected")
      await finish(activityID: activityID, status: .failed, generation: generation)
    }
  }

  private func finish(
    activityID: String,
    status: SaveLinkQuickSaveStatus,
    generation: UInt64
  ) async {
    let didSubmitResultStatus = await updateActivity(activityID: activityID, status: status)
    activeActivityIDs.remove(activityID)
    guard didSubmitResultStatus else { return }

    // Keep the committed result on screen longer to give ActivityKit time to render it.
    // This is best-effort; ActivityKit does not confirm that a submitted update was displayed.
    try? await Task.sleep(nanoseconds: Self.terminalStatusDisplayNanoseconds)
    guard requestGenerationByActivity[activityID] == generation,
          !activeActivityIDs.contains(activityID) else {
      return
    }
    _ = await updateActivity(activityID: activityID, status: .ready)
  }

  private func updateActivity(activityID: String, status: SaveLinkQuickSaveStatus) async -> Bool {
    guard let activity = Activity<LiveActivityAttributes>.activities.first(where: {
            $0.id == activityID && $0.content.state.name == "SaveAppSaveLink"
          }),
          let propsJSON = activity.content.state.props,
          let propsData = propsJSON.data(using: .utf8),
          var props = (try? JSONSerialization.jsonObject(with: propsData)) as? [String: Any] else {
      SaveAppQuickSaveLog.logger.error("activity_update.result=skipped reason=activity_or_props_not_found")
      return false
    }

    props["quickSaveStatus"] = status.rawValue
    guard let updatedData = try? JSONSerialization.data(withJSONObject: props, options: [.sortedKeys]),
          let updatedProps = String(data: updatedData, encoding: .utf8) else {
      SaveAppQuickSaveLog.logger.error("activity_update.result=failed reason=props_serialization")
      return false
    }

    let state = LiveActivityAttributes.ContentState(
      name: activity.content.state.name,
      props: updatedProps
    )
    await activity.update(ActivityContent(state: state, staleDate: nil))
    SaveAppQuickSaveLog.logger.info("activity_update.result=submitted state=\(status.rawValue, privacy: .public)")
    return true
  }

  @MainActor
  private func readClipboardAfterExplicitAction() -> ClipboardQuickSaveReadResult {
    let pasteboard = UIPasteboard.general
    let changeCount = pasteboard.changeCount
    guard pasteboard.hasURLs || pasteboard.hasStrings else {
      return .empty
    }

    let value = pasteboard.url?.absoluteString ?? pasteboard.string
    guard pasteboard.changeCount == changeCount, let value else {
      return .unavailable
    }
    guard !value.isEmpty else { return .empty }
    return .value(ClipboardQuickSaveInput(value: value, changeCount: changeCount))
  }
}

private enum ClipboardQuickSaveReadResult: Sendable {
  case empty
  case unavailable
  case value(ClipboardQuickSaveInput)
}

private struct ClipboardQuickSaveInput: Sendable {
  let value: String
  let changeCount: Int
}

private enum ClipboardQuickSaveMarker {
  static let appGroupIdentifier = "group.com.luanrigatti.saveapp"
  static let userDefaultsKey = "saveapp.dynamic-island.quick-save-clipboard-event-v1"

  static func markHandled(changeCount: Int) -> Bool {
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else {
      SaveAppQuickSaveLog.logger.error("clipboard_marker.result=unavailable")
      return false
    }
    defaults.set(
      [
        "changeCount": changeCount,
        "systemUptime": ProcessInfo.processInfo.systemUptime,
      ],
      forKey: userDefaultsKey
    )
    let synchronized = defaults.synchronize()
    if synchronized {
      SaveAppQuickSaveLog.logger.info("clipboard_marker.result=written")
    } else {
      SaveAppQuickSaveLog.logger.error("clipboard_marker.result=failed reason=synchronization_unconfirmed")
    }
    return synchronized
  }
}
