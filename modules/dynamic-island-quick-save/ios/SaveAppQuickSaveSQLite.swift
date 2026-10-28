import Foundation
import OSLog
import SQLite3

struct NormalizedQuickSaveLink {
  let url: String
  let domain: String
  let title: String
}

enum QuickSaveInsertResult {
  case inserted
  case alreadySaved
}

enum QuickSaveDatabaseFailureStage: String {
  case path
  case open
  case schema
  case busy
  case transaction
  case write
}

enum QuickSaveDatabaseError: Error {
  case failure(stage: QuickSaveDatabaseFailureStage, sqliteCode: Int32?)

  var diagnosticStage: String {
    guard case let .failure(stage, _) = self else { return "unknown" }
    return stage.rawValue
  }

  var diagnosticSQLiteCode: Int32 {
    guard case let .failure(_, sqliteCode) = self else { return SQLITE_ERROR }
    return sqliteCode ?? SQLITE_ERROR
  }
}

enum SaveLinkQuickSaveSQLite {
  private static let databaseName = "saveapp-photos.db"
  private static let requiredMigrations: Set<Int64> = [1, 9]
  private static let requiredColumns: Set<String> = [
    "id", "content_type", "created_at", "url", "normalized_url", "title",
    "description", "domain", "image_url", "favicon_url", "preview_image_relative_path",
    "preview_image_mime_type", "text_content", "deleted_at"
  ]
  private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
  private static let logger = Logger(subsystem: "com.luanrigatti.saveapp", category: "quick-save.sqlite")

  static func normalize(_ input: String) -> NormalizedQuickSaveLink? {
    let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty,
          trimmed.rangeOfCharacter(from: .controlCharacters) == nil else {
      return nil
    }

    let hasExplicitScheme = trimmed.range(
      of: "^[A-Za-z][A-Za-z0-9+.-]*:",
      options: .regularExpression
    ) != nil
    let candidate = hasExplicitScheme ? trimmed : "https://\(trimmed)"

    guard var components = URLComponents(string: candidate),
          let scheme = components.scheme?.lowercased(),
          scheme == "http" || scheme == "https",
          let originalHost = components.host,
          !originalHost.isEmpty,
          components.user == nil,
          components.password == nil else {
      return nil
    }

    let host = originalHost.lowercased()
    components.scheme = scheme
    components.host = host
    if (scheme == "http" && components.port == 80) ||
       (scheme == "https" && components.port == 443) {
      components.port = nil
    }
    if components.path.isEmpty {
      components.path = "/"
    }

    guard let normalizedURL = components.string,
          URL(string: normalizedURL) != nil else {
      return nil
    }

    let domain = host.replacingOccurrences(
      of: "^www\\.",
      with: "",
      options: [.regularExpression, .caseInsensitive]
    )
    let title = fallbackTitle(path: components.path, domain: domain)
    return NormalizedQuickSaveLink(url: normalizedURL, domain: domain, title: title)
  }

  static func insertOrFindExisting(
    _ link: NormalizedQuickSaveLink,
    operationID: String
  ) throws -> QuickSaveInsertResult {
    logger.notice("event=database.access.started operation=\(operationID, privacy: .public)")
    let databaseURL = try databaseFileURL(operationID: operationID)
    let fileExists = FileManager.default.fileExists(atPath: databaseURL.path)
    let fileIsReadable = fileExists && FileManager.default.isReadableFile(atPath: databaseURL.path)
    logger.notice("event=database.file.status exists=\(fileExists, privacy: .public) readable=\(fileIsReadable, privacy: .public) operation=\(operationID, privacy: .public)")
    guard fileExists else {
      logger.error("event=database.open.result=failed reason=database_missing sqlite_code=\(SQLITE_CANTOPEN, privacy: .public) operation=\(operationID, privacy: .public)")
      throw QuickSaveDatabaseError.failure(stage: .open, sqliteCode: SQLITE_CANTOPEN)
    }
    var database: OpaquePointer?
    let openResult = sqlite3_open_v2(
      databaseURL.path,
      &database,
      SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX,
      nil
    )
    guard openResult == SQLITE_OK, let database else {
      if let database { sqlite3_close_v2(database) }
      logger.error("event=database.open.result=failed sqlite_code=\(openResult, privacy: .public) operation=\(operationID, privacy: .public)")
      throw QuickSaveDatabaseError.failure(stage: .open, sqliteCode: openResult)
    }
    defer { sqlite3_close_v2(database) }
    logger.notice("event=database.open.result=success operation=\(operationID, privacy: .public)")

    sqlite3_extended_result_codes(database, 1)
    let busyTimeoutResult = sqlite3_busy_timeout(database, 3_000)
    guard busyTimeoutResult == SQLITE_OK else {
      logger.error("event=database.busy_timeout.result=failed sqlite_code=\(sqlite3_errcode(database), privacy: .public) operation=\(operationID, privacy: .public)")
      throw QuickSaveDatabaseError.failure(stage: .busy, sqliteCode: sqlite3_errcode(database))
    }
    logger.notice("event=database.busy_timeout.result=ready operation=\(operationID, privacy: .public)")
    try execute("BEGIN IMMEDIATE;", action: "transaction.begin", operationID: operationID, in: database)
    var committed = false
    defer {
      if !committed {
        logger.notice("event=database.rollback.started operation=\(operationID, privacy: .public)")
        let rollbackResult = sqlite3_exec(database, "ROLLBACK;", nil, nil, nil)
        if rollbackResult == SQLITE_OK {
          logger.notice("event=database.rollback.result=confirmed operation=\(operationID, privacy: .public)")
        } else {
          logger.error("event=database.rollback.result=failed sqlite_code=\(sqlite3_errcode(database), privacy: .public) operation=\(operationID, privacy: .public)")
        }
      }
    }
    // Lock the writer before checking the schema so an in-app migration cannot
    // change it between validation and this intent's insert.
    do {
      try verifyCompatibleSchema(database, operationID: operationID)
      logger.notice("event=database.schema.result=compatible operation=\(operationID, privacy: .public)")
    } catch {
      logger.error("event=database.schema.result=failed sqlite_code=\(sqlite3_errcode(database), privacy: .public) operation=\(operationID, privacy: .public)")
      throw error
    }

    if try containsActiveLink(link.url, operationID: operationID, in: database) {
      try execute("COMMIT;", action: "commit", operationID: operationID, in: database)
      committed = true
      logger.notice("event=database.commit.confirmed outcome=already_saved operation=\(operationID, privacy: .public)")
      return .alreadySaved
    }

    do {
      try insert(link, operationID: operationID, in: database)
    } catch {
      // The partial unique index is the final guard against a concurrent JS/native insert.
      if try containsActiveLink(link.url, operationID: operationID, in: database) {
        try execute("COMMIT;", action: "commit", operationID: operationID, in: database)
        committed = true
        logger.notice("event=database.commit.confirmed outcome=already_saved_after_conflict operation=\(operationID, privacy: .public)")
        return .alreadySaved
      }
      throw error
    }

    try execute("COMMIT;", action: "commit", operationID: operationID, in: database)
    committed = true
    logger.notice("event=database.commit.confirmed outcome=inserted operation=\(operationID, privacy: .public)")
    return .inserted
  }

  private static func databaseFileURL(operationID: String) throws -> URL {
    guard let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
      logger.error("event=database.container.result=unavailable operation=\(operationID, privacy: .public)")
      throw QuickSaveDatabaseError.failure(stage: .path, sqliteCode: nil)
    }
    let sqliteDirectory = documents.appendingPathComponent("SQLite", isDirectory: true)
    var isDirectory: ObjCBool = false
    let directoryExists = FileManager.default.fileExists(atPath: sqliteDirectory.path, isDirectory: &isDirectory)
    logger.notice("event=database.container.result=available sqlite_directory_exists=\(directoryExists && isDirectory.boolValue, privacy: .public) operation=\(operationID, privacy: .public)")
    return sqliteDirectory
      .appendingPathComponent(databaseName, isDirectory: false)
  }

  private static func verifyCompatibleSchema(_ database: OpaquePointer, operationID: String) throws {
    logger.notice("event=database.schema.validation_started operation=\(operationID, privacy: .public)")
    var migrations: Set<Int64> = []
    try withStatement(
      "SELECT version FROM saveapp_schema_migrations WHERE version IN (1, 9);",
      in: database
    ) { statement in
      while true {
        let result = sqlite3_step(statement)
        if result == SQLITE_DONE { break }
        guard result == SQLITE_ROW else { throw databaseError(database, fallback: .schema) }
        migrations.insert(sqlite3_column_int64(statement, 0))
      }
    }
    let migrationsCompatible = requiredMigrations.isSubset(of: migrations)
    logger.notice("event=database.schema.migrations migrations_v1=\(migrations.contains(1), privacy: .public) migration_v9=\(migrations.contains(9), privacy: .public) operation=\(operationID, privacy: .public)")
    guard migrationsCompatible else {
      throw QuickSaveDatabaseError.failure(stage: .schema, sqliteCode: SQLITE_SCHEMA)
    }

    var columns: Set<String> = []
    try withStatement("PRAGMA table_info(saved_content);", in: database) { statement in
      while true {
        let result = sqlite3_step(statement)
        if result == SQLITE_DONE { break }
        guard result == SQLITE_ROW else { throw databaseError(database, fallback: .schema) }
        if let text = sqlite3_column_text(statement, 1) {
          columns.insert(String(cString: text))
        }
      }
    }
    let columnsCompatible = requiredColumns.isSubset(of: columns)
    logger.notice("event=database.schema.columns_compatible value=\(columnsCompatible, privacy: .public) operation=\(operationID, privacy: .public)")
    guard columnsCompatible else {
      throw QuickSaveDatabaseError.failure(stage: .schema, sqliteCode: SQLITE_SCHEMA)
    }

    var indexIsCompatible = false
    try withStatement(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'saved_content_link_url_unique_idx' LIMIT 1;",
      in: database
    ) { statement in
      let result = sqlite3_step(statement)
      if result == SQLITE_ROW, let text = sqlite3_column_text(statement, 0) {
        let sql = String(cString: text)
          .lowercased()
          .filter { !$0.isWhitespace && $0 != ";" && $0 != "`" && $0 != "\"" }
        indexIsCompatible = sql.contains("createuniqueindex") &&
          sql.contains("onsaved_content(normalized_url)") &&
          sql.contains("wherecontent_type='link'anddeleted_atisnull")
      } else if result != SQLITE_DONE {
        throw databaseError(database, fallback: .schema)
      }
    }
    logger.notice("event=database.schema.unique_index_compatible value=\(indexIsCompatible, privacy: .public) operation=\(operationID, privacy: .public)")
    guard indexIsCompatible else {
      throw QuickSaveDatabaseError.failure(stage: .schema, sqliteCode: SQLITE_SCHEMA)
    }
  }

  private static func containsActiveLink(
    _ normalizedURL: String,
    operationID: String,
    in database: OpaquePointer
  ) throws -> Bool {
    logger.notice("event=database.duplicate_check.started operation=\(operationID, privacy: .public)")
    return try withStatement(
      "SELECT 1 FROM saved_content WHERE content_type = 'link' AND normalized_url = ? AND deleted_at IS NULL LIMIT 1;",
      in: database
    ) { statement in
      try bind(normalizedURL, to: 1, in: statement)
      let result = sqlite3_step(statement)
      if result == SQLITE_ROW {
        logger.notice("event=database.duplicate_check.result=found operation=\(operationID, privacy: .public)")
        return true
      }
      if result == SQLITE_DONE {
        logger.notice("event=database.duplicate_check.result=not_found operation=\(operationID, privacy: .public)")
        return false
      }
      throw databaseError(database, fallback: .write)
    }
  }

  private static func insert(
    _ link: NormalizedQuickSaveLink,
    operationID: String,
    in database: OpaquePointer
  ) throws {
    logger.notice("event=database.insert.started operation=\(operationID, privacy: .public)")
    try withStatement(
      "INSERT INTO saved_content (content_type, created_at, url, normalized_url, title, description, domain, image_url, favicon_url, preview_image_relative_path, preview_image_mime_type, text_content) VALUES ('link', ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, NULL, NULL);",
      in: database
    ) { statement in
      let createdAt = Int64(Date().timeIntervalSince1970 * 1_000)
      let timestampBindResult = sqlite3_bind_int64(statement, 1, createdAt)
      guard timestampBindResult == SQLITE_OK else {
        throw QuickSaveDatabaseError.failure(stage: .write, sqliteCode: timestampBindResult)
      }
      try bind(link.url, to: 2, in: statement)
      try bind(link.url, to: 3, in: statement)
      try bind(link.title, to: 4, in: statement)
      try bind(link.domain, to: 5, in: statement)
      let result = sqlite3_step(statement)
      guard result == SQLITE_DONE else {
        logger.error("event=database.insert.result=failed sqlite_code=\(sqlite3_extended_errcode(database), privacy: .public) operation=\(operationID, privacy: .public)")
        throw databaseError(database, fallback: .write, result: result)
      }
      logger.notice("event=database.insert.result=statement_completed operation=\(operationID, privacy: .public)")
    }
  }

  private static func execute(
    _ sql: String,
    action: String,
    operationID: String,
    in database: OpaquePointer
  ) throws {
    logger.notice("event=database.\(action).started operation=\(operationID, privacy: .public)")
    let result = sqlite3_exec(database, sql, nil, nil, nil)
    guard result == SQLITE_OK else {
      logger.error("event=database.\(action).result=failed sqlite_code=\(sqlite3_extended_errcode(database), privacy: .public) operation=\(operationID, privacy: .public)")
      throw databaseError(database, fallback: .transaction, result: result)
    }
    logger.notice("event=database.\(action).result=acquired operation=\(operationID, privacy: .public)")
  }

  private static func withStatement<T>(
    _ sql: String,
    in database: OpaquePointer,
    body: (OpaquePointer) throws -> T
  ) throws -> T {
    var statement: OpaquePointer?
    let result = sqlite3_prepare_v2(database, sql, -1, &statement, nil)
    guard result == SQLITE_OK, let statement else {
      throw databaseError(database, fallback: .schema, result: result)
    }
    defer { sqlite3_finalize(statement) }
    return try body(statement)
  }

  private static func bind(_ value: String, to index: Int32, in statement: OpaquePointer) throws {
    let result = value.withCString { sqlite3_bind_text(statement, index, $0, -1, transient) }
    guard result == SQLITE_OK else {
      throw QuickSaveDatabaseError.failure(stage: .write, sqliteCode: result)
    }
  }

  private static func databaseError(
    _ database: OpaquePointer,
    fallback: QuickSaveDatabaseFailureStage,
    result: Int32? = nil
  ) -> QuickSaveDatabaseError {
    databaseError(database: database, fallback: fallback, result: result)
  }

  private static func databaseError(
    database: OpaquePointer?,
    fallback: QuickSaveDatabaseFailureStage,
    result: Int32? = nil
  ) -> QuickSaveDatabaseError {
    let code: Int32
    if let database {
      code = sqlite3_errcode(database)
    } else {
      code = result ?? SQLITE_ERROR
    }
    let stage: QuickSaveDatabaseFailureStage =
      code == SQLITE_BUSY || code == SQLITE_LOCKED ? .busy : fallback
    return .failure(stage: stage, sqliteCode: code)
  }

  private static func fallbackTitle(path: String, domain: String) -> String {
    let lastPathPart = path.split(separator: "/").last.map(String.init)
    if let lastPathPart, !lastPathPart.isEmpty {
      let decoded = lastPathPart.removingPercentEncoding ?? lastPathPart
      let readable = decoded
        .replacingOccurrences(of: "[-_]+", with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
      if !readable.isEmpty {
        return String(readable.prefix(120))
      }
    }
    return String(domain.prefix(120))
  }
}
