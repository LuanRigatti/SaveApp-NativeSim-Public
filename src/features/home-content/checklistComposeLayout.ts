export const CHECKLIST_COMPOSE_ROW_MIN_HEIGHT = 44;
export const CHECKLIST_TASK_ROW_GAP = 0;
export const CHECKLIST_COMPOSE_ROW_GAP = CHECKLIST_TASK_ROW_GAP;
export const CHECKLIST_COMPOSE_TOUCH_TARGET = 44;

export function getChecklistComposeCheckboxCenters(rowCount: number): number[] {
  if (!Number.isSafeInteger(rowCount) || rowCount <= 0) return [];

  const centerStep = CHECKLIST_COMPOSE_ROW_MIN_HEIGHT + CHECKLIST_COMPOSE_ROW_GAP;
  return Array.from(
    { length: rowCount },
    (_, index) => CHECKLIST_COMPOSE_ROW_MIN_HEIGHT / 2 + index * centerStep,
  );
}
