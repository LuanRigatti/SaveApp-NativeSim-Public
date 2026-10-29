import { Ionicons } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import { PixelRatio, Platform, Pressable, Text, TextInput, type TextInputInstance, View } from 'react-native';

import { CHECKLIST_TASK_MAX_LENGTH, type SavedChecklistTask } from '@/features/home-content/checklistTypes';
import {
  getBoundedChecklistTaskInputHeight,
  getChecklistCheckboxTopOffset,
} from '@/features/home-content/checklistTaskRowLayout';
import { useAppTheme } from '@/theme';

type ChecklistTaskRowProps = {
  task: Pick<SavedChecklistTask, 'id' | 'text' | 'isCompleted'>;
  index: number;
  text: string;
  disabled: boolean;
  onTextChange: (value: string) => void;
  onTextBlur: () => void;
  onToggle: () => void;
  onSubmitEditing?: () => void;
  rowMinimumHeight?: number;
  verticalHitSlop?: number;
  checkboxHitTargetWidth?: number;
};

type ChecklistCheckboxIndicatorProps = {
  isCompleted: boolean;
};

type ChecklistTaskContextPreviewProps = {
  task: SavedChecklistTask;
  text: string;
  width: number;
};

export function ChecklistCheckboxIndicator({ isCompleted }: ChecklistCheckboxIndicatorProps) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: isCompleted ? theme.colors.primary : 'transparent',
        borderColor: isCompleted ? theme.colors.primary : theme.colors.textPrimary,
        borderRadius: theme.radius.sm * 0.75,
        borderWidth: 2,
        height: 22,
        justifyContent: 'center',
        width: 22,
      }}
    >
      {isCompleted ? <Ionicons color={theme.colors.textInverse} name="checkmark" size={16} /> : null}
    </View>
  );
}

export function ChecklistTaskContextPreview({ task, text, width }: ChecklistTaskContextPreviewProps) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        alignItems: 'flex-start',
        alignSelf: 'stretch',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.lg,
        flexDirection: 'row',
        gap: theme.spacing.sm,
        minHeight: theme.sizes.touchTargetMinimum,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        width,
      }}
    >
      <ChecklistCheckboxIndicator isCompleted={task.isCompleted} />
      <Text
        style={[
          theme.typography.body,
          {
            color: task.isCompleted ? theme.colors.textSecondary : theme.colors.textPrimary,
            flex: 1,
            flexShrink: 1,
            minWidth: 0,
            textDecorationLine: task.isCompleted ? 'line-through' : 'none',
          },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

export function ChecklistTaskRow({
  task,
  index,
  text,
  disabled,
  onTextChange,
  onTextBlur,
  onToggle,
  onSubmitEditing,
  rowMinimumHeight,
  verticalHitSlop = 4,
  checkboxHitTargetWidth = 32,
}: ChecklistTaskRowProps) {
  const { theme } = useAppTheme();
  const textInputRef = useRef<TextInputInstance | null>(null);
  const bodyFontSize = typeof theme.typography.body.fontSize === 'number' ? theme.typography.body.fontSize : 17;
  const bodyLineHeight = typeof theme.typography.body.lineHeight === 'number'
    ? theme.typography.body.lineHeight
    : Math.ceil(bodyFontSize * 1.3);
  const rowHeight = Math.max(theme.sizes.touchTargetMinimum, rowMinimumHeight ?? theme.sizes.touchTargetMinimum);
  const fontScale = PixelRatio.getFontScale();
  const [textHeight, setTextHeight] = useState(bodyLineHeight);
  const [displayTextHeight, setDisplayTextHeight] = useState(bodyLineHeight);
  const [firstLineHeight, setFirstLineHeight] = useState(bodyLineHeight);
  const [textWidth, setTextWidth] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const editingStartTextRef = useRef(text);
  const onTextLayout = useCallback((width: number) => {
    setTextWidth((current) => Math.abs(current - width) < 1 ? current : width);
  }, []);
  const onDisplayTextLayout = useCallback((height: number) => {
    const nextHeight = Math.max(bodyLineHeight, Math.ceil(height));
    setDisplayTextHeight((current) => current === nextHeight ? current : nextHeight);
  }, [bodyLineHeight]);
  const onFirstLineLayout = useCallback((height: number) => {
    const nextHeight = Number.isFinite(height) && height > 0 ? height : bodyLineHeight;
    setFirstLineHeight((current) => Math.abs(current - nextHeight) < 1 ? current : nextHeight);
  }, [bodyLineHeight]);
  const checkboxTopOffset = getChecklistCheckboxTopOffset({
    checkboxSize: 22,
    contentHeight: isEditing ? textHeight : displayTextHeight,
    firstLineHeight,
    rowHeight,
  });
  const beginEditing = useCallback(() => {
    if (disabled) return;
    editingStartTextRef.current = text;
    setTextHeight(displayTextHeight);
    setIsEditing(true);
    requestAnimationFrame(() => textInputRef.current?.focus());
  }, [disabled, displayTextHeight, text]);
  const onContentSizeChange = useCallback((measuredHeight: number) => {
    if (text === editingStartTextRef.current) {
      setTextHeight(displayTextHeight);
      return;
    }
    const nextHeight = getBoundedChecklistTaskInputHeight({
      availableWidth: textWidth,
      fontSize: bodyFontSize * fontScale,
      lineHeight: bodyLineHeight * fontScale,
      measuredHeight,
      minimumHeight: bodyLineHeight * fontScale,
      text,
    });
    setTextHeight((current) => current === nextHeight ? current : nextHeight);
  }, [bodyFontSize, bodyLineHeight, displayTextHeight, fontScale, text, textWidth]);

  return (
    <View
      style={{
        alignSelf: 'stretch',
        alignItems: 'flex-start',
        backgroundColor: theme.colors.background,
        flexDirection: 'row',
        flexShrink: 0,
        gap: 0,
        minHeight: rowHeight,
        minWidth: 0,
        paddingLeft: 0,
        paddingRight: theme.spacing.xxs,
        paddingVertical: 0,
      }}
    >
      <Pressable
        accessibilityLabel={task.isCompleted ? `Desmarcar tarefa ${index + 1}` : `Concluir tarefa ${index + 1}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.isCompleted, disabled }}
        disabled={disabled}
        onPress={onToggle}
        hitSlop={{
          bottom: verticalHitSlop,
          left: checkboxHitTargetWidth >= theme.sizes.touchTargetMinimum ? 0 : 12,
          right: 0,
          top: verticalHitSlop,
        }}
        style={{
          alignItems: 'flex-start',
          height: theme.sizes.touchTargetMinimum,
          justifyContent: 'flex-start',
          paddingTop: checkboxTopOffset,
          width: checkboxHitTargetWidth,
        }}
      >
        <ChecklistCheckboxIndicator isCompleted={task.isCompleted} />
      </Pressable>
      {isEditing ? (
        <View style={{ flex: 1, justifyContent: 'center', minHeight: rowHeight, minWidth: 0 }}>
          <TextInput
            accessibilityLabel={`Editar tarefa ${index + 1}`}
            editable={!disabled}
            maxLength={CHECKLIST_TASK_MAX_LENGTH}
            multiline
            onBlur={() => {
              setIsEditing(false);
              onTextBlur();
            }}
            onChangeText={onTextChange}
            onContentSizeChange={(event) => onContentSizeChange(event.nativeEvent.contentSize.height)}
            onLayout={(event) => onTextLayout(event.nativeEvent.layout.width)}
            onSubmitEditing={onSubmitEditing}
            ref={textInputRef}
            returnKeyType={onSubmitEditing ? 'next' : undefined}
            scrollEnabled={false}
            submitBehavior={onSubmitEditing ? 'submit' : undefined}
            style={[
              theme.typography.body,
              {
                alignSelf: 'stretch',
                color: task.isCompleted ? theme.colors.textSecondary : theme.colors.textPrimary,
                flexGrow: 0,
                flexShrink: 1,
                height: textHeight,
                minHeight: bodyLineHeight,
                minWidth: 0,
                padding: 0,
                textAlignVertical: Platform.OS === 'android' ? 'center' : 'top',
                textDecorationLine: task.isCompleted ? 'line-through' : 'none',
              },
            ]}
            value={text}
          />
        </View>
      ) : (
        <Pressable
          accessibilityHint="Toque para editar. Mantenha pressionada para ver as ações da tarefa."
          accessibilityLabel={`Editar tarefa ${index + 1}: ${text}`}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onLayout={(event) => onTextLayout(event.nativeEvent.layout.width)}
          onPress={beginEditing}
          style={{ flex: 1, justifyContent: 'center', minHeight: rowHeight, minWidth: 0 }}
        >
          <Text
            onTextLayout={(event) => onFirstLineLayout(event.nativeEvent.lines[0]?.height ?? bodyLineHeight)}
            onLayout={(event) => {
              onDisplayTextLayout(event.nativeEvent.layout.height);
            }}
            style={[
              theme.typography.body,
              {
                alignSelf: 'stretch',
                color: task.isCompleted ? theme.colors.textSecondary : theme.colors.textPrimary,
                flexShrink: 1,
                minWidth: 0,
                textDecorationLine: task.isCompleted ? 'line-through' : 'none',
              },
            ]}
          >
            {text}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
