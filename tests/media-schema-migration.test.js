const { ensureMixedMediaSchema } = require('../src/features/photos/mediaSchemaMigration');

const originalColumns = [
  'id',
  'relative_path',
  'width',
  'height',
  'created_at',
  'mime_type',
];

function createLegacyDatabase({ failOnColumn = null } = {}) {
  const columns = [...originalColumns];
  const rows = [
    {
      id: 31,
      relative_path: 'photos/photo-1800000000000-a1b2c3d4.jpg',
      width: 1200,
      height: 800,
      created_at: 1_800_000_000_000,
      mime_type: 'image/jpeg',
    },
  ];
  const statements = [];
  let shouldFail = Boolean(failOnColumn);

  return {
    columns,
    rows,
    statements,
    async execAsync(source) {
      statements.push(source);
      const match = source.match(/ALTER TABLE photos ADD COLUMN ([a-z_]+)/i);
      if (match) {
        const columnName = match[1];
        if (shouldFail && columnName === failOnColumn) {
          shouldFail = false;
          throw new Error('simulated migration interruption');
        }
        if (!columns.includes(columnName)) {
          columns.push(columnName);
          if (columnName === 'media_type') {
            rows.forEach((row) => {
              row.media_type = 'photo';
            });
          }
          if (columnName === 'custom_title') {
            rows.forEach((row) => {
              row.custom_title = null;
            });
          }
          if (columnName === 'is_screenshot') {
            rows.forEach((row) => {
              row.is_screenshot = 0;
            });
          }
        }
      }
      if (/\bDROP\s+TABLE\b/i.test(source)) {
        throw new Error('destructive table replacement is forbidden');
      }
    },
    async getAllAsync(source) {
      if (source !== 'PRAGMA table_info(photos);') {
        throw new Error(`unexpected query: ${source}`);
      }
      return columns.map((name) => ({ name }));
    },
  };
}

describe('mixed media schema migration', () => {
  test('adds only new columns and keeps existing photo rows intact across repeated opens', async () => {
    const database = createLegacyDatabase();
    const originalRow = { ...database.rows[0] };

    await ensureMixedMediaSchema(database);
    await ensureMixedMediaSchema(database);

    expect(database.columns).toEqual([
      ...originalColumns,
      'media_type',
      'duration_ms',
      'thumbnail_relative_path',
      'custom_title',
      'is_screenshot',
    ]);
    expect(database.rows).toEqual([
      { ...originalRow, media_type: 'photo', custom_title: null, is_screenshot: 0 },
    ]);
    expect(database.statements.filter((sql) => /ALTER TABLE photos ADD COLUMN/.test(sql))).toHaveLength(5);
    expect(database.statements.join('\n')).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM\s+photos/i);
  });

  test('resumes safely after an interrupted additive migration', async () => {
    const database = createLegacyDatabase({ failOnColumn: 'duration_ms' });

    await expect(ensureMixedMediaSchema(database)).rejects.toThrow('simulated migration interruption');
    await expect(ensureMixedMediaSchema(database)).resolves.toBeUndefined();

    expect(database.rows[0].relative_path).toBe('photos/photo-1800000000000-a1b2c3d4.jpg');
    expect(database.rows[0].media_type).toBe('photo');
    expect(database.columns).toEqual([
      ...originalColumns,
      'media_type',
      'duration_ms',
      'thumbnail_relative_path',
      'custom_title',
      'is_screenshot',
    ]);
  });

  test('resumes safely when the photo title columns migration is interrupted', async () => {
    const database = createLegacyDatabase({ failOnColumn: 'is_screenshot' });

    await expect(ensureMixedMediaSchema(database)).rejects.toThrow('simulated migration interruption');
    await expect(ensureMixedMediaSchema(database)).resolves.toBeUndefined();

    expect(database.rows[0]).toMatchObject({
      id: 31,
      relative_path: 'photos/photo-1800000000000-a1b2c3d4.jpg',
      custom_title: null,
      is_screenshot: 0,
    });
    expect(database.statements.join('\n')).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM\s+photos/i);
  });
});
