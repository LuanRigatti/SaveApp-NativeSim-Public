import AppIntents
import ExpoWidgets

/// Registers App Intents declared by the ExpoWidgets framework with SaveApp.
@available(iOS 16.0, *)
struct SaveAppQuickSaveAppIntentsPackage: AppIntentsPackage {
  static var includedPackages: [any AppIntentsPackage.Type] {
    [ExpoWidgetsQuickSaveAppIntentsPackage.self]
  }
}
