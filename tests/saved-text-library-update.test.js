/* global afterEach, beforeEach, describe, expect, jest, test */

const { DatabaseSync } = require('node:sqlite');

const mockDatabase = { current: null };

jest.mock(
  '@/features/photos/photoLibrary',
  () => ({ getSaveAppDatabase: async () => mockDatabase.current }),
  { virtual: true },
);

const { updateSavedText } = require('../src/features/home-content/savedContentLibrary');
const { createRichNoteParagraph, encodeRichNoteDraft } = require('../src/features/home-content/richNoteDocument');

function createDatabaseAdapter({ failAfterTextUpdate = false } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE saved_content (
      id INTEGER PRIMARY KEY,
      content_type TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      text_content TEXT,
      deleted_at INTEGER
    );
    CREATE TABLE saved_folder_items (
      content_type TEXT NOT NULL,
      content_id INTEGER NOT NULL,
      folder_id INTEGER NOT NULL,
      PRIMARY KEY (content_type, content_id)
    );
    INSERT INTO saved_content (id, content_type, created_at, text_content) VALUES (9, 'text', 321, 'antes');
    INSERT INTO saved_folder_items (content_type, content_id, folder_id) VALUES ('text', 9, 5);
  `);

  const adapter = {
    async runAsync(source, ...parameters) {
      const result = sqlite.prepare(source).run(...parameters);
      if (failAfterTextUpdate && /^\s*UPDATE saved_content SET text_content/i.test(source)) {
        throw new Error('simulated transaction failure');
      }
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async getFirstAsync(source, ...parameters) {
      return sqlite.prepare(source).get(...parameters) ?? null;
    },
    async withExclusiveTransactionAsync(work) {
      sqlite.exec('BEGIN IMMEDIATE;');
      try {
        await work(adapter);
        sqlite.exec('COMMIT;');
      } catch (error) {
        sqlite.exec('ROLLBACK;');
        throw error;
      }
    },
    sqlite,
  };
  return adapter;
}

beforeEach(() => {
  mockDatabase.current = createDatabaseAdapter();
});

afterEach(() => {
  mockDatabase.current.sqlite.close();
  mockDatabase.current = null;
});

describe('saved text SQLite update', () => {
  test('commits edits to the same row while preserving its ID, creation date, folder, and row count', async () => {
    const saved = await updateSavedText(9, 'texto editado\nsegunda linha');
    const row = mockDatabase.current.sqlite.prepare('SELECT * FROM saved_content WHERE id = 9').get();
    const folder = mockDatabase.current.sqlite.prepare('SELECT * FROM saved_folder_items WHERE content_id = 9').get();

    expect(saved).toMatchObject({
      id: 9,
      contentType: 'text',
      createdAt: 321,
      text: 'texto editado\nsegunda linha',
      storageText: 'texto editado\nsegunda linha',
    });
    expect(row).toMatchObject({ id: 9, content_type: 'text', created_at: 321, text_content: 'texto editado\nsegunda linha' });
    expect(folder).toEqual({ content_type: 'text', content_id: 9, folder_id: 5 });
    expect(mockDatabase.current.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_content').get().count).toBe(1);
  });

  test('allows saving an empty body without removing the existing text record', async () => {
    await updateSavedText(9, '');
    const row = mockDatabase.current.sqlite.prepare('SELECT id, text_content FROM saved_content WHERE id = 9').get();
    expect(row).toEqual({ id: 9, text_content: '' });
    expect(mockDatabase.current.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_content').get().count).toBe(1);
  });

  test('persists ordered rich blocks in the same SQLite row and returns a plain Home projection', async () => {
    const document = {
      format: 'saveapp-rich-note',
      version: 1,
      blocks: [
        { ...createRichNoteParagraph('Antes'), id: 'paragraph-before' },
        { ...createRichNoteParagraph('Depois', { bold: true }), id: 'paragraph-after' },
      ],
    };
    const saved = await updateSavedText(9, encodeRichNoteDraft(document));
    const row = mockDatabase.current.sqlite.prepare('SELECT id, created_at, text_content FROM saved_content WHERE id = 9').get();
    const folder = mockDatabase.current.sqlite.prepare('SELECT folder_id FROM saved_folder_items WHERE content_id = 9').get();

    expect(saved).toMatchObject({ id: 9, createdAt: 321, text: 'Antes\nDepois' });
    expect(saved.richDocument.blocks.map((block) => block.id)).toEqual(['paragraph-before', 'paragraph-after']);
    expect(row.id).toBe(9);
    expect(row.created_at).toBe(321);
    expect(row.text_content).toMatch(/^SAVEAPP_RICH_NOTE_V1:/);
    expect(folder.folder_id).toBe(5);
    expect(mockDatabase.current.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_content').get().count).toBe(1);
  });

  test('rolls back a write that fails before the transaction commits', async () => {
    mockDatabase.current.sqlite.close();
    mockDatabase.current = createDatabaseAdapter({ failAfterTextUpdate: true });

    await expect(updateSavedText(9, 'não confirmado')).rejects.toThrow('simulated transaction failure');
    expect(mockDatabase.current.sqlite.prepare('SELECT text_content FROM saved_content WHERE id = 9').get())
      .toEqual({ text_content: 'antes' });
    expect(mockDatabase.current.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_content').get().count).toBe(1);
  });

  test('rejects missing or non-text records instead of creating a replacement note', async () => {
    await expect(updateSavedText(77, 'texto')).rejects.toThrow('no longer available');
    await expect(updateSavedText(0, 'texto')).rejects.toThrow('Invalid saved text id');
    expect(mockDatabase.current.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_content').get().count).toBe(1);
  });
});
