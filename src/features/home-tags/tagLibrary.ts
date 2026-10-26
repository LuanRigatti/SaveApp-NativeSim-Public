import type { SQLiteDatabase } from 'expo-sqlite';

import { getSaveAppDatabase } from '@/features/photos/photoLibrary';
import { isAccentColorName } from '@/theme/colors';
import type { AccentColorName } from '@/theme/colors';

import {
  normalizeSavedTagName,
  SavedTagNameError,
  validateSavedTagName,
  type SavedTag,
  type SavedTagAssignment,
  type SavedTagItemReference,
} from './tagTypes';

type SavedTagRow = {
  id: string;
  name: string;
  color: string;
  created_at: number;
  updated_at: number;
};

type SavedTagAssignmentRow = {
  item_type: SavedTagAssignment['itemType'];
  item_id: string;
  tag_id: string;
  name: string;
  color: string;
};

const ITEM_EXISTS_SQL: Record<SavedTagItemReference['itemType'], string> = {
  photo: "SELECT id FROM photos WHERE id = ? AND media_type = 'photo' AND deleted_at IS NULL LIMIT 1;",
  video: "SELECT id FROM photos WHERE id = ? AND media_type = 'video' AND deleted_at IS NULL LIMIT 1;",
  link: "SELECT id FROM saved_content WHERE id = ? AND content_type = 'link' AND deleted_at IS NULL LIMIT 1;",
  text: "SELECT id FROM saved_content WHERE id = ? AND content_type = 'text' AND deleted_at IS NULL LIMIT 1;",
  document: 'SELECT id FROM saved_documents WHERE id = ? AND deleted_at IS NULL LIMIT 1;',
  checklist: 'SELECT id FROM saved_checklists WHERE id = ? AND deleted_at IS NULL LIMIT 1;',
};

function rowToSavedTag(row: SavedTagRow): SavedTag | null {
  if (!isAccentColorName(row.color)) return null;
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function newSavedTagId(): string {
  return `tag-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function assertItemReference(reference: SavedTagItemReference): void {
  if (
    !Object.hasOwn(ITEM_EXISTS_SQL, reference.itemType) ||
    !Number.isSafeInteger(reference.itemId) ||
    reference.itemId <= 0
  ) {
    throw new Error('SAVED_TAG_ITEM_NOT_FOUND');
  }
}

async function getDatabase(): Promise<SQLiteDatabase> {
  return getSaveAppDatabase();
}

export async function listSavedTags(): Promise<SavedTag[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<SavedTagRow>(`
    SELECT id, name, color, created_at, updated_at
    FROM saved_tags
    ORDER BY normalized_name COLLATE NOCASE, created_at, id;
  `);
  return rows.flatMap((row) => {
    const tag = rowToSavedTag(row);
    return tag ? [tag] : [];
  });
}

export async function createSavedTag(name: string, color: AccentColorName): Promise<SavedTag> {
  const displayName = validateSavedTagName(name);
  if (!isAccentColorName(color)) throw new Error('SAVED_TAG_COLOR_INVALID');
  const normalizedName = normalizeSavedTagName(displayName);
  const id = newSavedTagId();
  const timestamp = Date.now();
  const database = await getDatabase();

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const duplicate = await transaction.getFirstAsync<{ id: string }>(
      'SELECT id FROM saved_tags WHERE normalized_name = ? LIMIT 1;',
      normalizedName,
    );
    if (duplicate) throw new SavedTagNameError('duplicate');

    await transaction.runAsync(
      `INSERT INTO saved_tags (id, name, normalized_name, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?);`,
      id,
      displayName,
      normalizedName,
      color,
      timestamp,
      timestamp,
    );
  });

  return { id, name: displayName, color, createdAt: timestamp, updatedAt: timestamp };
}

export async function updateSavedTag(
  id: string,
  name: string,
  color: AccentColorName,
): Promise<SavedTag> {
  if (!id.trim()) throw new Error('SAVED_TAG_NOT_FOUND');
  const displayName = validateSavedTagName(name);
  if (!isAccentColorName(color)) throw new Error('SAVED_TAG_COLOR_INVALID');
  const normalizedName = normalizeSavedTagName(displayName);
  const timestamp = Date.now();
  const database = await getDatabase();
  let updatedTag: SavedTag | null = null;

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const current = await transaction.getFirstAsync<SavedTagRow>(
      'SELECT id, name, color, created_at, updated_at FROM saved_tags WHERE id = ? LIMIT 1;',
      id,
    );
    if (!current) throw new Error('SAVED_TAG_NOT_FOUND');

    const duplicate = await transaction.getFirstAsync<{ id: string }>(
      'SELECT id FROM saved_tags WHERE normalized_name = ? AND id <> ? LIMIT 1;',
      normalizedName,
      id,
    );
    if (duplicate) throw new SavedTagNameError('duplicate');

    await transaction.runAsync(
      'UPDATE saved_tags SET name = ?, normalized_name = ?, color = ?, updated_at = ? WHERE id = ?;',
      displayName,
      normalizedName,
      color,
      timestamp,
      id,
    );
    updatedTag = {
      id,
      name: displayName,
      color,
      createdAt: current.created_at,
      updatedAt: timestamp,
    };
  });

  if (!updatedTag) throw new Error('SAVED_TAG_NOT_FOUND');
  return updatedTag;
}

export async function deleteSavedTag(id: string): Promise<boolean> {
  if (!id.trim()) return false;
  const database = await getDatabase();
  let deleted = false;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('DELETE FROM saved_tag_items WHERE tag_id = ?;', id);
    const result = await transaction.runAsync('DELETE FROM saved_tags WHERE id = ?;', id);
    deleted = result.changes === 1;
  });
  return deleted;
}

export async function listSavedTagAssignments(
  references: readonly SavedTagItemReference[],
): Promise<SavedTagAssignment[]> {
  const uniqueReferences = new Map<string, SavedTagItemReference>();
  for (const reference of references) {
    if (!Number.isSafeInteger(reference.itemId) || reference.itemId <= 0) continue;
    if (!Object.hasOwn(ITEM_EXISTS_SQL, reference.itemType)) continue;
    uniqueReferences.set(`${reference.itemType}:${reference.itemId}`, reference);
  }
  if (uniqueReferences.size === 0) return [];

  const database = await getDatabase();
  const rows: SavedTagAssignmentRow[] = [];
  const allReferences = [...uniqueReferences.values()];

  // Keep each SQLite statement below conservative bind-parameter limits on supported devices.
  for (let offset = 0; offset < allReferences.length; offset += 300) {
    const batch = allReferences.slice(offset, offset + 300);
    const predicates = batch.map(() => '(items.item_type = ? AND items.item_id = ?)').join(' OR ');
    const parameters = batch.flatMap(({ itemType, itemId }) => [itemType, String(itemId)]);
    rows.push(...await database.getAllAsync<SavedTagAssignmentRow>(
      `SELECT items.item_type, items.item_id, tags.id AS tag_id, tags.name, tags.color
       FROM saved_tag_items AS items
       INNER JOIN saved_tags AS tags ON tags.id = items.tag_id
       INNER JOIN (
         SELECT media_type AS item_type, CAST(id AS TEXT) AS item_id FROM photos WHERE deleted_at IS NULL
         UNION ALL
         SELECT content_type AS item_type, CAST(id AS TEXT) AS item_id FROM saved_content WHERE deleted_at IS NULL
         UNION ALL
         SELECT 'document' AS item_type, CAST(id AS TEXT) AS item_id FROM saved_documents WHERE deleted_at IS NULL
         UNION ALL
         SELECT 'checklist' AS item_type, CAST(id AS TEXT) AS item_id FROM saved_checklists WHERE deleted_at IS NULL
       ) AS active_items ON active_items.item_type = items.item_type AND active_items.item_id = items.item_id
       WHERE ${predicates}
       ORDER BY tags.normalized_name COLLATE NOCASE, tags.created_at, tags.id;`,
      ...parameters,
    ));
  }

  return rows.flatMap((row) => {
    const itemId = Number(row.item_id);
    if (!Number.isSafeInteger(itemId) || itemId <= 0 || !isAccentColorName(row.color)) return [];
    return [{
      itemType: row.item_type,
      itemId,
      tagId: row.tag_id,
      name: row.name,
      color: row.color,
    }];
  });
}

export async function setSavedTagAssociation(
  reference: SavedTagItemReference,
  tagId: string,
  isSelected: boolean,
): Promise<void> {
  assertItemReference(reference);
  if (!tagId.trim()) throw new Error('SAVED_TAG_NOT_FOUND');
  const database = await getDatabase();

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const item = await transaction.getFirstAsync<{ id: number }>(
      ITEM_EXISTS_SQL[reference.itemType],
      reference.itemId,
    );
    if (!item) throw new Error('SAVED_TAG_ITEM_NOT_FOUND');

    if (!isSelected) {
      await transaction.runAsync(
        'DELETE FROM saved_tag_items WHERE item_type = ? AND item_id = ? AND tag_id = ?;',
        reference.itemType,
        String(reference.itemId),
        tagId,
      );
      return;
    }

    const tag = await transaction.getFirstAsync<{ id: string }>(
      'SELECT id FROM saved_tags WHERE id = ? LIMIT 1;',
      tagId,
    );
    if (!tag) throw new Error('SAVED_TAG_NOT_FOUND');

    await transaction.runAsync(
      `INSERT OR IGNORE INTO saved_tag_items (item_type, item_id, tag_id, created_at)
       VALUES (?, ?, ?, ?);`,
      reference.itemType,
      String(reference.itemId),
      tagId,
      Date.now(),
    );
  });
}
