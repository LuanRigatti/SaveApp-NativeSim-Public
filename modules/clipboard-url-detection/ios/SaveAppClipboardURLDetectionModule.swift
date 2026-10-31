import ExpoModulesCore
import Darwin
import ImageIO
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

private enum SaveAppQuickSaveLockScreenFaviconStore {
  private static let appGroupIdentifier = "group.com.luanrigatti.saveapp"
  private static let historyDirectoryName = "QuickSaveQueue"
  private static let faviconDirectoryName = "Favicons"
  private static let historyFileName = "QuickSaveLockScreenRecentLinks.json"
  private static let visibleKey = "saveapp.dynamic-island.lock-screen-recents-visible-v1"
  private static let maximumHistoryBytes = 4 * 1_024
  private static let maximumSourceBytes = 256 * 1_024
  private static let maximumFaviconBytes = 64 * 1_024
  private static let fileProtection: FileProtectionType = .completeUntilFirstUserAuthentication

  static func associateContent(id: String, contentId: Int) -> Bool {
    guard isDigest(id), contentId > 0 else { return false }
    return withHistory { directory, links in
      guard let index = links.firstIndex(where: { ($0["id"] as? String) == id }) else { return false }
      links[index]["savedContentId"] = contentId
      return writeHistory(directory: directory, links: links)
    }
  }

  static func store(id: String, base64: String) -> Bool {
    guard isDigest(id),
          base64.utf8.count <= ((maximumSourceBytes + 2) / 3) * 4,
          let sourceData = Data(base64Encoded: base64),
          !sourceData.isEmpty,
          sourceData.count <= maximumSourceBytes,
          let pngData = makeFaviconPNG(sourceData),
          pngData.count <= maximumFaviconBytes,
          isValidPNG(pngData) else { return false }

    return withHistory { directory, links in
      guard UserDefaults(suiteName: appGroupIdentifier)?.bool(forKey: visibleKey) == true,
            let index = links.firstIndex(where: { ($0["id"] as? String) == id }) else { return false }

      let faviconDirectory = directory.appendingPathComponent(faviconDirectoryName, isDirectory: true)
      do {
        try FileManager.default.createDirectory(
          at: faviconDirectory,
          withIntermediateDirectories: true,
          attributes: [.protectionKey: fileProtection]
        )
        try FileManager.default.setAttributes([.protectionKey: fileProtection], ofItemAtPath: faviconDirectory.path)
      } catch {
        return false
      }

      let fileName = "favicon-\(id).png"
      let imageURL = faviconDirectory.appendingPathComponent(fileName, isDirectory: false)
      let previousLinks = links
      guard atomicWrite(pngData, to: imageURL, in: faviconDirectory),
            let verified = try? Data(contentsOf: imageURL, options: [.mappedIfSafe]),
            isValidPNG(verified) else {
        pruneObsoleteFavicons(in: faviconDirectory, links: previousLinks)
        return false
      }

      links[index]["faviconFileName"] = fileName
      guard writeHistory(directory: directory, links: links) else {
        pruneObsoleteFavicons(in: faviconDirectory, links: readHistory(in: directory) ?? previousLinks)
        return false
      }
      pruneObsoleteFavicons(in: faviconDirectory, links: links)
      return true
    }
  }

  private static func isDigest(_ value: String) -> Bool {
    value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
  }

  private static func expectedFileName(id: String) -> String { "favicon-\(id).png" }

  private static func withHistory(_ update: (URL, inout [[String: Any]]) -> Bool) -> Bool {
    guard let container = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: appGroupIdentifier
    ) else { return false }
    let directory = container.appendingPathComponent(historyDirectoryName, isDirectory: true)
    do {
      try FileManager.default.createDirectory(
        at: directory,
        withIntermediateDirectories: true,
        attributes: [.protectionKey: fileProtection]
      )
      try FileManager.default.setAttributes([.protectionKey: fileProtection], ofItemAtPath: directory.path)
    } catch { return false }

    let lockURL = directory.appendingPathComponent(".queue.lock", isDirectory: false)
    let descriptor = open(lockURL.path, O_CREAT | O_RDWR, mode_t(S_IRUSR | S_IWUSR))
    guard descriptor >= 0 else { return false }
    defer { _ = close(descriptor) }
    do {
      try FileManager.default.setAttributes([.protectionKey: fileProtection], ofItemAtPath: lockURL.path)
    } catch { return false }
    while flock(descriptor, LOCK_EX) != 0 {
      if errno == EINTR { continue }
      return false
    }
    defer { _ = flock(descriptor, LOCK_UN) }

    guard var links = readHistory(in: directory), update(directory, &links) else { return false }
    return true
  }

  private static func readHistory(in directory: URL) -> [[String: Any]]? {
    let url = directory.appendingPathComponent(historyFileName, isDirectory: false)
    guard let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey]),
          values.isRegularFile == true,
          let size = values.fileSize,
          size > 0,
          size <= maximumHistoryBytes,
          let data = try? Data(contentsOf: url, options: [.mappedIfSafe]),
          let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          (root["formatVersion"] as? Int) == 1,
          let links = root["links"] as? [[String: Any]],
          (1...3).contains(links.count),
          links.allSatisfy(isValidHistoryLink),
          Set(links.compactMap { $0["id"] as? String }).count == links.count else { return nil }
    if links.count > 1 {
      for index in 1..<links.count {
        guard let previousTime = links[index - 1]["createdAt"] as? Int64,
              let currentTime = links[index]["createdAt"] as? Int64,
              let previousId = links[index - 1]["id"] as? String,
              let currentId = links[index]["id"] as? String,
              previousTime > currentTime || (previousTime == currentTime && previousId < currentId) else { return nil }
      }
    }
    return links
  }

  private static func isValidHistoryLink(_ link: [String: Any]) -> Bool {
    guard let id = link["id"] as? String,
          isDigest(id),
          let domain = link["domain"] as? String,
          domain.utf8.count <= 253,
          domain.range(of: "^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$", options: [.regularExpression, .caseInsensitive]) != nil,
          let components = URLComponents(string: "https://\(domain)"),
          components.host == domain,
          let createdAt = link["createdAt"] as? Int64,
          createdAt > 0,
          createdAt <= Int64(Date().timeIntervalSince1970 * 1_000) + 60_000 else { return false }
    if let contentId = link["savedContentId"] as? Int, contentId <= 0 { return false }
    if let fileName = link["faviconFileName"] as? String, fileName != expectedFileName(id: id) { return false }
    return true
  }

  private static func writeHistory(directory: URL, links: [[String: Any]]) -> Bool {
    let root: [String: Any] = ["formatVersion": 1, "links": links]
    guard let data = try? JSONSerialization.data(withJSONObject: root, options: [.sortedKeys]),
          data.count <= maximumHistoryBytes else { return false }
    let destination = directory.appendingPathComponent(historyFileName, isDirectory: false)
    guard atomicWrite(data, to: destination, in: directory),
          let verified = readHistory(in: directory) else { return false }
    let matches = verified.count == links.count && zip(verified, links).allSatisfy { pair in
      let (current, expected) = pair
      return current["id"] as? String == expected["id"] as? String &&
        current["domain"] as? String == expected["domain"] as? String &&
        (current["createdAt"] as? Int64) == (expected["createdAt"] as? Int64) &&
        (current["savedContentId"] as? Int) == (expected["savedContentId"] as? Int) &&
        (current["faviconFileName"] as? String) == (expected["faviconFileName"] as? String)
    }
    if matches { pruneAbandonedHistoryTemporaries(in: directory) }
    return matches
  }

  private static func atomicWrite(_ data: Data, to destination: URL, in directory: URL) -> Bool {
    let temporary = directory.appendingPathComponent(".pending-\(UUID().uuidString).tmp", isDirectory: false)
    let descriptor = open(temporary.path, O_WRONLY | O_CREAT | O_EXCL, mode_t(S_IRUSR | S_IWUSR))
    guard descriptor >= 0 else { return false }
    var published = false
    defer {
      _ = close(descriptor)
      if !published { _ = unlink(temporary.path) }
    }
    do {
      try data.withUnsafeBytes { buffer in
        guard let base = buffer.baseAddress else { throw CocoaError(.fileWriteUnknown) }
        var offset = 0
        while offset < buffer.count {
          let count = Darwin.write(descriptor, base.advanced(by: offset), buffer.count - offset)
          if count < 0 {
            if errno == EINTR { continue }
            throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
          }
          guard count > 0 else { throw POSIXError(.EIO) }
          offset += count
        }
      }
      guard fsync(descriptor) == 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
      try FileManager.default.setAttributes([.protectionKey: fileProtection], ofItemAtPath: temporary.path)
      let result = temporary.path.withCString { source in
        destination.path.withCString { target in Darwin.rename(source, target) }
      }
      guard result == 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
      published = true
      let directoryDescriptor = open(directory.path, O_RDONLY)
      guard directoryDescriptor >= 0 else { return false }
      defer { _ = close(directoryDescriptor) }
      return fsync(directoryDescriptor) == 0
    } catch {
      return false
    }
  }

  private static func pruneObsoleteFavicons(in directory: URL, links: [[String: Any]]) {
    let referenced = Set(links.compactMap { $0["faviconFileName"] as? String })
    guard let files = try? FileManager.default.contentsOfDirectory(
      at: directory,
      includingPropertiesForKeys: [.isRegularFileKey],
      options: []
    ) else { return }
    for file in files {
      let name = file.lastPathComponent
      let isObsoleteFavicon = name.range(
        of: "^favicon-[a-f0-9]{64}\\.png$", options: .regularExpression
      ) != nil && !referenced.contains(name)
      let isAbandonedTemporary = name.range(
        of: "^\\.pending-[A-F0-9-]{36}\\.tmp$", options: [.regularExpression, .caseInsensitive]
      ) != nil
      guard isObsoleteFavicon || isAbandonedTemporary else { continue }
      guard (try? file.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true else { continue }
      try? FileManager.default.removeItem(at: file)
    }
  }

  private static func pruneAbandonedHistoryTemporaries(in directory: URL) {
    guard let files = try? FileManager.default.contentsOfDirectory(
      at: directory,
      includingPropertiesForKeys: [.isRegularFileKey],
      options: []
    ) else { return }
    for file in files where file.lastPathComponent.range(
      of: "^\\.pending-[A-F0-9-]{36}\\.tmp$", options: [.regularExpression, .caseInsensitive]
    ) != nil {
      guard (try? file.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true else { continue }
      try? FileManager.default.removeItem(at: file)
    }
  }

  private static func makeFaviconPNG(_ data: Data) -> Data? {
    let bytes = [UInt8](data.prefix(12))
    let isPNG = bytes.starts(with: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    let isJPEG = bytes.starts(with: [0xff, 0xd8, 0xff])
    let isGIF = bytes.starts(with: Array("GIF87a".utf8)) || bytes.starts(with: Array("GIF89a".utf8))
    let isWebP = bytes.count >= 12 && Array(bytes[0..<4]) == Array("RIFF".utf8) && Array(bytes[8..<12]) == Array("WEBP".utf8)
    let isICO = bytes.count >= 4 && bytes[0] == 0 && bytes[1] == 0 && bytes[2] == 1 && bytes[3] == 0
    guard isPNG || isJPEG || isGIF || isWebP || isICO,
          let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
    let frameCount = CGImageSourceGetCount(source)
    guard frameCount > 0, frameCount <= 64 else { return nil }
    var bestIndex = 0
    var bestArea = 0
    for index in 0..<frameCount {
      guard let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any],
            let width = properties[kCGImagePropertyPixelWidth] as? Int,
            let height = properties[kCGImagePropertyPixelHeight] as? Int,
            width > 0, height > 0, width <= 4_096, height <= 4_096,
            width * height <= 16_777_216 else { continue }
      if width * height > bestArea {
        bestArea = width * height
        bestIndex = index
      }
    }
    guard bestArea > 0,
          let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, bestIndex, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 96,
          ] as CFDictionary) else { return nil }

    let scale = min(96 / CGFloat(thumbnail.width), 96 / CGFloat(thumbnail.height))
    let size = CGSize(width: CGFloat(thumbnail.width) * scale, height: CGFloat(thumbnail.height) * scale)
    let rect = CGRect(x: (96 - size.width) / 2, y: (96 - size.height) / 2, width: size.width, height: size.height)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = false
    let normalized = UIGraphicsImageRenderer(size: CGSize(width: 96, height: 96), format: format).image { context in
      context.cgContext.clear(CGRect(x: 0, y: 0, width: 96, height: 96))
      UIImage(cgImage: thumbnail).draw(in: rect)
    }
    return normalized.pngData()
  }

  private static func isValidPNG(_ data: Data) -> Bool {
    guard data.count >= 24,
          data.count <= maximumFaviconBytes,
          data.prefix(8).elementsEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          let source = CGImageSourceCreateWithData(data as CFData, nil),
          CGImageSourceGetCount(source) > 0,
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          (properties[kCGImagePropertyPixelWidth] as? Int) == 96,
          (properties[kCGImagePropertyPixelHeight] as? Int) == 96 else { return false }
    return CGImageSourceCreateImageAtIndex(source, 0, nil) != nil
  }
}

public final class SaveAppClipboardURLDetectionModule: Module {
  private let quickSaveMarkerAppGroup = "group.com.luanrigatti.saveapp"
  private let quickSaveMarkerKey = "saveapp.dynamic-island.quick-save-clipboard-event-v1"
  private let lockScreenRecentLinksVisibleKey = "saveapp.dynamic-island.lock-screen-recents-visible-v1"
  private let quickSaveActivityStatusKey = "saveapp.dynamic-island.quick-save-status-v1"

  public func definition() -> ModuleDefinition {
    Name("SaveAppClipboardURLDetection")

    Function("getQuickSaveLockScreenSettings") { () -> [String: Any] in
      let defaults = UserDefaults(suiteName: self.quickSaveMarkerAppGroup)
      let allowedStatuses: Set<String> = ["ready", "processing", "queued", "alreadyQueued", "invalid", "failed"]
      let storedStatus = defaults?.string(forKey: self.quickSaveActivityStatusKey) ?? "ready"
      return [
        "showRecentLinks": defaults?.bool(forKey: self.lockScreenRecentLinksVisibleKey) ?? false,
        "quickSaveStatus": allowedStatuses.contains(storedStatus) ? storedStatus : "ready",
      ]
    }

    Function("setQuickSaveLockScreenRecentLinksVisible") { (visible: Bool) -> Bool in
      guard let defaults = UserDefaults(suiteName: self.quickSaveMarkerAppGroup) else { return false }
      defaults.set(visible, forKey: self.lockScreenRecentLinksVisibleKey)
      return defaults.bool(forKey: self.lockScreenRecentLinksVisibleKey) == visible
    }

    Function("associateQuickSaveLockScreenContent") { (id: String, savedContentId: Int) -> Bool in
      SaveAppQuickSaveLockScreenFaviconStore.associateContent(id: id, contentId: savedContentId)
    }

    Function("storeQuickSaveLockScreenFavicon") { (id: String, base64: String) -> Bool in
      SaveAppQuickSaveLockScreenFaviconStore.store(id: id, base64: base64)
    }

    Function("setQuickSaveActivityStatus") { (status: String) -> Bool in
      let allowedStatuses: Set<String> = ["ready", "processing", "queued", "alreadyQueued", "invalid", "failed"]
      guard allowedStatuses.contains(status),
            let defaults = UserDefaults(suiteName: self.quickSaveMarkerAppGroup) else { return false }
      defaults.set(status, forKey: self.quickSaveActivityStatusKey)
      return defaults.string(forKey: self.quickSaveActivityStatusKey) == status
    }

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
