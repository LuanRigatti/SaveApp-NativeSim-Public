import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { SavedChecklistSummary } from '@/features/home-content/checklistTypes';
import { CHECKLIST_HOME_PREVIEW_TASK_LIMIT } from '@/features/home-content/checklistPreviewLayout';
import { useAppTheme } from '@/theme';

type SavedChecklistPreviewContentProps = {
  checklist: Pick<SavedChecklistSummary, 'previewTasks' | 'title' | 'totalTaskCount'>;
  height: number;
  width: number;
};

export function SavedChecklistPreviewContent({
  checklist,
  height,
  width,
}: SavedChecklistPreviewContentProps) {
  const { theme } = useAppTheme();
  const previewTasks = checklist.previewTasks.slice(0, CHECKLIST_HOME_PREVIEW_TASK_LIMIT);
  const remainingTaskCount = Math.max(0, checklist.totalTaskCount - previewTasks.length);

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.separator,
        borderRadius: theme.radius.linkCard,
        borderWidth: StyleSheet.hairlineWidth,
        gap: theme.spacing.sm,
        height,
        overflow: 'hidden',
        padding: theme.spacing.md,
        width,
      }}
    >
      <Text
        ellipsizeMode="tail"
        numberOfLines={2}
        style={[theme.typography.headline, { color: theme.colors.textPrimary, flexShrink: 1, minWidth: 0 }]}
      >
        {checklist.title}
      </Text>

      {previewTasks.length === 0 ? (
        <Text style={[theme.typography.subheadline, { color: theme.colors.textSecondary }]}>
          Nenhuma tarefa
        </Text>
      ) : (
        <View style={{ gap: theme.spacing.xxs, minWidth: 0 }}>
          {previewTasks.map((task, index) => (
            <View
              key={`${index}:${task.text}`}
              style={{
                alignItems: 'center',
                flexDirection: 'row',
                gap: theme.spacing.xs,
                minWidth: 0,
              }}
            >
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: task.isCompleted ? theme.colors.primary : 'transparent',
                  borderColor: task.isCompleted ? theme.colors.primary : theme.colors.textPrimary,
                  borderRadius: theme.radius.sm * 0.65,
                  borderWidth: 1.5,
                  flexShrink: 0,
                  height: 16,
                  justifyContent: 'center',
                  width: 16,
                }}
              >
                {task.isCompleted ? (
                  <Ionicons color={theme.colors.textInverse} name="checkmark" size={12} />
                ) : null}
              </View>
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={[
                  theme.typography.subheadline,
                  {
                    color: task.isCompleted ? theme.colors.textSecondary : theme.colors.textPrimary,
                    flex: 1,
                    flexShrink: 1,
                    minWidth: 0,
                    textDecorationLine: task.isCompleted ? 'line-through' : 'none',
                  },
                ]}
              >
                {task.text}
              </Text>
            </View>
          ))}
        </View>
      )}

      {remainingTaskCount > 0 ? (
        <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
          + {remainingTaskCount} {remainingTaskCount === 1 ? 'tarefa' : 'tarefas'}
        </Text>
      ) : null}
    </View>
  );
}
