/* global describe, expect, test */

const {
  ensureSavedDocumentsSchema,
  SAVED_DOCUMENTS_SCHEMA_VERSION,
} = require('../src/features/documents/documentSchemaMigration');

function createDatabase({ failFirstSchema = false, existingDocumentsMigration = false, existingThumbnailColumn = false } = {}) {
  const versions = new Set(existingDocumentsMigration ? [1, 2] : [1]);
  const statements = [];
  const legacyPhotos = [{ id: 27, relative_path: 'photos/photo-legacy.jpg' }];
  const savedContents = [{ id: 8, content_type: 'text', text_content: 'Nota existente' }];
  let hasDocumentsTable = existingDocumentsMigration;
  const documentColumns = new Set(existingThumbnailColumn ? ['thumbnail_relative_path'] : []);
  let shouldFail = failFirstSchema;
  let documentTableCreates = 0;

  return {
    versions,
    statements,
    legacyPhotos,
    savedContents,
    get hasDocumentsTable() { return hasDocumentsTable; },
    get documentTableCreates() { return documentTableCreates; },
    async execAsync(source) { statements.push(source); },
    async withExclusiveTransactionAsync(task) {
      const previousTable = hasDocumentsTable;
      const previousColumns = new Set(documentColumns);
      const previousVersions = new Set(versions);
      const transaction = {
        async execAsync(source) {
          statements.push(source);
          if (/CREATE TABLE IF NOT EXISTS saved_documents/i.test(source)) {
            documentTableCreates += 1;
            if (shouldFail) {
              shouldFail = false;
              throw new Error('migration interrupted');
            }
            hasDocumentsTable = true;
          }
          if (/ALTER TABLE saved_documents ADD COLUMN thumbnail_relative_path/i.test(source)) {
            documentColumns.add('thumbnail_relative_path');
          }
        },
        async getFirstAsync(_sql, version) {
          return versions.has(version) ? { version } : null;
        },
        async getAllAsync() {
          return [...documentColumns].map((name) => ({ name }));
        },
        async runAsync(_sql, version) { versions.add(version); },
      };

      try {
        await task(transaction);
      } catch (error) {
        hasDocumentsTable = previousTable;
        documentColumns.clear();
        for (const column of previousColumns) documentColumns.add(column);
        versions.clear();
        for (const version of previousVersions) versions.add(version);
        throw error;
      }
    },
  };
}

describe('additive saved document schema migration', () => {
  test('creates a document table once while preserving photos and link/text records', async () => {
    const database = createDatabase();
    const originalPhotos = structuredClone(database.legacyPhotos);
    const originalContents = structuredClone(database.savedContents);

    await ensureSavedDocumentsSchema(database);
    await ensureSavedDocumentsSchema(database);

    expect(database.hasDocumentsTable).toBe(true);
    expect(database.versions.has(SAVED_DOCUMENTS_SCHEMA_VERSION)).toBe(true);
    expect(database.versions.has(2)).toBe(true);
    expect(database.statements.join('\n')).toMatch(/ALTER TABLE saved_documents ADD COLUMN thumbnail_relative_path TEXT/i);
    expect(database.documentTableCreates).toBe(1);
    expect(database.legacyPhotos).toEqual(originalPhotos);
    expect(database.savedContents).toEqual(originalContents);
    expect(database.statements.join('\n')).not.toMatch(
      /DROP\s+TABLE|DELETE\s+FROM\s+(?:photos|saved_content)|ALTER\s+TABLE\s+(?:photos|saved_content)/i,
    );
  });

  test('can resume after interruption without marking the migration as complete early', async () => {
    const database = createDatabase({ failFirstSchema: true });

    await expect(ensureSavedDocumentsSchema(database)).rejects.toThrow('migration interrupted');
    expect(database.hasDocumentsTable).toBe(false);
    expect(database.versions.has(SAVED_DOCUMENTS_SCHEMA_VERSION)).toBe(false);
    await expect(ensureSavedDocumentsSchema(database)).resolves.toBeUndefined();
    expect(database.hasDocumentsTable).toBe(true);
    expect(database.versions.has(SAVED_DOCUMENTS_SCHEMA_VERSION)).toBe(true);
  });

  test('records the thumbnail migration without adding the column twice if it already exists', async () => {
    const database = createDatabase({ existingDocumentsMigration: true, existingThumbnailColumn: true });

    await ensureSavedDocumentsSchema(database);
    await ensureSavedDocumentsSchema(database);

    expect(database.versions.has(SAVED_DOCUMENTS_SCHEMA_VERSION)).toBe(true);
    expect(database.statements.join('\n')).not.toMatch(/ALTER TABLE saved_documents ADD COLUMN thumbnail_relative_path/i);
  });
});
