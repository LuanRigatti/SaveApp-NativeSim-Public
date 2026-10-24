const { ensureSavedContentSchema, SAVED_CONTENT_SCHEMA_VERSION } = require('../src/features/home-content/savedContentSchemaMigration');

function createDatabase({ failFirstSchema = false } = {}) {
  const legacyPhotoRows = [
    { id: 27, relative_path: 'photos/photo-legacy.jpg', created_at: 1_700_000_000_000 },
  ];
  const versions = new Set();
  const statements = [];
  let savedContentTable = false;
  let indexStatements = 0;
  let shouldFail = failFirstSchema;

  return {
    legacyPhotoRows,
    versions,
    statements,
    get savedContentTable() { return savedContentTable; },
    get indexStatements() { return indexStatements; },
    async execAsync(source) {
      statements.push(source);
      if (/CREATE TABLE IF NOT EXISTS saved_content/i.test(source)) {
        if (shouldFail) {
          shouldFail = false;
          throw new Error('simulated migration interruption');
        }
        savedContentTable = true;
      }
      if (/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS/i.test(source)) indexStatements += 1;
      if (/DROP\s+TABLE|DELETE\s+FROM\s+photos|ALTER\s+TABLE\s+photos/i.test(source)) {
        throw new Error('existing photo storage must not be modified by this migration');
      }
    },
    async withExclusiveTransactionAsync(task) {
      const previousTableState = savedContentTable;
      const previousVersions = new Set(versions);
      const previousIndexStatements = indexStatements;
      const transaction = {
        execAsync: async (source) => this.execAsync(source),
        getFirstAsync: async (_source, version) => versions.has(version) ? { version } : null,
        runAsync: async (_source, version) => { versions.add(version); },
      };
      try {
        await task(transaction);
      } catch (error) {
        savedContentTable = previousTableState;
        versions.clear();
        for (const version of previousVersions) versions.add(version);
        indexStatements = previousIndexStatements;
        throw error;
      }
    },
  };
}

describe('additive saved content schema migration', () => {
  test('creates links/texts once and leaves existing photo rows and schema untouched', async () => {
    const database = createDatabase();
    const originalPhotos = structuredClone(database.legacyPhotoRows);

    await ensureSavedContentSchema(database);
    await ensureSavedContentSchema(database);

    expect(database.savedContentTable).toBe(true);
    expect(database.versions.has(SAVED_CONTENT_SCHEMA_VERSION)).toBe(true);
    expect(database.indexStatements).toBe(1);
    expect(database.legacyPhotoRows).toEqual(originalPhotos);
    expect(database.statements.join('\n')).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM\s+photos|ALTER\s+TABLE\s+photos/i);
  });

  test('resumes after an interrupted transaction and remains idempotent', async () => {
    const database = createDatabase({ failFirstSchema: true });

    await expect(ensureSavedContentSchema(database)).rejects.toThrow('simulated migration interruption');
    expect(database.savedContentTable).toBe(false);
    expect(database.versions.size).toBe(0);
    await expect(ensureSavedContentSchema(database)).resolves.toBeUndefined();
    await expect(ensureSavedContentSchema(database)).resolves.toBeUndefined();
    expect(database.versions).toEqual(new Set([SAVED_CONTENT_SCHEMA_VERSION]));
    expect(database.legacyPhotoRows[0].relative_path).toBe('photos/photo-legacy.jpg');
  });
});
