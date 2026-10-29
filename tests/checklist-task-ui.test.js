/* global describe, expect, test */

const { readFileSync } = require('node:fs');
const { triggerChecklistHaptic } = require('../src/features/home-content/checklistHaptics');

const detailSource = readFileSync(require.resolve('../src/app/checklists/[id].tsx'), 'utf8');
const rowSource = readFileSync(require.resolve('../src/components/homeContent/ChecklistTaskRow.tsx'), 'utf8');
const addTaskRowSource = readFileSync(require.resolve('../src/components/homeContent/ChecklistAddTaskRow.tsx'), 'utf8');
const providerSource = readFileSync(require.resolve('../src/features/home-content/LocalChecklistLibraryProvider.tsx'), 'utf8');
const librarySource = readFileSync(require.resolve('../src/features/home-content/checklistLibrary.ts'), 'utf8');
const nativeMenuSource = readFileSync(require.resolve('../src/components/native/NativeCardContextMenu/NativeCardContextMenu.ios.tsx'), 'utf8');
const progressiveScreenSource = readFileSync(require.resolve('../src/components/premium/ProgressiveCollapsibleScreen.tsx'), 'utf8');
const gallerySource = readFileSync(require.resolve('../src/components/photos/PhotoMasonryGallery.tsx'), 'utf8');

describe('checklist task interactions', () => {
  test('removes drag and manual move behavior from the detail route and task row', () => {
    for (const source of [detailSource, rowSource, providerSource, librarySource]) {
      expect(source).not.toMatch(/Sortable|onDrag|dragActivation|reorderTasks|reorderSavedChecklistTasks|moveUp|moveDown|\bmoveTask\b|Mover tarefa/);
    }
    expect(rowSource).not.toContain('accessibilityActions');
    expect(rowSource).not.toContain('Sortable.Handle');
    expect(detailSource).not.toContain('PortalProvider');
  });

  test('uses a native destructive long-press context-menu action for task deletion', () => {
    expect(detailSource).toContain('NativeCardContextMenu');
    expect(detailSource).toMatch(/title: 'Excluir',[\s\S]*?systemImage: 'trash',[\s\S]*?destructive: true/);
    expect(detailSource).toContain('onPress: () => removeTask(task)');
    expect(rowSource).toContain('Mantenha pressionada para ver as ações da tarefa.');
    expect(nativeMenuSource).toContain("role={action.destructive ? 'destructive' : undefined}");
    expect(detailSource).toMatch(/const removeTask = useCallback\([\s\S]*?Alert\.alert\('Excluir tarefa\?'[\s\S]*?authorizeCurrentChecklist\(\)[\s\S]*?deleteTask\(checklist\.id, task\.id\)/);
    expect(detailSource).toMatch(/const deleted = await deleteTask\(checklist\.id, task\.id\);[\s\S]*?tasks = current\.tasks\.filter/);
    expect(rowSource).not.toContain('trash-outline');
    expect(rowSource).not.toContain('Excluir tarefa');
  });

  test('keeps tapping task text for inline editing without changing the measured starting height', () => {
    const beginEditingStart = rowSource.indexOf('const beginEditing = useCallback');
    const beginEditingEnd = rowSource.indexOf('const onContentSizeChange', beginEditingStart);
    const beginEditingSource = rowSource.slice(beginEditingStart, beginEditingEnd);
    expect(rowSource).toContain('onPress={beginEditing}');
    expect(rowSource).toContain('<TextInput');
    expect(rowSource).toContain('multiline');
    expect(rowSource).toContain('onTextBlur();');
    expect(beginEditingSource.indexOf('setTextHeight(displayTextHeight)')).toBeLessThan(beginEditingSource.indexOf('setIsEditing(true)'));
    expect(rowSource).toContain('height: textHeight');
    expect(rowSource).toContain('flexGrow: 0');
    expect(rowSource).toContain('getBoundedChecklistTaskInputHeight');
  });

  test('keeps an inline edit draft visible when SQLite persistence fails', () => {
    const saveStart = detailSource.indexOf('const saveTaskText = useCallback');
    const saveEnd = detailSource.indexOf('const toggleTask = useCallback', saveStart);
    const saveSource = detailSource.slice(saveStart, saveEnd);
    const catchStart = saveSource.indexOf('} catch (error) {');
    const catchEnd = saveSource.indexOf('} finally {', catchStart);
    const persistenceFailureSource = saveSource.slice(catchStart, catchEnd);
    expect(saveSource).toContain('showSaveError();');
    expect(persistenceFailureSource).not.toContain('setTaskDrafts');
  });

  test('keeps the square high-contrast checkbox, accessible hit area, completion haptic and strike-through', () => {
    expect(rowSource).toContain('accessibilityRole="checkbox"');
    expect(rowSource).toContain('accessibilityState={{ checked: task.isCompleted, disabled }}');
    expect(rowSource).toContain('height: 22');
    expect(rowSource).toContain('width: 22');
    expect(rowSource).toContain('borderWidth: 2');
    expect(rowSource).toContain('borderRadius: theme.radius.sm * 0.75');
    expect(rowSource).toContain('borderColor: isCompleted ? theme.colors.primary : theme.colors.textPrimary');
    expect(rowSource).toContain("textDecorationLine: task.isCompleted ? 'line-through' : 'none'");
    expect(rowSource).toContain('height: theme.sizes.touchTargetMinimum');
    expect(rowSource).toContain('checkboxHitTargetWidth = 32');
    expect(rowSource).toContain('verticalHitSlop = 4');
    expect(rowSource).toContain('left: checkboxHitTargetWidth >= theme.sizes.touchTargetMinimum ? 0 : 12');
    expect(detailSource).toContain('triggerChecklistHaptic(() => Haptics.selectionAsync())');
    expect(detailSource).toContain('withChecklistTaskCompletionState(current, task.id, nextCompleted)');
    expect(detailSource).toContain('await setTaskCompleted(checklist.id, task.id, nextCompleted)');
  });

  test('hides detail progress, tightens title-to-list spacing and keeps the saved title read-only', () => {
    expect(detailSource).toContain('contentGap={theme.spacing.md}');
    expect(detailSource).not.toContain('concluídas');
    expect(detailSource).not.toContain('Nenhuma tarefa');
    expect(detailSource).toContain('{checklist?.title ?? \'\'}');
    expect(detailSource).not.toContain('titleDraft');
    expect(detailSource).not.toContain('saveTitle');
  });

  test('renders Add Task after the task map, including empty lists, while preserving insertion order and drafts', () => {
    const taskMap = detailSource.indexOf('checklist.tasks.map');
    const addRow = detailSource.indexOf('<ChecklistAddTaskRow');
    expect(taskMap).toBeGreaterThanOrEqual(0);
    expect(addRow).toBeGreaterThanOrEqual(0);
    expect(addRow).toBeGreaterThan(taskMap);
    expect(detailSource).toMatch(/checklist\.tasks\.map\([\s\S]*?\n\s*\}\)\}\s*<ChecklistAddTaskRow/);
    expect(addTaskRowSource).toContain('if (!submittedText.trim() || submitInFlightRef.current) return');
    expect(addTaskRowSource).toContain('submitBehavior="submit"');
    expect(addTaskRowSource).toContain('onSubmitEditing={() => void handleSubmit()}');
    expect(addTaskRowSource).toContain('if (!saved) return');
    expect(addTaskRowSource).toContain('ChecklistCheckboxIndicator isCompleted={false}');
    expect(addTaskRowSource).toContain('placeholder="Adicionar tarefa"');
    expect(addTaskRowSource).not.toContain('name="add"');
    expect(addTaskRowSource).toContain('Adicionar tarefa');
    expect(detailSource).toContain('key="checklist-add-task-row"');
    expect(detailSource).toContain('scrollToEnd({ animated: true })');
    expect(detailSource).toContain('const task = await addTask(checklist.id, text)');
    expect(detailSource).toContain('const tasks = [...current.tasks, task]');
  });

  test('keeps task rows compact while allowing their content to grow for multiline text', () => {
    for (const source of [rowSource, addTaskRowSource]) {
      expect(source).toContain('minHeight: rowHeight,');
      expect(source).toContain('paddingVertical: 0,');
      expect(source).toContain('multiline');
    }
    expect(rowSource).toContain('verticalHitSlop = 4');
    expect(rowSource).toContain('rowMinimumHeight ?? theme.sizes.touchTargetMinimum');
    expect(addTaskRowSource).toContain('rowMinimumHeight === undefined');
    expect(addTaskRowSource).toContain('? Math.ceil(bodyLineHeight)');
    expect(rowSource).toContain('height: textHeight');
    expect(addTaskRowSource).toContain('height: textHeight');
    expect(rowSource).not.toMatch(/numberOfLines/);
    expect(detailSource).toContain('<ProgressiveCollapsibleScreen');
    expect(detailSource).toContain('nativeHeader');
    expect(detailSource).toContain('scrollRef={scrollableRef}');
    expect(detailSource).not.toMatch(/^\s*<Animated\.ScrollView/m);
  });

  test('aligns the checkbox to first-line metrics and adds only a small gap between rows', () => {
    expect(rowSource).toContain('getChecklistCheckboxTopOffset');
    expect(rowSource).toContain('onTextLayout={(event) => onFirstLineLayout(event.nativeEvent.lines[0]?.height ?? bodyLineHeight)}');
    expect(rowSource).toContain('paddingTop: checkboxTopOffset');
    expect(rowSource).toContain("justifyContent: 'flex-start'");
    expect(detailSource).toContain('gap: CHECKLIST_TASK_ROW_GAP');
    expect(detailSource).toContain('verticalHitSlop={0}');
    expect(detailSource).toContain('triggerContentWidth={taskListWidth}');
    expect(nativeMenuSource).toMatch(/<View style=\{\{ minWidth: 0, width: triggerContentWidth \}\}>\{children\}<\/View>/);
  });

  test('sets a finite Yoga width on the first React Native node inside the native ContextMenu trigger', () => {
    expect(detailSource).toContain('matchContents={{ vertical: true }}');
    expect(detailSource).toContain('onLayout={handleTaskListLayout}');
    expect(detailSource).toContain('width={taskListWidth}');
    expect(detailSource).toContain('triggerContentWidth={taskListWidth}');
    expect(detailSource).toContain('scrollContentContainerStyle={{');
    expect(detailSource).toContain("style={{ alignSelf: 'stretch', flexShrink: 1, minWidth: 0 }}");
    expect(detailSource).not.toContain("width: '100%' });");
    expect(detailSource).not.toContain('constrainContentWidth');
    expect(detailSource).not.toContain('rowWidth=');
    expect(rowSource).not.toContain('rowWidth');
    expect(nativeMenuSource).toContain('<RNHostView');
    expect(nativeMenuSource).toContain('<RNHostView matchContents={matchContents}>');
    expect(nativeMenuSource).toMatch(/const triggerContent = [\s\S]*?<View style=\{\{ minWidth: 0, width: triggerContentWidth \}\}>\{children\}<\/View>/);
    expect(nativeMenuSource).toContain('{triggerContent}');
    expect(nativeMenuSource).not.toContain('frame(');
    expect(rowSource).toMatch(/<Text[\s\S]*?flexShrink:\s*1,[\s\S]*?minWidth:\s*0/);
    expect(rowSource).toMatch(/<TextInput[\s\S]*?flexShrink:\s*1,[\s\S]*?minWidth:\s*0/);
    expect(rowSource).toMatch(/alignItems:\s*'flex-start'/);
    expect(addTaskRowSource).toMatch(/alignItems:\s*'flex-start'/);
    expect(detailSource).toContain('windowWidth - theme.spacing.lg * 2');
    expect(detailSource).not.toMatch(/CHECKLIST-LAYOUT-DIAG|Diagnóstico temporário|A · Texto sem menu|B · ContextMenu/);
    expect(rowSource).not.toContain('onDiagnosticLayout');
  });

  test('uses the shared scroll and blur pipeline without a native opaque header background', () => {
    expect(detailSource).toContain('<ProgressiveCollapsibleScreen');
    expect(detailSource).toContain('nativeHeader');
    expect(detailSource).toContain('contentTopInset={theme.spacing.xl + theme.spacing.xxl + theme.spacing.xxs * 2 + 2}');
    expect(detailSource).toContain('scrollRef={scrollableRef}');
    expect(detailSource).not.toContain('renderScrollableContent=');
    expect(progressiveScreenSource).toContain('const onScroll = useAnimatedScrollHandler');
    expect(progressiveScreenSource).toContain('onScroll={onScroll}');
    expect(progressiveScreenSource).toContain('headerBackgroundStyle');
    expect(progressiveScreenSource).toContain('<MaskedView');
    expect(progressiveScreenSource).toContain('<AnimatedBlurView');
  });

  test('keeps long paragraphs wrapping in display, inline editing, and the native preview', () => {
    const previewStart = rowSource.indexOf('export function ChecklistTaskContextPreview');
    const previewEnd = rowSource.indexOf('export function ChecklistTaskRow', previewStart);
    const previewSource = rowSource.slice(previewStart, previewEnd);
    expect(rowSource).toContain('<Text');
    expect(rowSource).toContain('<TextInput');
    expect(rowSource).toContain('multiline');
    expect(rowSource).toContain('scrollEnabled={false}');
    expect(rowSource).toContain('maxLength={CHECKLIST_TASK_MAX_LENGTH}');
    expect(previewSource).toMatch(/flex:\s*1,[\s\S]*?flexShrink:\s*1,[\s\S]*?minWidth:\s*0/);
    expect(detailSource).toContain('preview={(');
    expect(detailSource).toContain('<ChecklistTaskContextPreview');
    expect(detailSource).toContain('width={taskListWidth}');
    expect(rowSource).not.toMatch(/numberOfLines/);
  });

  test('uses a padded semantic surface only in the native context-menu preview', () => {
    expect(detailSource).toContain('preview={(');
    expect(detailSource).toContain('<ChecklistTaskContextPreview');
    expect(rowSource).toContain('export function ChecklistTaskContextPreview');
    expect(rowSource).toContain('backgroundColor: theme.colors.surface');
    expect(rowSource).toContain('borderRadius: theme.radius.lg');
    expect(rowSource).toContain('paddingHorizontal: theme.spacing.md');
    expect(rowSource).toContain('paddingVertical: theme.spacing.sm');
    expect(rowSource).toContain('flexShrink: 1');
    expect(nativeMenuSource).toContain('<ContextMenu.Preview>');
    expect(rowSource).toContain('backgroundColor: theme.colors.background');
  });

  test('preserves SQLite position order for display, append and deletion without exposing a reorder operation', () => {
    expect(librarySource).toContain('ORDER BY position, id');
    expect(librarySource).toContain('SELECT MAX(position) AS position FROM saved_checklist_items WHERE checklist_id = ?;');
    expect(librarySource).not.toContain('SET position = position + 1');
    expect(librarySource).toMatch(/normalizedText,[\s\S]*?\n\s*position,[\s\S]*?timestamp,/);
    expect(librarySource).toContain('for (const [position, task] of remainingTasks.entries())');
    expect(librarySource).toContain('UPDATE saved_checklist_items SET position = ? WHERE id = ?');
    expect(librarySource).not.toContain('reorderSavedChecklistTasks');
    expect(providerSource).not.toContain('reorderTasks');
  });

  test('keeps whole-checklist deletion available from the Home context menu', () => {
    expect(gallerySource).toContain("id: 'delete-checklist'");
    expect(gallerySource).toContain('deleteChecklist(checklist.id');
  });

  test('treats unavailable checkbox haptics as optional', async () => {
    let calls = 0;
    triggerChecklistHaptic(() => {
      calls += 1;
      return Promise.reject(new Error('haptics unavailable'));
    });

    expect(calls).toBe(1);
    expect(() => triggerChecklistHaptic(() => { throw new Error('native module unavailable'); })).not.toThrow();
    await Promise.resolve();
  });
});
