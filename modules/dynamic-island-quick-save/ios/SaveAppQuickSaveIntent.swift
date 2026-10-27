import ActivityKit
import AppIntents
import Foundation
import UIKit

let saveAppQuickSaveTarget = "saveapp.quickSave"

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
      return .result()
    }

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

  private var activeActivityIDs = Set<String>()
  private var requestGenerationByActivity: [String: UInt64] = [:]

  func perform(activityID: String) async {
    guard activeActivityIDs.insert(activityID).inserted else {
      return
    }
    defer { activeActivityIDs.remove(activityID) }
    let generation = (requestGenerationByActivity[activityID] ?? 0) &+ 1
    requestGenerationByActivity[activityID] = generation

    await updateActivity(activityID: activityID, status: .processing)

    let clipboard: ClipboardQuickSaveInput
    switch await readClipboardAfterExplicitAction() {
    case .value(let input):
      clipboard = input
    case .empty:
      await finish(activityID: activityID, status: .invalid, generation: generation)
      return
    case .unavailable:
      // The system may deny or defer pasteboard access. Keep this distinct from
      // an invalid URL so the UI offers a truthful retry state.
      await finish(activityID: activityID, status: .failed, generation: generation)
      return
    }

    guard let normalized = SaveLinkQuickSaveSQLite.normalize(clipboard.value) else {
      await finish(activityID: activityID, status: .invalid, generation: generation)
      return
    }

    do {
      let result = try SaveLinkQuickSaveSQLite.insertOrFindExisting(normalized)
      switch result {
      case .inserted:
        ClipboardQuickSaveMarker.markHandled(changeCount: clipboard.changeCount)
        await finish(activityID: activityID, status: .saved, generation: generation)
      case .alreadySaved:
        ClipboardQuickSaveMarker.markHandled(changeCount: clipboard.changeCount)
        await finish(activityID: activityID, status: .alreadySaved, generation: generation)
      }
    } catch {
      await finish(activityID: activityID, status: .failed, generation: generation)
    }
  }

  private func finish(
    activityID: String,
    status: SaveLinkQuickSaveStatus,
    generation: UInt64
  ) async {
    await updateActivity(activityID: activityID, status: status)
    // The result is already true at this point. Keep it visible briefly, then return
    // to the ready state without a repeating background timer. A newer tap wins.
    activeActivityIDs.remove(activityID)
    try? await Task.sleep(nanoseconds: 1_250_000_000)
    guard requestGenerationByActivity[activityID] == generation,
          !activeActivityIDs.contains(activityID) else {
      return
    }
    await updateActivity(activityID: activityID, status: .ready)
  }

  private func updateActivity(activityID: String, status: SaveLinkQuickSaveStatus) async {
    guard let activity = Activity<LiveActivityAttributes>.activities.first(where: {
            $0.id == activityID && $0.content.state.name == "SaveAppSaveLink"
          }),
          let propsJSON = activity.content.state.props,
          let propsData = propsJSON.data(using: .utf8),
          var props = (try? JSONSerialization.jsonObject(with: propsData)) as? [String: Any] else {
      return
    }

    props["quickSaveStatus"] = status.rawValue
    guard let updatedData = try? JSONSerialization.data(withJSONObject: props, options: [.sortedKeys]),
          let updatedProps = String(data: updatedData, encoding: .utf8) else {
      return
    }

    let state = LiveActivityAttributes.ContentState(
      name: activity.content.state.name,
      props: updatedProps
    )
    await activity.update(ActivityContent(state: state, staleDate: nil))
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

  static func markHandled(changeCount: Int) {
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else {
      return
    }
    defaults.set(
      [
        "changeCount": changeCount,
        "systemUptime": ProcessInfo.processInfo.systemUptime,
      ],
      forKey: userDefaultsKey
    )
    defaults.synchronize()
  }
}
