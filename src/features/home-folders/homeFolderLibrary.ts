import type { SQLiteDatabase } from 'expo-sqlite';

import { getSaveAppDatabase } from '@/features/photos/photoLibrary';
import { isAccentColorName } from '@/theme/colors';

import {
  HomeFolderNameError,
  normalizeHomeFolderName,
  validateHomeFolderName,
  type HomeFolder,
  type HomeFolderItemType,
} from './homeFolderTypes';
import type { AccentColorName } from '@/theme/colors';
import type { HomeFolderAssociationTransaction } from './folderAssociationDatabase';

type HomeFolderRow = {
  id: string;
  name: string;
  color: string | null;
  is_protected: number;
  created_at: number;
  updated_at: number;
  item_count: number;
};

type HomeFolderAssignmentRow = {
  item_type: HomeFolderItemType;
  item_id: string;
  folder_id: string;
};

export type HomeFolderAssignment = {
  itemType: HomeFolderItemType;
  itemId: number;
  folderId: string;
};

const ITEM_EXISTS_SQL: Record<HomeFolderItemType, string> = {
  photo: "SELECT id FROM photos WHERE id = ? AND media_type = 'photo' AND deleted_at IS NULL LIMIT 1;",
  video: "SELECT id FROM photos WHERE id = ? AND media_type = 'video' AND deleted_at IS NULL LIMIT 1;",
  link: "SELECT id FROM saved_content WHERE id = ? AND content_type = 'link' AND deleted_at IS NULL LIMIT 1;",
  text: "SELECT id FROM saved_content WHERE id = ? AND content_type = 'text' AND deleted_at IS NULL LIMIT 1;",
  document: 'SELECT id FROM saved_documents WHERE id = ? AND deleted_at IS NULL LIMIT 1;',
  checklist: 'SELECT id FROM saved_checklists WHERE id = ? AND deleted_at IS NULL LIMIT 1;',
};

const ACTIVE_FOLDER_ITEM_SQL = `(
  (items.item_type IN ('photo', 'video') AND EXISTS (
    SELECT 1 FROM photos WHERE id = CAST(items.item_id AS INTEGER)
      AND media_type = items.item_type AND deleted_at IS NULL
  )) OR
  (items.item_type IN ('link', 'text') AND EXISTS (
    SELECT 1 FROM saved_content WHERE id = CAST(items.item_id AS INTEGER)
      AND content_type = items.item_type AND deleted_at IS NULL
  )) OR
  (items.item_type = 'document' AND EXISTS (
    SELECT 1 FROM saved_documents WHERE id = CAST(items.item_id AS INTEGER) AND deleted_at IS NULL
  )) OR
  (items.item_type = 'checklist' AND EXISTS (
    SELECT 1 FROM saved_checklists WHERE id = CAST(items.item_id AS INTEGER) AND deleted_at IS NULL
  ))
)`;

function rowToHomeFolder(row: HomeFolderRow): HomeFolder {
  return {
    id: row.id,
    name: row.name,
    color: isAccentColorName(row.color) ? row.color : null,
    isProtected: row.is_protected === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemCount: row.item_count,
  };
}

function newHomeFolderId(): string {
  return `folder-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function getDatabase(): Promise<SQLiteDatabase> {
  return getSaveAppDatabase();
}

export async function listHomeFolders(): Promise<HomeFolder[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<HomeFolderRow>(`
    SELECT folders.id, folders.name, folders.color, folders.is_protected, folders.created_at, folders.updated_at,
      COUNT(items.item_id) AS item_count
    FROM saved_folders AS folders
    LEFT JOIN saved_folder_items AS items
      ON items.folder_id = folders.id AND ${ACTIVE_FOLDER_ITEM_SQL}
    GROUP BY folders.id
    ORDER BY folders.normalized_name COLLATE NOCASE, folders.created_at, folders.id;
  `);
  return rows.map(rowToHomeFolder);
}

export async function listHomeFolderAssignments(): Promise<HomeFolderAssignment[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<HomeFolderAssignmentRow>(`
    SELECT item_type, item_id, folder_id
    FROM saved_folder_items AS items
    WHERE ${ACTIVE_FOLDER_ITEM_SQL}
    ORDER BY item_type, item_id;
  `);
  return rows.flatMap((row) => {
    const itemId = Number(row.item_id);
    if (!Number.isSafeInteger(itemId) || itemId <= 0) return [];
    return [{ itemType: row.item_type, itemId, folderId: row.folder_id }];
  });
}

export async function getHomeFolderItemAssignment(
  itemType: HomeFolderItemType,
  itemId: number,
): Promise<string | null> {
  if (!Number.isSafeInteger(itemId) || itemId <= 0) throw new Error('HOME_FOLDER_ITEM_NOT_FOUND');
  const database = await getDatabase();
  return readAssignment(database, itemType, itemId);
}

export async function createHomeFolder(name: string): Promise<HomeFolder> {
  const normalizedDisplayName = validateHomeFolderName(name);
  const normalizedName = normalizeHomeFolderName(normalizedDisplayName);
  const folderId = newHomeFolderId();
  const timestamp = Date.now();
  const database = await getDatabase();

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const duplicate = await transaction.getFirstAsync<{ id: string }>(
      'SELECT id FROM saved_folders WHERE normalized_name = ? LIMIT 1;',
      normalizedName,
    );
    if (duplicate) throw new HomeFolderNameError('duplicate');

    await transaction.runAsync(
      `INSERT INTO saved_folders (id, name, normalized_name, color, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?);`,
      folderId,
      normalizedDisplayName,
      normalizedName,
      timestamp,
      timestamp,
    );
  });

  return {
    id: folderId,
    name: normalizedDisplayName,
    color: null,
    isProtected: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    itemCount: 0,
  };
}

export async function renameHomeFolder(folderId: string, name: string): Promise<HomeFolder> {
  const normalizedDisplayName = validateHomeFolderName(name);
  const normalizedName = normalizeHomeFolderName(normalizedDisplayName);
  const timestamp = Date.now();
  const database = await getDatabase();
  let updatedFolder: HomeFolder | null = null;

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const current = await transaction.getFirstAsync<HomeFolderRow>(
       `SELECT folders.id, folders.name, folders.color, folders.is_protected, folders.created_at, folders.updated_at,
         (SELECT COUNT(*) FROM saved_folder_items AS items
          WHERE items.folder_id = folders.id AND ${ACTIVE_FOLDER_ITEM_SQL}) AS item_count
       FROM saved_folders AS folders WHERE folders.id = ? LIMIT 1;`,
      folderId,
    );
    if (!current) throw new Error('HOME_FOLDER_NOT_FOUND');

    const duplicate = await transaction.getFirstAsync<{ id: string }>(
      'SELECT id FROM saved_folders WHERE normalized_name = ? AND id <> ? LIMIT 1;',
      normalizedName,
      folderId,
    );
    if (duplicate) throw new HomeFolderNameError('duplicate');

    await transaction.runAsync(
      'UPDATE saved_folders SET name = ?, normalized_name = ?, updated_at = ? WHERE id = ?;',
      normalizedDisplayName,
      normalizedName,
      timestamp,
      folderId,
    );
    updatedFolder = {
      id: folderId,
      name: normalizedDisplayName,
      color: isAccentColorName(current.color) ? current.color : null,
      isProtected: current.is_protected === 1,
      createdAt: current.created_at,
      updatedAt: timestamp,
      itemCount: current.item_count,
    };
  });

  if (!updatedFolder) throw new Error('HOME_FOLDER_NOT_FOUND');
  return updatedFolder;
}

export async function setHomeFolderColor(
  folderId: string,
  color: AccentColorName | null,
): Promise<boolean> {
  if (color !== null && !isAccentColorName(color)) throw new Error('HOME_FOLDER_COLOR_INVALID');
  const database = await getDatabase();
  const result = await database.runAsync(
    'UPDATE saved_folders SET color = ?, updated_at = ? WHERE id = ?;',
    color,
    Date.now(),
    folderId,
  );
  return result.changes === 1;
}

export async function deleteHomeFolder(
  folderId: string,
  expectedProtection?: boolean,
): Promise<boolean> {
  const database = await getDatabase();
  let deleted = false;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const current = await transaction.getFirstAsync<{ id: string; is_protected: number }>(
      'SELECT id, is_protected FROM saved_folders WHERE id = ? LIMIT 1;',
      folderId,
    );
    if (!current) return;
    if (expectedProtection !== undefined && current.is_protected !== (expectedProtection ? 1 : 0)) return;
    await transaction.runAsync('DELETE FROM saved_folder_items WHERE folder_id = ?;', folderId);
    const result = await transaction.runAsync('DELETE FROM saved_folders WHERE id = ?;', folderId);
    deleted = result.changes === 1;
  });
  return deleted;
}

export async function setHomeFolderProtection(
  folderId: string,
  isProtected: boolean,
  expectedCurrentProtection?: boolean,
): Promise<boolean> {
  const database = await getDatabase();
  const result = expectedCurrentProtection === undefined
    ? await database.runAsync(
      'UPDATE saved_folders SET is_protected = ?, updated_at = ? WHERE id = ?;',
      isProtected ? 1 : 0,
      Date.now(),
      folderId,
    )
    : await database.runAsync(
      'UPDATE saved_folders SET is_protected = ?, updated_at = ? WHERE id = ? AND is_protected = ?;',
      isProtected ? 1 : 0,
      Date.now(),
      folderId,
      expectedCurrentProtection ? 1 : 0,
    );
  return result.changes === 1;
}

export async function setHomeFolderItemAssignment(
  itemType: HomeFolderItemType,
  itemId: number,
  folderId: string | null,
  expectedPreviousFolderId?: string | null,
): Promise<string | null> {
  if (!Number.isSafeInteger(itemId) || itemId <= 0) throw new Error('HOME_FOLDER_ITEM_NOT_FOUND');
  const database = await getDatabase();
  let previousFolderId: string | null = null;

  await database.withExclusiveTransactionAsync(async (transaction) => {
    previousFolderId = await readAssignment(transaction, itemType, itemId);
    if (expectedPreviousFolderId !== undefined && previousFolderId !== expectedPreviousFolderId) {
      throw new Error('HOME_FOLDER_ASSIGNMENT_CHANGED');
    }
    if (folderId == null) {
      await transaction.runAsync(
        'DELETE FROM saved_folder_items WHERE item_type = ? AND item_id = ?;',
        itemType,
        String(itemId),
      );
      return;
    }

    const folder = await transaction.getFirstAsync<{ id: string }>(
      'SELECT id FROM saved_folders WHERE id = ? LIMIT 1;',
      folderId,
    );
    const item = await transaction.getFirstAsync<{ id: number }>(ITEM_EXISTS_SQL[itemType], itemId);
    if (!folder) throw new Error('HOME_FOLDER_NOT_FOUND');
    if (!item) throw new Error('HOME_FOLDER_ITEM_NOT_FOUND');

    await transaction.runAsync(
      `INSERT INTO saved_folder_items (item_type, item_id, folder_id)
       VALUES (?, ?, ?)
       ON CONFLICT(item_type, item_id) DO UPDATE SET folder_id = excluded.folder_id;`,
      itemType,
      String(itemId),
      folderId,
    );
  });

  return previousFolderId;
}

async function readAssignment(
  transaction: HomeFolderAssociationTransaction,
  itemType: HomeFolderItemType,
  itemId: number,
): Promise<string | null> {
  const row = await transaction.getFirstAsync<{ folder_id: string }>(
    'SELECT folder_id FROM saved_folder_items WHERE item_type = ? AND item_id = ? LIMIT 1;',
    itemType,
    String(itemId),
  );
  return row?.folder_id ?? null;
}
