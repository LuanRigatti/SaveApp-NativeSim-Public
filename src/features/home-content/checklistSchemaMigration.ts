import type { SQLiteDatabase } from "expo-sqlite";

export type ChecklistSchemaDatabase = Pick<
  SQLiteDatabase,
  "execAsync" | "withExclusiveTransactionAsync"
>;

type ChecklistSchemaTransaction = Pick<
  SQLiteDatabase,
  "execAsync" | "getAllAsync" | "getFirstAsync" | "runAsync"
>;

export const CHECKLIST_SCHEMA_VERSION = 7;
const CHECKLIST_SCHEMA_V6_VERSION = 6;
const CHECKLIST_TASK_TEXT_MAX_LENGTH = 10_000;

/** Adds structured checklists and expands folder associations after folder schema v5. */
export async function ensureChecklistSchema(
  database: ChecklistSchemaDatabase,
): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS saveapp_schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  await ensureChecklistSchemaV6(database);
  await ensureChecklistTaskTextLimitV7(database);
}

async function ensureChecklistSchemaV6(
  database: ChecklistSchemaDatabase,
): Promise<void> {
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const checklistMigration = await transaction.getFirstAsync<{
      version: number;
    }>(
      "SELECT version FROM saveapp_schema_migrations WHERE version = ?;",
      CHECKLIST_SCHEMA_V6_VERSION,
    );
    if (checklistMigration) return;

    const folderMigration = await transaction.getFirstAsync<{
      version: number;
    }>("SELECT version FROM saveapp_schema_migrations WHERE version = ?;", 5);
    if (!folderMigration)
      throw new Error("CHECKLIST_FOLDER_SCHEMA_V5_REQUIRED");

    const associationTable = await transaction.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'saved_folder_items' LIMIT 1;",
    );
    if (!associationTable)
      throw new Error("CHECKLIST_FOLDER_ASSOCIATIONS_REQUIRED");

    const existingChecklistTables = await transaction.getAllAsync<{
      name: string;
    }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name IN (
         'saved_checklists', 'saved_checklist_items', 'saved_folder_items_checklist_v6_backup'
       );`,
    );
    if (existingChecklistTables.length > 0)
      throw new Error("CHECKLIST_SCHEMA_CONFLICT");

    const associationIndexes = await transaction.getAllAsync<{ sql: string }>(
      `SELECT sql FROM sqlite_master
       WHERE type = 'index' AND tbl_name = 'saved_folder_items' AND sql IS NOT NULL
       ORDER BY name;`,
    );

    await transaction.execAsync(`
      CREATE TABLE saved_checklists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE saved_checklist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checklist_id INTEGER NOT NULL REFERENCES saved_checklists(id) ON DELETE CASCADE,
        text TEXT NOT NULL CHECK (length(trim(text)) BETWEEN 1 AND 1000),
        is_completed INTEGER NOT NULL DEFAULT 0 CHECK (is_completed IN (0, 1)),
        position INTEGER NOT NULL CHECK (position >= 0),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX saved_checklist_items_order_idx
        ON saved_checklist_items(checklist_id, position, id);
    `);

    await transaction.execAsync(`
      CREATE TABLE saved_folder_items_checklist_v6_backup AS
        SELECT item_type, item_id, folder_id FROM saved_folder_items;
    `);
    const sourceCount = await transaction.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM saved_folder_items;",
    );
    const backupCount = await transaction.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM saved_folder_items_checklist_v6_backup;",
    );
    const sourceDifferences = await transaction.getFirstAsync<{ count: number }>(`
      SELECT COUNT(*) AS count FROM (
        SELECT item_type, item_id, folder_id FROM saved_folder_items
        EXCEPT
        SELECT item_type, item_id, folder_id FROM saved_folder_items_checklist_v6_backup
      );
    `);
    if (
      sourceCount?.count !== backupCount?.count ||
      sourceDifferences?.count !== 0
    ) {
      throw new Error("CHECKLIST_FOLDER_ASSOCIATION_BACKUP_MISMATCH");
    }

    await transaction.execAsync(`
      DROP TABLE saved_folder_items;
      CREATE TABLE saved_folder_items (
        item_type TEXT NOT NULL CHECK (item_type IN ('photo', 'video', 'link', 'text', 'document', 'checklist')),
        item_id TEXT NOT NULL,
        folder_id TEXT NOT NULL REFERENCES saved_folders(id) ON DELETE CASCADE,
        PRIMARY KEY (item_type, item_id)
      );
      INSERT INTO saved_folder_items (item_type, item_id, folder_id)
        SELECT item_type, item_id, folder_id FROM saved_folder_items_checklist_v6_backup;
    `);

    const rebuiltCount = await transaction.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM saved_folder_items;",
    );
    const rebuiltDifferences = await transaction.getFirstAsync<{ count: number }>(`
      SELECT COUNT(*) AS count FROM (
        SELECT item_type, item_id, folder_id FROM saved_folder_items_checklist_v6_backup
        EXCEPT
        SELECT item_type, item_id, folder_id FROM saved_folder_items
      );
    `);
    if (
      rebuiltCount?.count !== sourceCount?.count ||
      rebuiltDifferences?.count !== 0
    ) {
      throw new Error("CHECKLIST_FOLDER_ASSOCIATION_REBUILD_MISMATCH");
    }
    await transaction.execAsync("DROP TABLE saved_folder_items_checklist_v6_backup;");

    for (const index of associationIndexes) {
      await transaction.execAsync(index.sql);
    }

    await transaction.execAsync(`
      CREATE TRIGGER IF NOT EXISTS saved_folder_items_checklist_delete
      AFTER DELETE ON saved_checklists
      BEGIN
        DELETE FROM saved_folder_items
        WHERE item_type = 'checklist' AND item_id = CAST(OLD.id AS TEXT);
      END;
    `);

    const foreignKeyViolations = await (
      transaction as ChecklistSchemaTransaction
    ).getAllAsync<{
      table: string;
      rowid: number | null;
      parent: string;
      fkid: number;
    }>("PRAGMA foreign_key_check(saved_folder_items);");
    if (foreignKeyViolations.length > 0)
      throw new Error("CHECKLIST_FOLDER_ASSOCIATION_MIGRATION_INVALID");

    await transaction.runAsync(
      "INSERT INTO saveapp_schema_migrations (version, applied_at) VALUES (?, ?);",
      CHECKLIST_SCHEMA_V6_VERSION,
      Date.now(),
    );
  });
}

async function ensureChecklistTaskTextLimitV7(
  database: ChecklistSchemaDatabase,
): Promise<void> {
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const migration = await transaction.getFirstAsync<{ version: number }>(
      "SELECT version FROM saveapp_schema_migrations WHERE version = ?;",
      CHECKLIST_SCHEMA_VERSION,
    );
    if (migration) return;

    const previousMigration = await transaction.getFirstAsync<{ version: number }>(
      "SELECT version FROM saveapp_schema_migrations WHERE version = ?;",
      CHECKLIST_SCHEMA_V6_VERSION,
    );
    if (!previousMigration) throw new Error("CHECKLIST_SCHEMA_V6_REQUIRED");

    const taskTable = await transaction.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'saved_checklist_items' LIMIT 1;",
    );
    if (!taskTable) throw new Error("CHECKLIST_TASK_TABLE_REQUIRED");

    const conflictingTable = await transaction.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'saved_checklist_items_v7' LIMIT 1;",
    );
    if (conflictingTable) throw new Error("CHECKLIST_TASK_TEXT_V7_CONFLICT");

    const originalSequence = await transaction.getFirstAsync<{ seq: number }>(
      "SELECT seq FROM sqlite_sequence WHERE name = 'saved_checklist_items' LIMIT 1;",
    );
    const originalCount = await transaction.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM saved_checklist_items;",
    );

    await transaction.execAsync(`
      CREATE TABLE saved_checklist_items_v7 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checklist_id INTEGER NOT NULL REFERENCES saved_checklists(id) ON DELETE CASCADE,
        text TEXT NOT NULL CHECK (length(trim(text)) BETWEEN 1 AND ${CHECKLIST_TASK_TEXT_MAX_LENGTH}),
        is_completed INTEGER NOT NULL DEFAULT 0 CHECK (is_completed IN (0, 1)),
        position INTEGER NOT NULL CHECK (position >= 0),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      INSERT INTO saved_checklist_items_v7
        (id, checklist_id, text, is_completed, position, created_at, updated_at)
      SELECT id, checklist_id, text, is_completed, position, created_at, updated_at
      FROM saved_checklist_items;
    `);

    const rebuiltCount = await transaction.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM saved_checklist_items_v7;",
    );
    const sourceDifferences = await transaction.getFirstAsync<{ count: number }>(`
      SELECT COUNT(*) AS count FROM (
        SELECT id, checklist_id, text, is_completed, position, created_at, updated_at FROM saved_checklist_items
        EXCEPT
        SELECT id, checklist_id, text, is_completed, position, created_at, updated_at FROM saved_checklist_items_v7
      );
    `);
    const rebuiltDifferences = await transaction.getFirstAsync<{ count: number }>(`
      SELECT COUNT(*) AS count FROM (
        SELECT id, checklist_id, text, is_completed, position, created_at, updated_at FROM saved_checklist_items_v7
        EXCEPT
        SELECT id, checklist_id, text, is_completed, position, created_at, updated_at FROM saved_checklist_items
      );
    `);
    if (
      originalCount?.count !== rebuiltCount?.count ||
      sourceDifferences?.count !== 0 ||
      rebuiltDifferences?.count !== 0
    ) {
      throw new Error("CHECKLIST_TASK_TEXT_V7_REBUILD_MISMATCH");
    }

    await transaction.execAsync(`
      DROP TABLE saved_checklist_items;
      ALTER TABLE saved_checklist_items_v7 RENAME TO saved_checklist_items;
      CREATE INDEX saved_checklist_items_order_idx
        ON saved_checklist_items(checklist_id, position, id);
    `);

    if (originalSequence) {
      await transaction.runAsync(
        `UPDATE sqlite_sequence SET seq = CASE WHEN seq < ? THEN ? ELSE seq END
         WHERE name = 'saved_checklist_items';`,
        originalSequence.seq,
        originalSequence.seq,
      );
      await transaction.runAsync(
        `INSERT INTO sqlite_sequence (name, seq)
         SELECT 'saved_checklist_items', ?
         WHERE NOT EXISTS (
           SELECT 1 FROM sqlite_sequence WHERE name = 'saved_checklist_items'
         );`,
        originalSequence.seq,
      );
    }

    const foreignKeyViolations = await (
      transaction as ChecklistSchemaTransaction
    ).getAllAsync<{ table: string; rowid: number | null; parent: string; fkid: number }>(
      "PRAGMA foreign_key_check(saved_checklist_items);",
    );
    if (foreignKeyViolations.length > 0)
      throw new Error("CHECKLIST_TASK_TEXT_V7_FOREIGN_KEY_INVALID");

    await transaction.runAsync(
      "INSERT INTO saveapp_schema_migrations (version, applied_at) VALUES (?, ?);",
      CHECKLIST_SCHEMA_VERSION,
      Date.now(),
    );
  });
}
