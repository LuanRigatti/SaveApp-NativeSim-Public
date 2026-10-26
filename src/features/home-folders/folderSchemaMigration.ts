import type { SQLiteDatabase } from 'expo-sqlite';

export type HomeFolderSchemaDatabase = Pick<
  SQLiteDatabase,
  'execAsync' | 'withExclusiveTransactionAsync'
>;

export const HOME_FOLDER_SCHEMA_VERSION = 5;

/** Adds logical folder catalogs and typed assignments without rewriting saved content or files. */
export async function ensureHomeFolderSchema(database: HomeFolderSchemaDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS saveapp_schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const foldersMigration = await transaction.getFirstAsync<{ version: number }>(
      'SELECT version FROM saveapp_schema_migrations WHERE version = ?;',
      4,
    );
    if (!foldersMigration) {
      await transaction.execAsync(`
        CREATE TABLE IF NOT EXISTS saved_folders (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          normalized_name TEXT NOT NULL UNIQUE,
          color TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS saved_folder_items (
          item_type TEXT NOT NULL CHECK (item_type IN ('photo', 'video', 'link', 'text', 'document')),
          item_id TEXT NOT NULL,
          folder_id TEXT NOT NULL REFERENCES saved_folders(id) ON DELETE CASCADE,
          PRIMARY KEY (item_type, item_id)
        );

        CREATE INDEX IF NOT EXISTS saved_folder_items_folder_idx
          ON saved_folder_items(folder_id, item_type, item_id);

        CREATE TRIGGER IF NOT EXISTS saved_folder_items_photo_delete
        AFTER DELETE ON photos
        BEGIN
          DELETE FROM saved_folder_items
          WHERE item_type = OLD.media_type AND item_id = CAST(OLD.id AS TEXT);
        END;

        CREATE TRIGGER IF NOT EXISTS saved_folder_items_content_delete
        AFTER DELETE ON saved_content
        BEGIN
          DELETE FROM saved_folder_items
          WHERE item_type = OLD.content_type AND item_id = CAST(OLD.id AS TEXT);
        END;

        CREATE TRIGGER IF NOT EXISTS saved_folder_items_document_delete
        AFTER DELETE ON saved_documents
        BEGIN
          DELETE FROM saved_folder_items
          WHERE item_type = 'document' AND item_id = CAST(OLD.id AS TEXT);
        END;
      `);

      await transaction.runAsync(
        'INSERT INTO saveapp_schema_migrations (version, applied_at) VALUES (?, ?);',
        4,
        Date.now(),
      );
    }

    const folderColumns = await transaction.getAllAsync<{ name: string }>(
      'PRAGMA table_info(saved_folders);',
    );
    if (!folderColumns.some((column) => column.name === 'is_protected')) {
      await transaction.execAsync(
        'ALTER TABLE saved_folders ADD COLUMN is_protected INTEGER NOT NULL DEFAULT 0 CHECK (is_protected IN (0, 1));',
      );
    }

    const protectionMigration = await transaction.getFirstAsync<{ version: number }>(
      'SELECT version FROM saveapp_schema_migrations WHERE version = ?;',
      HOME_FOLDER_SCHEMA_VERSION,
    );
    if (!protectionMigration) {
      await transaction.runAsync(
        'INSERT INTO saveapp_schema_migrations (version, applied_at) VALUES (?, ?);',
        HOME_FOLDER_SCHEMA_VERSION,
        Date.now(),
      );
    }
  });
}
