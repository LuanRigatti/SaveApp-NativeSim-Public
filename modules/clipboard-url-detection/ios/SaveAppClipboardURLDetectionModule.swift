import ExpoModulesCore
import UIKit

public final class SaveAppClipboardURLDetectionModule: Module {
  private let quickSaveMarkerAppGroup = "group.com.luanrigatti.saveapp"
  private let quickSaveMarkerKey = "saveapp.dynamic-island.quick-save-clipboard-event-v1"

  public func definition() -> ModuleDefinition {
    Name("SaveAppClipboardURLDetection")

    AsyncFunction("getDetectionSnapshotAsync") { () async -> [String: Any] in
      let pasteboard = UIPasteboard.general
      let probableWebURL: PartialKeyPath<UIPasteboard.DetectedValues> = \.probableWebURL

      for _ in 0..<2 {
        let changeCount = pasteboard.changeCount
        let hasURLItem = pasteboard.hasURLs
        do {
          let detectedPatterns = try await pasteboard.detectedPatterns(for: [probableWebURL])
          guard pasteboard.changeCount == changeCount else { continue }
          return makeSnapshot(
            changeCount: changeCount,
            hasURLItem: hasURLItem,
            hasProbableWebURL: detectedPatterns.contains(probableWebURL)
          )
        } catch {
          return makeSnapshot(
            changeCount: pasteboard.changeCount,
            hasURLItem: pasteboard.hasURLs,
            hasProbableWebURL: false
          )
        }
      }

      return makeSnapshot(
        changeCount: pasteboard.changeCount,
        hasURLItem: pasteboard.hasURLs,
        hasProbableWebURL: false
      )
    }
  }

  private func makeSnapshot(
    changeCount: Int,
    hasURLItem: Bool,
    hasProbableWebURL: Bool
  ) -> [String: Any] {
    let systemUptime = ProcessInfo.processInfo.systemUptime
    var snapshot: [String: Any] = [
      "changeCount": changeCount,
      "hasURLItem": hasURLItem,
      "hasProbableWebURL": hasProbableWebURL,
      "systemUptime": systemUptime,
    ]

    guard
      let defaults = UserDefaults(suiteName: quickSaveMarkerAppGroup),
      let marker = defaults.dictionary(forKey: quickSaveMarkerKey),
      let handledChangeCount = marker["changeCount"] as? Int,
      let handledSystemUptime = marker["systemUptime"] as? Double,
      handledChangeCount == changeCount,
      systemUptime >= handledSystemUptime
    else {
      return snapshot
    }

    snapshot["quickSaveHandledChangeCount"] = handledChangeCount
    snapshot["quickSaveHandledSystemUptime"] = handledSystemUptime
    return snapshot
  }
}
