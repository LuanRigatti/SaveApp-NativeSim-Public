import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Platform,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';

import { ChecklistAddTaskRow } from '@/components/homeContent/ChecklistAddTaskRow';
import { ChecklistTaskContextPreview, ChecklistTaskRow } from '@/components/homeContent/ChecklistTaskRow';
import { NativeCardContextMenu, type NativeCardContextMenuAction } from '@/components/native';
import { ProgressiveCollapsibleScreen } from '@/components/premium';
import { HomeFolderAuthorizationPrompt } from '@/features/home-folders/HomeFolderAuthorizationPrompt';
import { getHomeFolderItemAssignment } from '@/features/home-folders/homeFolderLibrary';
import { useHomeFolderItemAuthorization, useHomeFolderAuthorization } from '@/features/home-folders/useHomeFolderAuthorization';
import { useLocalHomeFolders } from '@/features/home-folders/LocalHomeFolderProvider';
import { useLocalChecklists } from '@/features/home-content/LocalChecklistLibraryProvider';
import { CHECKLIST_TASK_ROW_GAP } from '@/features/home-content/checklistComposeLayout';
import { triggerChecklistHaptic } from '@/features/home-content/checklistHaptics';
import {
  CHECKLIST_TASK_MAX_LENGTH,
  normalizeChecklistTaskText,
  withChecklistTaskCompletionState,
  type SavedChecklist,
  type SavedChecklistTask,
} from '@/features/home-content/checklistTypes';
import { useAppSafeAreaInsets } from '@/providers';
import { useAppTheme } from '@/theme';

type ChecklistAssignmentState = {
  id: number;
  folderId: string | null;
  status: 'loaded' | 'error';
};

type ChecklistLoadState = {
  id: number;
  folderId: string | null;
  checklist: SavedChecklist | null;
};

export default function ChecklistDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const id = useMemo(() => {
    const parsed = Number(rawId);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }, [rawId]);
  const routeAuthorization = useHomeFolderItemAuthorization('checklist', id);

  return (
    <>
      <Stack.Screen
        options={{
          animation: 'default',
          gestureEnabled: true,
          headerLargeTitle: false,
          headerShadowVisible: false,
          headerTitle: '',
          headerTransparent: true,
        }}
      />
      {routeAuthorization.isAuthorized ? (
        <ChecklistDetailContent id={id} />
      ) : (
        <HomeFolderAuthorizationPrompt authorization={routeAuthorization} />
      )}
    </>
  );
}

function ChecklistDetailContent({ id }: { id: number | null }) {
  const { theme } = useAppTheme();
  const insets = useAppSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const {
    addTask,
    deleteTask,
    getChecklist,
    setTaskCompleted,
    updateTaskText,
  } = useLocalChecklists();
  const {
    authorizeFolder,
    folders,
    isAppActive,
    isFolderAuthorized,
    lockEpoch,
  } = useLocalHomeFolders();
  const [assignmentState, setAssignmentState] = useState<ChecklistAssignmentState | null>(null);
  const assignmentForRoute = id != null && assignmentState?.id === id ? assignmentState : null;
  const assignedFolderId = assignmentForRoute?.status === 'loaded' ? assignmentForRoute.folderId : null;
  const assignmentChecked = assignmentForRoute?.status === 'loaded';
  const authorization = useHomeFolderAuthorization(assignedFolderId);
  const [loadedRecord, setLoadedRecord] = useState<ChecklistLoadState | null>(null);
  const [loadErrorRecord, setLoadErrorRecord] = useState<{ id: number; folderId: string | null } | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [taskListWidth, setTaskListWidth] = useState(() => Math.max(0, windowWidth - theme.spacing.lg * 2));
  const addTaskInFlightRef = useRef(false);
  const taskToggleInFlightRef = useRef(new Set<number>());
  const [taskDrafts, setTaskDrafts] = useState<Record<number, string>>({});
  const scrollableRef = useAnimatedRef<Animated.ScrollView>();
  const checklist = loadedRecord?.id === id && loadedRecord.folderId === assignedFolderId
    ? loadedRecord.checklist
    : null;
  const loadError = assignmentForRoute?.status === 'error' || (
    id != null && loadErrorRecord?.id === id && loadErrorRecord.folderId === assignedFolderId
  );
  const isLoading = id != null && !loadError && !(
    loadedRecord?.id === id && loadedRecord.folderId === assignedFolderId
  );
  const updateLoadedChecklist = useCallback((
    checklistId: number,
    update: (current: SavedChecklist) => SavedChecklist,
  ) => {
    setLoadedRecord((current) => current?.id === checklistId && current.folderId === assignedFolderId && current.checklist
      ? { ...current, checklist: update(current.checklist) }
      : current);
  }, [assignedFolderId]);

  useEffect(() => {
    let active = true;
    if (id == null) return () => { active = false; };
    void getHomeFolderItemAssignment('checklist', id)
      .then((folderId) => {
        if (!active) return;
        setAssignmentState({ id, folderId, status: 'loaded' });
      })
      .catch(() => {
        if (!active) return;
        setAssignmentState({ id, folderId: null, status: 'error' });
      });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (id == null || !assignmentChecked || !authorization.isReady || !authorization.isAuthorized) return;
    let active = true;
    const epoch = lockEpoch;
    const folderId = assignedFolderId;
    void (async () => {
      try {
        const currentAssociation = await getHomeFolderItemAssignment('checklist', id);
        if (currentAssociation !== assignedFolderId) {
          if (active) setAssignmentState({ id, folderId: currentAssociation, status: 'loaded' });
          return;
        }
        const nextChecklist = await getChecklist(id);
        const latestAssociation = await getHomeFolderItemAssignment('checklist', id);
        if (!active) return;
        if (
          latestAssociation !== assignedFolderId ||
          !isAppActive ||
          lockEpoch !== epoch ||
          (assignedFolderId != null && !isFolderAuthorized(assignedFolderId))
        ) {
          setAssignmentState({ id, folderId: latestAssociation, status: 'loaded' });
          return;
        }
        setLoadedRecord({ id, folderId, checklist: nextChecklist });
        setLoadErrorRecord(null);
        setTaskDrafts(Object.fromEntries((nextChecklist?.tasks ?? []).map((task) => [task.id, task.text])));
      } catch {
        if (!active) return;
        setLoadErrorRecord({ id, folderId });
      }
    })();
    return () => { active = false; };
  }, [assignedFolderId, assignmentChecked, authorization.isAuthorized, authorization.isReady, getChecklist, id, isAppActive, isFolderAuthorized, lockEpoch]);

  const authorizeCurrentChecklist = useCallback(async () => {
    if (id == null || !isAppActive || !authorization.isReady) return false;
    const operationEpoch = lockEpoch;
    const previousFolderId = await getHomeFolderItemAssignment('checklist', id);
    if (previousFolderId != null) {
      if (!folders.some((folder) => folder.id === previousFolderId)) return false;
      const outcome = await authorizeFolder(previousFolderId);
      if (outcome !== 'authenticated') return false;
    }
    const currentFolderId = await getHomeFolderItemAssignment('checklist', id);
    if (currentFolderId !== previousFolderId) {
      setAssignmentState({ id, folderId: currentFolderId, status: 'loaded' });
      return false;
    }
    return isAppActive && lockEpoch === operationEpoch &&
      (currentFolderId == null || isFolderAuthorized(currentFolderId));
  }, [authorizeFolder, authorization.isReady, folders, id, isAppActive, isFolderAuthorized, lockEpoch]);

  const showSaveError = useCallback(() => {
    Alert.alert('Não foi possível salvar', 'A alteração não foi aplicada. Tente novamente.');
  }, []);

  const saveTaskText = useCallback(async (task: SavedChecklistTask) => {
    if (!checklist) return;
    const draft = taskDrafts[task.id] ?? task.text;
    if (draft === task.text) return;
    if (!draft.trim()) {
      setTaskDrafts((current) => ({ ...current, [task.id]: task.text }));
      return;
    }
    try {
      const normalized = normalizeChecklistTaskText(draft);
      if (!(await authorizeCurrentChecklist())) return;
      setIsMutating(true);
      const changed = await updateTaskText(checklist.id, task.id, normalized);
      if (!changed) throw new Error('CHECKLIST_TASK_NOT_FOUND');
      updateLoadedChecklist(checklist.id, (current) => ({
        ...current,
        tasks: current.tasks.map((item) => item.id === task.id ? { ...item, text: normalized } : item),
      }));
      setTaskDrafts((current) => ({ ...current, [task.id]: normalized }));
    } catch (error) {
      if (error instanceof Error && error.message === 'task-too-long') {
        Alert.alert('Tarefa muito longa', `A tarefa aceita até ${CHECKLIST_TASK_MAX_LENGTH} caracteres. Reduza o texto para salvar.`);
      } else {
        showSaveError();
      }
    } finally {
      setIsMutating(false);
    }
  }, [authorizeCurrentChecklist, checklist, showSaveError, taskDrafts, updateLoadedChecklist, updateTaskText]);

  const toggleTask = useCallback(async (task: SavedChecklistTask) => {
    if (!checklist || taskToggleInFlightRef.current.has(task.id)) return;
    taskToggleInFlightRef.current.add(task.id);
    setIsMutating(true);
    let previousValue: boolean | null = null;
    try {
      if (!(await authorizeCurrentChecklist())) return;
      const currentTask = checklist.tasks.find((item) => item.id === task.id);
      if (!currentTask) return;
      previousValue = currentTask.isCompleted;
      const nextCompleted = !previousValue;
      updateLoadedChecklist(checklist.id, (current) => withChecklistTaskCompletionState(current, task.id, nextCompleted));
      triggerChecklistHaptic(() => Haptics.selectionAsync());
      const updated = await setTaskCompleted(checklist.id, task.id, nextCompleted);
      if (!updated) throw new Error('CHECKLIST_TASK_NOT_FOUND');
    } catch {
      const valueToRestore = previousValue;
      if (valueToRestore !== null) {
        updateLoadedChecklist(checklist.id, (current) => withChecklistTaskCompletionState(current, task.id, valueToRestore));
      }
      showSaveError();
    } finally {
      taskToggleInFlightRef.current.delete(task.id);
      setIsMutating(false);
    }
  }, [authorizeCurrentChecklist, checklist, setTaskCompleted, showSaveError, updateLoadedChecklist]);

  const addNewTask = useCallback(async (taskDraft: string) => {
    if (!checklist || !taskDraft.trim() || isMutating || addTaskInFlightRef.current) return false;
    addTaskInFlightRef.current = true;
    try {
      const text = normalizeChecklistTaskText(taskDraft);
      if (!(await authorizeCurrentChecklist())) return false;
      setIsMutating(true);
      const task = await addTask(checklist.id, text);
      updateLoadedChecklist(checklist.id, (current) => {
        const tasks = [...current.tasks, task];
        return {
          ...current,
          tasks,
          totalTaskCount: current.totalTaskCount + 1,
          previewTasks: tasks.slice(0, 5).map(({ text: taskText, isCompleted }) => ({ text: taskText, isCompleted })),
        };
      });
      setTaskDrafts((current) => ({ ...current, [task.id]: task.text }));
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === 'task-too-long') {
        Alert.alert('Tarefa muito longa', 'Reduza o texto da tarefa.');
      } else {
        showSaveError();
      }
      return false;
    } finally {
      setIsMutating(false);
      addTaskInFlightRef.current = false;
    }
  }, [addTask, authorizeCurrentChecklist, checklist, isMutating, showSaveError, updateLoadedChecklist]);

  const removeTask = useCallback((task: SavedChecklistTask) => {
    Alert.alert('Excluir tarefa?', 'Esta tarefa será removida da lista.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            if (!checklist || !(await authorizeCurrentChecklist())) return;
            setIsMutating(true);
            try {
              const deleted = await deleteTask(checklist.id, task.id);
              if (!deleted) throw new Error('CHECKLIST_TASK_NOT_FOUND');
              updateLoadedChecklist(checklist.id, (current) => {
                const tasks = current.tasks.filter((item) => item.id !== task.id);
                return {
                  ...current,
                  tasks,
                  totalTaskCount: Math.max(0, current.totalTaskCount - 1),
                  completedTaskCount: Math.max(0, current.completedTaskCount - (task.isCompleted ? 1 : 0)),
                  previewTasks: tasks.slice(0, 5).map(({ text: taskText, isCompleted }) => ({ text: taskText, isCompleted })),
                };
              });
              setTaskDrafts((current) => {
                const next = { ...current };
                delete next[task.id];
                return next;
              });
            } catch {
              showSaveError();
            } finally {
              setIsMutating(false);
            }
          })();
        },
      },
    ]);
  }, [authorizeCurrentChecklist, checklist, deleteTask, showSaveError, updateLoadedChecklist]);

  const handleAddTaskInputFocus = useCallback(() => {
    requestAnimationFrame(() => scrollableRef.current?.scrollToEnd({ animated: true }));
  }, [scrollableRef]);

  const handleTaskListLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (!Number.isFinite(nextWidth) || nextWidth <= 0) return;
    setTaskListWidth((current) => Math.abs(current - nextWidth) < 1 ? current : nextWidth);
  }, []);

  if (id == null) {
    return (
      <View style={{ backgroundColor: theme.colors.background, flex: 1, justifyContent: 'center', padding: theme.spacing.lg }}>
        <Text style={[theme.typography.body, { color: theme.colors.textSecondary, textAlign: 'center' }]}>Esta lista não está disponível.</Text>
      </View>
    );
  }

  if (assignedFolderId != null && !authorization.isAuthorized) {
    return <HomeFolderAuthorizationPrompt authorization={authorization} />;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ProgressiveCollapsibleScreen
        compactTitle={checklist?.title ?? ''}
        contentGap={theme.spacing.md}
        contentTopInset={theme.spacing.xl + theme.spacing.xxl + theme.spacing.xxs * 2 + 2}
        largeTitle={(
          <Text
            style={[
              theme.typography.largeTitle,
              {
                color: theme.colors.textPrimary,
                fontSize: theme.typography.largeTitle.fontSize + 2,
                minHeight: 48,
                paddingVertical: theme.spacing.xs,
              },
            ]}
          >
            {checklist?.title ?? ''}
          </Text>
        )}
        nativeHeader
        scrollRef={scrollableRef}
        scrollViewProps={{ keyboardShouldPersistTaps: 'handled' }}
        scrollContentContainerStyle={{
          alignItems: 'stretch',
          paddingBottom: insets.bottom + theme.spacing.xxl,
          paddingHorizontal: theme.spacing.lg,
        }}
      >
          {isLoading ? (
            <View style={{ alignItems: 'center', minHeight: 160, justifyContent: 'center' }}>
              <ActivityIndicator color={theme.colors.info} />
            </View>
          ) : loadError ? (
            <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Não foi possível carregar esta lista.</Text>
          ) : !checklist ? (
            <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Esta lista não está disponível.</Text>
          ) : (
            <View onLayout={handleTaskListLayout} style={{ alignSelf: 'stretch', flexShrink: 1, gap: CHECKLIST_TASK_ROW_GAP, minWidth: 0 }}>
              {checklist.tasks.map((task, index) => {
                const row = (
                  <ChecklistTaskRow
                    disabled={isMutating}
                    index={index}
                    onTextBlur={() => void saveTaskText(task)}
                    onTextChange={(value) => setTaskDrafts((current) => ({ ...current, [task.id]: value }))}
                    onToggle={() => void toggleTask(task)}
                    task={task}
                    text={taskDrafts[task.id] ?? task.text}
                    verticalHitSlop={0}
                  />
                );
                const deleteAction: NativeCardContextMenuAction = {
                  id: `delete-task-${task.id}`,
                  title: 'Excluir',
                  systemImage: 'trash',
                  destructive: true,
                  disabled: isMutating,
                  onPress: () => removeTask(task),
                };

                return (
                  <NativeCardContextMenu
                    key={String(task.id)}
                    actions={[deleteAction]}
                    matchContents={{ vertical: true }}
                    preview={(
                      <ChecklistTaskContextPreview
                        task={task}
                        text={taskDrafts[task.id] ?? task.text}
                        width={taskListWidth}
                      />
                    )}
                    style={{ alignSelf: 'stretch', flexShrink: 1, minWidth: 0 }}
                    triggerContentWidth={taskListWidth}
                  >
                    {row}
                  </NativeCardContextMenu>
                );
              })}
              <ChecklistAddTaskRow
                key="checklist-add-task-row"
                onInputFocus={handleAddTaskInputFocus}
                onSubmit={addNewTask}
              />
            </View>
          )}
      </ProgressiveCollapsibleScreen>
    </KeyboardAvoidingView>
  );
}
