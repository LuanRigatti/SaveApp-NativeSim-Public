/* global afterEach, beforeEach, describe, expect, jest, test */

const { DatabaseSync } = require('node:sqlite');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const repositoryRoot = join(__dirname, '..');
const source = (relativePath) => readFileSync(join(repositoryRoot, relativePath), 'utf8');

const mockTrash = { database: null, databaseError: null, deleted: [] };

jest.mock('@/features/photos/photoLibrary', () => ({
  getSaveAppDatabase: async () => {
    if (mockTrash.databaseError) throw mockTrash.databaseError;
    return mockTrash.database;
  },
  deleteSavedPhoto: async (id) => { mockTrash.deleted.push(['photo', id]); return true; },
  deleteSavedVideo: async (id) => { mockTrash.deleted.push(['video', id]); return true; },
}), { virtual: true });
jest.mock('@/features/home-content/savedContentLibrary', () => ({
  deleteSavedHomeContent: async (id, type) => { mockTrash.deleted.push([type, id]); return true; },
}), { virtual: true });
jest.mock('@/features/documents/documentLibrary', () => ({
  deleteSavedDocument: async (id) => {
    mockTrash.deleted.push(['document', id]);
    return mockTrash.documentDelete?.(id) ?? true;
  },
}), { virtual: true });
jest.mock('@/features/home-content/checklistLibrary', () => ({
  deleteSavedChecklist: async (id) => { mockTrash.deleted.push(['checklist', id]); return true; },
}), { virtual: true });

const {
  RECENTLY_DELETED_SCHEMA_VERSION,
  ensureRecentlyDeletedSchema,
} = require('../src/features/home-trash/trashSchemaMigration');
const trash = require('../src/features/home-trash/trashLibrary');

function createDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE saveapp_schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL);
    INSERT INTO saveapp_schema_migrations (version, applied_at) VALUES (1, 1), (2, 2), (3, 3), (4, 4), (5, 5), (6, 6), (7, 7), (8, 8);
    CREATE TABLE photos (
      id INTEGER PRIMARY KEY, media_type TEXT NOT NULL, custom_title TEXT, relative_path TEXT
    );
    CREATE TABLE saved_content (
      id INTEGER PRIMARY KEY, content_type TEXT NOT NULL, normalized_url TEXT,
      title TEXT, domain TEXT, text_content TEXT
    );
    CREATE UNIQUE INDEX saved_content_link_url_unique_idx
      ON saved_content(normalized_url) WHERE content_type = 'link';
    CREATE TABLE saved_documents (id INTEGER PRIMARY KEY, original_name TEXT NOT NULL);
    CREATE TABLE saved_checklists (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
    CREATE TABLE saved_checklist_items (
      id INTEGER PRIMARY KEY, checklist_id INTEGER NOT NULL, text TEXT NOT NULL
    );
    CREATE TABLE saved_folders (id TEXT PRIMARY KEY, name TEXT, is_protected INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE saved_folder_items (
      item_type TEXT NOT NULL, item_id TEXT NOT NULL,
      folder_id TEXT NOT NULL REFERENCES saved_folders(id) ON DELETE CASCADE,
      PRIMARY KEY (item_type, item_id)
    );
    CREATE TABLE saved_tags (id TEXT PRIMARY KEY);
    CREATE TABLE saved_tag_items (
      item_type TEXT NOT NULL, item_id TEXT NOT NULL, tag_id TEXT NOT NULL,
      created_at INTEGER NOT NULL, PRIMARY KEY (item_type, item_id, tag_id)
    );
    INSERT INTO photos (id, media_type, custom_title, relative_path) VALUES
      (1, 'photo', 'Minha foto', 'photos/photo-1.jpg'), (2, 'video', NULL, 'videos/video-2/video.mp4');
    INSERT INTO saved_content (id, content_type, normalized_url, title, domain, text_content) VALUES
      (3, 'link', 'https://example.com', 'Meu link', 'example.com', NULL),
      (4, 'text', NULL, NULL, NULL, 'Nota privada');
    INSERT INTO saved_documents (id, original_name) VALUES (5, 'Contrato.pdf');
    INSERT INTO saved_checklists (id, title) VALUES (6, 'Compras');
    INSERT INTO saved_checklist_items VALUES (61, 6, 'Leite'), (62, 6, 'Pão');
    INSERT INTO saved_folders VALUES ('folder-safe', 'Pessoal', 0), ('folder-private', 'Privada', 1);
    INSERT INTO saved_folder_items VALUES
      ('photo', '1', 'folder-safe'), ('video', '2', 'folder-safe'),
      ('link', '3', 'folder-safe'), ('text', '4', 'folder-private'),
      ('document', '5', 'folder-safe'), ('checklist', '6', 'folder-safe');
    INSERT INTO saved_tags VALUES ('tag-work');
    INSERT INTO saved_tag_items VALUES ('checklist', '6', 'tag-work', 777);
  `);

  const adapter = (connection) => ({
    async execAsync(sql) { connection.exec(sql); },
    async getFirstAsync(sql, ...parameters) { return connection.prepare(sql).get(...parameters) ?? null; },
    async getAllAsync(sql, ...parameters) { return connection.prepare(sql).all(...parameters); },
    async runAsync(sql, ...parameters) {
      const result = connection.prepare(sql).run(...parameters);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async withExclusiveTransactionAsync(callback) {
      connection.exec('BEGIN EXCLUSIVE;');
      try { await callback(adapter(connection)); connection.exec('COMMIT;'); }
      catch (error) { connection.exec('ROLLBACK;'); throw error; }
    },
  });
  return { sqlite, database: adapter(sqlite) };
}

describe('recently deleted local content', () => {
  let fixture;

  beforeEach(async () => {
    fixture = createDatabase();
    mockTrash.database = fixture.database;
    mockTrash.databaseError = null;
    mockTrash.deleted = [];
    mockTrash.documentDelete = null;
    await ensureRecentlyDeletedSchema(fixture.database);
  });

  afterEach(() => {
    mockTrash.database = null;
    mockTrash.databaseError = null;
    mockTrash.documentDelete = null;
    fixture.sqlite.close();
  });

  test('v9 adds tombstones transactionally, preserves existing rows, and is idempotent', async () => {
    await ensureRecentlyDeletedSchema(fixture.database);
    expect(fixture.sqlite.prepare('SELECT version FROM saveapp_schema_migrations WHERE version = ?').get(RECENTLY_DELETED_SCHEMA_VERSION))
      .toEqual({ version: 9 });
    expect(fixture.sqlite.prepare('SELECT text_content FROM saved_content WHERE id = 4').get().text_content)
      .toBe('Nota privada');
    for (const table of ['photos', 'saved_content', 'saved_documents', 'saved_checklists']) {
      expect(fixture.sqlite.prepare(`PRAGMA table_info(${table})`).all().map(({ name }) => name))
        .toEqual(expect.arrayContaining(['deleted_at', 'deleted_folder_id', 'deleted_folder_is_protected']));
    }

    fixture.sqlite.prepare("UPDATE saved_content SET deleted_at = 10 WHERE id = 3").run();
    expect(() => fixture.sqlite.prepare(
      "INSERT INTO saved_content (id, content_type, normalized_url) VALUES (30, 'link', 'https://example.com')",
    ).run()).not.toThrow();
  });

  test('keeps trash out of every active content and organization catalog', () => {
    expect(source('src/features/photos/photoLibrary.ts')).toMatch(/FROM photos WHERE deleted_at IS NULL/);
    expect(source('src/features/home-content/savedContentLibrary.ts')).toMatch(/FROM saved_content WHERE deleted_at IS NULL/);
    expect(source('src/features/documents/documentLibrary.ts')).toMatch(/FROM saved_documents WHERE deleted_at IS NULL/);
    expect(source('src/features/home-content/checklistLibrary.ts')).toMatch(/WHERE checklists\.deleted_at IS NULL/);
    expect(source('src/features/home-folders/homeFolderLibrary.ts')).toMatch(/deleted_at IS NULL/);
    expect(source('src/features/home-tags/tagLibrary.ts')).toMatch(/deleted_at IS NULL/);
  });

  test('purges at launch and on foreground activation without background scheduling', () => {
    const rootLayout = source('src/app/_layout.tsx');
    expect(rootLayout).toMatch(/void purgeExpired\(\);/);
    expect(rootLayout).toMatch(/AppState\.addEventListener\('change',[\s\S]*?state === 'active'[\s\S]*?purgeExpired\(\)/);
    expect(rootLayout).not.toMatch(/BackgroundTask|setInterval|registerTaskAsync/);
  });

  test('keeps an empty trash result stable instead of feeding it back into the refresh effect', async () => {
    expect(await trash.listRecentlyDeletedItems()).toEqual([]);

    const hook = source('src/features/home-trash/useRecentlyDeletedItems.ts');
    const authorizationMemo = hook.match(
      /const authorizedFolderIds = useMemo\(\(\) => \{([\s\S]*?)\n  \}, \[([^\]]*)\]\);/,
    );
    expect(authorizationMemo).not.toBeNull();
    expect(authorizationMemo[1]).not.toMatch(/\bitems\b/);
    expect(authorizationMemo[2]).not.toMatch(/\bitems\b/);

    expect(hook).toMatch(
      /void Promise\.resolve\(\)\.then\(\(\) => refresh\(\)\);\s*\}, \[isActive, refresh, setProtectedTrashContentVisible, setRevealedFolders\]\);/,
    );
    expect(hook).toMatch(/if \(!isActive \|\| !isAppActive \|\| AppState\.currentState !== 'active'\) \{\s*return redactProtectedItems\(items\);/);
    expect(hook).toMatch(/return \{\s*items: visibleItems,/);
  });

  test('moves every content type without removing files, tasks, folder links, or tags', async () => {
    const types = [
      ['photo', 1], ['video', 2], ['link', 3], ['text', 4], ['document', 5], ['checklist', 6],
    ];
    for (const [itemType, itemId] of types) {
      expect(await trash.moveSavedItemToRecentlyDeleted(itemType, itemId, undefined, 1_000)).toBe(true);
    }

    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM photos').get().count).toBe(2);
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_checklist_items WHERE checklist_id = 6').get().count).toBe(2);
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_folder_items').get().count).toBe(6);
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_tag_items').get().count).toBe(1);
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_content WHERE deleted_at IS NULL').get().count).toBe(0);
  });

  test('lists protected entries without title until the protected folder is authorized', async () => {
    await trash.moveSavedItemToRecentlyDeleted('text', 4, 'folder-private', 2_000);
    const locked = await trash.listRecentlyDeletedItems();
    expect(locked).toEqual([
      expect.objectContaining({
        itemType: 'text', itemId: 4, title: null,
        folderId: 'folder-private', folderIsProtected: true, requiresAuthorization: true,
      }),
    ]);
    const authorized = await trash.listRecentlyDeletedItems(['folder-private']);
    expect(authorized[0]).toMatchObject({ title: 'Texto', requiresAuthorization: false });
  });

  test('keeps former protected-folder titles redacted if the folder is later deleted', async () => {
    await trash.moveSavedItemToRecentlyDeleted('text', 4, 'folder-private', 2_500);
    fixture.sqlite.prepare("DELETE FROM saved_folders WHERE id = 'folder-private'").run();

    const locked = await trash.listRecentlyDeletedItems();
    expect(locked[0]).toMatchObject({
      title: null,
      folderId: 'folder-private',
      folderIsProtected: true,
      requiresAuthorization: true,
    });
    expect((await trash.listRecentlyDeletedItems(['folder-private']))[0].title).toBe('Texto');
  });

  test('restores content, checklist child rows, tags, and the original folder; missing folders restore unfiled', async () => {
    await trash.moveSavedItemToRecentlyDeleted('checklist', 6, 'folder-safe', 3_000);
    expect(await trash.restoreRecentlyDeletedItem('checklist', 6)).toBe(true);
    expect(fixture.sqlite.prepare('SELECT deleted_at FROM saved_checklists WHERE id = 6').get().deleted_at).toBeNull();
    expect(fixture.sqlite.prepare("SELECT folder_id FROM saved_folder_items WHERE item_type = 'checklist' AND item_id = '6'").get().folder_id)
      .toBe('folder-safe');
    expect(fixture.sqlite.prepare("SELECT tag_id, created_at FROM saved_tag_items WHERE item_type = 'checklist' AND item_id = '6'").get())
      .toEqual({ tag_id: 'tag-work', created_at: 777 });
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM saved_checklist_items WHERE checklist_id = 6').get().count).toBe(2);

    await trash.moveSavedItemToRecentlyDeleted('document', 5, 'folder-safe', 4_000);
    fixture.sqlite.prepare("DELETE FROM saved_folders WHERE id = 'folder-safe'").run();
    expect(await trash.restoreRecentlyDeletedItem('document', 5)).toBe(true);
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM saved_folder_items WHERE item_type = 'document' AND item_id = '5'").get().count)
      .toBe(0);
  });

  test('releases the restore lock when opening SQLite fails so the item can be retried', async () => {
    await trash.moveSavedItemToRecentlyDeleted('document', 5, 'folder-safe', 3_250);
    mockTrash.databaseError = new Error('SQLite unavailable');

    await expect(trash.restoreRecentlyDeletedItem('document', 5)).rejects.toThrow('SQLite unavailable');
    expect(fixture.sqlite.prepare('SELECT deleted_at FROM saved_documents WHERE id = 5').get().deleted_at).toBe(3_250);

    mockTrash.databaseError = null;
    expect(await trash.restoreRecentlyDeletedItem('document', 5)).toBe(true);
    expect(fixture.sqlite.prepare('SELECT deleted_at FROM saved_documents WHERE id = 5').get().deleted_at).toBeNull();
  });

  test('keeps a trashed link intact when a duplicate active link prevents restoration', async () => {
    await trash.moveSavedItemToRecentlyDeleted('link', 3, 'folder-safe', 3_500);
    await fixture.database.runAsync(
      "INSERT INTO saved_content (id, content_type, normalized_url, title, domain) VALUES (30, 'link', 'https://example.com', 'Novo link', 'example.com')",
    );

    await expect(trash.restoreRecentlyDeletedItem('link', 3))
      .rejects.toBeInstanceOf(trash.RecentlyDeletedRestoreConflictError);
    expect(fixture.sqlite.prepare('SELECT deleted_at FROM saved_content WHERE id = 3').get().deleted_at).toBe(3_500);
    expect(fixture.sqlite.prepare('SELECT deleted_at FROM saved_content WHERE id = 30').get().deleted_at).toBeNull();
  });

  test('checks the 30-day deadline and retries a failed permanent erase without losing tags', async () => {
    const retention = trash.RECENTLY_DELETED_RETENTION_MS;
    expect(trash.getRecentlyDeletedDaysRemaining(100, 100 + retention - 1)).toBe(1);
    expect(trash.getRecentlyDeletedDaysRemaining(100, 100 + retention)).toBe(0);
    await trash.moveSavedItemToRecentlyDeleted('document', 5, 'folder-safe', 100);
    mockTrash.documentDelete = async () => {
      await fixture.database.runAsync("DELETE FROM saved_tag_items WHERE item_type = 'document' AND item_id = '5'");
      await fixture.database.runAsync("DELETE FROM saved_folder_items WHERE item_type = 'document' AND item_id = '5'");
      await fixture.database.runAsync('DELETE FROM saved_documents WHERE id = 5');
      await fixture.database.runAsync("INSERT INTO saved_documents (id, original_name) VALUES (5, 'Contrato.pdf')");
      return false;
    };
    await fixture.database.runAsync("INSERT INTO saved_tag_items VALUES ('document', '5', 'tag-work', 888)");

    expect(await trash.permanentlyDeleteRecentlyDeletedItem('document', 5)).toBe(false);
    expect(fixture.sqlite.prepare('SELECT tag_id, created_at FROM saved_tag_items WHERE item_type = ? AND item_id = ?').get('document', '5'))
      .toEqual({ tag_id: 'tag-work', created_at: 888 });
    expect(fixture.sqlite.prepare('SELECT deleted_at FROM saved_documents WHERE id = 5').get().deleted_at).toBe(100);
    expect(fixture.sqlite.prepare('SELECT deleted_folder_is_protected FROM saved_documents WHERE id = 5').get().deleted_folder_is_protected).toBe(0);
    expect(fixture.sqlite.prepare("SELECT folder_id FROM saved_folder_items WHERE item_type = 'document' AND item_id = '5'").get().folder_id)
      .toBe('folder-safe');
  });

  test('permanently deletes a confirmed trash item and removes it from the trash query', async () => {
    await trash.moveSavedItemToRecentlyDeleted('document', 5, 'folder-safe', 500);
    mockTrash.documentDelete = async (id) => {
      const result = await fixture.database.runAsync('DELETE FROM saved_documents WHERE id = ?;', id);
      return result.changes === 1;
    };

    expect(await trash.permanentlyDeleteRecentlyDeletedItem('document', 5)).toBe(true);
    expect(fixture.sqlite.prepare('SELECT id FROM saved_documents WHERE id = 5').get()).toBeUndefined();
    expect(await trash.listRecentlyDeletedItems()).toEqual([]);
    expect(mockTrash.deleted).toEqual([['document', 5]]);
  });

  test('releases the permanent-delete lock when opening SQLite fails so the item can be retried', async () => {
    await trash.moveSavedItemToRecentlyDeleted('document', 5, 'folder-safe', 600);
    mockTrash.databaseError = new Error('SQLite unavailable');

    await expect(trash.permanentlyDeleteRecentlyDeletedItem('document', 5)).rejects.toThrow('SQLite unavailable');
    expect(fixture.sqlite.prepare('SELECT deleted_at FROM saved_documents WHERE id = 5').get().deleted_at).toBe(600);

    mockTrash.databaseError = null;
    mockTrash.documentDelete = async (id) => {
      const result = await fixture.database.runAsync('DELETE FROM saved_documents WHERE id = ?;', id);
      return result.changes === 1;
    };
    expect(await trash.permanentlyDeleteRecentlyDeletedItem('document', 5)).toBe(true);
    expect(await trash.listRecentlyDeletedItems()).toEqual([]);
  });

  test('purges expired items through their existing permanent deletion adapters', async () => {
    const expiredAt = 10;
    const types = [
      ['photo', 1], ['video', 2], ['link', 3], ['text', 4], ['document', 5], ['checklist', 6],
    ];
    for (const [itemType, itemId] of types) {
      await trash.moveSavedItemToRecentlyDeleted(itemType, itemId, undefined, expiredAt);
    }

    const result = await trash.purgeExpiredRecentlyDeletedItems(expiredAt + trash.RECENTLY_DELETED_RETENTION_MS);
    expect(result).toEqual({ deletedCount: 6, failedCount: 0 });
    expect(mockTrash.deleted).toEqual(types);
  });
});
