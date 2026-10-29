import ExpoModulesCore
import OSLog
import UIKit

private enum SaveAppClipboardDiagnostics {
  static let logger = Logger(subsystem: "com.luanrigatti.saveapp", category: "diagnostics")
  static let allowedEvents: Set<String> = [
    "clipboard.snapshot.started", "clipboard.snapshot.completed", "clipboard.snapshot.failed",
    "clipboard.offer.check_started", "clipboard.offer.snapshot_unavailable",
    "clipboard.offer.quick_save_marker_matched", "clipboard.offer.no_candidate",
    "clipboard.offer.presented", "clipboard.offer.dismissed", "clipboard.offer.save_selected",
    "clipboard.offer.read_started", "clipboard.offer.read_url", "clipboard.offer.read_text",
    "clipboard.offer.change_count_changed", "clipboard.offer.read_empty",
    "clipboard.offer.read_failed", "clipboard.offer.candidate_dispatched",
    "clipboard.offer.candidate_invalid", "clipboard.offer.candidate_duplicate",
    "clipboard.offer.candidate_received", "clipboard.offer.marker_persistence_failed",
    "navigation.home.focused",
    "navigation.home.expanded_deep_link_received", "navigation.home.clipboard_suppressed",
    "navigation.home.clipboard_suppression_failed", "navigation.composer.route_opened",
    "navigation.composer.dynamic_island_source", "navigation.composer.other_source",
    "navigation.composer.token_present", "navigation.composer.token_missing",
    "navigation.composer.token_malformed",
    "navigation.composer.token_valid", "navigation.composer.token_invalid",
    "navigation.composer.clipboard_read_started", "navigation.composer.clipboard_read_url",
    "navigation.composer.clipboard_read_text", "navigation.composer.clipboard_changed",
    "navigation.composer.clipboard_empty", "navigation.composer.clipboard_read_failed",
    "navigation.composer.candidate_valid", "navigation.composer.candidate_invalid",
    "navigation.composer.candidate_duplicate", "navigation.composer.presented",
    "home.catalog.initialize_started", "home.catalog.initialize_completed",
    "home.catalog.initialize_failed", "home.catalog.refresh_requested",
    "home.catalog.refresh_from_home_focus",
    "home.catalog.refresh_coalesced", "home.catalog.refresh_completed",
    "home.catalog.refresh_failed", "home.catalog.app_foreground",
    "home.catalog.query_started", "home.catalog.query_completed_links_present",
    "home.catalog.query_completed_links_absent", "home.catalog.query_failed",
    "home.catalog.state_updated_links_present", "home.catalog.state_updated_links_absent",
    "home.gallery.awaiting_data", "home.gallery.content_hidden", "home.gallery.no_links_in_catalog",
    "home.gallery.links_visible", "home.gallery.links_filtered_out",
    "home.filter.all", "home.filter.folder", "home.filter.category", "home.filter.favorites",
    "quick_save.import.started", "quick_save.import.sqlite_commit_confirmed",
    "quick_save.import.duplicate_confirmed", "quick_save.import.queue_acknowledged",
    "quick_save.import.failed", "quick_save.import.container_unavailable"
  ]
}

public final class SaveAppClipboardURLDetectionModule: Module {
  private let quickSaveMarkerAppGroup = "group.com.luanrigatti.saveapp"
  private let quickSaveMarkerKey = "saveapp.dynamic-island.quick-save-clipboard-event-v1"

  public func definition() -> ModuleDefinition {
    Name("SaveAppClipboardURLDetection")

    Function("recordDiagnosticEvent") { (event: String) in
      guard SaveAppClipboardDiagnostics.allowedEvents.contains(event) else { return }
      SaveAppClipboardDiagnostics.logger.notice("event=\(event, privacy: .public)")
    }

    AsyncFunction("getDetectionSnapshotAsync") { () async -> [String: Any] in
      SaveAppClipboardDiagnostics.logger.notice("event=clipboard.snapshot.started")
      let pasteboard = UIPasteboard.general
      let probableWebURL: PartialKeyPath<UIPasteboard.DetectedValues> = \.probableWebURL

      for _ in 0..<2 {
        let changeCount = pasteboard.changeCount
        let hasURLItem = pasteboard.hasURLs
        do {
          let detectedPatterns = try await pasteboard.detectedPatterns(for: [probableWebURL])
          guard pasteboard.changeCount == changeCount else {
            SaveAppClipboardDiagnostics.logger.notice("event=clipboard.snapshot.changed_during_detection")
            continue
          }
          SaveAppClipboardDiagnostics.logger.notice(
            "event=clipboard.snapshot.completed has_url_item=\(hasURLItem, privacy: .public) probable_web_url=\(detectedPatterns.contains(probableWebURL), privacy: .public)"
          )
          return makeSnapshot(
            changeCount: changeCount,
            hasURLItem: hasURLItem,
            hasProbableWebURL: detectedPatterns.contains(probableWebURL)
          )
        } catch {
          SaveAppClipboardDiagnostics.logger.error("event=clipboard.snapshot.failed stage=detected_patterns")
          return makeSnapshot(
            changeCount: pasteboard.changeCount,
            hasURLItem: pasteboard.hasURLs,
            hasProbableWebURL: false
          )
        }
      }

      SaveAppClipboardDiagnostics.logger.error("event=clipboard.snapshot.failed stage=unstable_change_count")
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
      SaveAppClipboardDiagnostics.logger.notice("event=clipboard.snapshot.quick_save_marker=not_matched")
      return snapshot
    }

    SaveAppClipboardDiagnostics.logger.notice("event=clipboard.snapshot.quick_save_marker=matched")
    snapshot["quickSaveHandledChangeCount"] = handledChangeCount
    snapshot["quickSaveHandledSystemUptime"] = handledSystemUptime
    return snapshot
  }
}
