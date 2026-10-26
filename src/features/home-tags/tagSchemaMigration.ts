import type { SQLiteDatabase } from 'expo-sqlite';

export type SavedTagSchemaDatabase = Pick<
  SQLiteDatabase,
  'execAsync' | 'withExclusiveTransactionAsync'
>;

type SavedTagSchemaTransaction = Pick<
  SQLiteDatabase,
  'execAsync' | 'getAllAsync' | 'getFirstAsync' | 'runAsync'
>;

export const SAVED_TAG_SCHEMA_VERSION = 8;

/** Adds an independent tag catalog and polymorphic item associations without rewriting saved data. */
export async function ensureSavedTagSchema(database: SavedTagSchemaDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS saveapp_schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const migration = await transaction.getFirstAsync<{ version: number }>(
      'SELECT version FROM saveapp_schema_migrations WHERE version = ? LIMIT 1;',
      SAVED_TAG_SCHEMA_VERSION,
    );
    if (migration) return;

    const checklistMigration = await transaction.getFirstAsync<{ version: number }>(
      'SELECT version FROM saveapp_schema_migrations WHERE version = 7 LIMIT 1;',
    );
    if (!checklistMigration) throw new Error('SAVED_TAG_CHECKLIST_SCHEMA_V7_REQUIRED');

    const unexpectedTables = await transaction.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name IN ('saved_tags', 'saved_tag_items');`,
    );
    if (unexpectedTables.length > 0) throw new Error('SAVED_TAG_SCHEMA_CONFLICT');

    await transaction.execAsync(`
      CREATE TABLE saved_tags (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
        normalized_name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL CHECK (color IN (
          'black', 'blue', 'purple', 'green', 'orange', 'pink',
          'red', 'gray', 'cyan', 'yellow', 'indigo', 'wine'
        )),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE saved_tag_items (
        item_type TEXT NOT NULL CHECK (item_type IN ('photo', 'video', 'link', 'text', 'document', 'checklist')),
        item_id TEXT NOT NULL,
        tag_id TEXT NOT NULL REFERENCES saved_tags(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (item_type, item_id, tag_id)
      );

      CREATE INDEX saved_tag_items_item_idx
        ON saved_tag_items(item_type, item_id, tag_id);
      CREATE INDEX saved_tag_items_tag_idx
        ON saved_tag_items(tag_id, item_type, item_id);

      CREATE TRIGGER saved_tag_items_photo_delete
      AFTER DELETE ON photos
      BEGIN
        DELETE FROM saved_tag_items
        WHERE item_type = OLD.media_type AND item_id = CAST(OLD.id AS TEXT);
      END;

      CREATE TRIGGER saved_tag_items_content_delete
      AFTER DELETE ON saved_content
      BEGIN
        DELETE FROM saved_tag_items
        WHERE item_type = OLD.content_type AND item_id = CAST(OLD.id AS TEXT);
      END;

      CREATE TRIGGER saved_tag_items_document_delete
      AFTER DELETE ON saved_documents
      BEGIN
        DELETE FROM saved_tag_items
        WHERE item_type = 'document' AND item_id = CAST(OLD.id AS TEXT);
      END;

      CREATE TRIGGER saved_tag_items_checklist_delete
      AFTER DELETE ON saved_checklists
      BEGIN
        DELETE FROM saved_tag_items
        WHERE item_type = 'checklist' AND item_id = CAST(OLD.id AS TEXT);
      END;
    `);

    const foreignKeyViolations = await (
      transaction as SavedTagSchemaTransaction
    ).getAllAsync<{ table: string; rowid: number | null; parent: string; fkid: number }>(
      'PRAGMA foreign_key_check(saved_tag_items);',
    );
    if (foreignKeyViolations.length > 0) throw new Error('SAVED_TAG_SCHEMA_FOREIGN_KEY_INVALID');

    await transaction.runAsync(
      'INSERT INTO saveapp_schema_migrations (version, applied_at) VALUES (?, ?);',
      SAVED_TAG_SCHEMA_VERSION,
      Date.now(),
    );
  });
}
