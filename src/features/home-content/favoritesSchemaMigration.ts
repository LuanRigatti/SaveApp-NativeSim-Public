import type { SQLiteDatabase } from 'expo-sqlite';

export type SavedFavoritesSchemaDatabase = Pick<
  SQLiteDatabase,
  'execAsync' | 'withExclusiveTransactionAsync'
>;

type SavedFavoritesSchemaTransaction = Pick<
  SQLiteDatabase,
  'execAsync' | 'getFirstAsync' | 'runAsync'
>;

export const SAVED_FAVORITES_SCHEMA_VERSION = 10;

/** Adds an independent favorite association without rewriting saved content or folders. */
export async function ensureSavedFavoritesSchema(
  database: SavedFavoritesSchemaDatabase,
): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS saveapp_schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const migration = await (transaction as SavedFavoritesSchemaTransaction).getFirstAsync<{ version: number }>(
      'SELECT version FROM saveapp_schema_migrations WHERE version = ? LIMIT 1;',
      SAVED_FAVORITES_SCHEMA_VERSION,
    );
    if (migration) return;

    const trashMigration = await (transaction as SavedFavoritesSchemaTransaction).getFirstAsync<{ version: number }>(
      'SELECT version FROM saveapp_schema_migrations WHERE version = 9 LIMIT 1;',
    );
    if (!trashMigration) throw new Error('SAVED_FAVORITES_TRASH_SCHEMA_V9_REQUIRED');

    const conflictingTable = await (transaction as SavedFavoritesSchemaTransaction).getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'saved_favorite_items' LIMIT 1;",
    );
    if (conflictingTable) throw new Error('SAVED_FAVORITES_SCHEMA_CONFLICT');

    await transaction.execAsync(`
      CREATE TABLE saved_favorite_items (
        item_type TEXT NOT NULL CHECK (item_type IN ('photo', 'video', 'link', 'text', 'document', 'checklist')),
        item_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (item_type, item_id)
      );

      CREATE INDEX saved_favorite_items_created_idx
        ON saved_favorite_items(created_at DESC, item_type, item_id);

      CREATE TRIGGER saved_favorite_items_photo_delete
      AFTER DELETE ON photos
      BEGIN
        DELETE FROM saved_favorite_items
        WHERE item_type = OLD.media_type AND item_id = CAST(OLD.id AS TEXT);
      END;

      CREATE TRIGGER saved_favorite_items_content_delete
      AFTER DELETE ON saved_content
      BEGIN
        DELETE FROM saved_favorite_items
        WHERE item_type = OLD.content_type AND item_id = CAST(OLD.id AS TEXT);
      END;

      CREATE TRIGGER saved_favorite_items_document_delete
      AFTER DELETE ON saved_documents
      BEGIN
        DELETE FROM saved_favorite_items
        WHERE item_type = 'document' AND item_id = CAST(OLD.id AS TEXT);
      END;

      CREATE TRIGGER saved_favorite_items_checklist_delete
      AFTER DELETE ON saved_checklists
      BEGIN
        DELETE FROM saved_favorite_items
        WHERE item_type = 'checklist' AND item_id = CAST(OLD.id AS TEXT);
      END;
    `);

    await (transaction as SavedFavoritesSchemaTransaction).runAsync(
      'INSERT INTO saveapp_schema_migrations (version, applied_at) VALUES (?, ?);',
      SAVED_FAVORITES_SCHEMA_VERSION,
      Date.now(),
    );
  });
}
