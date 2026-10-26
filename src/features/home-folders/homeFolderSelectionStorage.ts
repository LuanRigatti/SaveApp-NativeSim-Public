import type { HomeFolder, HomeFolderHomeView, HomeFolderSelection } from './homeFolderTypes';

export const HOME_FOLDER_SELECTION_STORAGE_KEY = '@saveapp/home-folder-selection-v4';
export const HOME_FOLDER_VIEW_STORAGE_KEY = '@saveapp/home-folder-view-v3';
export const PREVIOUS_HOME_FOLDER_VIEW_STORAGE_KEY = '@saveapp/home-folder-view-v2';
export const LEGACY_HOME_FOLDER_FILTER_STORAGE_KEY = '@saveapp/home-folder-filter';

export type HomeFolderViewStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

function isHomeFolderHomeView(value: unknown): value is HomeFolderHomeView {
  return value === 'all-items' || value === 'unfiled' || value === 'folders';
}

function getViewSelection(view: HomeFolderHomeView): HomeFolderSelection {
  return { kind: 'view', view };
}

function isExistingFolder(folderId: string, folders: readonly HomeFolder[]): boolean {
  return folders.some((folder) => folder.id === folderId);
}

function parseCurrentSelection(
  value: string,
  folders: readonly HomeFolder[],
): HomeFolderSelection | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const candidate = parsed as { kind?: unknown; view?: unknown; folderId?: unknown };
  if (candidate.kind === 'view' && isHomeFolderHomeView(candidate.view)) {
    return getViewSelection(candidate.view);
  }

  if (
    candidate.kind === 'folder' &&
    typeof candidate.folderId === 'string' &&
    candidate.folderId.length > 0 &&
    isExistingFolder(candidate.folderId, folders)
  ) {
    return { kind: 'folder', folderId: candidate.folderId };
  }

  return null;
}

function migratePreviousHomeFolderView(value: string): HomeFolderSelection {
  if (value === 'all-folders') return getViewSelection('folders');
  return getViewSelection('all-items');
}

function migrateLegacyFolderFilter(
  value: string | null,
  folders: readonly HomeFolder[],
): HomeFolderSelection {
  if (value === 'all') return getViewSelection('all-items');

  if (value?.startsWith('folder:')) {
    const legacyFolderId = value.slice('folder:'.length);
    return getViewSelection(
      isExistingFolder(legacyFolderId, folders) ? 'folders' : 'all-items',
    );
  }

  return getViewSelection('all-items');
}

async function readStoredValue(
  storage: HomeFolderViewStorage,
  key: string,
): Promise<string | null | undefined> {
  try {
    return await storage.getItem(key);
  } catch {
    return undefined;
  }
}

export async function restoreHomeFolderSelection(
  storage: HomeFolderViewStorage,
  folders: readonly HomeFolder[],
): Promise<HomeFolderSelection> {
  const storedSelection = await readStoredValue(storage, HOME_FOLDER_SELECTION_STORAGE_KEY);
  if (storedSelection === undefined) return getViewSelection('all-items');
  if (storedSelection !== null) {
    const selection = parseCurrentSelection(storedSelection, folders);
    if (selection && !(selection.kind === 'view' && selection.view === 'unfiled')) return selection;

    const fallback = getViewSelection('all-items');
    await persistHomeFolderSelection(storage, fallback);
    return fallback;
  }

  const storedView = await readStoredValue(storage, HOME_FOLDER_VIEW_STORAGE_KEY);
  if (storedView === undefined) return getViewSelection('all-items');
  if (storedView !== null) {
    const selection = getViewSelection(
      isHomeFolderHomeView(storedView) && storedView !== 'unfiled' ? storedView : 'all-items',
    );
    await persistHomeFolderSelection(storage, selection);
    return selection;
  }

  const previousView = await readStoredValue(storage, PREVIOUS_HOME_FOLDER_VIEW_STORAGE_KEY);
  if (previousView === undefined) return getViewSelection('all-items');
  if (previousView !== null) {
    const selection = migratePreviousHomeFolderView(previousView);
    await persistHomeFolderSelection(storage, selection);
    return selection;
  }

  const legacyFilter = await readStoredValue(storage, LEGACY_HOME_FOLDER_FILTER_STORAGE_KEY);
  const selection = migrateLegacyFolderFilter(
    legacyFilter === undefined ? null : legacyFilter,
    folders,
  );
  await persistHomeFolderSelection(storage, selection);
  return selection;
}

export async function persistHomeFolderSelection(
  storage: HomeFolderViewStorage,
  selection: HomeFolderSelection,
): Promise<void> {
  try {
    await storage.setItem(HOME_FOLDER_SELECTION_STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // Keep the selected folder usable for this session if local preferences are unavailable.
  }
}
