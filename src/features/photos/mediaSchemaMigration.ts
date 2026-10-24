type PhotoTableColumn = {
  name: string;
};

export type MediaSchemaDatabase = {
  execAsync: (source: string) => Promise<void>;
  getAllAsync: <T>(source: string) => Promise<T[]>;
};

const ADDITIVE_MEDIA_COLUMNS = [
  "ALTER TABLE photos ADD COLUMN media_type TEXT NOT NULL DEFAULT 'photo' CHECK (media_type IN ('photo', 'video'));",
  'ALTER TABLE photos ADD COLUMN duration_ms REAL;',
  'ALTER TABLE photos ADD COLUMN thumbnail_relative_path TEXT;',
  'ALTER TABLE photos ADD COLUMN custom_title TEXT;',
  'ALTER TABLE photos ADD COLUMN is_screenshot INTEGER NOT NULL DEFAULT 0 CHECK (is_screenshot IN (0, 1));',
] as const;

/** Adds mixed-media and photo-title metadata without replacing existing rows or files. */
export async function ensureMixedMediaSchema(database: MediaSchemaDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      relative_path TEXT NOT NULL UNIQUE,
      width INTEGER NOT NULL CHECK (width > 0),
      height INTEGER NOT NULL CHECK (height > 0),
      created_at INTEGER NOT NULL,
      mime_type TEXT
    );
  `);

  const columns = await database.getAllAsync<PhotoTableColumn>('PRAGMA table_info(photos);');
  const existingColumns = new Set(columns.map(({ name }) => name));
  const addedColumnNames = [
    'media_type',
    'duration_ms',
    'thumbnail_relative_path',
    'custom_title',
    'is_screenshot',
  ] as const;

  for (const [index, columnName] of addedColumnNames.entries()) {
    if (!existingColumns.has(columnName)) {
      await database.execAsync(ADDITIVE_MEDIA_COLUMNS[index]);
    }
  }

  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS photos_created_at_idx
      ON photos(created_at DESC, id DESC);
  `);
}
