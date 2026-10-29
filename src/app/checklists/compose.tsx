import * as Haptics from 'expo-haptics';
import { Stack, usePreventRemove, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChecklistAddTaskRow } from '@/components/homeContent/ChecklistAddTaskRow';
import { ChecklistTaskRow } from '@/components/homeContent/ChecklistTaskRow';
import { NativeButton, NativeCardContextMenu, type NativeCardContextMenuAction } from '@/components/native';
import {
  appendChecklistDraftTask,
  checklistTasksForCreation,
  removeChecklistDraftTask,
  toggleChecklistDraftTask,
  updateChecklistDraftTaskText,
  type ChecklistDraftTask,
} from '@/features/home-content/checklistDraftTasks';
import { useLocalChecklists } from '@/features/home-content/LocalChecklistLibraryProvider';
import { triggerChecklistHaptic } from '@/features/home-content/checklistHaptics';
import {
  CHECKLIST_COMPOSE_ROW_GAP,
  CHECKLIST_COMPOSE_ROW_MIN_HEIGHT,
  CHECKLIST_COMPOSE_TOUCH_TARGET,
} from '@/features/home-content/checklistComposeLayout';
import { MAX_CHECKLIST_TITLE_LENGTH } from '@/features/home-content/checklistTypes';
import { useAppTheme } from '@/theme';

export default function ChecklistComposeScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { createChecklist } = useLocalChecklists();
  const [title, setTitle] = useState('');
  const [tasks, setTasks] = useState<ChecklistDraftTask[]>([]);
  const [pendingTaskText, setPendingTaskText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [allowRouteRemoval, setAllowRouteRemoval] = useState(false);
  const scrollViewRef = useRef<ScrollViewInstance | null>(null);
  const taskIdCounter = useRef(0);
  const pendingTaskTextRef = useRef('');
  const [addTaskFocusRequest, setAddTaskFocusRequest] = useState(0);
  const hasDraft = title.trim().length > 0
    || pendingTaskText.trim().length > 0
    || tasks.some((task) => task.text.trim().length > 0);

  const onPreventedRemoval = useCallback(({ repeat }: { repeat: () => void }) => {
    if (isSaving) {
      Alert.alert('Salvando lista', 'Aguarde a conclusão para voltar.');
      return;
    }
    Alert.alert('Descartar rascunho?', 'A lista ainda não foi salva.', [
      { text: 'Continuar escrevendo', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: () => {
          setAllowRouteRemoval(true);
          repeat();
        },
      },
    ]);
  }, [isSaving]);
  usePreventRemove(hasDraft && !allowRouteRemoval, onPreventedRemoval);

  const addDraftTask = useCallback(async (text: string) => {
    const task: ChecklistDraftTask = {
      id: taskIdCounter.current++,
      text,
      isCompleted: false,
    };
    setTasks((current) => appendChecklistDraftTask(current, task));
    pendingTaskTextRef.current = '';
    setPendingTaskText('');
    setErrorMessage(null);
    return true;
  }, []);

  const handleAddTaskDraftChange = useCallback((text: string) => {
    pendingTaskTextRef.current = text;
    setPendingTaskText(text);
  }, []);

  const updateDraftTask = useCallback((taskId: number, text: string) => {
    setTasks((current) => updateChecklistDraftTaskText(current, taskId, text));
    setErrorMessage(null);
  }, []);

  const removeDraftTask = useCallback((taskId: number) => {
    setTasks((current) => removeChecklistDraftTask(current, taskId));
  }, []);

  const toggleDraftTask = useCallback((taskId: number) => {
    setTasks((current) => toggleChecklistDraftTask(current, taskId));
    triggerChecklistHaptic(() => Haptics.selectionAsync());
  }, []);

  const focusAddTaskInput = useCallback(() => {
    setAddTaskFocusRequest((current) => current + 1);
  }, []);

  const handleAddTaskInputFocus = useCallback(() => {
    requestAnimationFrame(() => scrollViewRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const handleDraftTaskBlur = useCallback(() => {
    // The task remains in this route's draft until the user saves the checklist.
  }, []);

  const createDraftTaskDeleteAction = useCallback((taskId: number): NativeCardContextMenuAction => ({
    id: `delete-draft-task-${taskId}`,
    title: 'Excluir',
    systemImage: 'trash',
    destructive: true,
    onPress: () => removeDraftTask(taskId),
  }), [removeDraftTask]);

  const handleDraftTaskSubmit = useCallback((task: ChecklistDraftTask) => {
    if (task.text.trim()) focusAddTaskInput();
  }, [focusAddTaskInput]);

  const save = useCallback(async () => {
    if (!title.trim()) {
      setErrorMessage('Digite um título para a lista.');
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const id = await createChecklist(
        title,
        checklistTasksForCreation(tasks, pendingTaskTextRef.current),
      );
      setAllowRouteRemoval(true);
      router.replace({ pathname: '/checklists/[id]', params: { id: String(id) } });
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid-title') {
        setErrorMessage('Digite um título para a lista.');
      } else if (error instanceof Error && (error.message === 'title-too-long' || error.message === 'task-too-long')) {
        setErrorMessage('O título ou uma tarefa ultrapassou o limite permitido.');
      } else {
        setErrorMessage('Não foi possível salvar a lista. Tente novamente.');
      }
      setIsSaving(false);
    }
  }, [createChecklist, router, tasks, title]);

  return (
    <>
      <Stack.Screen options={{ headerTitle: 'Nova lista', gestureEnabled: !isSaving }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: theme.colors.background, flex: 1 }}>
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={{ gap: theme.spacing.lg, padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ gap: theme.spacing.xs }}>
              <Text style={[theme.typography.subheadline, { color: theme.colors.textSecondary }]}>Título</Text>
              <TextInput
                accessibilityLabel="Título da lista"
                autoCapitalize="sentences"
                maxLength={MAX_CHECKLIST_TITLE_LENGTH}
                onChangeText={(value) => { setTitle(value); setErrorMessage(null); }}
                onSubmitEditing={focusAddTaskInput}
                placeholder="Digite o título"
                placeholderTextColor={theme.colors.textTertiary}
                returnKeyType="next"
                style={{
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.separator,
                  borderRadius: theme.radius.lg,
                  borderWidth: StyleSheet.hairlineWidth,
                  color: theme.colors.textPrimary,
                  minHeight: 50,
                  paddingHorizontal: theme.spacing.md,
                  ...theme.typography.body,
                }}
                value={title}
              />
            </View>

            <View style={{ gap: theme.spacing.xs }}>
              <Text style={[theme.typography.subheadline, { color: theme.colors.textSecondary }]}>Tarefas</Text>
              <View style={{ gap: CHECKLIST_COMPOSE_ROW_GAP }}>
                {tasks.map((task, index) => (
                  <NativeCardContextMenu
                    key={task.id}
                    actions={[createDraftTaskDeleteAction(task.id)]}
                    matchContents={{ vertical: true }}
                    style={{ alignSelf: 'stretch', flexShrink: 1, minHeight: CHECKLIST_COMPOSE_ROW_MIN_HEIGHT, minWidth: 0 }}
                  >
                    <ChecklistTaskRow
                      disabled={isSaving}
                      index={index}
                      onTextBlur={handleDraftTaskBlur}
                      onTextChange={(value) => updateDraftTask(task.id, value)}
                      onSubmitEditing={() => handleDraftTaskSubmit(task)}
                      onToggle={() => toggleDraftTask(task.id)}
                      checkboxHitTargetWidth={CHECKLIST_COMPOSE_TOUCH_TARGET}
                      rowMinimumHeight={CHECKLIST_COMPOSE_ROW_MIN_HEIGHT}
                      task={task}
                      text={task.text}
                      verticalHitSlop={0}
                    />
                  </NativeCardContextMenu>
                ))}
                <ChecklistAddTaskRow
                  key="checklist-add-task-row"
                  disabled={isSaving}
                  focusRequest={addTaskFocusRequest}
                  onDraftChange={handleAddTaskDraftChange}
                  onInputFocus={handleAddTaskInputFocus}
                  onSubmit={addDraftTask}
                  checkboxColumnWidth={CHECKLIST_COMPOSE_TOUCH_TARGET}
                  rowMinimumHeight={CHECKLIST_COMPOSE_ROW_MIN_HEIGHT}
                />
              </View>
            </View>

            {errorMessage ? (
              <Text accessibilityRole="alert" style={[theme.typography.footnote, { color: theme.colors.danger }]}>
                {errorMessage}
              </Text>
            ) : null}
            <View style={{ alignSelf: 'stretch', alignItems: 'flex-end' }}>
              <NativeButton disabled={isSaving || !title.trim()} label={isSaving ? 'Salvando…' : 'Salvar'} onPress={() => void save()} variant="primary" />
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </>
  );
}
