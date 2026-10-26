import { Stack, usePreventRemove, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputInstance,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NativeButton } from '@/components/native';
import { useLocalChecklists } from '@/features/home-content/LocalChecklistLibraryProvider';
import {
  MAX_CHECKLIST_TASK_LENGTH,
  MAX_CHECKLIST_TITLE_LENGTH,
} from '@/features/home-content/checklistTypes';
import { useAppTheme } from '@/theme';

type DraftTask = { id: string; text: string };

export default function ChecklistComposeScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { createChecklist } = useLocalChecklists();
  const [title, setTitle] = useState('');
  const [tasks, setTasks] = useState<DraftTask[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [allowRouteRemoval, setAllowRouteRemoval] = useState(false);
  const taskInputRefs = useRef(new Map<string, TextInputInstance | null>());
  const taskIdCounter = useRef(0);
  const focusTaskId = useRef<string | null>(null);
  const hasDraft = title.trim().length > 0 || tasks.some((task) => task.text.trim().length > 0);

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

  useEffect(() => {
    const id = focusTaskId.current;
    if (!id) return;
    focusTaskId.current = null;
    requestAnimationFrame(() => taskInputRefs.current.get(id)?.focus());
  }, [tasks]);

  const addDraftTask = useCallback((shouldFocus = false) => {
    const id = `draft-${taskIdCounter.current++}`;
    if (shouldFocus) focusTaskId.current = id;
    setTasks((current) => [...current, { id, text: '' }]);
    setErrorMessage(null);
  }, []);

  const updateDraftTask = useCallback((id: string, text: string) => {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, text } : task));
    setErrorMessage(null);
  }, []);

  const removeDraftTask = useCallback((id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id));
  }, []);

  const save = useCallback(async () => {
    if (!title.trim()) {
      setErrorMessage('Digite um título para a lista.');
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const id = await createChecklist(title, tasks.map((task) => task.text));
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
                placeholder="Por fazer"
                placeholderTextColor={theme.colors.textTertiary}
                returnKeyType="next"
                style={{
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.separator,
                  borderRadius: theme.radius.md,
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
              <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, overflow: 'hidden' }}>
                {tasks.map((task, index) => (
                  <View
                    key={task.id}
                    style={{
                      alignItems: 'center',
                      borderBottomColor: theme.colors.separator,
                      borderBottomWidth: index === tasks.length - 1 ? 0 : StyleSheet.hairlineWidth,
                      flexDirection: 'row',
                      gap: theme.spacing.xs,
                      minHeight: theme.sizes.touchTargetMinimum,
                      paddingHorizontal: theme.spacing.sm,
                    }}
                  >
                    <TextInput
                      accessibilityLabel={`Tarefa ${index + 1}`}
                      autoCapitalize="sentences"
                      maxLength={MAX_CHECKLIST_TASK_LENGTH}
                      onChangeText={(value) => updateDraftTask(task.id, value)}
                      onSubmitEditing={() => {
                        if (task.text.trim()) addDraftTask(true);
                      }}
                      placeholder="Nova tarefa"
                      placeholderTextColor={theme.colors.textTertiary}
                      ref={(instance) => { taskInputRefs.current.set(task.id, instance); }}
                      returnKeyType="next"
                      style={[theme.typography.body, { color: theme.colors.textPrimary, flex: 1, minHeight: theme.sizes.touchTargetMinimum, paddingVertical: theme.spacing.sm }]}
                      value={task.text}
                    />
                    <Pressable
                      accessibilityLabel={`Remover tarefa ${index + 1}`}
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => removeDraftTask(task.id)}
                      style={{ alignItems: 'center', height: theme.sizes.touchTargetMinimum, justifyContent: 'center', width: 36 }}
                    >
                      <Text style={[theme.typography.title3, { color: theme.colors.textTertiary }]}>−</Text>
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => addDraftTask(true)}
                  style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm, minHeight: theme.sizes.touchTargetMinimum, paddingHorizontal: theme.spacing.md }}
                >
                  <Text style={[theme.typography.title3, { color: theme.colors.primary }]}>+</Text>
                  <Text style={[theme.typography.body, { color: theme.colors.primary }]}>Adicionar tarefa</Text>
                </Pressable>
              </View>
            </View>

            {errorMessage ? (
              <Text accessibilityRole="alert" style={[theme.typography.footnote, { color: theme.colors.danger }]}>
                {errorMessage}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
              <NativeButton disabled={isSaving} label="Cancelar" onPress={() => router.back()} variant="plain" />
              <NativeButton disabled={isSaving || !title.trim()} label={isSaving ? 'Salvando…' : 'Salvar lista'} onPress={() => void save()} variant="primary" />
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </>
  );
}
