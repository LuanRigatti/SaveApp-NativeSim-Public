import type { SQLiteDatabase } from 'expo-sqlite';

export type SavedContentMigrationDatabase = Pick<
  SQLiteDatabase,
  'execAsync' | 'withExclusiveTransactionAsync'
>;

export const SAVED_CONTENT_SCHEMA_VERSION = 1;

/** Adds the link/text catalog in a versioned transaction without touching photos or media files. */
export async function ensureSavedContentSchema(
  database: SavedContentMigrationDatabase,
): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS saveapp_schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const migration = await transaction.getFirstAsync<{ version: number }>(
      'SELECT version FROM saveapp_schema_migrations WHERE version = ?;',
      SAVED_CONTENT_SCHEMA_VERSION,
    );
    if (migration) {
      return;
    }

    await transaction.execAsync(`
      CREATE TABLE IF NOT EXISTS saved_content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_type TEXT NOT NULL CHECK (content_type IN ('link', 'text')),
        created_at INTEGER NOT NULL,
        url TEXT,
        normalized_url TEXT,
        title TEXT,
        description TEXT,
        domain TEXT,
        image_url TEXT,
        favicon_url TEXT,
        preview_image_relative_path TEXT,
        preview_image_mime_type TEXT,
        text_content TEXT,
        CHECK (
          (content_type = 'link' AND url IS NOT NULL AND normalized_url IS NOT NULL AND text_content IS NULL)
          OR
          (content_type = 'text' AND url IS NULL AND normalized_url IS NULL AND text_content IS NOT NULL)
        )
      );
      CREATE UNIQUE INDEX IF NOT EXISTS saved_content_link_url_unique_idx
        ON saved_content(normalized_url) WHERE content_type = 'link';
      CREATE INDEX IF NOT EXISTS saved_content_created_at_idx
        ON saved_content(created_at DESC, id DESC);
    `);

    await transaction.runAsync(
      'INSERT INTO saveapp_schema_migrations (version, applied_at) VALUES (?, ?);',
      SAVED_CONTENT_SCHEMA_VERSION,
      Date.now(),
    );
  });
}
