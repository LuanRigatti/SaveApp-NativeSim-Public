import type { SavedHomeItem } from '@/features/home-content/homeContentTypes';
import { getHomeCategoryDefinition, getHomeCategoryForItemType, type HomeCategory } from '@/features/home-content/homeCategories';
import type { AccentColorName } from '@/theme/colors';

export const MAX_HOME_FOLDER_NAME_LENGTH = 40;

export type HomeFolderItemType = 'photo' | 'video' | 'link' | 'text' | 'document' | 'checklist';

export type HomeFolder = {
  id: string;
  name: string;
  color: AccentColorName | null;
  isProtected: boolean;
  createdAt: number;
  updatedAt: number;
  itemCount: number;
};

export type HomeFolderHomeView = 'all-items' | 'unfiled' | 'folders';

export type HomeFolderSelection =
  | { kind: 'view'; view: HomeFolderHomeView }
  | { kind: 'category'; category: HomeCategory }
  | { kind: 'folder'; folderId: string };

export function getHomeFolderHomeTitle(
  selection: HomeFolderSelection,
  folders: readonly HomeFolder[],
): string {
  if (selection.kind === 'category') {
    return getHomeCategoryDefinition(selection.category).label;
  }

  if (selection.kind === 'folder') {
    return folders.find((folder) => folder.id === selection.folderId)?.name ?? 'Todos';
  }

  if (selection.view === 'unfiled') return 'Sem pasta';
  return selection.view === 'folders' ? 'Pastas' : 'Todos';
}

export type HomeFolderItemFilter =
  | { kind: 'all-items' }
  | { kind: 'category'; category: HomeCategory }
  | { kind: 'unfiled' }
  | { kind: 'folder'; folderId: string };

export function getHomeFolderViewForSelection(
  selection: HomeFolderSelection,
): HomeFolderHomeView {
  return selection.kind === 'view' ? selection.view : 'all-items';
}

export function getHomeFolderItemFilterForSelection(
  selection: HomeFolderSelection,
): HomeFolderItemFilter {
  if (selection.kind === 'folder') {
    return { kind: 'folder', folderId: selection.folderId };
  }

  if (selection.kind === 'category') {
    return { kind: 'category', category: selection.category };
  }

  return selection.view === 'unfiled'
    ? { kind: 'unfiled' }
    : { kind: 'all-items' };
}

export type HomeFolderNameErrorCode = 'required' | 'too-long' | 'duplicate';

export class HomeFolderNameError extends Error {
  readonly code: HomeFolderNameErrorCode;

  constructor(code: HomeFolderNameErrorCode) {
    super(code);
    this.name = 'HomeFolderNameError';
    this.code = code;
  }
}

export function normalizeHomeFolderName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('pt-BR');
}

export function validateHomeFolderName(name: string): string {
  const normalized = name.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!normalized) throw new HomeFolderNameError('required');
  if (Array.from(normalized).length > MAX_HOME_FOLDER_NAME_LENGTH) {
    throw new HomeFolderNameError('too-long');
  }
  return normalized;
}

export function getHomeFolderItemType(item: SavedHomeItem): HomeFolderItemType {
  if ('mediaType' in item) return item.mediaType;
  return item.contentType;
}

export function getHomeFolderItemKey(itemType: HomeFolderItemType, itemId: number): string {
  return `${itemType}:${itemId}`;
}

export function filterHomeFolderItems<T extends SavedHomeItem>(
  items: readonly T[],
  filter: HomeFolderItemFilter,
  folderIdByItemKey: ReadonlyMap<string, string>,
  protectedFolderIds: ReadonlySet<string> = new Set(),
  unlockedFolderIds: ReadonlySet<string> = new Set(),
): T[] {
  if (filter.kind === 'all-items' || filter.kind === 'category') {
    return items.filter((item) => {
      const itemType = getHomeFolderItemType(item);
      if (filter.kind === 'category' && getHomeCategoryForItemType(itemType) !== filter.category) {
        return false;
      }

      const folderId = folderIdByItemKey.get(getHomeFolderItemKey(itemType, item.id));
      return folderId == null || !protectedFolderIds.has(folderId);
    });
  }

  if (filter.kind === 'unfiled') {
    return items.filter((item) => {
      const key = getHomeFolderItemKey(getHomeFolderItemType(item), item.id);
      return !folderIdByItemKey.has(key);
    });
  }

  return items.filter((item) => {
    const key = getHomeFolderItemKey(getHomeFolderItemType(item), item.id);
    return folderIdByItemKey.get(key) === filter.folderId &&
      (!protectedFolderIds.has(filter.folderId) || unlockedFolderIds.has(filter.folderId));
  });
}

export function getHomeFolderNameErrorMessage(error: unknown): string {
  if (!(error instanceof HomeFolderNameError)) {
    return 'Não foi possível salvar a pasta. Tente novamente.';
  }

  switch (error.code) {
    case 'required':
      return 'Digite um nome para a pasta.';
    case 'too-long':
      return `Use até ${MAX_HOME_FOLDER_NAME_LENGTH} caracteres no nome da pasta.`;
    case 'duplicate':
      return 'Já existe uma pasta com esse nome.';
  }
}
