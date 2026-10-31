import CryptoKit
import Darwin
import Foundation
import ImageIO
import OSLog

struct QuickSaveQueueRecord: Codable, Equatable {
  let formatVersion: Int
  let operationID: String
  let url: String
  let normalizedURL: String
  let createdAt: Int64
  let title: String
  let domain: String
}

struct QuickSaveLockScreenRecentLink: Codable, Equatable, Sendable {
  let id: String
  let domain: String
  let createdAt: Int64
  var savedContentId: Int? = nil
  var faviconFileName: String? = nil
}

private struct QuickSaveLockScreenRecentLinksFile: Codable, Equatable {
  let formatVersion: Int
  let revision: Int64
  var links: [QuickSaveLockScreenRecentLink]

  private enum CodingKeys: String, CodingKey {
    case formatVersion
    case revision
    case links
  }

  init(formatVersion: Int, revision: Int64, links: [QuickSaveLockScreenRecentLink]) {
    self.formatVersion = formatVersion
    self.revision = revision
    self.links = links
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    formatVersion = try container.decode(Int.self, forKey: .formatVersion)
    // Version 1 summaries predate revisions and remain readable as revision 0.
    revision = try container.decodeIfPresent(Int64.self, forKey: .revision) ?? 0
    links = try container.decode([QuickSaveLockScreenRecentLink].self, forKey: .links)
  }
}

struct QuickSaveLockScreenRecentLinksSnapshot: Sendable {
  let revision: Int64
  let links: [QuickSaveLockScreenRecentLink]

  func activityProps() -> [[String: Any]] {
    links.map { link in
      var result: [String: Any] = [
        "domain": link.domain,
        "createdAt": link.createdAt,
      ]
      if let fileName = link.faviconFileName,
         let uri = SaveAppQuickSaveQueue.validFaviconURLForActivity(fileName: fileName, id: link.id) {
        result["faviconUri"] = uri.absoluteString
      }
      return result
    }
  }
}

struct QuickSaveLockScreenActivityHistory: Sendable {
  let snapshot: QuickSaveLockScreenRecentLinksSnapshot?
  let showRecentLinks: Bool
}

enum QuickSaveQueueWriteResult {
  case enqueued(lockScreenHistoryUpdated: Bool)
  case alreadyQueued(lockScreenHistoryUpdated: Bool)
}

enum QuickSaveQueueFailure: Error {
  case unavailable
  case lockTimeout
  case invalidRecord
  case capacityExceeded
  case io(Int32)

  var diagnosticCode: String {
    switch self {
    case .unavailable: return "app_group_unavailable"
    case .lockTimeout: return "app_group_lock_timeout"
    case .invalidRecord: return "record_invalid"
    case .capacityExceeded: return "capacity_exceeded"
    case .io(let code): return "io_\(code)"
    }
  }
}

enum SaveAppQuickSaveQueue {
  static let appGroupIdentifier = "group.com.luanrigatti.saveapp"
  static let directoryName = "QuickSaveQueue"
  static let formatVersion = 1
  static let maximumPendingRecords = 1_000
  static let maximumRecordBytes = 16 * 1_024
  static let lockScreenRecentLinksFileName = "QuickSaveLockScreenRecentLinks.json"
  static let lockScreenRecentLinksVersion = 2
  private static let maximumLockScreenHistoryRevision: Int64 = 9_007_199_254_740_991
  static let maximumLockScreenRecentLinks = 3
  static let lockScreenFaviconDirectoryName = "Favicons"
  static let maximumLockScreenFaviconBytes = 64 * 1_024
  static let lockScreenRecentLinksVisibleKey = "saveapp.dynamic-island.lock-screen-recents-visible-v1"
  static let quickSaveActivityStatusKey = "saveapp.dynamic-island.quick-save-status-v1"
  private static let maximumLockScreenRecentLinksBytes = 4 * 1_024
  private static let fileLockTimeoutNanoseconds: UInt64 = 1_000_000_000
  private static let fileLockRetryInterval: TimeInterval = 0.01
  private static let logger = Logger(subsystem: "com.luanrigatti.saveapp", category: "quick-save.queue")
  private static let fileProtection: FileProtectionType = .completeUntilFirstUserAuthentication

  static func enqueue(
    _ link: NormalizedQuickSaveLink,
    createdAt: Int64 = Int64(Date().timeIntervalSince1970 * 1_000)
  ) throws -> QuickSaveQueueWriteResult {
    guard link.url.utf8.count <= 8_192,
          !link.url.isEmpty,
          link.domain.utf8.count <= 253,
          link.title.utf8.count <= 120 else {
      throw QuickSaveQueueFailure.invalidRecord
    }

    logger.notice("event=quick_save.queue.write_started")
    guard let sharedContainer = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: appGroupIdentifier
    ) else {
      logger.error("event=quick_save.queue.write_failed reason=app_group_unavailable")
      throw QuickSaveQueueFailure.unavailable
    }

    let directory = sharedContainer.appendingPathComponent(directoryName, isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      try FileManager.default.setAttributes([.protectionKey: fileProtection], ofItemAtPath: directory.path)
    } catch {
      logger.error("event=quick_save.queue.write_failed reason=directory_unavailable")
      throw QuickSaveQueueFailure.unavailable
    }

    return try withExclusiveFileLock(in: directory) {
      cleanStaleTemporaryFiles(in: directory)
      let fileName = queueFileName(for: link.url)
      let destination = directory.appendingPathComponent(fileName, isDirectory: false)

      if FileManager.default.fileExists(atPath: destination.path) {
        guard let existing = try readAndValidateRecord(at: destination),
              existing.normalizedURL == link.url else {
          logger.error("event=quick_save.queue.write_failed reason=existing_record_invalid")
          throw QuickSaveQueueFailure.invalidRecord
        }
        let historyUpdated = updateLockScreenRecentLinksBestEffort(existing, in: directory)
        logger.notice("event=quick_save.queue.duplicate")
        return .alreadyQueued(lockScreenHistoryUpdated: historyUpdated)
      }

      let pendingCount = try FileManager.default.contentsOfDirectory(
        at: directory,
        includingPropertiesForKeys: [.isRegularFileKey],
        options: [.skipsHiddenFiles]
      ).filter { $0.lastPathComponent.range(of: "^[a-f0-9]{64}\\.json$", options: .regularExpression) != nil }.count
      guard pendingCount < maximumPendingRecords else {
        logger.error("event=quick_save.queue.write_failed reason=capacity_exceeded")
        throw QuickSaveQueueFailure.capacityExceeded
      }

      let record = QuickSaveQueueRecord(
        formatVersion: formatVersion,
        operationID: UUID().uuidString,
        url: link.url,
        normalizedURL: link.url,
        createdAt: createdAt,
        title: link.title,
        domain: link.domain
      )
      let encoder = JSONEncoder()
      encoder.outputFormatting = [.sortedKeys]
      let data = try encoder.encode(record)
      guard data.count <= maximumRecordBytes else {
        throw QuickSaveQueueFailure.invalidRecord
      }

      try writeAtomically(data, to: destination, in: directory)
      guard let persisted = try readAndValidateRecord(at: destination), persisted == record else {
        logger.error("event=quick_save.queue.write_failed reason=persistence_verification_failed")
        throw QuickSaveQueueFailure.io(EIO)
      }

      let historyUpdated = updateLockScreenRecentLinksBestEffort(record, in: directory)
      logger.notice("event=quick_save.queue.write_confirmed")
      return .enqueued(lockScreenHistoryUpdated: historyUpdated)
    }
  }

  static func lockScreenRecentLinks() -> [QuickSaveLockScreenRecentLink] {
    guard let container = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: appGroupIdentifier
    ) else { return [] }
    let directory = container.appendingPathComponent(directoryName, isDirectory: true)
    guard FileManager.default.fileExists(atPath: directory.path) else { return [] }
    do {
      return try withExclusiveFileLock(in: directory) {
        readLockScreenRecentLinks(in: directory)?.links ?? []
      }
    } catch {
      logger.notice("event=quick_save.lock_screen_history.read_failed")
      return []
    }
  }

  /// Reads the revision and privacy preference atomically. The shared file lock
  /// is released before callers submit any asynchronous ActivityKit update.
  static func lockScreenHistoryForActivityUpdate() -> QuickSaveLockScreenActivityHistory? {
    guard let sharedContainer = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: appGroupIdentifier
    ) else { return nil }
    let directory = sharedContainer.appendingPathComponent(directoryName, isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      try FileManager.default.setAttributes([.protectionKey: fileProtection], ofItemAtPath: directory.path)
      return try withExclusiveFileLock(in: directory) {
        let historyURL = directory.appendingPathComponent(lockScreenRecentLinksFileName, isDirectory: false)
        let snapshot: QuickSaveLockScreenRecentLinksSnapshot?
        if FileManager.default.fileExists(atPath: historyURL.path) {
          snapshot = readLockScreenRecentLinks(in: directory).map {
            QuickSaveLockScreenRecentLinksSnapshot(revision: $0.revision, links: $0.links)
          }
        } else {
          snapshot = QuickSaveLockScreenRecentLinksSnapshot(revision: 0, links: [])
        }
        let showRecentLinks = UserDefaults(suiteName: appGroupIdentifier)?
          .bool(forKey: lockScreenRecentLinksVisibleKey) ?? false
        return QuickSaveLockScreenActivityHistory(snapshot: snapshot, showRecentLinks: showRecentLinks)
      }
    } catch {
      logger.notice("event=quick_save.lock_screen_history.activity_read_failed")
      return nil
    }
  }

  private static func updateLockScreenRecentLinksBestEffort(
    _ record: QuickSaveQueueRecord,
    in directory: URL
  ) -> Bool {
    do {
      let historyURL = directory.appendingPathComponent(lockScreenRecentLinksFileName, isDirectory: false)
      let previousFile: QuickSaveLockScreenRecentLinksFile?
      if FileManager.default.fileExists(atPath: historyURL.path) {
        guard let existing = readLockScreenRecentLinks(in: directory) else {
          throw QuickSaveQueueFailure.invalidRecord
        }
        previousFile = existing
      } else {
        previousFile = nil
      }
      var links = previousFile?.links ?? []
      let id = String(queueFileName(for: record.normalizedURL).dropLast(".json".count))
      let previous = links.first(where: { $0.id == id })
      let entry = QuickSaveLockScreenRecentLink(
        id: id,
        domain: record.domain,
        createdAt: record.createdAt,
        savedContentId: previous?.savedContentId,
        faviconFileName: previous?.faviconFileName
      )
      links.removeAll { $0.id == entry.id }
      links.append(entry)
      links.sort {
        if $0.createdAt != $1.createdAt { return $0.createdAt > $1.createdAt }
        return $0.id < $1.id
      }
      let (revision, overflow) = (previousFile?.revision ?? 0).addingReportingOverflow(1)
      guard !overflow, revision > 0, revision <= maximumLockScreenHistoryRevision else {
        throw QuickSaveQueueFailure.invalidRecord
      }
      let file = QuickSaveLockScreenRecentLinksFile(
        formatVersion: lockScreenRecentLinksVersion,
        revision: revision,
        links: Array(links.prefix(maximumLockScreenRecentLinks))
      )
      let encoder = JSONEncoder()
      encoder.outputFormatting = [.sortedKeys]
      let data = try encoder.encode(file)
      guard data.count <= maximumLockScreenRecentLinksBytes else {
        throw QuickSaveQueueFailure.invalidRecord
      }
      let destination = directory.appendingPathComponent(lockScreenRecentLinksFileName, isDirectory: false)
      try writeAtomically(data, to: destination, in: directory)
      guard let verified = readLockScreenRecentLinks(in: directory), verified == file else {
        throw QuickSaveQueueFailure.io(EIO)
      }
      pruneObsoleteFavicons(in: directory, referencedNames: Set(file.links.compactMap(\.faviconFileName)))
      logger.notice("event=quick_save.lock_screen_history.write_confirmed count=\(file.links.count, privacy: .public)")
      return true
    } catch {
      // The durable queue record is authoritative. A summary failure must never turn a
      // confirmed Quick Save into a failed save or remove it from the import queue.
      logger.notice("event=quick_save.lock_screen_history.write_failed")
      return false
    }
  }

  private static func readLockScreenRecentLinks(in directory: URL) -> QuickSaveLockScreenRecentLinksFile? {
    let url = directory.appendingPathComponent(lockScreenRecentLinksFileName, isDirectory: false)
    guard let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey]),
          values.isRegularFile == true,
          let size = values.fileSize,
          size > 0,
          size <= maximumLockScreenRecentLinksBytes,
          let data = try? Data(contentsOf: url, options: [.mappedIfSafe]),
          let decoded = try? JSONDecoder().decode(QuickSaveLockScreenRecentLinksFile.self, from: data),
          (decoded.formatVersion == 1 || decoded.formatVersion == lockScreenRecentLinksVersion),
          decoded.revision >= 0,
          decoded.revision <= maximumLockScreenHistoryRevision,
          (decoded.formatVersion == 1 ? decoded.revision == 0 : decoded.revision > 0),
          decoded.links.count <= maximumLockScreenRecentLinks,
          decoded.links.allSatisfy(isValidLockScreenRecentLink),
          Set(decoded.links.map(\.id)).count == decoded.links.count,
          decoded.links == decoded.links.sorted(by: {
            if $0.createdAt != $1.createdAt { return $0.createdAt > $1.createdAt }
            return $0.id < $1.id
          }) else {
      return nil
    }
    return decoded
  }

  private static func isValidLockScreenRecentLink(_ link: QuickSaveLockScreenRecentLink) -> Bool {
    guard link.id.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
          !link.domain.isEmpty,
          link.domain.utf8.count <= 253,
          link.createdAt > 0,
          link.createdAt <= Int64(Date().timeIntervalSince1970 * 1_000) + 60_000,
          let normalized = SaveLinkQuickSaveSQLite.normalize("https://\(link.domain)") else {
      return false
    }
    return normalized.domain == link.domain &&
      (link.savedContentId == nil || link.savedContentId! > 0) &&
      (link.faviconFileName == nil || link.faviconFileName == faviconFileName(for: link.id))
  }

  private static func faviconFileName(for id: String) -> String {
    "favicon-\(id.lowercased()).png"
  }

  private static func validFaviconURL(fileName: String, id: String) -> URL? {
    guard fileName == faviconFileName(for: id),
          let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupIdentifier
          ) else { return nil }
    let directory = container.appendingPathComponent(directoryName, isDirectory: true)
      .appendingPathComponent(lockScreenFaviconDirectoryName, isDirectory: true)
    let url = directory.appendingPathComponent(fileName, isDirectory: false)
    guard let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey]),
          values.isRegularFile == true,
          let size = values.fileSize,
          size > 0,
          size <= maximumLockScreenFaviconBytes,
          let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          CGImageSourceGetCount(source) > 0,
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          (properties[kCGImagePropertyPixelWidth] as? Int) == 96,
          (properties[kCGImagePropertyPixelHeight] as? Int) == 96,
          CGImageSourceCreateImageAtIndex(source, 0, nil) != nil else { return nil }
    return url
  }

  fileprivate static func validFaviconURLForActivity(fileName: String, id: String) -> URL? {
    validFaviconURL(fileName: fileName, id: id)
  }

  private static func pruneObsoleteFavicons(in directory: URL, referencedNames: Set<String>) {
    let faviconDirectory = directory.appendingPathComponent(lockScreenFaviconDirectoryName, isDirectory: true)
    guard let children = try? FileManager.default.contentsOfDirectory(
      at: faviconDirectory,
      includingPropertiesForKeys: [.isRegularFileKey],
      options: []
    ) else { return }
    for child in children {
      let name = child.lastPathComponent
      let isObsoleteFavicon = name.range(
        of: "^favicon-[a-f0-9]{64}\\.png$", options: .regularExpression
      ) != nil && !referencedNames.contains(name)
      let isAbandonedTemporary = name.range(
        of: "^\\.pending-[A-F0-9-]{36}\\.tmp$", options: [.regularExpression, .caseInsensitive]
      ) != nil
      guard isObsoleteFavicon || isAbandonedTemporary else { continue }
      guard (try? child.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true else { continue }
      try? FileManager.default.removeItem(at: child)
    }
  }

  private static func queueFileName(for normalizedURL: String) -> String {
    let digest = SHA256.hash(data: Data(normalizedURL.utf8))
    return digest.map { String(format: "%02x", $0) }.joined() + ".json"
  }

  private static func withExclusiveFileLock<T>(in directory: URL, body: () throws -> T) throws -> T {
    let lockURL = directory.appendingPathComponent(".queue.lock", isDirectory: false)
    let descriptor = open(lockURL.path, O_CREAT | O_RDWR, mode_t(S_IRUSR | S_IWUSR))
    guard descriptor >= 0 else { throw QuickSaveQueueFailure.io(errno) }
    defer { _ = close(descriptor) }
    do {
      try FileManager.default.setAttributes([.protectionKey: fileProtection], ofItemAtPath: lockURL.path)
    } catch {
      throw QuickSaveQueueFailure.unavailable
    }

    try acquireFileLock(descriptor)
    defer { _ = flock(descriptor, LOCK_UN) }
    return try body()
  }

  private static func acquireFileLock(_ descriptor: Int32) throws {
    let deadline = DispatchTime.now().uptimeNanoseconds &+ fileLockTimeoutNanoseconds
    while true {
      if flock(descriptor, LOCK_EX | LOCK_NB) == 0 { return }
      let code = errno
      if code == EINTR { continue }
      guard code == EWOULDBLOCK || code == EAGAIN else {
        throw QuickSaveQueueFailure.io(code)
      }
      guard DispatchTime.now().uptimeNanoseconds < deadline else {
        throw QuickSaveQueueFailure.lockTimeout
      }
      Thread.sleep(forTimeInterval: fileLockRetryInterval)
    }
  }

  private static func writeAtomically(_ data: Data, to destination: URL, in directory: URL) throws {
    let temporary = directory.appendingPathComponent(".pending-\(UUID().uuidString).tmp", isDirectory: false)
    let descriptor = open(temporary.path, O_WRONLY | O_CREAT | O_EXCL, mode_t(S_IRUSR | S_IWUSR))
    guard descriptor >= 0 else { throw QuickSaveQueueFailure.io(errno) }
    var published = false
    defer {
      _ = close(descriptor)
      if !published { _ = unlink(temporary.path) }
    }

    do {
      try data.withUnsafeBytes { buffer in
        guard let baseAddress = buffer.baseAddress else { throw QuickSaveQueueFailure.invalidRecord }
        var offset = 0
        while offset < buffer.count {
          let written = Darwin.write(descriptor, baseAddress.advanced(by: offset), buffer.count - offset)
          if written < 0 {
            if errno == EINTR { continue }
            throw QuickSaveQueueFailure.io(errno)
          }
          guard written > 0 else { throw QuickSaveQueueFailure.io(EIO) }
          offset += written
        }
      }
      guard fsync(descriptor) == 0 else { throw QuickSaveQueueFailure.io(errno) }
      try FileManager.default.setAttributes([.protectionKey: fileProtection], ofItemAtPath: temporary.path)

      let renameResult = temporary.path.withCString { sourcePath in
        destination.path.withCString { destinationPath in
          Darwin.rename(sourcePath, destinationPath)
        }
      }
      guard renameResult == 0 else { throw QuickSaveQueueFailure.io(errno) }
      published = true

      let directoryDescriptor = open(directory.path, O_RDONLY)
      guard directoryDescriptor >= 0 else { throw QuickSaveQueueFailure.io(errno) }
      defer { _ = close(directoryDescriptor) }
      guard fsync(directoryDescriptor) == 0 else { throw QuickSaveQueueFailure.io(errno) }
    } catch {
      throw error
    }
  }

  private static func readAndValidateRecord(at url: URL) throws -> QuickSaveQueueRecord? {
    let values = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
    guard values.isRegularFile == true,
          let size = values.fileSize,
          size > 0,
          size <= maximumRecordBytes else {
      return nil
    }
    let data = try Data(contentsOf: url, options: [.mappedIfSafe])
    let record = try JSONDecoder().decode(QuickSaveQueueRecord.self, from: data)
    guard record.formatVersion == formatVersion,
          UUID(uuidString: record.operationID) != nil,
          record.normalizedURL == record.url,
          queueFileName(for: record.normalizedURL) == url.lastPathComponent,
          SaveLinkQuickSaveSQLite.normalize(record.url)?.url == record.normalizedURL,
          record.createdAt > 0,
          record.title.utf8.count <= 120,
          record.domain.utf8.count <= 253 else {
      return nil
    }
    return record
  }

  private static func cleanStaleTemporaryFiles(in directory: URL) {
    guard let children = try? FileManager.default.contentsOfDirectory(
      at: directory,
      includingPropertiesForKeys: [.contentModificationDateKey],
      options: []
    ) else { return }
    let staleBefore = Date().addingTimeInterval(-60 * 60)
    for child in children where child.lastPathComponent.hasPrefix(".pending-") && child.pathExtension == "tmp" {
      guard let modifiedAt = try? child.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate,
            modifiedAt < staleBefore else { continue }
      try? FileManager.default.removeItem(at: child)
    }
  }
}
