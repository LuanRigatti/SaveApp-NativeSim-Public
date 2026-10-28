import CryptoKit
import Darwin
import Foundation
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

enum QuickSaveQueueWriteResult {
  case enqueued
  case alreadyQueued
}

enum QuickSaveQueueFailure: Error {
  case unavailable
  case invalidRecord
  case capacityExceeded
  case io(Int32)

  var diagnosticCode: String {
    switch self {
    case .unavailable: return "app_group_unavailable"
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
        logger.notice("event=quick_save.queue.duplicate")
        return .alreadyQueued
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

      logger.notice("event=quick_save.queue.write_confirmed")
      return .enqueued
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

    while flock(descriptor, LOCK_EX) != 0 {
      if errno == EINTR { continue }
      throw QuickSaveQueueFailure.io(errno)
    }
    defer { _ = flock(descriptor, LOCK_UN) }
    return try body()
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
