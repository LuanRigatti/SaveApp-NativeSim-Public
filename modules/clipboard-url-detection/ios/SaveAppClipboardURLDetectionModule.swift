import ExpoModulesCore
import UIKit

public final class SaveAppClipboardURLDetectionModule: Module {
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
          return [
            "changeCount": changeCount,
            "hasURLItem": hasURLItem,
            "hasProbableWebURL": detectedPatterns.contains(probableWebURL),
          ]
        } catch {
          return [
            "changeCount": pasteboard.changeCount,
            "hasURLItem": pasteboard.hasURLs,
            "hasProbableWebURL": false,
          ]
        }
      }

      return [
        "changeCount": pasteboard.changeCount,
        "hasURLItem": pasteboard.hasURLs,
        "hasProbableWebURL": false,
      ]
    }
  }
}
