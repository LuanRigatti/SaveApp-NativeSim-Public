import type { AppTheme } from '@/theme/types';

export const CHECKLIST_HOME_PREVIEW_TASK_LIMIT = 5;

export type ChecklistPreviewSize = { width: number; height: number };

export function getChecklistPreviewSize(
  screenWidth: number,
  visibleTaskCount: number,
  totalTaskCount: number,
  fontScale: number,
  theme: Pick<AppTheme, 'spacing' | 'typography'>,
): ChecklistPreviewSize {
  const width = Math.max(1, Math.min(360, screenWidth - 48));
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const taskCount = Math.min(
    CHECKLIST_HOME_PREVIEW_TASK_LIMIT,
    Math.max(0, Math.floor(visibleTaskCount)),
  );
  const hasMoreTasks = totalTaskCount > taskCount;
  const titleHeight = (theme.typography.headline.lineHeight ?? 22) * 2 * scale;
  const taskLineHeight = (theme.typography.subheadline.lineHeight ?? 20) * scale;
  const emptyStateHeight = (theme.typography.subheadline.lineHeight ?? 20) * scale;
  const taskRowsHeight = taskCount > 0
    ? taskCount * (taskLineHeight + theme.spacing.xxs * 2) + (taskCount - 1) * theme.spacing.xxs
    : emptyStateHeight;
  const moreTasksHeight = hasMoreTasks
    ? theme.spacing.xxs + (theme.typography.caption.lineHeight ?? 16) * scale
    : 0;
  const height = Math.ceil(
    theme.spacing.md * 2 +
    titleHeight +
    theme.spacing.sm +
    taskRowsHeight +
    moreTasksHeight,
  );

  return { width, height };
}
