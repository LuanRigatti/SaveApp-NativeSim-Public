import type { SQLiteDatabase } from 'expo-sqlite';

export type SavedDocumentsMigrationDatabase = Pick<
  SQLiteDatabase,
  'execAsync' | 'withExclusiveTransactionAsync'
>;

export const SAVED_DOCUMENTS_SCHEMA_VERSION = 3;

/** Adds the local document catalog without rewriting the existing media or saved-content tables. */
export async function ensureSavedDocumentsSchema(
  database: SavedDocumentsMigrationDatabase,
): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS saveapp_schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const documentsMigration = await transaction.getFirstAsync<{ version: number }>(
      'SELECT version FROM saveapp_schema_migrations WHERE version = ?;',
      2,
    );

    if (!documentsMigration) {
      await transaction.execAsync(`
        CREATE TABLE IF NOT EXISTS saved_documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          original_name TEXT NOT NULL,
          mime_type TEXT,
          extension TEXT,
          size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
          relative_path TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL,
          text_excerpt TEXT
        );
        CREATE INDEX IF NOT EXISTS saved_documents_created_at_idx
          ON saved_documents(created_at DESC, id DESC);
      `);

      await transaction.runAsync(
        'INSERT INTO saveapp_schema_migrations (version, applied_at) VALUES (?, ?);',
        2,
        Date.now(),
      );
    }

    const thumbnailMigration = await transaction.getFirstAsync<{ version: number }>(
      'SELECT version FROM saveapp_schema_migrations WHERE version = ?;',
      SAVED_DOCUMENTS_SCHEMA_VERSION,
    );
    if (thumbnailMigration) return;

    const documentColumns = await transaction.getAllAsync<{ name: string }>(
      'PRAGMA table_info(saved_documents);',
    );
    if (!documentColumns.some((column) => column.name === 'thumbnail_relative_path')) {
      await transaction.execAsync(
        'ALTER TABLE saved_documents ADD COLUMN thumbnail_relative_path TEXT;',
      );
    }
    await transaction.runAsync(
      'INSERT INTO saveapp_schema_migrations (version, applied_at) VALUES (?, ?);',
      SAVED_DOCUMENTS_SCHEMA_VERSION,
      Date.now(),
    );
  });
}
