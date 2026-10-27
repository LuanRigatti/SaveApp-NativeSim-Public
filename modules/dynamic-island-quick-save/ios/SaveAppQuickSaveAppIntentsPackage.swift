import AppIntents
internal import ExpoWidgets

/// Registers App Intents declared by the ExpoWidgets module with SaveApp.
@available(iOS 17.0, *)
struct SaveAppQuickSaveAppIntentsPackage: AppIntentsPackage {
  static var includedPackages: [any AppIntentsPackage.Type] {
    [ExpoWidgetsQuickSaveAppIntentsPackage.self]
  }
}
