/* global afterEach, describe, expect, jest, test */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { createTextAutoSaveController } = require('../src/features/home-content/textAutoSave');
const { savedContentRowToModel } = require('../src/features/home-content/savedContentCatalog');

const detailSource = readFileSync(join(__dirname, '../src/app/texts/[id].tsx'), 'utf8');
const composeSource = readFileSync(join(__dirname, '../src/app/texts/compose.tsx'), 'utf8');
const editorSource = readFileSync(join(__dirname, '../src/components/homeContent/RichNoteEditor.tsx'), 'utf8');
const documentSource = readFileSync(join(__dirname, '../src/features/home-content/richNoteDocument.ts'), 'utf8');
const librarySource = readFileSync(join(__dirname, '../src/features/home-content/savedContentLibrary.ts'), 'utf8');
const providerSource = readFileSync(join(__dirname, '../src/features/home-content/LocalSavedContentProvider.tsx'), 'utf8');

afterEach(() => {
  jest.useRealTimers();
});

describe('saved text inline editing and autosave', () => {
  test('edits the note title as the first rich block and keeps the legacy database value untouched on load', () => {
    expect(detailSource).toContain('withRichNoteEditorTitle(result.richDocument)');
    expect(detailSource).toContain('latestDraftRef.current = result?.storageText ?? null');
    expect(detailSource).toContain('largeTitle={null}');
    expect(detailSource).toContain('compactTitle="Texto"');
    expect(detailSource).toContain('contentGap={0}');
    expect(detailSource).not.toMatch(/largeTitle=\{<Text[\s\S]*?>Texto<\/Text>\}/);
    expect(composeSource).toContain('const [hasDraft, setHasDraft] = useState(false)');
    expect(composeSource).toMatch(/const handleChange = useCallback\([\s\S]*?setHasDraft\(hasRichNoteContent\(next\)\)/);
    expect(documentSource).toContain("role: 'document-title'");
    expect(documentSource).toContain('blocks: [title, createRichNoteParagraph()]');
    expect(editorSource).toContain("placeholder={block.id === bodyPlaceholderBlockId ? 'Comece a escrever...' : undefined}");
    expect(editorSource).toContain('theme.typography.largeTitle.fontSize + 2');
    expect(editorSource).toContain('theme.typography.largeTitle.lineHeight');
    expect(editorSource).toContain("case 'format.body': applyParagraphUpdate({ style: 'body', bold: false");
    expect(editorSource).toContain("case 'format.title': applyParagraphUpdate({ style: 'title', bold: true");
    expect(editorSource).toContain("case 'format.subtitle': applyParagraphUpdate({ style: 'subtitle'");
    expect(editorSource).toContain("case 'undo': undo(); break");
  });

  test('loads legacy and rich text into the shared block editor without opening the keyboard automatically', () => {
    expect(detailSource).toContain('getText(id)');
    expect(detailSource).toMatch(/<RichNoteEditor[\s\S]*?document=\{document\}[\s\S]*?onChange=\{handleChange\}/);
    expect(editorSource).toMatch(/<TextInput[\s\S]*?multiline[\s\S]*?value=\{block\.text\}/);
    expect(editorSource).not.toMatch(/InputAccessoryView|inputAccessoryViewID|ACCESSORY_ID/);
    expect(editorSource).toMatch(/renderParagraph[\s\S]*?<TextInput[\s\S]*?value=\{block\.text\}/);
    expect(editorSource).toContain('accessibilityLabel="Endereço do link"');
    expect(editorSource).toContain('renderInlineLinkComposer');
    expect(editorSource).not.toMatch(/BottomSheet|presentationDetents|TextField/);
    expect(editorSource).toContain('onSelectionChange');
    expect(detailSource).not.toContain('Editar texto');
    expect(detailSource).not.toContain('Salvando…');
    expect(detailSource).toContain("saveState === 'saving'");
  });

  test('debounces changes and stores only the newest multiline version', async () => {
    jest.useFakeTimers();
    const saved = [];
    const controller = createTextAutoSaveController({
      debounceMs: 450,
      initialText: 'texto original',
      onStateChange: () => undefined,
      save: async (text) => { saved.push(text); },
    });

    controller.schedule('rascunho');
    controller.schedule('versão final\ncom segunda linha');
    expect(saved).toEqual([]);

    await jest.advanceTimersByTimeAsync(450);
    await controller.flush();
    expect(saved).toEqual(['versão final\ncom segunda linha']);
    expect(controller.hasPendingChanges()).toBe(false);
    await controller.dispose();
  });

  test('flushes before navigation and a newly opened controller starts from persisted content', async () => {
    const database = { value: 'versão inicial' };
    const save = async (text) => { database.value = text; };
    const firstOpen = createTextAutoSaveController({
      initialText: database.value,
      onStateChange: () => undefined,
      save,
    });

    firstOpen.schedule('editado antes de voltar');
    await firstOpen.flush();
    expect(database.value).toBe('editado antes de voltar');
    expect(detailSource).toContain('usePreventRemove(hasUnsavedChanges, onPreventedRemoval)');
    expect(detailSource).toContain('controller.flush().then(');
    expect(detailSource).toContain('repeat();');

    const reopened = createTextAutoSaveController({
      initialText: database.value,
      onStateChange: () => undefined,
      save,
    });
    expect(reopened.getLatestText()).toBe('editado antes de voltar');
    expect(reopened.hasPendingChanges()).toBe(false);
    await firstOpen.dispose();
    await reopened.dispose();
  });

  test('keeps the complete latest draft after a persistence failure and allows retry', async () => {
    const statuses = [];
    let attempt = 0;
    const persisted = [];
    const controller = createTextAutoSaveController({
      initialText: 'original',
      onStateChange: (state) => statuses.push(state),
      save: async (text) => {
        attempt += 1;
        if (attempt === 1) throw new Error('storage unavailable');
        persisted.push(text);
      },
    });
    const longDraft = 'linha longa com conteúdo '.repeat(150);
    controller.schedule(longDraft);

    await expect(controller.flush()).rejects.toThrow('storage unavailable');
    expect(controller.getLatestText()).toBe(longDraft);
    expect(controller.hasPendingChanges()).toBe(true);
    expect(statuses).toContain('error');

    await controller.flush();
    expect(persisted).toEqual([longDraft]);
    expect(controller.hasPendingChanges()).toBe(false);
    await controller.dispose();
  });

  test('serializes overlapping writes so the final committed version is the latest edit', async () => {
    let releaseFirst;
    let activeWrites = 0;
    let maximumConcurrentWrites = 0;
    let persisted = '';
    const save = jest.fn((text) => new Promise((resolve) => {
      activeWrites += 1;
      maximumConcurrentWrites = Math.max(maximumConcurrentWrites, activeWrites);
      const finish = () => {
        persisted = text;
        activeWrites -= 1;
        resolve();
      };
      if (text === 'primeira edição') releaseFirst = finish;
      else finish();
    }));
    const controller = createTextAutoSaveController({
      initialText: 'original',
      onStateChange: () => undefined,
      save,
    });

    controller.schedule('primeira edição');
    const firstFlush = controller.flush();
    await Promise.resolve();
    await Promise.resolve();
    expect(releaseFirst).toEqual(expect.any(Function));

    controller.schedule('última edição');
    const latestFlush = controller.flush();
    releaseFirst();
    await Promise.all([firstFlush, latestFlush]);

    expect(maximumConcurrentWrites).toBe(1);
    expect(persisted).toBe('última edição');
    expect(save.mock.calls.map(([text]) => text)).toEqual(['primeira edição', 'última edição']);
    await controller.dispose();
  });

  test('persists an empty body and keeps the saved note in the Home catalog', () => {
    const emptyText = savedContentRowToModel({
      id: 42,
      content_type: 'text',
      created_at: 123,
      url: null,
      normalized_url: null,
      title: null,
      description: null,
      domain: null,
      image_url: null,
      favicon_url: null,
      preview_image_relative_path: null,
      preview_image_mime_type: null,
      text_content: '',
    }, {
      isSafePreviewPath: () => true,
      fileExists: () => false,
      uriForPath: () => '',
    });

    expect(emptyText).toMatchObject({ id: 42, contentType: 'text', createdAt: 123, text: '', storageText: '' });
    expect(providerSource).toContain('const updated = await updateSavedText(id, text)');
    expect(providerSource).toMatch(/setContents\(\(current\) => current\.map\([\s\S]*?item\.contentType === 'text' && item\.id === id \? updated : item/);
  });

  test('updates only the original active text row inside an exclusive SQLite transaction', () => {
    const updateStart = librarySource.indexOf('export async function updateSavedText');
    const updateEnd = librarySource.indexOf('export async function deleteSavedHomeContent', updateStart);
    const updateSource = librarySource.slice(updateStart, updateEnd);

    expect(updateSource).toContain('withExclusiveTransactionAsync');
    expect(updateSource).toMatch(/UPDATE saved_content SET text_content = \? WHERE id = \? AND content_type = 'text' AND deleted_at IS NULL/);
    expect(updateSource).toContain('if (result.changes !== 1)');
    expect(updateSource).toContain('SELECT id, created_at, text_content');
    expect(updateSource).not.toContain('INSERT INTO saved_content');
    expect(updateSource).not.toContain('created_at =');
    expect(updateSource).not.toContain('saved_folders');
  });

  test('flushes when the editor blurs, ends editing, or the app leaves the foreground', () => {
    expect(detailSource).toContain('onBlur={flushEdits}');
    expect(detailSource).toContain("if (state !== 'active')");
    expect(detailSource).toContain('automaticallyAdjustKeyboardInsets: Platform.OS === \'ios\'');
    expect(detailSource).toContain("Keyboard.addListener('keyboardDidHide', flushEdits)");
  });

  test('toggles focus from blank page taps without stealing editor taps or scrolls', () => {
    expect(detailSource).toContain('onTouchStartCapture={pageTouches.onTouchStartCapture}');
    expect(detailSource).toContain('onTouchMove={pageTouches.onTouchMove}');
    expect(detailSource).toContain('onTouchEnd={pageTouches.onTouchEnd}');
    expect(editorSource).toContain('touch.touchedInteractive');
    expect(editorSource).toContain('touch.moved');
    expect(editorSource).toContain('focusAtEnd: () => void');
    expect(editorSource).toContain('target.setNativeProps({ selection });');
    expect(editorSource).toContain('Keyboard.isVisible()');
    expect(editorSource).toContain("handleToolbarAction('toggleKeyboard')");
    expect(detailSource).toContain('onInteractionStart={pageTouches.markInteractiveTouch}');
    expect(composeSource).toContain('onInteractionStart={pageTouches.markInteractiveTouch}');
    expect(detailSource).toContain("keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : 'on-drag'");
  });

  test('uses one persistent UIKit-anchored toolbar with undo, monochrome icons, and a keyboard toggle', () => {
    const toolbarSource = readFileSync(join(__dirname, '../modules/rich-note-keyboard-toolbar/ios/SaveAppRichNoteKeyboardToolbarModule.swift'), 'utf8');
    const toolbarComponentSource = readFileSync(join(__dirname, '../src/components/homeContent/RichNoteKeyboardToolbar.ios.tsx'), 'utf8');
    expect(editorSource).not.toMatch(/InputAccessoryView|inputAccessoryViewID|ACCESSORY_ID/);
    expect(toolbarComponentSource).toContain("requireNativeViewManager<NativeToolbarProps>(moduleName, 'Dock')");
    expect(toolbarComponentSource).toContain('requireOptionalNativeModule');
    expect(toolbarComponentSource).toContain('ViewPrototypes?.[`${moduleName}_Dock`]');
    expect(toolbarSource).toContain('keyboardLayoutGuide.topAnchor');
    expect(toolbarSource).toContain('ViewName("Dock")');
    expect(toolbarSource).not.toMatch(/^\s+Name\("Dock"\)$/m);
    expect(toolbarSource).not.toContain('usesBottomSafeArea = true');
    expect(toolbarSource).toContain('followsUndockedKeyboard = true');
    expect(toolbarSource).toContain('toolbarSymbol("textformat"');
    expect(toolbarSource).toContain('toolbarSymbol("ellipsis"');
    expect(toolbarSource).toContain('toolbarButton("arrow.uturn.backward", label: "Desfazer", action: "undo")');
    expect(toolbarSource).toContain('"toggleKeyboard"');
    expect(toolbarSource).toContain('foregroundStyle(iconColor)');
    expect(toolbarSource).toContain('.tint(iconColor)');
    expect(toolbarSource).toContain('widthAnchor.constraint(equalToConstant: 332)');
    for (const symbol of ['checklist', 'photo', 'link']) {
      expect(toolbarSource).toContain(`toolbarButton("${symbol}"`);
    }
    expect(toolbarSource).toContain('Menu {');
    expect(toolbarSource).toContain('if #available(iOS 26.0, *)');
    expect(composeSource).toMatch(/<RichNoteKeyboardToolbar[\s\S]*?active=\{isFocused && !auxiliaryPresentationVisible\}/);
    expect(detailSource).toMatch(/<RichNoteKeyboardToolbar[\s\S]*?active=\{isFocused && !auxiliaryPresentationVisible && savedText != null && document != null\}/);
    expect(composeSource).not.toContain('KeyboardAvoidingView');
    expect(detailSource).not.toContain('KeyboardAvoidingView');
    expect(toolbarSource).toContain('keyboardWillShowNotification');
    expect(toolbarSource).toContain('keyboardWillHideNotification');
    expect(toolbarSource).not.toMatch(/keyboardDidShow|keyboardDidHide/);
    expect(editorSource).toContain('insertChecklist');
    expect(editorSource).toContain('openImagePicker');
    expect(editorSource).toContain('openLinkComposer');
    expect(editorSource).toContain('commitLinkComposer');
    expect(editorSource).toContain('insertAtAnchor([block], linkComposer.anchor, false)');
    expect(editorSource).toContain('scheduleFocus({ kind: \'checklist\', blockId, itemId }');
    expect(editorSource).toContain('submitBehavior="newline"');
    expect(editorSource).toContain('selectionByInputRef.current.set(block.id, event.nativeEvent.selection)');
    expect(editorSource).toContain("case 'undo': undo(); break");
    expect(editorSource).toContain('undoStackRef.current.push(current)');
  });

  test('image picker inserts selected assets into the document and the existing save pipeline materializes them', () => {
    const librarySource = readFileSync(join(__dirname, '../src/features/home-content/savedContentLibrary.ts'), 'utf8');
    expect(editorSource).toContain("mediaTypes: ['images']");
    expect(editorSource).toContain('const images = result.assets.map');
    expect(editorSource).toContain('sourceUri: asset.uri');
    expect(editorSource).toContain('insertAtAnchor(images, insertionAnchor, false)');
    expect(editorSource).toContain("Alert.alert('Não foi possível inserir as imagens'");
    expect(librarySource).toContain('materializeRichNoteAssets(normalized, null)');
    expect(librarySource).toContain('materializeRichNoteAssets(normalized, previousDocument)');
  });

  test('inline link composer offers preview or text and cancels without mutating the note', () => {
    expect(editorSource).toContain("(['preview', 'text'] as const)");
    expect(editorSource).toContain("presentation === 'preview' ? 'Prévia' : 'Link simples'");
    expect(editorSource).toContain('const cancelLinkComposer');
    expect(editorSource).toContain('const commitLinkComposer');
    expect(editorSource).toContain('normalizeWebLink(linkURL)');
    expect(editorSource).toContain('onSubmitEditing={commitLinkComposer}');
    expect(editorSource).toContain('const anchor = currentInsertionAnchor()');
    expect(editorSource).toContain('const before = { ...activeParagraph, text: activeParagraph.text.slice(0, start) }');
    expect(editorSource).toContain('const after = createRichNoteParagraph(activeParagraph.text.slice(end)');
    const cancelStart = editorSource.indexOf('const cancelLinkComposer');
    const cancelEnd = editorSource.indexOf('const applyParagraphUpdate', cancelStart);
    expect(editorSource.slice(cancelStart, cancelEnd)).not.toContain('publishDocument(');
  });
});
