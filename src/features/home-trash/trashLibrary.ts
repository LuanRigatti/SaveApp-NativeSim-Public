import type { SQLiteDatabase } from 'expo-sqlite';

import { deleteSavedDocument } from '@/features/documents/documentLibrary';
import { deleteSavedHomeContent } from '@/features/home-content/savedContentLibrary';
import { deleteSavedChecklist } from '@/features/home-content/checklistLibrary';
import { getSaveAppDatabase, deleteSavedPhoto, deleteSavedVideo } from '@/features/photos/photoLibrary';
import type { HomeFolderItemType } from '@/features/home-folders/homeFolderTypes';

export const RECENTLY_DELETED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type RecentlyDeletedItemType = HomeFolderItemType;

export type RecentlyDeletedItem = {
  itemType: RecentlyDeletedItemType;
  itemId: number;
  title: string | null;
  deletedAt: number;
  folderId: string | null;
  folderIsProtected: boolean;
  requiresAuthorization: boolean;
};

export class RecentlyDeletedRestoreConflictError extends Error {
  constructor() {
    super('RECENTLY_DELETED_ACTIVE_LINK_CONFLICT');
    this.name = 'RecentlyDeletedRestoreConflictError';
  }
}

type TrashTable = {
  table: 'photos' | 'saved_content' | 'saved_documents' | 'saved_checklists';
  typeColumn?: 'media_type' | 'content_type';
  typeValue?: string;
};

const TABLE_BY_TYPE: Record<RecentlyDeletedItemType, TrashTable> = {
  photo: { table: 'photos', typeColumn: 'media_type', typeValue: 'photo' },
  video: { table: 'photos', typeColumn: 'media_type', typeValue: 'video' },
  link: { table: 'saved_content', typeColumn: 'content_type', typeValue: 'link' },
  text: { table: 'saved_content', typeColumn: 'content_type', typeValue: 'text' },
  document: { table: 'saved_documents' },
  checklist: { table: 'saved_checklists' },
};

const trashOperationsInProgress = new Set<string>();

function itemKey(itemType: RecentlyDeletedItemType, itemId: number): string {
  return `${itemType}:${itemId}`;
}

function isValidItemId(itemId: number): boolean {
  return Number.isSafeInteger(itemId) && itemId > 0;
}

function rowPredicate(itemType: RecentlyDeletedItemType, itemId: number): {
  sql: string;
  parameters: (string | number)[];
} {
  const definition = TABLE_BY_TYPE[itemType];
  return {
    sql: `id = ?${definition.typeColumn ? ` AND ${definition.typeColumn} = ?` : ''}`,
    parameters: definition.typeColumn ? [itemId, definition.typeValue!] : [itemId],
  };
}

function titleVisibilitySql(authorizedFolderIds: readonly string[]): string {
  const protectedPredicate = '(item.deleted_folder_is_protected = 1 OR COALESCE(folder.is_protected, 0) = 1)';
  if (authorizedFolderIds.length === 0) return `NOT ${protectedPredicate}`;
  return `(NOT ${protectedPredicate} OR COALESCE(association.folder_id, item.deleted_folder_id) IN (${authorizedFolderIds.map(() => '?').join(', ')}))`;
}

function entryQuery(
  itemType: RecentlyDeletedItemType,
  authorizedFolderIds: readonly string[],
): { sql: string; parameters: string[] } {
  const authorized = titleVisibilitySql(authorizedFolderIds);
  const shared = (type: string, title: string, table: string, idExpression = 'item.id') => `
    SELECT '${type}' AS item_type, ${idExpression} AS item_id,
      CASE WHEN ${authorized} THEN ${title} ELSE NULL END AS title,
      item.deleted_at AS deleted_at,
      COALESCE(association.folder_id, item.deleted_folder_id) AS folder_id,
      CASE WHEN item.deleted_folder_is_protected = 1 OR COALESCE(folder.is_protected, 0) = 1 THEN 1 ELSE 0 END AS folder_is_protected,
      CASE WHEN (item.deleted_folder_is_protected = 1 OR COALESCE(folder.is_protected, 0) = 1) AND NOT (${authorized}) THEN 1 ELSE 0 END AS requires_authorization
    FROM ${table} AS item
    LEFT JOIN saved_folder_items AS association
      ON association.item_type = '${type}' AND association.item_id = CAST(item.id AS TEXT)
    LEFT JOIN saved_folders AS folder
      ON folder.id = COALESCE(association.folder_id, item.deleted_folder_id)
    WHERE item.deleted_at IS NOT NULL`;

  const definitions: Record<RecentlyDeletedItemType, { sql: string; parameters: string[] }> = {
    photo: {
      sql: shared('photo', "COALESCE(NULLIF(item.custom_title, ''), 'Foto')", 'photos') + " AND item.media_type = 'photo'",
      parameters: [...authorizedFolderIds],
    },
    video: {
      sql: shared('video', "'Vídeo'", 'photos') + " AND item.media_type = 'video'",
      parameters: [...authorizedFolderIds],
    },
    link: {
      sql: shared('link', "COALESCE(NULLIF(item.title, ''), NULLIF(item.domain, ''), 'Link')", 'saved_content') + " AND item.content_type = 'link'",
      parameters: [...authorizedFolderIds],
    },
    text: {
      sql: shared('text', "'Texto'", 'saved_content') + " AND item.content_type = 'text'",
      parameters: [...authorizedFolderIds],
    },
    document: {
      sql: shared('document', 'item.original_name', 'saved_documents'),
      parameters: [...authorizedFolderIds],
    },
    checklist: {
      sql: shared('checklist', 'item.title', 'saved_checklists'),
      parameters: [...authorizedFolderIds],
    },
  };

  const query = definitions[itemType];
  // The same authorization predicate appears twice in each SELECT.
  return { sql: query.sql, parameters: [...query.parameters, ...authorizedFolderIds] };
}

type RecentlyDeletedRow = {
  item_type: RecentlyDeletedItemType;
  item_id: number;
  title: string | null;
  deleted_at: number;
  folder_id: string | null;
  folder_is_protected: number;
  requires_authorization: number;
};

/** Tombstones remain in the content tables, so child tasks, files, folder rows and tags stay intact. */
export async function moveSavedItemToRecentlyDeleted(
  itemType: RecentlyDeletedItemType,
  itemId: number,
  expectedFolderId?: string | null,
  deletedAt = Date.now(),
): Promise<boolean> {
  if (!isValidItemId(itemId) || !Object.hasOwn(TABLE_BY_TYPE, itemType)) return false;
  const database = await getSaveAppDatabase();
  const definition = TABLE_BY_TYPE[itemType];
  const predicate = rowPredicate(itemType, itemId);
  let moved = false;

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const current = await transaction.getFirstAsync<{ id: number; deleted_at: number | null }>(
      `SELECT id, deleted_at FROM ${definition.table} WHERE ${predicate.sql} LIMIT 1;`,
      ...predicate.parameters,
    );
    if (!current || current.deleted_at != null) return;

    const association = await transaction.getFirstAsync<{ folder_id: string; is_protected: number }>(
      `SELECT association.folder_id, COALESCE(folder.is_protected, 0) AS is_protected
       FROM saved_folder_items AS association
       LEFT JOIN saved_folders AS folder ON folder.id = association.folder_id
       WHERE association.item_type = ? AND association.item_id = ? LIMIT 1;`,
      itemType,
      String(itemId),
    );
    const folderId = association?.folder_id ?? null;
    if (expectedFolderId !== undefined && folderId !== expectedFolderId) {
      throw new Error('RECENTLY_DELETED_FOLDER_ASSIGNMENT_CHANGED');
    }

    const result = await transaction.runAsync(
      `UPDATE ${definition.table}
       SET deleted_at = ?, deleted_folder_id = ?, deleted_folder_is_protected = ?
       WHERE ${predicate.sql} AND deleted_at IS NULL;`,
      deletedAt,
      folderId,
      association?.is_protected === 1 ? 1 : 0,
      ...predicate.parameters,
    );
    moved = result.changes === 1;
  });

  return moved;
}

/** Protected-folder names are selected from SQLite only for folder IDs already authorized by Face ID. */
export async function listRecentlyDeletedItems(
  authorizedProtectedFolderIds: readonly string[] = [],
): Promise<RecentlyDeletedItem[]> {
  const database = await getSaveAppDatabase();
  const uniqueAuthorizedIds = [...new Set(authorizedProtectedFolderIds.filter(Boolean))];
  const types = Object.keys(TABLE_BY_TYPE) as RecentlyDeletedItemType[];
  const rows: RecentlyDeletedRow[] = [];

  for (const itemType of types) {
    const query = entryQuery(itemType, uniqueAuthorizedIds);
    rows.push(...await database.getAllAsync<RecentlyDeletedRow>(query.sql, ...query.parameters));
  }

  return rows.flatMap((row) => {
    if (!isValidItemId(Number(row.item_id)) || !Number.isSafeInteger(row.deleted_at)) return [];
    return [{
      itemType: row.item_type,
      itemId: Number(row.item_id),
      title: row.title,
      deletedAt: row.deleted_at,
      folderId: row.folder_id,
      folderIsProtected: row.folder_is_protected === 1,
      requiresAuthorization: row.requires_authorization === 1,
    }];
  }).sort((first, second) => second.deletedAt - first.deletedAt || second.itemId - first.itemId);
}

export function getRecentlyDeletedDaysRemaining(deletedAt: number, now = Date.now()): number {
  const deadline = deletedAt + RECENTLY_DELETED_RETENTION_MS;
  return Math.max(0, Math.ceil((deadline - now) / (24 * 60 * 60 * 1000)));
}

export async function restoreRecentlyDeletedItem(
  itemType: RecentlyDeletedItemType,
  itemId: number,
): Promise<boolean> {
  if (!isValidItemId(itemId) || !Object.hasOwn(TABLE_BY_TYPE, itemType)) return false;
  const key = itemKey(itemType, itemId);
  if (trashOperationsInProgress.has(key)) return false;
  trashOperationsInProgress.add(key);

  try {
    const database = await getSaveAppDatabase();
    const definition = TABLE_BY_TYPE[itemType];
    const predicate = rowPredicate(itemType, itemId);
    let restored = false;

    await database.withExclusiveTransactionAsync(async (transaction) => {
      const current = await transaction.getFirstAsync<{ id: number; deleted_folder_id: string | null }>(
        `SELECT id, deleted_folder_id FROM ${definition.table} WHERE ${predicate.sql} AND deleted_at IS NOT NULL LIMIT 1;`,
        ...predicate.parameters,
      );
      if (!current) return;

      if (itemType === 'link') {
        const duplicate = await transaction.getFirstAsync<{ id: number }>(
          `SELECT id FROM saved_content
           WHERE content_type = 'link' AND id <> ? AND deleted_at IS NULL
             AND normalized_url = (SELECT normalized_url FROM saved_content WHERE id = ?)
           LIMIT 1;`,
          itemId,
          itemId,
        );
        if (duplicate) throw new RecentlyDeletedRestoreConflictError();
      }

      const update = await transaction.runAsync(
        `UPDATE ${definition.table} SET deleted_at = NULL, deleted_folder_id = NULL, deleted_folder_is_protected = 0
         WHERE ${predicate.sql} AND deleted_at IS NOT NULL;`,
        ...predicate.parameters,
      );
      if (update.changes !== 1) return;

      const existingAssociation = await transaction.getFirstAsync<{ folder_id: string }>(
        'SELECT folder_id FROM saved_folder_items WHERE item_type = ? AND item_id = ? LIMIT 1;',
        itemType,
        String(itemId),
      );
      if (!existingAssociation && current.deleted_folder_id) {
        const folder = await transaction.getFirstAsync<{ id: string }>(
          'SELECT id FROM saved_folders WHERE id = ? LIMIT 1;',
          current.deleted_folder_id,
        );
        if (folder) {
          await transaction.runAsync(
            'INSERT OR IGNORE INTO saved_folder_items (item_type, item_id, folder_id) VALUES (?, ?, ?);',
            itemType,
            String(itemId),
            folder.id,
          );
        }
      }
      restored = true;
    });
    return restored;
  } finally {
    trashOperationsInProgress.delete(key);
  }
}

async function readTrashedTagAssociations(
  database: SQLiteDatabase,
  itemType: RecentlyDeletedItemType,
  itemId: number,
): Promise<{ tag_id: string; created_at: number }[]> {
  return database.getAllAsync<{ tag_id: string; created_at: number }>(
    'SELECT tag_id, created_at FROM saved_tag_items WHERE item_type = ? AND item_id = ?;',
    itemType,
    String(itemId),
  );
}

async function restoreTrashStateAfterFailedPermanentDelete(
  database: SQLiteDatabase,
  itemType: RecentlyDeletedItemType,
  itemId: number,
  tombstone: { deleted_at: number; deleted_folder_id: string | null; deleted_folder_is_protected: number },
  associations: readonly { tag_id: string; created_at: number }[],
): Promise<boolean> {
  const definition = TABLE_BY_TYPE[itemType];
  const predicate = rowPredicate(itemType, itemId);
  let restored = false;

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const item = await transaction.getFirstAsync<{ id: number }>(
      `SELECT id FROM ${definition.table} WHERE ${predicate.sql} LIMIT 1;`,
      ...predicate.parameters,
    );
    if (!item) return;

    await transaction.runAsync(
      `UPDATE ${definition.table} SET deleted_at = ?, deleted_folder_id = ?, deleted_folder_is_protected = ? WHERE ${predicate.sql};`,
      tombstone.deleted_at,
      tombstone.deleted_folder_id,
      tombstone.deleted_folder_is_protected,
      ...predicate.parameters,
    );

    if (tombstone.deleted_folder_id) {
      const currentAssociation = await transaction.getFirstAsync<{ folder_id: string }>(
        'SELECT folder_id FROM saved_folder_items WHERE item_type = ? AND item_id = ? LIMIT 1;',
        itemType,
        String(itemId),
      );
      const folder = await transaction.getFirstAsync<{ id: string }>(
        'SELECT id FROM saved_folders WHERE id = ? LIMIT 1;',
        tombstone.deleted_folder_id,
      );
      if (!currentAssociation && folder) {
        await transaction.runAsync(
          'INSERT OR IGNORE INTO saved_folder_items (item_type, item_id, folder_id) VALUES (?, ?, ?);',
          itemType,
          String(itemId),
          folder.id,
        );
      }
    }

    for (const association of associations) {
      await transaction.runAsync(
        `INSERT OR IGNORE INTO saved_tag_items (item_type, item_id, tag_id, created_at)
         SELECT ?, ?, id, ? FROM saved_tags WHERE id = ?;`,
        itemType,
        String(itemId),
        association.created_at,
        association.tag_id,
      );
    }
    restored = true;
  });

  return restored;
}

async function physicallyDelete(itemType: RecentlyDeletedItemType, itemId: number): Promise<boolean> {
  switch (itemType) {
    case 'photo': return deleteSavedPhoto(itemId);
    case 'video': return deleteSavedVideo(itemId);
    case 'link':
    case 'text': return deleteSavedHomeContent(itemId, itemType);
    case 'document': return deleteSavedDocument(itemId);
    case 'checklist': return deleteSavedChecklist(itemId);
  }
}

export async function permanentlyDeleteRecentlyDeletedItem(
  itemType: RecentlyDeletedItemType,
  itemId: number,
): Promise<boolean> {
  if (!isValidItemId(itemId) || !Object.hasOwn(TABLE_BY_TYPE, itemType)) return false;
  const key = itemKey(itemType, itemId);
  if (trashOperationsInProgress.has(key)) return false;
  trashOperationsInProgress.add(key);

  try {
    const database = await getSaveAppDatabase();
    const definition = TABLE_BY_TYPE[itemType];
    const predicate = rowPredicate(itemType, itemId);
    const tombstone = await database.getFirstAsync<{ deleted_at: number; deleted_folder_id: string | null; deleted_folder_is_protected: number }>(
      `SELECT deleted_at, deleted_folder_id, deleted_folder_is_protected FROM ${definition.table}
       WHERE ${predicate.sql} AND deleted_at IS NOT NULL LIMIT 1;`,
      ...predicate.parameters,
    );
    if (!tombstone) return false;
    const tagAssociations = await readTrashedTagAssociations(database, itemType, itemId);
    try {
      const deleted = await physicallyDelete(itemType, itemId);
      if (!deleted) {
        await restoreTrashStateAfterFailedPermanentDelete(
          database,
          itemType,
          itemId,
          tombstone,
          tagAssociations,
        );
      }
      return deleted;
    } catch (error) {
      await restoreTrashStateAfterFailedPermanentDelete(
        database,
        itemType,
        itemId,
        tombstone,
        tagAssociations,
      );
      throw error;
    }
  } finally {
    trashOperationsInProgress.delete(key);
  }
}

export async function purgeExpiredRecentlyDeletedItems(now = Date.now()): Promise<{
  deletedCount: number;
  failedCount: number;
}> {
  const database = await getSaveAppDatabase();
  const cutoff = now - RECENTLY_DELETED_RETENTION_MS;
  let deletedCount = 0;
  let failedCount = 0;

  for (const itemType of Object.keys(TABLE_BY_TYPE) as RecentlyDeletedItemType[]) {
    const definition = TABLE_BY_TYPE[itemType];
    const typeFilter = definition.typeColumn ? ` AND ${definition.typeColumn} = ?` : '';
    const parameters = definition.typeColumn ? [cutoff, definition.typeValue!] : [cutoff];
    const rows = await database.getAllAsync<{ id: number }>(
      `SELECT id FROM ${definition.table} WHERE deleted_at IS NOT NULL AND deleted_at <= ?${typeFilter} ORDER BY deleted_at, id;`,
      ...parameters,
    );

    for (const row of rows) {
      try {
        if (await permanentlyDeleteRecentlyDeletedItem(itemType, row.id)) deletedCount += 1;
        else failedCount += 1;
      } catch {
        // Keep a failed item and retry safely on the next app activation.
        failedCount += 1;
      }
    }
  }

  return { deletedCount, failedCount };
}
