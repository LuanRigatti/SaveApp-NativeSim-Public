import type { SQLiteDatabase } from 'expo-sqlite';

export type QuickSavePreviewEnrichmentSchemaDatabase = Pick<
  SQLiteDatabase,
  'execAsync' | 'withExclusiveTransactionAsync'
>;

type QuickSavePreviewEnrichmentTransaction = Pick<SQLiteDatabase, 'execAsync' | 'getFirstAsync' | 'runAsync'>;

export const QUICK_SAVE_PREVIEW_ENRICHMENT_SCHEMA_VERSION = 11;

/** Tracks a small, durable retry budget without changing saved-content rows or user data. */
export async function ensureQuickSavePreviewEnrichmentSchema(
  database: QuickSavePreviewEnrichmentSchemaDatabase,
): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS saveapp_schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  await database.withExclusiveTransactionAsync(async (rawTransaction) => {
    const transaction = rawTransaction as QuickSavePreviewEnrichmentTransaction;
    const existing = await transaction.getFirstAsync<{ version: number }>(
      'SELECT version FROM saveapp_schema_migrations WHERE version = ? LIMIT 1;',
      QUICK_SAVE_PREVIEW_ENRICHMENT_SCHEMA_VERSION,
    );
    if (existing) return;

    const favoritesMigration = await transaction.getFirstAsync<{ version: number }>(
      'SELECT version FROM saveapp_schema_migrations WHERE version = ? LIMIT 1;',
      10,
    );
    if (!favoritesMigration) throw new Error('QUICK_SAVE_PREVIEW_ENRICHMENT_SCHEMA_V10_REQUIRED');

    await transaction.execAsync(`
      CREATE TABLE saved_link_preview_enrichment (
        content_id INTEGER PRIMARY KEY NOT NULL
          REFERENCES saved_content(id) ON DELETE CASCADE,
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 2),
        last_attempt_at INTEGER,
        completed_at INTEGER
      );
    `);
    await transaction.runAsync(
      'INSERT INTO saveapp_schema_migrations (version, applied_at) VALUES (?, ?);',
      QUICK_SAVE_PREVIEW_ENRICHMENT_SCHEMA_VERSION,
      Date.now(),
    );
  });
}
