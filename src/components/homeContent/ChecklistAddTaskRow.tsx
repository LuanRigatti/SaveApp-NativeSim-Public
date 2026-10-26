import { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, type TextInputInstance, View } from 'react-native';

import { ChecklistCheckboxIndicator } from '@/components/homeContent/ChecklistTaskRow';
import { CHECKLIST_TASK_MAX_LENGTH } from '@/features/home-content/checklistTypes';
import { getBoundedChecklistTaskInputHeight } from '@/features/home-content/checklistTaskRowLayout';
import { useAppTheme } from '@/theme';

type ChecklistAddTaskRowProps = {
  onInputFocus: () => void;
  onSubmit: (text: string) => Promise<boolean>;
};

export function ChecklistAddTaskRow({
  onInputFocus,
  onSubmit,
}: ChecklistAddTaskRowProps) {
  const { theme } = useAppTheme();
  const textInputRef = useRef<TextInputInstance | null>(null);
  const draftRef = useRef('');
  const submitInFlightRef = useRef(false);
  const bodyFontSize = typeof theme.typography.body.fontSize === 'number' ? theme.typography.body.fontSize : 17;
  const bodyLineHeight = typeof theme.typography.body.lineHeight === 'number'
    ? theme.typography.body.lineHeight
    : Math.ceil(bodyFontSize * 1.3);
  const minimumTextHeight = Math.ceil(bodyLineHeight);
  const [draft, setDraft] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [textHeight, setTextHeight] = useState(minimumTextHeight);
  const [textWidth, setTextWidth] = useState(0);
  const rowStyle = {
    alignItems: 'flex-start' as const,
    alignSelf: 'stretch' as const,
    backgroundColor: theme.colors.background,
    flexDirection: 'row' as const,
    flexShrink: 0,
    gap: 0,
    minHeight: theme.sizes.touchTargetMinimum,
    minWidth: 0,
    paddingLeft: 0,
    paddingRight: theme.spacing.xxs,
    paddingVertical: 0,
  };

  const beginEditing = useCallback(() => {
    setIsEditing(true);
    requestAnimationFrame(() => textInputRef.current?.focus());
  }, []);

  const handleTextChange = useCallback((value: string) => {
    draftRef.current = value;
    setDraft(value);
  }, []);

  const handleSubmit = useCallback(async () => {
    const submittedText = draftRef.current;
    if (!submittedText.trim() || submitInFlightRef.current) return;

    submitInFlightRef.current = true;
    let saved = false;
    try {
      saved = await onSubmit(submittedText);
    } catch {
      // The parent owns persistence errors; keep this draft available to retry.
    } finally {
      submitInFlightRef.current = false;
    }

    if (!saved) return;
    if (draftRef.current === submittedText) {
      draftRef.current = '';
      setDraft('');
      setTextHeight(minimumTextHeight);
    }
    requestAnimationFrame(() => textInputRef.current?.focus());
  }, [minimumTextHeight, onSubmit]);

  const handleBlur = useCallback(() => {
    if (draftRef.current.trim()) return;
    setIsEditing(false);
  }, []);

  const handleContentSizeChange = useCallback((measuredHeight: number) => {
    const nextHeight = getBoundedChecklistTaskInputHeight({
      availableWidth: textWidth,
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
      measuredHeight,
      minimumHeight: minimumTextHeight,
      text: draft,
    });
    setTextHeight((current) => current === nextHeight ? current : nextHeight);
  }, [bodyFontSize, bodyLineHeight, draft, minimumTextHeight, textWidth]);

  const handleInputLayout = useCallback((width: number) => {
    setTextWidth((current) => Math.abs(current - width) < 1 ? current : width);
  }, []);

  const leadingCheckbox = (
    <View style={{ alignItems: 'flex-start', height: 44, justifyContent: 'center', width: 32 }}>
      <ChecklistCheckboxIndicator isCompleted={false} />
    </View>
  );

  if (!isEditing) {
    return (
      <Pressable
        accessibilityHint="Toque para escrever uma tarefa e pressione Return para adicioná-la."
        accessibilityLabel="Adicionar tarefa"
        accessibilityRole="button"
        onPress={beginEditing}
        style={rowStyle}
      >
        {leadingCheckbox}
        <View style={{ flex: 1, justifyContent: 'center', minHeight: 44, minWidth: 0 }}>
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary, flexShrink: 1, minWidth: 0 }]}>
            Adicionar tarefa
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={rowStyle}>
      {leadingCheckbox}
      <View style={{ flex: 1, justifyContent: 'center', minHeight: 44, minWidth: 0 }}>
        <TextInput
          accessibilityHint="Pressione Return para salvar e continuar adicionando tarefas."
          accessibilityLabel="Adicionar tarefa"
          maxLength={CHECKLIST_TASK_MAX_LENGTH}
          multiline
          onBlur={handleBlur}
          onChangeText={handleTextChange}
          onContentSizeChange={(event) => handleContentSizeChange(event.nativeEvent.contentSize.height)}
          onFocus={onInputFocus}
          onLayout={(event) => handleInputLayout(event.nativeEvent.layout.width)}
          onSubmitEditing={() => void handleSubmit()}
          ref={textInputRef}
          returnKeyType="next"
          scrollEnabled={false}
          submitBehavior="submit"
          placeholder="Adicionar tarefa"
          placeholderTextColor={theme.colors.textSecondary}
          style={[
            theme.typography.body,
            {
              color: theme.colors.textPrimary,
              alignSelf: 'stretch',
              flexShrink: 1,
              height: textHeight,
              minHeight: minimumTextHeight,
              minWidth: 0,
              padding: 0,
              // iOS multiline input aligns text from the top. Keep its frame to
              // one line and center it beside the checkbox.
              textAlignVertical: Platform.OS === 'android' ? 'center' : 'top',
            },
          ]}
          value={draft}
        />
      </View>
    </View>
  );
}
