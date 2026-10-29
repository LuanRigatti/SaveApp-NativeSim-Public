export const CHECKLIST_TITLE_MAX_LENGTH = 160;
export const CHECKLIST_TASK_MAX_LENGTH = 10_000;
export const MAX_CHECKLIST_TITLE_LENGTH = CHECKLIST_TITLE_MAX_LENGTH;
export const MAX_CHECKLIST_TASK_LENGTH = CHECKLIST_TASK_MAX_LENGTH;

export type InitialChecklistTask = {
  text: string;
  isCompleted: boolean;
};

export type SavedChecklistTask = {
  id: number;
  checklistId: number;
  text: string;
  isCompleted: boolean;
  position: number;
  createdAt: number;
  updatedAt: number;
};

export type SavedChecklistPreviewTask = Pick<SavedChecklistTask, "text" | "isCompleted">;

export type SavedChecklistSummary = {
  contentType: "checklist";
  id: number;
  title: string;
  createdAt: number;
  updatedAt: number;
  totalTaskCount: number;
  completedTaskCount: number;
  previewTasks: SavedChecklistPreviewTask[];
};

export type SavedChecklist = SavedChecklistSummary & {
  tasks: SavedChecklistTask[];
};

export function withChecklistTaskCompletionState(
  checklist: SavedChecklist,
  taskId: number,
  isCompleted: boolean,
): SavedChecklist {
  let changed = false;
  const tasks = checklist.tasks.map((task) => {
    if (task.id !== taskId || task.isCompleted === isCompleted) return task;
    changed = true;
    return { ...task, isCompleted };
  });

  if (!changed) return checklist;

  return {
    ...checklist,
    tasks,
    completedTaskCount: tasks.reduce((count, task) => count + Number(task.isCompleted), 0),
  };
}

export type ChecklistLibraryErrorCode =
  | "invalid-id"
  | "invalid-title"
  | "title-too-long"
  | "invalid-task"
  | "task-too-long"
  | "folder-assignment-changed"
  | "checklist-not-found"
  | "task-not-found";

export class ChecklistLibraryError extends Error {
  constructor(public readonly code: ChecklistLibraryErrorCode) {
    super(code);
    this.name = "ChecklistLibraryError";
  }
}

export function normalizeChecklistTitle(title: string): string {
  if (typeof title !== "string")
    throw new ChecklistLibraryError("invalid-title");
  const normalized = title.trim();
  if (normalized.length === 0) throw new ChecklistLibraryError("invalid-title");
  if (Array.from(normalized).length > CHECKLIST_TITLE_MAX_LENGTH) {
    throw new ChecklistLibraryError("title-too-long");
  }
  return normalized;
}

export function normalizeChecklistTaskText(text: string): string {
  if (typeof text !== "string") throw new ChecklistLibraryError("invalid-task");
  if (text.trim().length === 0) throw new ChecklistLibraryError("invalid-task");
  if (Array.from(text).length > CHECKLIST_TASK_MAX_LENGTH) {
    throw new ChecklistLibraryError("task-too-long");
  }
  return text;
}
