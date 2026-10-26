/* global afterEach, beforeEach, describe, expect, jest, test */

const { DatabaseSync } = require('node:sqlite');

const mockDatabase = { current: null };

jest.mock(
  '@/features/photos/photoLibrary',
  () => ({ getSaveAppDatabase: async () => mockDatabase.current }),
  { virtual: true },
);

const {
  createSavedTag,
  deleteSavedTag,
  listSavedTagAssignments,
  listSavedTags,
  setSavedTagAssociation,
  updateSavedTag,
} = require('../src/features/home-tags/tagLibrary');
const {
  SAVED_TAG_SCHEMA_VERSION,
  ensureSavedTagSchema,
} = require('../src/features/home-tags/tagSchemaMigration');
const { getVisibleSavedTagDots } = require('../src/features/home-tags/tagPresentation');
const { SavedTagNameError } = require('../src/features/home-tags/tagTypes');

function createDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE saveapp_schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL);
    INSERT INTO saveapp_schema_migrations (version, applied_at) VALUES (4, 4), (5, 5), (6, 6), (7, 7);
    CREATE TABLE photos (id INTEGER PRIMARY KEY, media_type TEXT NOT NULL, deleted_at INTEGER);
    CREATE TABLE saved_content (id INTEGER PRIMARY KEY, content_type TEXT NOT NULL, deleted_at INTEGER);
    CREATE TABLE saved_documents (id INTEGER PRIMARY KEY, deleted_at INTEGER);
    CREATE TABLE saved_checklists (id INTEGER PRIMARY KEY, deleted_at INTEGER);
    INSERT INTO photos (id, media_type) VALUES (1, 'photo'), (2, 'video');
    INSERT INTO saved_content (id, content_type) VALUES (3, 'link'), (4, 'text');
    INSERT INTO saved_documents (id) VALUES (5);
    INSERT INTO saved_checklists (id) VALUES (6);
  `);

  const makeAdapter = (connection) => ({
    async execAsync(source) { connection.exec(source); },
    async runAsync(source, ...parameters) {
      const result = connection.prepare(source).run(...parameters);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async getFirstAsync(source, ...parameters) {
      return connection.prepare(source).get(...parameters) ?? null;
    },
    async getAllAsync(source, ...parameters) {
      return connection.prepare(source).all(...parameters);
    },
    async withExclusiveTransactionAsync(callback) {
      connection.exec('BEGIN EXCLUSIVE;');
      try {
        await callback(makeAdapter(connection));
        connection.exec('COMMIT;');
      } catch (error) {
        connection.exec('ROLLBACK;');
        throw error;
      }
    },
  });

  return { sqlite, database: makeAdapter(sqlite) };
}

describe('local saved tags', () => {
  let database;

  beforeEach(async () => {
    database = createDatabase();
    mockDatabase.current = database.database;
    await ensureSavedTagSchema(database.database);
  });

  afterEach(() => {
    mockDatabase.current = null;
    database.sqlite.close();
  });

  test('v8 migration creates an independent catalog, preserves existing records, and is idempotent', async () => {
    await ensureSavedTagSchema(database.database);

    expect(database.sqlite.prepare('SELECT version FROM saveapp_schema_migrations WHERE version = ?;').get(SAVED_TAG_SCHEMA_VERSION))
      .toEqual({ version: SAVED_TAG_SCHEMA_VERSION });
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM photos;').get().count).toBe(2);
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_content;').get().count).toBe(2);
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_documents;').get().count).toBe(1);
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_checklists;').get().count).toBe(1);
    expect(database.sqlite.prepare("PRAGMA table_info(saved_tags);").all().map(({ name }) => name)).toEqual([
      'id', 'name', 'normalized_name', 'color', 'created_at', 'updated_at',
    ]);
  });

  test('creates, renames, recolors, and rejects duplicate or invalid names', async () => {
    const tag = await createSavedTag('  Trabalho   urgente ', 'cyan');
    expect(tag.name).toBe('Trabalho urgente');
    expect(tag.color).toBe('cyan');

    const updated = await updateSavedTag(tag.id, 'Trabalho', 'wine');
    expect(updated).toMatchObject({ id: tag.id, name: 'Trabalho', color: 'wine' });
    await expect(createSavedTag(' trabalho ', 'red')).rejects.toBeInstanceOf(SavedTagNameError);
    await expect(createSavedTag('   ', 'red')).rejects.toMatchObject({ code: 'required' });
    await expect(createSavedTag('x'.repeat(41), 'red')).rejects.toMatchObject({ code: 'too-long' });
    expect(await listSavedTags()).toEqual([updated]);
  });

  test('associates multiple tags with every saved content type and scopes reads to requested items', async () => {
    const first = await createSavedTag('Trabalho', 'indigo');
    const second = await createSavedTag('Pessoal', 'pink');
    const references = [
      { itemType: 'photo', itemId: 1 },
      { itemType: 'video', itemId: 2 },
      { itemType: 'link', itemId: 3 },
      { itemType: 'text', itemId: 4 },
      { itemType: 'document', itemId: 5 },
      { itemType: 'checklist', itemId: 6 },
    ];

    for (const reference of references) await setSavedTagAssociation(reference, first.id, true);
    await setSavedTagAssociation(references[0], second.id, true);

    const assignments = await listSavedTagAssignments(references);
    expect(assignments).toHaveLength(7);
    expect(assignments.filter(({ itemType, itemId }) => itemType === 'photo' && itemId === 1)).toHaveLength(2);
    expect(await listSavedTagAssignments([references[2]])).toEqual([
      expect.objectContaining({ itemType: 'link', itemId: 3, tagId: first.id }),
    ]);

    await setSavedTagAssociation(references[0], second.id, false);
    expect(await listSavedTagAssignments([references[0]])).toEqual([
      expect.objectContaining({ itemType: 'photo', itemId: 1, tagId: first.id }),
    ]);
  });

  test('deleting a tag removes only associations and deleting content cleans its associations', async () => {
    const tag = await createSavedTag('Arquivo', 'green');
    await setSavedTagAssociation({ itemType: 'document', itemId: 5 }, tag.id, true);
    await setSavedTagAssociation({ itemType: 'checklist', itemId: 6 }, tag.id, true);

    expect(await deleteSavedTag(tag.id)).toBe(true);
    expect(await listSavedTags()).toEqual([]);
    expect(await listSavedTagAssignments([
      { itemType: 'document', itemId: 5 },
      { itemType: 'checklist', itemId: 6 },
    ])).toEqual([]);
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_documents;').get().count).toBe(1);
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_checklists;').get().count).toBe(1);

    const second = await createSavedTag('Outro', 'blue');
    for (const [table, id, itemType] of [
      ['photos', 1, 'photo'],
      ['photos', 2, 'video'],
      ['saved_content', 3, 'link'],
      ['saved_content', 4, 'text'],
      ['saved_documents', 5, 'document'],
      ['saved_checklists', 6, 'checklist'],
    ]) {
      await setSavedTagAssociation({ itemType, itemId: id }, second.id, true);
      database.sqlite.prepare(`DELETE FROM ${table} WHERE id = ?;`).run(id);
      expect(await listSavedTagAssignments([{ itemType, itemId: id }])).toEqual([]);
    }
  });

  test('only a specific-folder view returns the first two color indicators', () => {
    const assignments = [
      { itemType: 'photo', itemId: 1, tagId: 'one', name: 'A', color: 'red' },
      { itemType: 'photo', itemId: 1, tagId: 'two', name: 'B', color: 'blue' },
      { itemType: 'photo', itemId: 1, tagId: 'three', name: 'C', color: 'green' },
    ];
    expect(getVisibleSavedTagDots(true, assignments).map(({ tagId }) => tagId)).toEqual(['one', 'two']);
    expect(getVisibleSavedTagDots(false, assignments)).toEqual([]);
  });
});
