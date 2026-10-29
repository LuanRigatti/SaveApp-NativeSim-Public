let mockDatabase;

jest.mock('../src/features/photos/photoLibrary', () => ({
  getSaveAppDatabase: async () => mockDatabase,
}));

const {
  createHomeFolder,
  deleteHomeFolder,
  listHomeFolderAssignments,
  listHomeFolders,
  renameHomeFolder,
  setHomeFolderColor,
  setHomeFolderProtection,
  setHomeFolderItemAssignment,
} = require('../src/features/home-folders/homeFolderLibrary');
const {
  filterHomeFolderItems,
  getHomeFolderItemFilterForSelection,
  getHomeFolderHomeTitle,
  getHomeFolderItemKey,
  getHomeFolderViewForSelection,
  normalizeHomeFolderName,
  validateHomeFolderName,
} = require('../src/features/home-folders/homeFolderTypes');
const {
  HOME_CATEGORIES,
  getHomeCategoryForItemType,
} = require('../src/features/home-content/homeCategories');
const {
  HOME_FOLDER_SELECTION_STORAGE_KEY,
  HOME_FOLDER_VIEW_STORAGE_KEY,
  LEGACY_HOME_FOLDER_FILTER_STORAGE_KEY,
  PREVIOUS_HOME_FOLDER_VIEW_STORAGE_KEY,
  persistHomeFolderSelection,
  restoreHomeFolderSelection,
} = require('../src/features/home-folders/homeFolderSelectionStorage');
const { ensureHomeFolderSchema, HOME_FOLDER_SCHEMA_VERSION } = require('../src/features/home-folders/folderSchemaMigration');
const { readHomeFolderAssociation, restoreHomeFolderAssociation } = require('../src/features/home-folders/folderAssociationDatabase');

function createIsolatedLegacySqliteDatabase() {
  const { DatabaseSync } = require('node:sqlite');
  const sqlite = new DatabaseSync(':memory:');
  let failMigrationMarker = true;
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE saveapp_schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL);
    INSERT INTO saveapp_schema_migrations (version, applied_at) VALUES (1, 100), (2, 200), (3, 300);
    CREATE TABLE photos (
      id INTEGER PRIMARY KEY,
      relative_path TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      mime_type TEXT,
      media_type TEXT NOT NULL
    );
    CREATE TABLE saved_content (id INTEGER PRIMARY KEY, content_type TEXT NOT NULL, text_content TEXT);
    CREATE TABLE saved_documents (id INTEGER PRIMARY KEY, relative_path TEXT NOT NULL);
    INSERT INTO photos VALUES (27, 'photos/photo-legacy.jpg', 640, 480, 1700000000000, 'image/jpeg', 'photo');
    INSERT INTO photos VALUES (28, 'photos/video-legacy.mp4', 1280, 720, 1700000001000, 'video/mp4', 'video');
    INSERT INTO saved_content VALUES (8, 'link', NULL);
    INSERT INTO saved_content VALUES (9, 'text', 'Nota legada');
    INSERT INTO saved_documents VALUES (10, 'documents/document-legacy.pdf');
  `);

  const transaction = {
    async execAsync(sql) { sqlite.exec(sql); },
    async getFirstAsync(sql, ...parameters) {
      return sqlite.prepare(sql).get(...parameters) ?? null;
    },
    async getAllAsync(sql, ...parameters) {
      return sqlite.prepare(sql).all(...parameters);
    },
    async runAsync(sql, ...parameters) {
      if (failMigrationMarker && /INSERT INTO saveapp_schema_migrations/i.test(sql)) {
        failMigrationMarker = false;
        throw new Error('simulated migration interruption');
      }
      const result = sqlite.prepare(sql).run(...parameters);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
  };

  return {
    sqlite,
    transaction,
    database: {
      async execAsync(sql) { sqlite.exec(sql); },
      async withExclusiveTransactionAsync(callback) {
        sqlite.exec('BEGIN EXCLUSIVE;');
        try {
          await callback(transaction);
          sqlite.exec('COMMIT;');
        } catch (error) {
          sqlite.exec('ROLLBACK;');
          throw error;
        }
      },
    },
  };
}

function createFolderLibraryDatabase(seedItems = []) {
  const folders = new Map();
  const assignments = new Map();
  const items = new Set(seedItems);

  const getFirstAsync = async (sql, ...parameters) => {
    if (/SELECT folder_id FROM saved_folder_items/i.test(sql)) {
      const [itemType, itemId] = parameters;
      const folderId = assignments.get(`${itemType}:${itemId}`);
      return folderId ? { folder_id: folderId } : null;
    }
    if (/normalized_name = \? AND id <> \?/i.test(sql)) {
      const [normalizedName, folderId] = parameters;
      const found = [...folders.values()].find((folder) => folder.normalized_name === normalizedName && folder.id !== folderId);
      return found ? { id: found.id } : null;
    }
    if (/normalized_name = \? LIMIT 1/i.test(sql)) {
      const [normalizedName] = parameters;
      const found = [...folders.values()].find((folder) => folder.normalized_name === normalizedName);
      return found ? { id: found.id } : null;
    }
    if (/SELECT folders\.id, folders\.name/i.test(sql)) {
      const [folderId] = parameters;
      const folder = folders.get(folderId);
      if (!folder) return null;
      const itemCount = [...assignments.values()].filter((id) => id === folderId).length;
      return { ...folder, item_count: itemCount };
    }
    if (/FROM saved_folders WHERE id = \?/i.test(sql)) {
      const [folderId] = parameters;
      const folder = folders.get(folderId);
      return folder ? { id: folderId, is_protected: folder.is_protected } : null;
    }
    const itemType = /media_type = 'photo'/i.test(sql) ? 'photo'
      : /media_type = 'video'/i.test(sql) ? 'video'
        : /content_type = 'link'/i.test(sql) ? 'link'
          : /content_type = 'text'/i.test(sql) ? 'text'
            : /FROM saved_documents/i.test(sql) ? 'document' : null;
    if (itemType) {
      const [itemId] = parameters;
      return items.has(`${itemType}:${itemId}`) ? { id: Number(itemId) } : null;
    }
    return null;
  };

  const getAllAsync = async (sql) => {
    if (/FROM saved_folder_items/i.test(sql)) {
      return [...assignments.entries()].map(([key, folderId]) => {
        const separator = key.indexOf(':');
        return {
          item_type: key.slice(0, separator),
          item_id: key.slice(separator + 1),
          folder_id: folderId,
        };
      });
    }
    if (/FROM saved_folders AS folders/i.test(sql)) {
      return [...folders.values()].map((folder) => ({
        ...folder,
        item_count: [...assignments.values()].filter((id) => id === folder.id).length,
      }));
    }
    return [];
  };

  const runAsync = async (sql, ...parameters) => {
    if (/INSERT INTO saved_folders/i.test(sql)) {
      const [id, name, normalizedName, createdAt, updatedAt] = parameters;
      folders.set(id, { id, name, normalized_name: normalizedName, color: null, is_protected: 0, created_at: createdAt, updated_at: updatedAt });
      return { changes: 1, lastInsertRowId: 1 };
    }
    if (/UPDATE saved_folders SET is_protected/i.test(sql)) {
      const [isProtected, updatedAt, id, expectedCurrent] = parameters;
      const folder = folders.get(id);
      if (!folder || (expectedCurrent !== undefined && folder.is_protected !== expectedCurrent)) {
        return { changes: 0 };
      }
      folders.set(id, { ...folder, is_protected: isProtected, updated_at: updatedAt });
      return { changes: 1 };
    }
    if (/UPDATE saved_folders SET color = \?, updated_at = \? WHERE id = \?/i.test(sql)) {
      const [color, updatedAt, id] = parameters;
      const folder = folders.get(id);
      if (!folder) return { changes: 0 };
      folders.set(id, { ...folder, color, updated_at: updatedAt });
      return { changes: 1 };
    }
    if (/UPDATE saved_folders SET/i.test(sql)) {
      const [name, normalizedName, updatedAt, id] = parameters;
      const folder = folders.get(id);
      if (!folder) return { changes: 0 };
      folders.set(id, { ...folder, name, normalized_name: normalizedName, updated_at: updatedAt });
      return { changes: 1 };
    }
    if (/DELETE FROM saved_folder_items WHERE folder_id = \?/i.test(sql)) {
      const [folderId] = parameters;
      let changes = 0;
      for (const [key, assignedFolderId] of assignments) {
        if (assignedFolderId === folderId) {
          assignments.delete(key);
          changes += 1;
        }
      }
      return { changes };
    }
    if (/DELETE FROM saved_folders WHERE id = \?/i.test(sql)) {
      const [folderId] = parameters;
      return { changes: Number(folders.delete(folderId)) };
    }
    if (/DELETE FROM saved_folder_items WHERE item_type = \?/i.test(sql)) {
      const [itemType, itemId] = parameters;
      return { changes: Number(assignments.delete(`${itemType}:${itemId}`)) };
    }
    if (/INSERT INTO saved_folder_items/i.test(sql)) {
      const [itemType, itemId, folderId] = parameters;
      assignments.set(`${itemType}:${itemId}`, folderId);
      return { changes: 1 };
    }
    return { changes: 0 };
  };

  const transaction = { getFirstAsync, getAllAsync, runAsync, execAsync: async () => undefined };
  mockDatabase = {
    ...transaction,
    async withExclusiveTransactionAsync(callback) {
      const previousFolders = new Map(folders);
      const previousAssignments = new Map(assignments);
      try {
        await callback(transaction);
      } catch (error) {
        folders.clear();
        previousFolders.forEach((value, key) => folders.set(key, value));
        assignments.clear();
        previousAssignments.forEach((value, key) => assignments.set(key, value));
        throw error;
      }
    },
  };
  return { folders, assignments, items };
}

describe('home folder names, filters, and persistence', () => {
  test('derives the Home title from the active view or stable folder selection', () => {
    const folders = [{ id: 'pdf', name: 'Pdf' }];

    expect(getHomeFolderHomeTitle({ kind: 'view', view: 'all-items' }, folders)).toBe('Todos');
    expect(getHomeFolderHomeTitle({ kind: 'view', view: 'unfiled' }, folders)).toBe('Sem pasta');
    expect(getHomeFolderHomeTitle({ kind: 'view', view: 'folders' }, folders)).toBe('Pastas');
    expect(getHomeFolderHomeTitle({ kind: 'folder', folderId: 'pdf' }, folders)).toBe('Pdf');
    expect(getHomeFolderHomeTitle({ kind: 'folder', folderId: 'missing' }, folders)).toBe('Todos');
    expect(getHomeFolderHomeTitle({ kind: 'folder', folderId: 'pdf' }, [{ id: 'pdf', name: 'Documentos' }])).toBe('Documentos');
  });

  test('normalizes names and rejects empty, long, and case-insensitive duplicates', async () => {
    createFolderLibraryDatabase();
    expect(normalizeHomeFolderName('  Minha   Pasta ')).toBe('minha pasta');
    expect(validateHomeFolderName('  Minha   Pasta ')).toBe('Minha Pasta');
    expect(() => validateHomeFolderName('   ')).toThrow();
    expect(() => validateHomeFolderName('x'.repeat(41))).toThrow();

    const folder = await createHomeFolder('  Minha   Pasta ');
    expect(folder.name).toBe('Minha Pasta');
    await expect(createHomeFolder('minha pasta')).rejects.toMatchObject({ code: 'duplicate' });
  });

  test('keeps stable IDs when renaming and moves one typed item between folders', async () => {
    const database = createFolderLibraryDatabase(['photo:5', 'document:5']);
    const first = await createHomeFolder('Fotos');
    const second = await createHomeFolder('Arquivos');

    expect(await setHomeFolderItemAssignment('photo', 5, first.id)).toBeNull();
    expect(await setHomeFolderItemAssignment('photo', 5, second.id)).toBe(first.id);
    expect(await setHomeFolderItemAssignment('document', 5, first.id)).toBeNull();
    expect(database.assignments.get('photo:5')).toBe(second.id);
    expect(database.assignments.get('document:5')).toBe(first.id);

    const renamed = await renameHomeFolder(second.id, 'Imagens');
    expect(renamed.id).toBe(second.id);
    expect(renamed.name).toBe('Imagens');
    expect((await listHomeFolders()).find((folder) => folder.id === second.id).itemCount).toBe(1);
    expect(await listHomeFolderAssignments()).toHaveLength(2);
  });

  test('persists an individual folder color, keeps the default nullable, and leaves other folder data intact', async () => {
    const database = createFolderLibraryDatabase(['photo:5']);
    const coloredFolder = await createHomeFolder('Fotos');
    const defaultFolder = await createHomeFolder('Documentos');
    await setHomeFolderItemAssignment('photo', 5, coloredFolder.id);

    expect(coloredFolder.color).toBeNull();
    expect(defaultFolder.color).toBeNull();
    expect(await setHomeFolderColor(coloredFolder.id, 'purple')).toBe(true);
    expect(database.assignments.get('photo:5')).toBe(coloredFolder.id);
    expect((await listHomeFolders()).find(({ id }) => id === coloredFolder.id)).toEqual(
      expect.objectContaining({ color: 'purple', itemCount: 1 }),
    );
    expect((await listHomeFolders()).find(({ id }) => id === defaultFolder.id).color).toBeNull();

    const renamed = await renameHomeFolder(coloredFolder.id, 'Imagens');
    expect(renamed).toEqual(expect.objectContaining({ id: coloredFolder.id, color: 'purple' }));
    expect(await setHomeFolderColor(coloredFolder.id, null)).toBe(true);
    expect((await listHomeFolders()).find(({ id }) => id === coloredFolder.id).color).toBeNull();
    expect(await setHomeFolderColor('missing-folder', 'cyan')).toBe(false);
    await expect(setHomeFolderColor(coloredFolder.id, 'invalid')).rejects.toThrow('HOME_FOLDER_COLOR_INVALID');
    expect(database.assignments.get('photo:5')).toBe(coloredFolder.id);
  });

  test('treats an unknown legacy folder color as the global default', async () => {
    const database = createFolderLibraryDatabase();
    const folder = await createHomeFolder('Legada');
    database.folders.set(folder.id, { ...database.folders.get(folder.id), color: 'unknown-color' });

    await expect(listHomeFolders()).resolves.toEqual([
      expect.objectContaining({ id: folder.id, color: null }),
    ]);
  });

  test('persists protection independently and rejects a stale assignment change', async () => {
    const database = createFolderLibraryDatabase(['photo:5']);
    const folder = await createHomeFolder('Privada');
    await setHomeFolderItemAssignment('photo', 5, folder.id);

    await expect(setHomeFolderProtection(folder.id, true, false)).resolves.toBe(true);
    await expect(listHomeFolders()).resolves.toEqual([
      expect.objectContaining({ id: folder.id, isProtected: true, itemCount: 1 }),
    ]);
    await expect(setHomeFolderProtection(folder.id, false, false)).resolves.toBe(false);
    await expect(setHomeFolderItemAssignment('photo', 5, null, null)).rejects.toThrow('HOME_FOLDER_ASSIGNMENT_CHANGED');
    expect(database.assignments.get('photo:5')).toBe(folder.id);
  });

  test('persists folder protection without changing its stable identity or assignments', async () => {
    const database = createFolderLibraryDatabase(['photo:5']);
    const folder = await createHomeFolder('Privada');
    await setHomeFolderItemAssignment('photo', 5, folder.id);

    expect(folder.isProtected).toBe(false);
    expect(await setHomeFolderProtection(folder.id, true)).toBe(true);
    expect(await listHomeFolders()).toEqual([
      expect.objectContaining({ id: folder.id, isProtected: true, itemCount: 1 }),
    ]);
    expect(database.assignments.get('photo:5')).toBe(folder.id);
    expect(await setHomeFolderProtection(folder.id, false)).toBe(true);
    expect((await listHomeFolders())[0].isProtected).toBe(false);
  });

  test('deletes only a folder and its assignments, leaving saved catalog entries untouched', async () => {
    const database = createFolderLibraryDatabase(['link:8', 'text:8']);
    const folder = await createHomeFolder('Leituras');
    await setHomeFolderItemAssignment('link', 8, folder.id);
    await setHomeFolderItemAssignment('text', 8, folder.id);

    await expect(deleteHomeFolder(folder.id)).resolves.toBe(true);
    expect(database.items).toEqual(new Set(['link:8', 'text:8']));
    expect(database.assignments.size).toBe(0);
    expect(await listHomeFolders()).toEqual([]);
  });

  test('filters every content type as unfiled or by stable folder id', () => {
    const items = [
      { id: 4, mediaType: 'photo', createdAt: 1 },
      { id: 4, mediaType: 'video', createdAt: 2 },
      { id: 4, contentType: 'link', createdAt: 3 },
      { id: 4, contentType: 'text', createdAt: 4 },
      { id: 4, contentType: 'document', createdAt: 5 },
    ];
    const assignments = new Map([
      [getHomeFolderItemKey('photo', 4), 'a'],
      [getHomeFolderItemKey('link', 4), 'b'],
      [getHomeFolderItemKey('document', 4), 'a'],
    ]);

    expect(filterHomeFolderItems(items, { kind: 'unfiled' }, assignments).map((item) => item.contentType ?? item.mediaType)).toEqual(['video', 'text']);
    expect(filterHomeFolderItems(items, { kind: 'folder', folderId: 'a' }, assignments).map((item) => item.mediaType ?? item.contentType)).toEqual(['photo', 'document']);
    expect(filterHomeFolderItems(items, { kind: 'folder', folderId: 'b' }, assignments).map((item) => item.contentType ?? item.mediaType)).toEqual(['link']);
    expect(filterHomeFolderItems(items, { kind: 'all-items' }, assignments)).toEqual(items);
  });

  test('classifies existing and newly imported records by content type without duplicating them', () => {
    const items = [
      { id: 1, mediaType: 'photo', createdAt: 1 },
      { id: 2, mediaType: 'video', createdAt: 2 },
      { id: 3, contentType: 'document', createdAt: 3 },
      { id: 4, contentType: 'link', createdAt: 4, source: 'quick-save' },
      { id: 5, contentType: 'checklist', createdAt: 5 },
      { id: 6, contentType: 'text', createdAt: 6 },
    ];
    const legacyAssignments = new Map([
      [getHomeFolderItemKey('photo', 1), 'legacy-fotos'],
      [getHomeFolderItemKey('video', 2), 'legacy-fotos'],
      [getHomeFolderItemKey('document', 3), 'legacy-pdf'],
      [getHomeFolderItemKey('link', 4), 'legacy-links'],
      [getHomeFolderItemKey('checklist', 5), 'legacy-listas'],
      [getHomeFolderItemKey('text', 6), 'legacy-texto'],
    ]);

    expect(HOME_CATEGORIES.map(({ id, label }) => [id, label])).toEqual([
      ['media', 'Mídia'],
      ['documents', 'Documentos'],
      ['links', 'Links'],
      ['lists', 'Listas'],
      ['texts', 'Textos'],
    ]);
    expect(items.map((item) => getHomeCategoryForItemType(item.mediaType ?? item.contentType))).toEqual([
      'media', 'media', 'documents', 'links', 'lists', 'texts',
    ]);

    const media = filterHomeFolderItems(items, { kind: 'category', category: 'media' }, legacyAssignments);
    expect(media).toEqual([items[0], items[1]]);
    expect(filterHomeFolderItems(items, { kind: 'category', category: 'documents' }, legacyAssignments)).toEqual([items[2]]);
    expect(filterHomeFolderItems(items, { kind: 'category', category: 'links' }, legacyAssignments)).toEqual([items[3]]);
    expect(filterHomeFolderItems(items, { kind: 'category', category: 'lists' }, legacyAssignments)).toEqual([items[4]]);
    expect(filterHomeFolderItems(items, { kind: 'category', category: 'texts' }, legacyAssignments)).toEqual([items[5]]);
    expect(new Set([...media, ...filterHomeFolderItems(items, { kind: 'category', category: 'links' }, legacyAssignments)]).size).toBe(3);
  });

  test('keeps automatic categories independent from a custom folder with the same name', () => {
    const link = { id: 44, contentType: 'link', createdAt: 1 };
    const assignments = new Map([[getHomeFolderItemKey('link', link.id), 'links']]);
    const categorySelection = { kind: 'category', category: 'links' };
    const customFolderSelection = { kind: 'folder', folderId: 'links' };

    expect(getHomeFolderItemFilterForSelection(categorySelection)).toEqual({ kind: 'category', category: 'links' });
    expect(getHomeFolderItemFilterForSelection(customFolderSelection)).toEqual({ kind: 'folder', folderId: 'links' });
    expect(getHomeFolderHomeTitle(categorySelection, [{ id: 'links', name: 'Links' }])).toBe('Links');
    expect(getHomeFolderHomeTitle(customFolderSelection, [{ id: 'links', name: 'Links' }])).toBe('Links');
    expect(getHomeFolderViewForSelection(categorySelection)).toBe('all-items');
    expect(filterHomeFolderItems([link], { kind: 'category', category: 'links' }, assignments)).toEqual([link]);
    expect(filterHomeFolderItems([link], { kind: 'folder', folderId: 'links' }, assignments)).toEqual([link]);
  });

  test('keeps protected-folder items out of Todos even while their folder is unlocked', () => {
    const items = [
      { id: 1, mediaType: 'photo', createdAt: 1 },
      { id: 2, contentType: 'link', createdAt: 2 },
      { id: 3, contentType: 'text', createdAt: 3 },
    ];
    const assignments = new Map([
      [getHomeFolderItemKey('photo', 1), 'private'],
      [getHomeFolderItemKey('link', 2), 'normal'],
    ]);
    const protectedFolders = new Set(['private']);
    const unlockedFolders = new Set(['private']);

    expect(filterHomeFolderItems(items, { kind: 'all-items' }, assignments, protectedFolders, unlockedFolders))
      .toEqual([items[1], items[2]]);
    expect(filterHomeFolderItems(items, { kind: 'category', category: 'media' }, assignments, protectedFolders, unlockedFolders))
      .toEqual([]);
    expect(filterHomeFolderItems(items, { kind: 'category', category: 'links' }, assignments, protectedFolders, unlockedFolders))
      .toEqual([items[1]]);
    expect(filterHomeFolderItems(items, { kind: 'folder', folderId: 'private' }, assignments, protectedFolders))
      .toEqual([]);
    expect(filterHomeFolderItems(items, { kind: 'folder', folderId: 'private' }, assignments, protectedFolders, unlockedFolders))
      .toEqual([items[0]]);
    expect(filterHomeFolderItems(items, { kind: 'unfiled' }, assignments, protectedFolders, unlockedFolders))
      .toEqual([items[2]]);
  });

  test('uses typed folder selections as direct Home filters and derives the selected folder title', () => {
    const selection = { kind: 'folder', folderId: 'folders' };
    expect(getHomeFolderItemFilterForSelection(selection)).toEqual({
      kind: 'folder',
      folderId: 'folders',
    });
    expect(getHomeFolderViewForSelection(selection)).toBe('all-items');
    expect(getHomeFolderHomeTitle(selection, [{ id: 'folders', name: 'Arquivos' }])).toBe('Arquivos');
  });

  test('persists folder IDs as typed selections and falls back when that folder was deleted', async () => {
    const values = new Map();
    const storage = {
      async getItem(key) { return values.get(key) ?? null; },
      async setItem(key, value) { values.set(key, value); },
    };
    const folder = { id: 'all-items', name: 'Minha pasta', isProtected: false };
    const selection = { kind: 'folder', folderId: folder.id };

    await persistHomeFolderSelection(storage, selection);
    expect(JSON.parse(values.get(HOME_FOLDER_SELECTION_STORAGE_KEY))).toEqual(selection);
    await expect(restoreHomeFolderSelection(storage, [folder])).resolves.toEqual(selection);

    await expect(restoreHomeFolderSelection(storage, [])).resolves.toEqual({
      kind: 'view',
      view: 'all-items',
    });
    expect(JSON.parse(values.get(HOME_FOLDER_SELECTION_STORAGE_KEY))).toEqual({
      kind: 'view',
      view: 'all-items',
    });
  });

  test('persists a virtual category separately from custom-folder identities', async () => {
    const values = new Map();
    const storage = {
      async getItem(key) { return values.get(key) ?? null; },
      async setItem(key, value) { values.set(key, value); },
    };
    const categorySelection = { kind: 'category', category: 'links' };
    const sameNamedFolder = { id: 'links', name: 'Links', isProtected: false };

    await persistHomeFolderSelection(storage, categorySelection);
    expect(JSON.parse(values.get(HOME_FOLDER_SELECTION_STORAGE_KEY))).toEqual(categorySelection);
    await expect(restoreHomeFolderSelection(storage, [sameNamedFolder])).resolves.toEqual(categorySelection);

    const folderSelection = { kind: 'folder', folderId: sameNamedFolder.id };
    await persistHomeFolderSelection(storage, folderSelection);
    expect(JSON.parse(values.get(HOME_FOLDER_SELECTION_STORAGE_KEY))).toEqual(folderSelection);
    await expect(restoreHomeFolderSelection(storage, [sameNamedFolder])).resolves.toEqual(folderSelection);
  });

  test('migrates prior Home selections to the typed preference without changing their meaning', async () => {
    const values = new Map();
    const storage = {
      async getItem(key) { return values.get(key) ?? null; },
      async setItem(key, value) { values.set(key, value); },
    };
    const folders = [{ id: 'live', name: 'Viva' }];
    const expected = (view) => ({ kind: 'view', view });
    const clearStoredPreferences = () => {
      values.delete(HOME_FOLDER_SELECTION_STORAGE_KEY);
      values.delete(HOME_FOLDER_VIEW_STORAGE_KEY);
      values.delete(PREVIOUS_HOME_FOLDER_VIEW_STORAGE_KEY);
      values.delete(LEGACY_HOME_FOLDER_FILTER_STORAGE_KEY);
    };

    await expect(restoreHomeFolderSelection(storage, folders)).resolves.toEqual(expected('all-items'));
    expect(JSON.parse(values.get(HOME_FOLDER_SELECTION_STORAGE_KEY))).toEqual(expected('all-items'));

    clearStoredPreferences();
    values.set(HOME_FOLDER_SELECTION_STORAGE_KEY, JSON.stringify(expected('unfiled')));
    await expect(restoreHomeFolderSelection(storage, folders)).resolves.toEqual(expected('all-items'));
    expect(JSON.parse(values.get(HOME_FOLDER_SELECTION_STORAGE_KEY))).toEqual(expected('all-items'));

    clearStoredPreferences();
    values.set(HOME_FOLDER_VIEW_STORAGE_KEY, 'all-items');
    await expect(restoreHomeFolderSelection(storage, folders)).resolves.toEqual(expected('all-items'));

    clearStoredPreferences();
    values.set(HOME_FOLDER_VIEW_STORAGE_KEY, 'unfiled');
    await expect(restoreHomeFolderSelection(storage, folders)).resolves.toEqual(expected('all-items'));

    clearStoredPreferences();
    values.set(HOME_FOLDER_VIEW_STORAGE_KEY, 'folders');
    await expect(restoreHomeFolderSelection(storage, folders)).resolves.toEqual(expected('folders'));

    clearStoredPreferences();
    values.set(LEGACY_HOME_FOLDER_FILTER_STORAGE_KEY, 'all');
    await expect(restoreHomeFolderSelection(storage, folders)).resolves.toEqual(expected('all-items'));

    clearStoredPreferences();
    values.set(LEGACY_HOME_FOLDER_FILTER_STORAGE_KEY, 'unfiled');
    await expect(restoreHomeFolderSelection(storage, folders)).resolves.toEqual(expected('all-items'));

    clearStoredPreferences();
    values.set(LEGACY_HOME_FOLDER_FILTER_STORAGE_KEY, 'folder:live');
    await expect(restoreHomeFolderSelection(storage, folders)).resolves.toEqual(expected('folders'));

    clearStoredPreferences();
    values.set(LEGACY_HOME_FOLDER_FILTER_STORAGE_KEY, 'folder:deleted');
    await expect(restoreHomeFolderSelection(storage, folders)).resolves.toEqual(expected('all-items'));

    clearStoredPreferences();
    values.set(PREVIOUS_HOME_FOLDER_VIEW_STORAGE_KEY, 'all-folders');
    await expect(restoreHomeFolderSelection(storage, folders)).resolves.toEqual(expected('folders'));

    clearStoredPreferences();
    values.set(PREVIOUS_HOME_FOLDER_VIEW_STORAGE_KEY, 'unfiled');
    await expect(restoreHomeFolderSelection(storage, folders)).resolves.toEqual(expected('all-items'));

    clearStoredPreferences();
    await persistHomeFolderSelection(storage, expected('folders'));
    await expect(restoreHomeFolderSelection(storage, folders)).resolves.toEqual(expected('folders'));
  });
});

describe('home folder SQLite migration', () => {
  test('adds protection to an existing version 4 database and preserves folders and assignments', async () => {
    const { DatabaseSync } = require('node:sqlite');
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(`
      CREATE TABLE saveapp_schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL);
      INSERT INTO saveapp_schema_migrations VALUES (4, 400);
      CREATE TABLE saved_folders (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, normalized_name TEXT NOT NULL UNIQUE,
        color TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE saved_folder_items (
        item_type TEXT NOT NULL, item_id TEXT NOT NULL, folder_id TEXT NOT NULL,
        PRIMARY KEY (item_type, item_id)
      );
      INSERT INTO saved_folders VALUES ('private-id', 'Privada', 'privada', NULL, 10, 20);
      INSERT INTO saved_folder_items VALUES ('photo', '17', 'private-id');
    `);
    const tx = {
      async execAsync(sql) { sqlite.exec(sql); },
      async getFirstAsync(sql, ...parameters) { return sqlite.prepare(sql).get(...parameters) ?? null; },
      async getAllAsync(sql, ...parameters) { return sqlite.prepare(sql).all(...parameters); },
      async runAsync(sql, ...parameters) {
        const result = sqlite.prepare(sql).run(...parameters);
        return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
      },
    };
    const database = {
      async execAsync(sql) { sqlite.exec(sql); },
      async withExclusiveTransactionAsync(callback) {
        sqlite.exec('BEGIN EXCLUSIVE;');
        try {
          await callback(tx);
          sqlite.exec('COMMIT;');
        } catch (error) {
          sqlite.exec('ROLLBACK;');
          throw error;
        }
      },
    };

    await ensureHomeFolderSchema(database);

    expect(sqlite.prepare('SELECT id, name, color, is_protected FROM saved_folders').get()).toEqual({
      id: 'private-id',
      name: 'Privada',
      color: null,
      is_protected: 0,
    });
    expect(sqlite.prepare('PRAGMA table_info(saved_folders)').all().some((column) => column.name === 'color')).toBe(true);
    expect(sqlite.prepare('SELECT item_type, item_id, folder_id FROM saved_folder_items').get()).toEqual({
      item_type: 'photo',
      item_id: '17',
      folder_id: 'private-id',
    });
    expect(sqlite.prepare('SELECT version FROM saveapp_schema_migrations ORDER BY version').all().map((row) => row.version)).toEqual([4, 5]);
    sqlite.close();
  });

  test('adds typed folder tables and cleanup triggers without altering legacy catalog records or files', async () => {
    const versions = new Set([1, 2, 3]);
    const legacyRows = {
      photos: [{ id: 27, relative_path: 'photos/photo-legacy.jpg', created_at: 1_700_000_000_000 }],
      content: [{ id: 8, content_type: 'text', text_content: 'Nota legada' }],
      documents: [{ id: 9, relative_path: 'documents/document-9-pdf.pdf' }],
    };
    const statements = [];
    const database = {
      async execAsync(sql) { statements.push(sql); },
      async withExclusiveTransactionAsync(callback) {
        const tx = {
          async execAsync(sql) { statements.push(sql); },
          async getFirstAsync(_sql, version) { return versions.has(version) ? { version } : null; },
          async getAllAsync(sql) {
            if (/PRAGMA table_info\(saved_folders\)/i.test(sql)) return [];
            return [];
          },
          async runAsync(_sql, version) { versions.add(version); return { changes: 1 }; },
        };
        await callback(tx);
      },
    };

    await ensureHomeFolderSchema(database);
    await ensureHomeFolderSchema(database);
    const sql = statements.join('\n');
    expect(versions.has(HOME_FOLDER_SCHEMA_VERSION)).toBe(true);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS saved_folders/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS saved_folder_items/i);
    expect(sql).toMatch(/ALTER TABLE saved_folders ADD COLUMN is_protected INTEGER NOT NULL DEFAULT 0/i);
    expect(sql).toMatch(/PRIMARY KEY \(item_type, item_id\)/i);
    expect(sql).toMatch(/CHECK \(item_type IN \('photo', 'video', 'link', 'text', 'document'\)\)/i);
    expect(sql).toMatch(/AFTER DELETE ON photos/i);
    expect(sql).toMatch(/AFTER DELETE ON saved_content/i);
    expect(sql).toMatch(/AFTER DELETE ON saved_documents/i);
    expect(sql).not.toMatch(/DROP TABLE|DELETE FROM (?:photos|saved_content|saved_documents)|ALTER TABLE (?:photos|saved_content|saved_documents)/i);
    expect(legacyRows.photos[0].relative_path).toBe('photos/photo-legacy.jpg');
    expect(legacyRows.content[0].text_content).toBe('Nota legada');
    expect(legacyRows.documents[0].relative_path).toBe('documents/document-9-pdf.pdf');
  });

  test('migrates an isolated legacy SQLite database atomically and preserves saved rows', async () => {
    const { database, sqlite, transaction } = createIsolatedLegacySqliteDatabase();

    await expect(ensureHomeFolderSchema(database)).rejects.toThrow('simulated migration interruption');
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'saved_folders'").get()).toBeUndefined();
    expect(sqlite.prepare('SELECT version FROM saveapp_schema_migrations ORDER BY version').all().map((row) => row.version)).toEqual([1, 2, 3]);

    await ensureHomeFolderSchema(database);
    await ensureHomeFolderSchema(database);
    expect(sqlite.prepare('SELECT version FROM saveapp_schema_migrations ORDER BY version').all().map((row) => row.version)).toEqual([1, 2, 3, 4, 5]);
    expect(sqlite.prepare('SELECT id, relative_path FROM photos ORDER BY id').all()).toEqual([
      { id: 27, relative_path: 'photos/photo-legacy.jpg' },
      { id: 28, relative_path: 'photos/video-legacy.mp4' },
    ]);
    expect(sqlite.prepare('SELECT id, text_content FROM saved_content ORDER BY id').all()).toEqual([
      { id: 8, text_content: null },
      { id: 9, text_content: 'Nota legada' },
    ]);
    expect(sqlite.prepare('SELECT id, relative_path FROM saved_documents').all()).toEqual([
      { id: 10, relative_path: 'documents/document-legacy.pdf' },
    ]);

    sqlite.prepare('INSERT INTO saved_folders (id, name, normalized_name, color, created_at, updated_at) VALUES (?, ?, ?, NULL, 1, 1)').run('f1', 'Legadas', 'legadas');
    expect(sqlite.prepare('SELECT is_protected FROM saved_folders WHERE id = ?').get('f1').is_protected).toBe(0);
    sqlite.prepare('INSERT INTO saved_folder_items (item_type, item_id, folder_id) VALUES (?, ?, ?)').run('photo', '27', 'f1');
    sqlite.prepare('INSERT INTO saved_folder_items (item_type, item_id, folder_id) VALUES (?, ?, ?)').run('link', '8', 'f1');
    sqlite.prepare('INSERT INTO saved_folder_items (item_type, item_id, folder_id) VALUES (?, ?, ?)').run('document', '10', 'f1');
    const previousLinkFolder = await readHomeFolderAssociation(transaction, 'link', 8);
    sqlite.prepare('DELETE FROM saved_content WHERE id = 8').run();
    expect(sqlite.prepare('SELECT item_type FROM saved_folder_items ORDER BY item_type').all().map((row) => row.item_type)).toEqual(['document', 'photo']);
    sqlite.exec('ALTER TABLE saved_content ADD COLUMN deleted_at INTEGER;');
    sqlite.prepare('INSERT INTO saved_content (id, content_type, text_content, deleted_at) VALUES (8, \'link\', NULL, NULL)').run();
    await database.withExclusiveTransactionAsync(async (tx) => {
      await restoreHomeFolderAssociation(tx, 'link', 8, previousLinkFolder);
    });
    expect(sqlite.prepare("SELECT folder_id FROM saved_folder_items WHERE item_type = 'link' AND item_id = '8'").get().folder_id).toBe('f1');

    sqlite.prepare('DELETE FROM saved_folders WHERE id = ?').run('f1');
    expect(sqlite.prepare('SELECT relative_path FROM photos WHERE id = 27').get().relative_path).toBe('photos/photo-legacy.jpg');
    expect(sqlite.prepare('SELECT relative_path FROM saved_documents WHERE id = 10').get().relative_path).toBe('documents/document-legacy.pdf');
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM saved_folder_items').get().count).toBe(0);
    sqlite.close();
  });
});
