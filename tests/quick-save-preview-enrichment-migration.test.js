/* global describe, expect, test */

const {
  ensureQuickSavePreviewEnrichmentSchema,
  QUICK_SAVE_PREVIEW_ENRICHMENT_SCHEMA_VERSION,
} = require('../src/features/home-content/quickSavePreviewEnrichmentSchemaMigration');

function createDatabase({ hasFavorites = true } = {}) {
  const versions = new Set(hasFavorites ? [10] : []);
  const statements = [];
  let tableCreated = false;
  return {
    versions,
    statements,
    get tableCreated() { return tableCreated; },
    async execAsync(source) { statements.push(source); },
    async withExclusiveTransactionAsync(task) {
      const transaction = {
        execAsync: async (source) => {
          statements.push(source);
          if (/CREATE TABLE saved_link_preview_enrichment/i.test(source)) tableCreated = true;
        },
        getFirstAsync: async (_sql, version) => versions.has(version) ? { version } : null,
        runAsync: async (_sql, version) => { versions.add(version); },
      };
      await task(transaction);
    },
  };
}

describe('Quick Save preview enrichment migration', () => {
  test('adds a durable bounded retry ledger without rewriting saved content', async () => {
    const database = createDatabase();
    await ensureQuickSavePreviewEnrichmentSchema(database);
    await ensureQuickSavePreviewEnrichmentSchema(database);

    expect(database.tableCreated).toBe(true);
    expect(database.versions.has(QUICK_SAVE_PREVIEW_ENRICHMENT_SCHEMA_VERSION)).toBe(true);
    expect(database.statements.join('\n')).toContain('attempt_count BETWEEN 0 AND 2');
    expect(database.statements.join('\n')).toContain('REFERENCES saved_content(id) ON DELETE CASCADE');
    expect(database.statements.join('\n')).not.toMatch(/ALTER\s+TABLE\s+saved_content|DELETE\s+FROM\s+saved_content|DROP\s+TABLE/i);
  });

  test('fails closed if the prerequisite favorites migration is absent', async () => {
    const database = createDatabase({ hasFavorites: false });
    await expect(ensureQuickSavePreviewEnrichmentSchema(database))
      .rejects.toThrow('QUICK_SAVE_PREVIEW_ENRICHMENT_SCHEMA_V10_REQUIRED');
    expect(database.tableCreated).toBe(false);
    expect(database.versions.has(QUICK_SAVE_PREVIEW_ENRICHMENT_SCHEMA_VERSION)).toBe(false);
  });
});
