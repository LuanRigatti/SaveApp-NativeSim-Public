import type { SQLiteDatabase } from 'expo-sqlite';

export type RecentlyDeletedSchemaDatabase = Pick<
  SQLiteDatabase,
  'execAsync' | 'withExclusiveTransactionAsync'
>;

type RecentlyDeletedSchemaTransaction = Pick<
  SQLiteDatabase,
  'execAsync' | 'getAllAsync' | 'getFirstAsync' | 'runAsync'
>;

export const RECENTLY_DELETED_SCHEMA_VERSION = 9;

const CONTENT_TABLES = ['photos', 'saved_content', 'saved_documents', 'saved_checklists'] as const;

/** Adds tombstone metadata without moving files or rebuilding any content table. */
export async function ensureRecentlyDeletedSchema(
  database: RecentlyDeletedSchemaDatabase,
): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS saveapp_schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const migration = await transaction.getFirstAsync<{ version: number }>(
      'SELECT version FROM saveapp_schema_migrations WHERE version = ? LIMIT 1;',
      RECENTLY_DELETED_SCHEMA_VERSION,
    );
    if (migration) return;

    for (const table of CONTENT_TABLES) {
      const exists = await (transaction as RecentlyDeletedSchemaTransaction).getFirstAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1;",
        table,
      );
      if (!exists) throw new Error(`RECENTLY_DELETED_REQUIRED_TABLE_MISSING:${table}`);

      const columns = await (transaction as RecentlyDeletedSchemaTransaction).getAllAsync<{ name: string }>(
        `PRAGMA table_info(${table});`,
      );
      const names = new Set(columns.map(({ name }) => name));
      if (!names.has('deleted_at')) {
        await transaction.execAsync(`ALTER TABLE ${table} ADD COLUMN deleted_at INTEGER;`);
      }
      if (!names.has('deleted_folder_id')) {
        await transaction.execAsync(`ALTER TABLE ${table} ADD COLUMN deleted_folder_id TEXT;`);
      }
      if (!names.has('deleted_folder_is_protected')) {
        await transaction.execAsync(
          `ALTER TABLE ${table} ADD COLUMN deleted_folder_is_protected INTEGER NOT NULL DEFAULT 0;`,
        );
      }
      await transaction.execAsync(
        `CREATE INDEX IF NOT EXISTS ${table}_deleted_at_idx ON ${table}(deleted_at) WHERE deleted_at IS NOT NULL;`,
      );
    }

    // Trashed links must not block saving the same URL again. Keep the one-active-link rule.
    await transaction.execAsync(`
      DROP INDEX IF EXISTS saved_content_link_url_unique_idx;
      CREATE UNIQUE INDEX saved_content_link_url_unique_idx
        ON saved_content(normalized_url)
        WHERE content_type = 'link' AND deleted_at IS NULL;
    `);

    await transaction.runAsync(
      'INSERT INTO saveapp_schema_migrations (version, applied_at) VALUES (?, ?);',
      RECENTLY_DELETED_SCHEMA_VERSION,
      Date.now(),
    );
  });
}
