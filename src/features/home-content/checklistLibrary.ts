import type { SQLiteDatabase } from "expo-sqlite";

import { getSaveAppDatabase } from "@/features/photos/photoLibrary";

import {
  ChecklistLibraryError,
  normalizeChecklistTaskText,
  normalizeChecklistTitle,
  type SavedChecklist,
  type SavedChecklistSummary,
  type SavedChecklistTask,
} from "./checklistTypes";

type ChecklistRow = {
  id: number;
  title: string;
  created_at: number;
  updated_at: number;
};

type ChecklistSummaryRow = ChecklistRow & {
  total_tasks: number;
  completed_tasks: number;
  preview_1: string | null;
  preview_1_completed: number | null;
  preview_2: string | null;
  preview_2_completed: number | null;
  preview_3: string | null;
  preview_3_completed: number | null;
  preview_4: string | null;
  preview_4_completed: number | null;
  preview_5: string | null;
  preview_5_completed: number | null;
};

type ChecklistTaskRow = {
  id: number;
  checklist_id: number;
  text: string;
  is_completed: number;
  position: number;
  created_at: number;
  updated_at: number;
};

type ChecklistTransaction = Pick<
  SQLiteDatabase,
  "getAllAsync" | "getFirstAsync" | "runAsync"
>;

function requireChecklistId(id: number): number {
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new ChecklistLibraryError("invalid-id");
  return id;
}

function normalizeInitialTasks(tasks: readonly string[] | undefined): string[] {
  if (tasks === undefined) return [];
  if (!Array.isArray(tasks)) throw new ChecklistLibraryError("invalid-task");
  return tasks.flatMap((task) => {
    if (typeof task !== "string")
      throw new ChecklistLibraryError("invalid-task");
    if (!task.trim()) return [];
    return [normalizeChecklistTaskText(task)];
  });
}

function rowToTask(row: ChecklistTaskRow): SavedChecklistTask {
  return {
    id: row.id,
    checklistId: row.checklist_id,
    text: row.text,
    isCompleted: row.is_completed === 1,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSummary(row: ChecklistSummaryRow): SavedChecklistSummary {
  const previewTaskColumns = [
    [row.preview_1, row.preview_1_completed],
    [row.preview_2, row.preview_2_completed],
    [row.preview_3, row.preview_3_completed],
    [row.preview_4, row.preview_4_completed],
    [row.preview_5, row.preview_5_completed],
  ] as const;

  return {
    contentType: "checklist",
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalTaskCount: row.total_tasks,
    completedTaskCount: row.completed_tasks,
    previewTasks: previewTaskColumns.flatMap(([text, isCompleted]) => (
      text == null ? [] : [{ text, isCompleted: isCompleted === 1 }]
    )),
  };
}

async function readChecklist(
  database: ChecklistTransaction,
  checklistId: number,
): Promise<SavedChecklist | null> {
  const row = await database.getFirstAsync<ChecklistRow>(
    "SELECT id, title, created_at, updated_at FROM saved_checklists WHERE id = ? AND deleted_at IS NULL LIMIT 1;",
    checklistId,
  );
  if (!row) return null;

  const taskRows = await database.getAllAsync<ChecklistTaskRow>(
    `SELECT id, checklist_id, text, is_completed, position, created_at, updated_at
     FROM saved_checklist_items WHERE checklist_id = ? ORDER BY position, id;`,
    checklistId,
  );
  const tasks = taskRows.map(rowToTask);
  const completedTaskCount = tasks.reduce(
    (total, task) => total + Number(task.isCompleted),
    0,
  );

  return {
    contentType: "checklist",
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalTaskCount: tasks.length,
    completedTaskCount,
    previewTasks: tasks.slice(0, 5).map(({ text, isCompleted }) => ({ text, isCompleted })),
    tasks,
  };
}

export async function listSavedChecklists(): Promise<SavedChecklistSummary[]> {
  const database = await getSaveAppDatabase();
  const rows = await database.getAllAsync<ChecklistSummaryRow>(`
    WITH task_counts AS (
      SELECT checklist_id, COUNT(*) AS total_tasks, SUM(is_completed) AS completed_tasks
      FROM saved_checklist_items
      GROUP BY checklist_id
    ),
    ranked_previews AS (
      SELECT checklist_id, text, is_completed,
        ROW_NUMBER() OVER (PARTITION BY checklist_id ORDER BY position, id) AS preview_rank
      FROM saved_checklist_items
    ),
    previews AS (
      SELECT checklist_id,
        MAX(CASE WHEN preview_rank = 1 THEN text END) AS preview_1,
        MAX(CASE WHEN preview_rank = 1 THEN is_completed END) AS preview_1_completed,
        MAX(CASE WHEN preview_rank = 2 THEN text END) AS preview_2,
        MAX(CASE WHEN preview_rank = 2 THEN is_completed END) AS preview_2_completed,
        MAX(CASE WHEN preview_rank = 3 THEN text END) AS preview_3,
        MAX(CASE WHEN preview_rank = 3 THEN is_completed END) AS preview_3_completed,
        MAX(CASE WHEN preview_rank = 4 THEN text END) AS preview_4,
        MAX(CASE WHEN preview_rank = 4 THEN is_completed END) AS preview_4_completed,
        MAX(CASE WHEN preview_rank = 5 THEN text END) AS preview_5,
        MAX(CASE WHEN preview_rank = 5 THEN is_completed END) AS preview_5_completed
      FROM ranked_previews
      WHERE preview_rank <= 5
      GROUP BY checklist_id
    )
    SELECT checklists.id, checklists.title, checklists.created_at, checklists.updated_at,
      COALESCE(task_counts.total_tasks, 0) AS total_tasks,
      COALESCE(task_counts.completed_tasks, 0) AS completed_tasks,
      previews.preview_1, previews.preview_1_completed,
      previews.preview_2, previews.preview_2_completed,
      previews.preview_3, previews.preview_3_completed,
      previews.preview_4, previews.preview_4_completed,
      previews.preview_5, previews.preview_5_completed
    FROM saved_checklists AS checklists
    LEFT JOIN task_counts ON task_counts.checklist_id = checklists.id
    LEFT JOIN previews ON previews.checklist_id = checklists.id
    WHERE checklists.deleted_at IS NULL
    ORDER BY checklists.created_at DESC, checklists.id DESC;
  `);
  return rows.map(rowToSummary);
}

export async function getSavedChecklist(
  id: number,
): Promise<SavedChecklist | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const database = await getSaveAppDatabase();
  return readChecklist(database, id);
}

export async function createSavedChecklist(
  titleValue: string,
  initialTaskTexts?: readonly string[],
): Promise<number> {
  const title = normalizeChecklistTitle(titleValue);
  const tasks = normalizeInitialTasks(initialTaskTexts);
  const database = await getSaveAppDatabase();
  const timestamp = Date.now();
  let checklistId = 0;

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const result = await transaction.runAsync(
      "INSERT INTO saved_checklists (title, created_at, updated_at) VALUES (?, ?, ?);",
      title,
      timestamp,
      timestamp,
    );
    checklistId = result.lastInsertRowId;

    for (const [position, text] of tasks.entries()) {
      await transaction.runAsync(
        `INSERT INTO saved_checklist_items
          (checklist_id, text, is_completed, position, created_at, updated_at)
         VALUES (?, ?, 0, ?, ?, ?);`,
        checklistId,
        text,
        position,
        timestamp,
        timestamp,
      );
    }
  });

  return checklistId;
}

export async function updateSavedChecklistTitle(
  id: number,
  title: string,
): Promise<boolean> {
  const checklistId = requireChecklistId(id);
  const normalizedTitle = normalizeChecklistTitle(title);
  const database = await getSaveAppDatabase();

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const result = await transaction.runAsync(
      "UPDATE saved_checklists SET title = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL;",
      normalizedTitle,
      Date.now(),
      checklistId,
    );
    if (result.changes !== 1)
      throw new ChecklistLibraryError("checklist-not-found");
  });

  return true;
}

export async function addSavedChecklistTask(
  checklistIdValue: number,
  text: string,
): Promise<SavedChecklistTask> {
  const checklistId = requireChecklistId(checklistIdValue);
  const normalizedText = normalizeChecklistTaskText(text);
  const database = await getSaveAppDatabase();
  const timestamp = Date.now();
  let createdTask: SavedChecklistTask | null = null;

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const checklist = await transaction.getFirstAsync<{ id: number }>(
      "SELECT id FROM saved_checklists WHERE id = ? AND deleted_at IS NULL LIMIT 1;",
      checklistId,
    );
    if (!checklist) throw new ChecklistLibraryError("checklist-not-found");

    const lastTask = await transaction.getFirstAsync<{ position: number | null }>(
      "SELECT MAX(position) AS position FROM saved_checklist_items WHERE checklist_id = ?;",
      checklistId,
    );
    const position = (lastTask?.position ?? -1) + 1;

    const result = await transaction.runAsync(
      `INSERT INTO saved_checklist_items
        (checklist_id, text, is_completed, position, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?, ?);`,
      checklistId,
      normalizedText,
      position,
      timestamp,
      timestamp,
    );
    await transaction.runAsync(
      "UPDATE saved_checklists SET updated_at = ? WHERE id = ?;",
      timestamp,
      checklistId,
    );
    createdTask = {
      id: result.lastInsertRowId,
      checklistId,
      text: normalizedText,
      isCompleted: false,
      position,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });

  if (!createdTask) throw new ChecklistLibraryError("task-not-found");
  return createdTask;
}

export async function createSavedChecklistTask(
  checklistId: number,
  text: string,
): Promise<SavedChecklistTask> {
  return addSavedChecklistTask(checklistId, text);
}

export async function updateSavedChecklistTaskText(
  checklistIdValue: number,
  taskIdValue: number,
  text: string,
): Promise<boolean> {
  const checklistId = requireChecklistId(checklistIdValue);
  const taskId = requireChecklistId(taskIdValue);
  const normalizedText = normalizeChecklistTaskText(text);
  const database = await getSaveAppDatabase();
  const timestamp = Date.now();
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const result = await transaction.runAsync(
      `UPDATE saved_checklist_items SET text = ?, updated_at = ?
       WHERE id = ? AND checklist_id = ?
         AND EXISTS (SELECT 1 FROM saved_checklists WHERE id = ? AND deleted_at IS NULL);`,
      normalizedText,
      timestamp,
      taskId,
      checklistId,
      checklistId,
    );
    if (result.changes !== 1) throw new ChecklistLibraryError("task-not-found");
    await transaction.runAsync(
      "UPDATE saved_checklists SET updated_at = ? WHERE id = ? AND deleted_at IS NULL;",
      timestamp,
      checklistId,
    );
  });

  return true;
}

export async function toggleSavedChecklistTask(
  checklistIdValue: number,
  taskIdValue: number,
  isCompleted: boolean,
): Promise<SavedChecklistTask> {
  const checklistId = requireChecklistId(checklistIdValue);
  const taskId = requireChecklistId(taskIdValue);
  if (typeof isCompleted !== "boolean")
    throw new ChecklistLibraryError("invalid-task");
  const database = await getSaveAppDatabase();
  const timestamp = Date.now();
  let updatedTask: ChecklistTaskRow | null = null;

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const current = await transaction.getFirstAsync<ChecklistTaskRow>(
      `SELECT id, checklist_id, text, is_completed, position, created_at, updated_at
       FROM saved_checklist_items WHERE id = ? AND checklist_id = ?
         AND EXISTS (SELECT 1 FROM saved_checklists WHERE id = ? AND deleted_at IS NULL) LIMIT 1;`,
      taskId,
      checklistId,
      checklistId,
    );
    if (!current) throw new ChecklistLibraryError("task-not-found");

    if (current.is_completed !== Number(isCompleted)) {
      await transaction.runAsync(
        `UPDATE saved_checklist_items SET is_completed = ?, updated_at = ? WHERE id = ? AND checklist_id = ?
         AND EXISTS (SELECT 1 FROM saved_checklists WHERE id = ? AND deleted_at IS NULL);`,
        Number(isCompleted),
        timestamp,
        taskId,
        checklistId,
        checklistId,
      );
    }
    updatedTask = await transaction.getFirstAsync<ChecklistTaskRow>(
      `SELECT id, checklist_id, text, is_completed, position, created_at, updated_at
       FROM saved_checklist_items WHERE id = ? AND checklist_id = ?
         AND EXISTS (SELECT 1 FROM saved_checklists WHERE id = ? AND deleted_at IS NULL) LIMIT 1;`,
      taskId,
      checklistId,
      checklistId,
    );
  });

  if (!updatedTask) throw new ChecklistLibraryError("task-not-found");
  return rowToTask(updatedTask);
}

export async function setSavedChecklistTaskCompleted(
  checklistId: number,
  taskId: number,
  isCompleted: boolean,
): Promise<boolean> {
  await toggleSavedChecklistTask(checklistId, taskId, isCompleted);
  return true;
}

export async function deleteSavedChecklistTask(
  checklistIdValue: number,
  taskIdValue: number,
): Promise<boolean> {
  const checklistId = requireChecklistId(checklistIdValue);
  const taskId = requireChecklistId(taskIdValue);
  const database = await getSaveAppDatabase();
  const timestamp = Date.now();
  let deleted = false;

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const result = await transaction.runAsync(
      `DELETE FROM saved_checklist_items WHERE id = ? AND checklist_id = ?
       AND EXISTS (SELECT 1 FROM saved_checklists WHERE id = ? AND deleted_at IS NULL);`,
      taskId,
      checklistId,
      checklistId,
    );
    if (result.changes !== 1) return;

    const remainingTasks = await transaction.getAllAsync<{ id: number }>(
      "SELECT id FROM saved_checklist_items WHERE checklist_id = ? ORDER BY position, id;",
      checklistId,
    );
    for (const [position, task] of remainingTasks.entries()) {
      await transaction.runAsync(
        "UPDATE saved_checklist_items SET position = ? WHERE id = ? AND checklist_id = ?;",
        position,
        task.id,
        checklistId,
      );
    }
    await transaction.runAsync(
      "UPDATE saved_checklists SET updated_at = ? WHERE id = ? AND deleted_at IS NULL;",
      timestamp,
      checklistId,
    );
    deleted = true;
  });

  return deleted;
}

export async function deleteSavedChecklist(
  id: number,
  expectedFolderId?: string | null,
): Promise<boolean> {
  const checklistId = requireChecklistId(id);
  const database = await getSaveAppDatabase();
  let deleted = false;

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const checklist = await transaction.getFirstAsync<{ id: number }>(
      "SELECT id FROM saved_checklists WHERE id = ? LIMIT 1;",
      checklistId,
    );
    if (!checklist) return;

    if (expectedFolderId !== undefined) {
      const association = await transaction.getFirstAsync<{ folder_id: string }>(
        `SELECT folder_id FROM saved_folder_items
         WHERE item_type = 'checklist' AND item_id = ? LIMIT 1;`,
        String(checklistId),
      );
      if ((association?.folder_id ?? null) !== expectedFolderId) {
        throw new ChecklistLibraryError("folder-assignment-changed");
      }
    }

    // Expo SDK 58 runs exclusive transactions on a separate connection where
    // foreign-key cascading may be disabled; delete children explicitly.
    await transaction.runAsync(
      "DELETE FROM saved_checklist_items WHERE checklist_id = ?;",
      checklistId,
    );
    const result = await transaction.runAsync(
      "DELETE FROM saved_checklists WHERE id = ?;",
      checklistId,
    );
    deleted = result.changes === 1;
  });

  return deleted;
}
