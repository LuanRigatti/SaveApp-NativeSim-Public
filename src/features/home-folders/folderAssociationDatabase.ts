import type { SQLiteDatabase } from 'expo-sqlite';

import type { HomeFolderItemType } from './homeFolderTypes';

export type HomeFolderAssociationTransaction = Pick<
  SQLiteDatabase,
  'getFirstAsync' | 'runAsync'
>;

const ITEM_EXISTS_SQL: Record<HomeFolderItemType, string> = {
  photo: "SELECT id FROM photos WHERE id = ? AND media_type = 'photo' AND deleted_at IS NULL LIMIT 1;",
  video: "SELECT id FROM photos WHERE id = ? AND media_type = 'video' AND deleted_at IS NULL LIMIT 1;",
  link: "SELECT id FROM saved_content WHERE id = ? AND content_type = 'link' AND deleted_at IS NULL LIMIT 1;",
  text: "SELECT id FROM saved_content WHERE id = ? AND content_type = 'text' AND deleted_at IS NULL LIMIT 1;",
  document: 'SELECT id FROM saved_documents WHERE id = ? AND deleted_at IS NULL LIMIT 1;',
  checklist: 'SELECT id FROM saved_checklists WHERE id = ? AND deleted_at IS NULL LIMIT 1;',
};

export async function readHomeFolderAssociation(
  database: HomeFolderAssociationTransaction,
  itemType: HomeFolderItemType,
  itemId: number,
): Promise<string | null> {
  const row = await database.getFirstAsync<{ folder_id: string }>(
    'SELECT folder_id FROM saved_folder_items WHERE item_type = ? AND item_id = ? LIMIT 1;',
    itemType,
    String(itemId),
  );
  return row?.folder_id ?? null;
}

export async function restoreHomeFolderAssociation(
  database: HomeFolderAssociationTransaction,
  itemType: HomeFolderItemType,
  itemId: number,
  folderId: string | null,
): Promise<void> {
  if (!folderId) return;

  const item = await database.getFirstAsync<{ id: number }>(ITEM_EXISTS_SQL[itemType], itemId);
  const folder = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM saved_folders WHERE id = ? LIMIT 1;',
    folderId,
  );
  if (!item || !folder) return;

  await database.runAsync(
    'INSERT OR IGNORE INTO saved_folder_items (item_type, item_id, folder_id) VALUES (?, ?, ?);',
    itemType,
    String(itemId),
    folderId,
  );
}
