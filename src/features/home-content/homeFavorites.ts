import type { SavedHomeItem } from './homeContentTypes';
import { getSavedHomeItemKey } from './homeContentTypes';

export function getHomeTitleForFavorites(currentTitle: string, favoritesOnly: boolean): string {
  return favoritesOnly ? 'Favoritos' : currentTitle;
}

/** Apply favorite filtering only after checking folder privacy and current authorization. */
export function filterHomeFavoriteItems<T extends SavedHomeItem>(
  items: readonly T[],
  favoriteKeys: ReadonlySet<string>,
  folderIdByItemKey: ReadonlyMap<string, string>,
  protectedFolderIds: ReadonlySet<string>,
  authorizedFolderIds: ReadonlySet<string>,
  folderAssignmentsReady = true,
): T[] {
  // Folder ownership must be known before a favorite can be shown; otherwise
  // a protected folder item could flash during the provider's initial load.
  if (!folderAssignmentsReady) return [];

  return items.filter((item) => {
    const key = getSavedHomeItemKey(item);
    if (!favoriteKeys.has(key)) return false;

    const folderId = folderIdByItemKey.get(key);
    return folderId == null || !protectedFolderIds.has(folderId) || authorizedFolderIds.has(folderId);
  });
}
