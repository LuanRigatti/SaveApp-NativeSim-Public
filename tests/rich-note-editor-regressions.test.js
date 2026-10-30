/* global describe, expect, test */

const { readFileSync } = require('node:fs');
const { getRichNoteInputHeight } = require('../src/features/home-content/richNoteEditorLayout');
const { getBoundedChecklistTaskInputHeight } = require('../src/features/home-content/checklistTaskRowLayout');
const { createEmptyRichNoteDocument } = require('../src/features/home-content/richNoteDocument');
const { getDockedKeyboardViewportOverlap } = require('../src/features/home-content/keyboardViewportOverlap');
const { isTouchWithinRichNoteTextLine } = require('../src/features/home-content/richNoteTextLineHitTest');

const editorSource = readFileSync(require.resolve('../src/components/homeContent/RichNoteEditor.tsx'), 'utf8');
const composeRouteSource = readFileSync(require.resolve('../src/app/texts/compose.tsx'), 'utf8');
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

  test('keeps an empty compose note intrinsic and expands long paragraphs for natural scrolling', () => {
    const emptyDocument = createEmptyRichNoteDocument();
    const bodyPlaceholder = emptyDocument.blocks[1];
    const longParagraph = `${'Linha longa do documento. '.repeat(12)}\nContinuação.`;
    const longParagraphHeight = getRichNoteInputHeight({
      measuredHeight: 220,
      text: longParagraph,
      lineHeight: 25,
    });
    const scrollStart = composeRouteSource.indexOf('<ScrollView');
    const scrollEnd = composeRouteSource.indexOf('</ScrollView>', scrollStart);
    const scrollSource = composeRouteSource.slice(scrollStart, scrollEnd);

    expect(bodyPlaceholder).toMatchObject({ type: 'paragraph', text: '', style: 'body' });
    expect(scrollSource).not.toContain('flexGrow: 1');
    expect(scrollSource).not.toMatch(/<View\s+style=\{\{\s*flex:\s*1/);
    expect(editorSource).toContain('height: measuredInputHeights[block.id] ?? lineHeight');
    expect(editorSource).toContain('scrollEnabled={false}');
    expect(longParagraphHeight).toBe(220);
    expect(longParagraphHeight).toBeGreaterThan(25);
  });

  test('adds only the measured docked-keyboard overlap to the scrollable bottom space', () => {
    const viewport = { x: 0, y: 96, width: 390, height: 714 };

    expect(getDockedKeyboardViewportOverlap({
      viewport,
      keyboard: { x: 0, y: 500, width: 390, height: 344 },
    })).toBe(310);
    expect(getDockedKeyboardViewportOverlap({
      viewport,
      keyboard: { x: 0, y: 844, width: 390, height: 0 },
    })).toBe(0);
    expect(getDockedKeyboardViewportOverlap({
      viewport,
      keyboard: { x: 45, y: 500, width: 300, height: 260 },
    })).toBe(0);
    expect(getDockedKeyboardViewportOverlap({
      viewport,
      keyboard: { x: 0, y: 760, width: 390, height: 40 },
    })).toBe(0);

    expect(composeRouteSource).toContain("Keyboard.addListener('keyboardWillChangeFrame'");
    expect(composeRouteSource).toContain('Keyboard.scheduleLayoutAnimation(event)');
    expect(composeRouteSource).toContain('viewport.measureInWindow');
    expect(composeRouteSource).toContain('IOS_RICH_NOTE_KEYBOARD_TOOLBAR_RESERVED_SPACE + keyboardViewportOverlap');
    expect(composeRouteSource).toContain('automaticallyAdjustKeyboardInsets={false}');
    expect(composeRouteSource).toContain("contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : undefined}");
  });

  test('distinguishes taps on rendered text lines from whitespace without changing TextInput layout', () => {
    const checklistStart = editorSource.indexOf('const renderChecklist');
    const checklistEnd = editorSource.indexOf('const renderInlineLinkComposer', checklistStart);
    const checklistSource = editorSource.slice(checklistStart, checklistEnd);

    const geometry = { availableWidth: 320, containerHeight: 48, lineHeight: 24, lines: [{ width: 42, height: 24 }, { width: 116.4, height: 24 }] };
    expect(isTouchWithinRichNoteTextLine({ ...geometry, x: 30, y: 12 })).toBe(true);
    expect(isTouchWithinRichNoteTextLine({ ...geometry, x: 80, y: 12 })).toBe(false);
    expect(isTouchWithinRichNoteTextLine({ ...geometry, x: 80, y: 36 })).toBe(true);
    expect(isTouchWithinRichNoteTextLine({ ...geometry, x: 80, y: 58 })).toBe(false);
    expect(isTouchWithinRichNoteTextLine({ ...geometry, lines: [{ width: 0, height: 24 }], x: 40, y: 12 })).toBe(true);
    expect(isTouchWithinRichNoteTextLine({ ...geometry, lines: [{ width: 0, height: 24 }], x: 60, y: 12 })).toBe(false);
    expect(isTouchWithinRichNoteTextLine({ availableWidth: 320, containerHeight: 86, lineHeight: 24, lines: [{ width: 90, height: 43 }, { width: 72, height: 43 }], x: 75, y: 66 })).toBe(true);
    expect(isTouchWithinRichNoteTextLine({ ...geometry, x: Number.NaN, y: 12 })).toBe(false);
    expect(editorSource).toContain('inputTextLinesRef.current.set(inputId, lines)');
    expect(editorSource).toContain('onTextLayout={(event) => measureInputTextLines(block.id, event.nativeEvent.lines.map((line) => ({ width: line.width, height: line.height })))}');
    expect(editorSource).toContain('onTextLayout={(event) => measureInputTextLines(item.id, event.nativeEvent.lines.map((line) => ({ width: line.width, height: line.height })))}');
    expect(editorSource).toContain('x: event.nativeEvent.locationX');
    expect(editorSource).toContain('y: event.nativeEvent.locationY');
    expect(editorSource).toContain('flex: 1,\n              height: measuredInputHeights[block.id]');
    expect(checklistSource).toContain('flex: 1, height: measuredInputHeights[item.id]');
    expect(checklistSource).toContain("{item.text || 'Item da checklist'}");
    expect(editorSource).toContain('keyboardWasVisible: Keyboard.isVisible()');
    expect(editorSource).toContain("if (touch.keyboardWasVisible) editorRef.current?.dismissKeyboard()");
    expect(editorSource).toContain("else editorRef.current?.handleToolbarAction('focusAtEnd')");
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
    expect(editorSource).toContain('onSubmitEditing={() => submitChecklistItem(block.id, item.id)}');
    expect(editorSource).toContain('onPress={() => toggleChecklistItem(block.id, item.id)}');
    expect(librarySource).toContain('encodePersistedRichNote');
    expect(librarySource).toContain('UPDATE saved_content SET text_content = ?');
  });

  test('keeps the checklist checkbox inside a finite native context-menu trigger', () => {
    const checklistStart = editorSource.indexOf('const renderChecklist');
    const checklistEnd = editorSource.indexOf('const renderInlineLinkComposer', checklistStart);
    const checklistSource = editorSource.slice(checklistStart, checklistEnd);

    expect(checklistSource).toContain('matchContents={{ vertical: true }}');
    expect(checklistSource).toContain('triggerContentWidth={RICH_NOTE_CHECKLIST_CONTROL_WIDTH}');
    expect(editorSource).toContain('const RICH_NOTE_CHECKLIST_CONTROL_WIDTH = 44');
    expect(checklistSource).toContain('width: RICH_NOTE_CHECKLIST_CONTROL_WIDTH');
    expect(checklistSource).toContain("alignItems: 'center', justifyContent: 'center', minHeight: theme.sizes.touchTargetMinimum");
    expect(checklistSource).not.toContain('hitSlop={4}');
    expect(checklistSource).toContain('<ChecklistCheckboxIndicator isCompleted={item.checked} />');
    expect(checklistSource).toContain('accessibilityRole="checkbox"');
  });

  test('bounds transient keyboard viewport heights for 1, 2, 5, and 10 checklist rows', () => {
    for (const rowCount of [1, 2, 5, 10]) {
      const heights = Array.from({ length: rowCount }, (_, index) => getBoundedChecklistTaskInputHeight({
        availableWidth: 280,
        fontSize: 17,
        lineHeight: 24,
        measuredHeight: 1800,
        minimumHeight: 44,
        text: `Tarefa ${index + 1}`,
        verticalPadding: 16,
      }));

      expect(heights).toEqual(Array(rowCount).fill(44));
      expect(heights.reduce((total, height) => total + height, 2 * Math.max(0, rowCount - 1)))
        .toBe(rowCount * 44 + 2 * Math.max(0, rowCount - 1));
    }

    const longMultiline = `${'Detalhe de tarefa longa '.repeat(10)}\n\n${'Continuação da tarefa '.repeat(8)}`;
    const boundedHeight = getBoundedChecklistTaskInputHeight({
      availableWidth: 150,
      fontSize: 20,
      lineHeight: 28,
      measuredHeight: 1800,
      minimumHeight: 72,
      text: longMultiline,
      verticalPadding: 16,
    });

    expect(boundedHeight).toBeGreaterThan(72);
    expect(boundedHeight).toBeLessThan(1800);
  });

  test('limits checklist height by text width and advances once per Return action', () => {
    const checklistStart = editorSource.indexOf('const renderChecklist');
    const checklistEnd = editorSource.indexOf('const renderInlineLinkComposer', checklistStart);
    const checklistSource = editorSource.slice(checklistStart, checklistEnd);
    const longText = 'Uma descrição de tarefa com muitas palavras. '.repeat(12);
    const narrowHeight = getBoundedChecklistTaskInputHeight({
      availableWidth: 150, fontSize: 17, lineHeight: 24, measuredHeight: 1200, text: longText, verticalPadding: 16,
    });
    const wideHeight = getBoundedChecklistTaskInputHeight({
      availableWidth: 300, fontSize: 17, lineHeight: 24, measuredHeight: 1200, text: longText, verticalPadding: 16,
    });

    expect(editorSource).toContain('measureChecklistInput(item.id, event.nativeEvent.contentSize.height, item.text)');
    expect(editorSource).toContain('editorContentWidth - RICH_NOTE_CHECKLIST_CONTROL_WIDTH');
    expect(editorSource).toContain('submittedChecklistItemRef.current === itemId');
    expect(checklistSource).toContain('onSubmitEditing={() => submitChecklistItem(block.id, item.id)}');
    expect(checklistSource).toContain('submitBehavior="submit"');
    expect(checklistSource).not.toContain('onSubmitEditing={() => addChecklistItem(block.id, item.id)}');
    expect(narrowHeight).toBeGreaterThan(wideHeight);
    expect(wideHeight).toBeGreaterThanOrEqual(44);
  });

  test('keeps full-width Unicode, emoji, explicit blank lines, and scaled text within the measured-height bound', () => {
    const wideLatinHeight = getBoundedChecklistTaskInputHeight({
      availableWidth: 170, fontSize: 17, lineHeight: 24, measuredHeight: 1800,
      minimumHeight: 44, text: 'W'.repeat(12), verticalPadding: 16,
    });
    const fullWidthHeight = getBoundedChecklistTaskInputHeight({
      availableWidth: 170, fontSize: 17, lineHeight: 24, measuredHeight: 1800,
      minimumHeight: 44, text: '漢'.repeat(12), verticalPadding: 16,
    });
    const emojiHeight = getBoundedChecklistTaskInputHeight({
      availableWidth: 170, fontSize: 17, lineHeight: 24, measuredHeight: 1800,
      minimumHeight: 44, text: '😀'.repeat(6), verticalPadding: 16,
    });
    const explicitLinesHeight = getBoundedChecklistTaskInputHeight({
      availableWidth: 1000, fontSize: 17, lineHeight: 24, measuredHeight: 1800,
      minimumHeight: 44, text: 'linha 1\n\nlinha 3', verticalPadding: 16,
    });
    const scaledTextHeight = getBoundedChecklistTaskInputHeight({
      availableWidth: 220, fontSize: 34, lineHeight: 44, measuredHeight: 1800,
      minimumHeight: 60, text: '漢'.repeat(20), verticalPadding: 16,
    });

    expect(wideLatinHeight).toBe(64);
    expect(fullWidthHeight).toBe(64);
    expect(emojiHeight).toBe(64);
    expect(explicitLinesHeight).toBe(88);
    expect(scaledTextHeight).toBeGreaterThanOrEqual(60);
    expect(scaledTextHeight).toBeLessThan(1800);
  });

  test('keeps bullet and numbered markers visible and tied to paragraph formatting actions', () => {
    expect(toolbarSource).toContain('action: "format.bullet"');
    expect(toolbarSource).toContain('action: "format.numbered"');
    expect(editorSource).toContain("case 'format.bullet': applyParagraphUpdate({ listStyle: 'bullet' }); break;");
    expect(editorSource).toContain("case 'format.numbered': applyParagraphUpdate({ listStyle: 'numbered' }); break;");
    expect(editorSource).toContain("block.listStyle === 'bullet' ? '•'");
    expect(editorSource).toContain("block.listStyle === 'numbered' ? `${listNumber(document.blocks, block.id)}.`");
    expect(editorSource).toContain("const placeholder = block.id === bodyPlaceholderBlockId ? 'Comece a escrever...' : undefined;");
    expect(editorSource).toContain('placeholder={placeholder}');
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
