/* global afterEach, beforeEach, describe, expect, jest, test */

const { DatabaseSync } = require('node:sqlite');

const mockDatabase = { current: null };

jest.mock(
  '@/features/photos/photoLibrary',
  () => ({ getSaveAppDatabase: async () => mockDatabase.current }),
  { virtual: true },
);

const { listSavedFavoriteKeys, setSavedFavorite } = require('../src/features/home-content/favoritesLibrary');
const {
  SAVED_FAVORITES_SCHEMA_VERSION,
  ensureSavedFavoritesSchema,
} = require('../src/features/home-content/favoritesSchemaMigration');
const { filterHomeFavoriteItems, getHomeTitleForFavorites } = require('../src/features/home-content/homeFavorites');
const { getHomeFolderItemKey } = require('../src/features/home-folders/homeFolderTypes');
const { getSavedHomeItemKey } = require('../src/features/home-content/homeContentTypes');

function createDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE saveapp_schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL);
    INSERT INTO saveapp_schema_migrations (version, applied_at) VALUES (9, 900);
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

const references = [
  { itemType: 'photo', itemId: 1 },
  { itemType: 'video', itemId: 2 },
  { itemType: 'link', itemId: 3 },
  { itemType: 'text', itemId: 4 },
  { itemType: 'document', itemId: 5 },
  { itemType: 'checklist', itemId: 6 },
];

describe('saved favorites', () => {
  let fixture;

  beforeEach(async () => {
    fixture = createDatabase();
    mockDatabase.current = fixture.database;
    await ensureSavedFavoritesSchema(fixture.database);
  });

  afterEach(() => {
    mockDatabase.current = null;
    fixture.sqlite.close();
  });

  test('v10 migration is additive, preserves content, and is idempotent', async () => {
    await ensureSavedFavoritesSchema(fixture.database);
    expect(fixture.sqlite.prepare('SELECT version FROM saveapp_schema_migrations WHERE version = ?;').get(SAVED_FAVORITES_SCHEMA_VERSION))
      .toEqual({ version: SAVED_FAVORITES_SCHEMA_VERSION });
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM photos;').get().count).toBe(2);
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_content;').get().count).toBe(2);
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_documents;').get().count).toBe(1);
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_checklists;').get().count).toBe(1);
  });

  test('persists independent favorites for all six content types and removes them on permanent deletion', async () => {
    for (const reference of references) await setSavedFavorite(reference, true);
    expect(new Set(await listSavedFavoriteKeys())).toEqual(
      new Set(references.map(({ itemType, itemId }) => getHomeFolderItemKey(itemType, itemId))),
    );

    fixture.sqlite.prepare('UPDATE saved_checklists SET deleted_at = 123 WHERE id = 6;').run();
    expect(await listSavedFavoriteKeys()).toContain(getHomeFolderItemKey('checklist', 6));
    await expect(setSavedFavorite(references[5], true)).rejects.toThrow('SAVED_FAVORITE_ITEM_NOT_FOUND');

    for (const [table, reference] of [
      ['photos', references[0]],
      ['photos', references[1]],
      ['saved_content', references[2]],
      ['saved_content', references[3]],
      ['saved_documents', references[4]],
      ['saved_checklists', references[5]],
    ]) {
      fixture.sqlite.prepare(`DELETE FROM ${table} WHERE id = ?;`).run(reference.itemId);
      expect(await listSavedFavoriteKeys()).not.toContain(getHomeFolderItemKey(reference.itemType, reference.itemId));
    }

    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_favorite_items;').get().count).toBe(0);
  });

  test('removes a favorite without affecting the saved item', async () => {
    await setSavedFavorite(references[2], true);
    await setSavedFavorite(references[2], false);
    expect(await listSavedFavoriteKeys()).toEqual([]);
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_content WHERE id = 3;').get().count).toBe(1);
  });
});

describe('Home favorites filtering', () => {
  const items = [
    { id: 1, mediaType: 'photo' },
    { id: 2, mediaType: 'video' },
    { id: 3, contentType: 'link' },
    { id: 4, contentType: 'text' },
    { id: 5, contentType: 'document' },
    { id: 6, contentType: 'checklist' },
  ];

  test('shows only marked items across all six supported types and keeps a single Favorites title', () => {
    const favoriteKeys = new Set(items.map(getSavedHomeItemKey));
    expect(filterHomeFavoriteItems(items, favoriteKeys, new Map(), new Set(), new Set()))
      .toEqual(items);
    expect(getHomeTitleForFavorites('Todos', true)).toBe('Favoritos');
    expect(getHomeTitleForFavorites('Pastas', false)).toBe('Pastas');
  });

  test('does not reveal favorites inside protected folders until that folder is authorized', () => {
    const folderAssignments = new Map([
      [getHomeFolderItemKey('photo', 1), 'protected-folder'],
      [getHomeFolderItemKey('link', 3), 'open-folder'],
    ]);
    const favorites = new Set(items.map(getSavedHomeItemKey));
    const protectedFolders = new Set(['protected-folder']);

    expect(filterHomeFavoriteItems(items, favorites, folderAssignments, protectedFolders, new Set()))
      .toEqual(items.slice(1));
    expect(filterHomeFavoriteItems(items, favorites, folderAssignments, protectedFolders, new Set(['protected-folder'])))
      .toEqual(items);
  });

  test('fails closed until folder assignments are loaded', () => {
    const assignedToProtectedFolder = new Map([
      [getHomeFolderItemKey('checklist', 6), 'protected-folder'],
    ]);
    const favorites = new Set([getSavedHomeItemKey(items[5])]);

    expect(filterHomeFavoriteItems(items, favorites, assignedToProtectedFolder, new Set(), new Set(), false))
      .toEqual([]);
  });
});
