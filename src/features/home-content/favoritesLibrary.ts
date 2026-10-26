import type { SQLiteDatabase } from 'expo-sqlite';

import { getSaveAppDatabase } from '@/features/photos/photoLibrary';
import { getHomeFolderItemKey } from '@/features/home-folders/homeFolderTypes';

import type { SavedFavoriteItemReference } from './favoritesTypes';

type FavoriteRow = {
  item_type: SavedFavoriteItemReference['itemType'];
  item_id: string;
};

const ITEM_EXISTS_SQL: Record<SavedFavoriteItemReference['itemType'], string> = {
  photo: "SELECT id FROM photos WHERE id = ? AND media_type = 'photo' AND deleted_at IS NULL LIMIT 1;",
  video: "SELECT id FROM photos WHERE id = ? AND media_type = 'video' AND deleted_at IS NULL LIMIT 1;",
  link: "SELECT id FROM saved_content WHERE id = ? AND content_type = 'link' AND deleted_at IS NULL LIMIT 1;",
  text: "SELECT id FROM saved_content WHERE id = ? AND content_type = 'text' AND deleted_at IS NULL LIMIT 1;",
  document: 'SELECT id FROM saved_documents WHERE id = ? AND deleted_at IS NULL LIMIT 1;',
  checklist: 'SELECT id FROM saved_checklists WHERE id = ? AND deleted_at IS NULL LIMIT 1;',
};

function assertReference(reference: SavedFavoriteItemReference): void {
  if (
    !Object.hasOwn(ITEM_EXISTS_SQL, reference.itemType) ||
    !Number.isSafeInteger(reference.itemId) ||
    reference.itemId <= 0
  ) {
    throw new Error('SAVED_FAVORITE_ITEM_NOT_FOUND');
  }
}

async function getDatabase(): Promise<SQLiteDatabase> {
  return getSaveAppDatabase();
}

export async function listSavedFavoriteKeys(): Promise<string[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<FavoriteRow>(
    'SELECT item_type, item_id FROM saved_favorite_items ORDER BY created_at, item_type, item_id;',
  );
  return rows.map(({ item_type, item_id }) => getHomeFolderItemKey(item_type, Number(item_id)));
}

export async function setSavedFavorite(
  reference: SavedFavoriteItemReference,
  isFavorite: boolean,
): Promise<void> {
  assertReference(reference);
  const database = await getDatabase();

  await database.withExclusiveTransactionAsync(async (transaction) => {
    if (isFavorite) {
      const item = await transaction.getFirstAsync<{ id: number }>(
        ITEM_EXISTS_SQL[reference.itemType],
        reference.itemId,
      );
      if (!item) throw new Error('SAVED_FAVORITE_ITEM_NOT_FOUND');
      await transaction.runAsync(
        `INSERT OR IGNORE INTO saved_favorite_items (item_type, item_id, created_at)
         VALUES (?, ?, ?);`,
        reference.itemType,
        String(reference.itemId),
        Date.now(),
      );
      return;
    }

    await transaction.runAsync(
      'DELETE FROM saved_favorite_items WHERE item_type = ? AND item_id = ?;',
      reference.itemType,
      String(reference.itemId),
    );
  });
}
