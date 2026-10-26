import ExpoModulesCore
import Foundation
import QuickLookThumbnailing
import UIKit

public final class SaveAppDocumentThumbnailingModule: Module {
  private static let sourcePathPattern = #"^documents/document-[0-9]+-[a-z0-9]+(?:\.[a-z0-9]{1,16})?$"#
  private static let maximumSourceBytes: Int64 = 200 * 1024 * 1024
  private static let maximumThumbnailPixels = 1_536
  private static let maximumThumbnailBytes = 2 * 1024 * 1024
  private static let fileQueue = DispatchQueue(label: "com.luanrigatti.saveapp.document-thumbnails", qos: .utility)

  public func definition() -> ModuleDefinition {
    Name("SaveAppDocumentThumbnailing")

    AsyncFunction("generateThumbnailAsync") { (documentId: Int, relativePath: String, promise: Promise) in
      guard documentId > 0 else {
        promise.resolve(["status": "invalidInput"])
        return
      }

      guard let sourceURL = Self.validatedSourceURL(relativePath: relativePath) else {
        promise.resolve(["status": "invalidPath"])
        return
      }

      guard Self.isAvailableRegularFile(sourceURL) else {
        promise.resolve(["status": "missing"])
        return
      }

      let request = QLThumbnailGenerator.Request(
        fileAt: sourceURL,
        size: CGSize(width: 768, height: 768),
        scale: 1.5,
        representationTypes: [.thumbnail]
      )
      request.iconMode = false

      QLThumbnailGenerator.shared.generateBestRepresentation(for: request) { representation, _ in
        guard let representation, representation.type == .thumbnail else {
          promise.resolve(["status": "unsupported"])
          return
        }

        Self.fileQueue.async {
          guard Self.isAvailableRegularFile(sourceURL),
                let result = Self.persistJPEG(representation.uiImage, documentId: documentId) else {
            promise.resolve(["status": "failed"])
            return
          }

          promise.resolve([
            "status": "generated",
            "relativePath": result.relativePath,
            "width": result.width,
            "height": result.height,
            "sizeBytes": result.sizeBytes,
          ])
        }
      }
    }

  }

  private static func documentRoot() -> URL? {
    FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?.standardizedFileURL
  }

  private static func validatedSourceURL(relativePath: String) -> URL? {
    guard relativePath.range(of: sourcePathPattern, options: .regularExpression) != nil,
          let root = documentRoot() else {
      return nil
    }

    let sourceURL = root.appendingPathComponent(relativePath, isDirectory: false).standardizedFileURL
    let managedDirectory = root.appendingPathComponent("documents", isDirectory: true).standardizedFileURL
    let resolvedSource = sourceURL.resolvingSymlinksInPath().standardizedFileURL
    let resolvedDirectory = managedDirectory.resolvingSymlinksInPath().standardizedFileURL
    let expectedPrefix = resolvedDirectory.path.hasSuffix("/") ? resolvedDirectory.path : resolvedDirectory.path + "/"

    guard resolvedSource.path.hasPrefix(expectedPrefix),
          resolvedSource.path == sourceURL.path else {
      return nil
    }
    return sourceURL
  }

  private static func isAvailableRegularFile(_ url: URL) -> Bool {
    guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
          attributes[.type] as? FileAttributeType == .typeRegular,
          let size = attributes[.size] as? NSNumber else {
      return false
    }
    return size.int64Value > 0 && size.int64Value <= maximumSourceBytes
  }

  private static func validatedThumbnailURL(documentId: Int) -> URL? {
    guard documentId > 0, let root = documentRoot() else { return nil }
    let directory = root.appendingPathComponent("document-thumbnails", isDirectory: true).standardizedFileURL

    do {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    } catch {
      return nil
    }

    let resolvedDirectory = directory.resolvingSymlinksInPath().standardizedFileURL
    guard resolvedDirectory.path == directory.path else { return nil }

    let file = directory.appendingPathComponent("document-\(documentId).jpg", isDirectory: false).standardizedFileURL
    let prefix = directory.path.hasSuffix("/") ? directory.path : directory.path + "/"
    guard file.path.hasPrefix(prefix) else { return nil }
    return file
  }

  private static func persistJPEG(_ image: UIImage, documentId: Int) -> (relativePath: String, width: Int, height: Int, sizeBytes: Int)? {
    guard let cgImage = image.cgImage else { return nil }
    let width = cgImage.width
    let height = cgImage.height
    guard width > 0, height > 0,
          width <= maximumThumbnailPixels, height <= maximumThumbnailPixels,
          let data = image.jpegData(compressionQuality: 0.78),
          !data.isEmpty, data.count <= maximumThumbnailBytes,
          let destinationURL = validatedThumbnailURL(documentId: documentId) else {
      return nil
    }

    do {
      try data.write(to: destinationURL, options: .atomic)
      guard let attributes = try? FileManager.default.attributesOfItem(atPath: destinationURL.path),
            (attributes[.size] as? NSNumber)?.intValue == data.count else {
        return nil
      }
      return ("document-thumbnails/document-\(documentId).jpg", width, height, data.count)
    } catch {
      return nil
    }
  }
}
