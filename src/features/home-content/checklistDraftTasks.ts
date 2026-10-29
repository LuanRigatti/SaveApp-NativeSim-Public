export type ChecklistDraftTask = {
  id: number;
  text: string;
  isCompleted: boolean;
};

export type ChecklistTaskForCreation = {
  text: string;
  isCompleted: boolean;
};

export function appendChecklistDraftTask(
  tasks: readonly ChecklistDraftTask[],
  task: ChecklistDraftTask,
): ChecklistDraftTask[] {
  if (tasks.some((existing) => existing.id === task.id)) return [...tasks];
  return [...tasks, task];
}

export function updateChecklistDraftTaskText(
  tasks: readonly ChecklistDraftTask[],
  taskId: number,
  text: string,
): ChecklistDraftTask[] {
  return tasks.map((task) => task.id === taskId ? { ...task, text } : task);
}

export function toggleChecklistDraftTask(
  tasks: readonly ChecklistDraftTask[],
  taskId: number,
): ChecklistDraftTask[] {
  return tasks.map((task) => task.id === taskId ? { ...task, isCompleted: !task.isCompleted } : task);
}

export function removeChecklistDraftTask(
  tasks: readonly ChecklistDraftTask[],
  taskId: number,
): ChecklistDraftTask[] {
  return tasks.filter((task) => task.id !== taskId);
}

export function checklistTasksForCreation(
  tasks: readonly ChecklistDraftTask[],
  pendingTaskText = '',
): ChecklistTaskForCreation[] {
  const savedTasks = tasks.flatMap((task) => (
    task.text.trim().length === 0
      ? []
      : [{ text: task.text, isCompleted: task.isCompleted }]
  ));
  if (pendingTaskText.trim().length > 0) {
    savedTasks.push({ text: pendingTaskText, isCompleted: false });
  }
  return savedTasks;
}
