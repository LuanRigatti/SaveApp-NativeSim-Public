/* global describe, expect, test */

const { readFileSync } = require('node:fs');
const { getRichNoteInputHeight } = require('../src/features/home-content/richNoteEditorLayout');

const editorSource = readFileSync(require.resolve('../src/components/homeContent/RichNoteEditor.tsx'), 'utf8');
const toolbarSource = readFileSync(require.resolve('../modules/rich-note-keyboard-toolbar/ios/SaveAppRichNoteKeyboardToolbarModule.swift'), 'utf8');
const librarySource = readFileSync(require.resolve('../src/features/home-content/savedContentLibrary.ts'), 'utf8');

describe('rich note editor iOS regressions', () => {
  test('reserves a full line for Return, including a trailing blank paragraph and large-title metrics', () => {
    expect(getRichNoteInputHeight({ measuredHeight: 20, text: 'linha', lineHeight: 25 })).toBe(25);
    expect(getRichNoteInputHeight({ measuredHeight: 24, text: 'linha\n', lineHeight: 25 })).toBe(50);
    expect(getRichNoteInputHeight({ measuredHeight: 26, text: 'linha\n\n', lineHeight: 25 })).toBe(75);
    expect(getRichNoteInputHeight({ measuredHeight: 20, text: 'título\n', lineHeight: 42 })).toBe(84);
    expect(getRichNoteInputHeight({ measuredHeight: 90, text: 'linha\n', lineHeight: 25 })).toBe(90);
    expect(getRichNoteInputHeight({ measuredHeight: 40, text: 'linha\n', lineHeight: 25, verticalPadding: 8 })).toBe(58);
  });

  test('keeps new-field focus pending until the React ref exists', () => {
    const focusStart = editorSource.indexOf('const focusInput = useCallback');
    const focusEnd = editorSource.indexOf('const focusAtEnd', focusStart);
    const focusSource = editorSource.slice(focusStart, focusEnd);

    expect(focusSource).toContain('pendingFocusRef.current = pending');
    expect(focusSource).toContain('if (!target) return;');
    expect(focusSource.indexOf('if (!target) return;')).toBeLessThan(focusSource.indexOf('pendingFocusRef.current = null'));
    expect(editorSource).toContain('useEffect(() => {\n    const pending = pendingFocusRef.current;');
    expect(editorSource).toContain('const target = inputRefs.current.get(inputId);');
    expect(editorSource).toContain('inputRefs.current.set(block.id, node)');
    expect(editorSource).toContain('target.focus();\n    if (pending.selection) target.setNativeProps({ selection: pending.selection });\n    pendingFocusRef.current = null;');
    expect(focusSource).toContain('target.setNativeProps({ selection })');
    expect(editorSource).toContain('pendingFocusRef.current = null;\n    const activeId');
  });

  test('inserts a persisted checklist block and renders editable rows with working checkbox and Return actions', () => {
    const insertStart = editorSource.indexOf('const insertChecklist = useCallback');
    const insertEnd = editorSource.indexOf('const removeChecklistItem', insertStart);
    const insertSource = editorSource.slice(insertStart, insertEnd);

    expect(toolbarSource).toContain('action: "insertChecklist"');
    expect(editorSource).toContain("case 'insertChecklist': insertChecklist(); break;");
    expect(insertSource).toContain("type: 'checklist'");
    expect(insertSource).toContain("text: '', checked: false");
    expect(insertSource).toContain('insertAfterActivePosition([block], false)');
    expect(insertSource).toContain('scheduleFocus({ kind: \'checklist\', blockId, itemId }');
    expect(editorSource).toContain('accessibilityRole="checkbox"');
    expect(editorSource).toContain('onSubmitEditing={() => addChecklistItem(block.id, item.id)}');
    expect(editorSource).toContain('onPress={() => toggleChecklistItem(block.id, item.id)}');
    expect(librarySource).toContain('encodePersistedRichNote');
    expect(librarySource).toContain('UPDATE saved_content SET text_content = ?');
  });

  test('keeps bullet and numbered markers visible and tied to paragraph formatting actions', () => {
    expect(toolbarSource).toContain('action: "format.bullet"');
    expect(toolbarSource).toContain('action: "format.numbered"');
    expect(editorSource).toContain("case 'format.bullet': applyParagraphUpdate({ listStyle: 'bullet' }); break;");
    expect(editorSource).toContain("case 'format.numbered': applyParagraphUpdate({ listStyle: 'numbered' }); break;");
    expect(editorSource).toContain("block.listStyle === 'bullet' ? '•'");
    expect(editorSource).toContain("block.listStyle === 'numbered' ? `${listNumber(document.blocks, block.id)}.`");
    expect(editorSource).toContain('placeholder={block.id === bodyPlaceholderBlockId ? \'Comece a escrever...\' : undefined}');
  });

  test('gives photo blocks finite measured width inside the native context-menu host and reports load failures', () => {
    expect(editorSource).toContain('onLayout={handleEditorLayout}');
    expect(editorSource).toContain('triggerContentWidth={imageWidth}');
    expect(editorSource).toContain('matchContents={{ vertical: true }}');
    expect(editorSource).toContain("block.size === 'small' ? 0.45 : block.size === 'medium' ? 0.72 : 1");
    expect(editorSource).toContain('onError={() => setFailedImageIds');
    expect(editorSource).toContain('Não foi possível carregar esta imagem.');
    expect(editorSource).toContain('Toque para selecionar outra foto.');
    expect(editorSource).toContain('onRetry={requestImageRetry}');
    expect(editorSource).toContain('handledImageRetryRef.current === imageRetryRequest');
    expect(editorSource).toContain('void openImagePicker(imageRetryRequest.blockId)');
    expect(editorSource).toContain('allowsMultipleSelection: replaceBlockId == null');
    expect(editorSource).toContain('sourceUri: asset.uri');
    expect(librarySource).toContain('materializeRichNoteAssets');
    expect(librarySource).toContain('encodePersistedRichNote');
  });
});
