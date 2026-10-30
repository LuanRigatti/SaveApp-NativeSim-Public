/* global describe, expect, test, __dirname */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const readSource = (path) => readFileSync(join(__dirname, path), 'utf8');
const composerSource = readSource('../src/components/homeContent/HomeContentComposer.tsx');
const linkSavingSource = readSource('../src/components/homeContent/HomeContentComposerLinkSavingSwiftUI.ios.tsx');
const controllerSource = readSource('../src/components/homeContent/HomeContentComposerController.ts');
const composeRouteSource = readSource('../src/app/texts/compose.tsx');
const detailRouteSource = readSource('../src/app/texts/[id].tsx');
const editorSource = readSource('../src/components/homeContent/RichNoteEditor.tsx');
const richNoteDocumentSource = readSource('../src/features/home-content/richNoteDocument.ts');
const toolbarSource = readSource('../src/components/homeContent/RichNoteKeyboardToolbar.ios.tsx');
const toolbarNativeSource = readSource('../modules/rich-note-keyboard-toolbar/ios/SaveAppRichNoteKeyboardToolbarModule.swift');
const librarySource = readSource('../src/features/home-content/savedContentLibrary.ts');
const catalogSource = readSource('../src/features/home-content/savedContentCatalog.ts');
const rootLayoutSource = readSource('../src/app/_layout.tsx');
const tabsLayoutSource = readSource('../src/app/(tabs)/_layout.tsx');
const homeSource = readSource('../src/app/(tabs)/index.tsx');

describe('home link composer and shared rich text editor contract', () => {
  test('keeps the UIKit link prompt and its existing retry flow', () => {
    expect(composerSource).toMatch(/kind === 'link' && Platform\.OS === 'ios'/);
    expect(composerSource).toMatch(/Alert\.prompt\(/);
    expect(composerSource).toMatch(/'Adicionar link'/);
    expect(composerSource).toMatch(/submitLinkFromNativePrompt/);
    expect(composerSource).toMatch(/'Tentar novamente'/);
    expect(composerSource).toMatch(/HomeContentComposerLinkSavingSwiftUI\.ios/);
    expect(composerSource).not.toMatch(/kind === 'text'/);
  });

  test('opens the same shared rich editor for creation and saved-note editing', () => {
    expect(composeRouteSource).toContain('<RichNoteEditor');
    expect(detailRouteSource).toContain('<RichNoteEditor');
    expect(composeRouteSource).toContain('createEmptyRichNoteDocument');
    expect(detailRouteSource).toContain('savedText.richDocument');
    expect(composeRouteSource).not.toContain('HomeContentComposerSwiftUI.ios');
    expect(detailRouteSource).not.toMatch(/<TextInput/);
  });

  test('renders the creation title only as the first editable document block', () => {
    expect(composeRouteSource).not.toMatch(/>\s*Adicionar texto\s*</);
    expect(composeRouteSource).toContain('<RichNoteEditor');
    expect(richNoteDocumentSource).toContain("createRichNoteParagraph('Adicionar texto'");
    expect(richNoteDocumentSource).toContain("role: 'document-title'");
    expect(editorSource).toContain('accessibilityLabel={block.style === \'title\' ? `Título do parágrafo ${index + 1}` : `Parágrafo ${index + 1}`}');
    expect(editorSource).toContain("const placeholder = block.id === bodyPlaceholderBlockId ? 'Comece a escrever...' : undefined;");
    expect(editorSource).toContain('placeholder={placeholder}');
    expect(composeRouteSource).toContain('const [hasDraft, setHasDraft] = useState(false)');
  });

  test('keeps the existing root Native Stack card, transition focus, and discard protection', () => {
    expect(tabsLayoutSource).toMatch(/<NativeTabs\s+hidden=\{Platform\.OS === 'ios'\}[\s\S]*?<NativeTabs\.Trigger name="settings"/);
    expect(homeSource).toMatch(/router\.push\(TEXT_COMPOSER_ROUTE\)/);
    expect(rootLayoutSource).toMatch(/<Stack\.Screen[\s\S]*?name="texts\/compose"[\s\S]*?presentation: 'card'/);
    expect(rootLayoutSource).toMatch(/name="\(tabs\)"/);
    expect(composeRouteSource).toMatch(/navigation\.addListener\('transitionEnd'/);
    expect(composeRouteSource).toMatch(/shouldFocusTextComposerAfterTransitionEnd/);
    expect(composeRouteSource).toMatch(/setShouldFocusInput\(true\)[\s\S]*?<RichNoteEditor[\s\S]*?initialFocus=\{shouldFocusInput\}/);
    expect(composeRouteSource).toMatch(/usePreventRemove\(shouldPreventRemoval/);
    expect(composeRouteSource).toMatch(/Alert\.alert\('Descartar rascunho\?'/);
    expect(composeRouteSource).toMatch(/disableRemovalPrevention\(\)[\s\S]*?router\.back\(\)/);
  });

  test('uses the native iOS header save action and keeps a fallback only off iOS', () => {
    const routeOptions = composeRouteSource.match(/const screenOptions = useMemo\(\(\) => \(\{([\s\S]*?)\n  \}\),/)?.[1] ?? '';
    const rootComposeOptions = rootLayoutSource.match(/name="texts\/compose"[\s\S]*?options=\{\{([\s\S]*?)\}\}\s*\/>/)?.[1] ?? '';

    expect(composeRouteSource).toMatch(/<Stack\.Toolbar placement="right">[\s\S]*?<Stack\.Toolbar\.Button[\s\S]*?disabled=\{isSaving \|\| !hasDraft\}[\s\S]*?onPress=\{\(\) => void onSave\(\)\}[\s\S]*?<Stack\.Toolbar\.Label>\{saveLabel\}<\/Stack\.Toolbar\.Label>[\s\S]*?<\/Stack\.Toolbar\.Button>[\s\S]*?<\/Stack\.Toolbar>/);
    expect(composeRouteSource).toContain('separateBackground={false}');
    expect(composeRouteSource).toMatch(/const onSave = useCallback\(async \(\) => \{[\s\S]*?submit\(encodeRichNoteDraft\(document\)\)[\s\S]*?disableRemovalPrevention\(\)[\s\S]*?router\.back\(\)/);
    expect(routeOptions).toContain("headerTransparent: Platform.OS === 'ios'");
    expect(routeOptions).not.toContain('headerStyle');
    expect(rootComposeOptions).toContain("headerTransparent: Platform.OS === 'ios'");
    expect(rootComposeOptions).not.toContain('headerStyle');
    expect(composeRouteSource).toContain("contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : undefined}");
    expect(composeRouteSource).toContain('automaticallyAdjustKeyboardInsets={false}');
    expect(composeRouteSource).not.toContain('automaticallyAdjustContentInsets');
    expect(composeRouteSource).toContain("<SafeAreaView edges={['bottom']}");
    expect(composeRouteSource).toContain('paddingTop: theme.spacing.lg');
    expect(composeRouteSource).toContain('const IOS_RICH_NOTE_KEYBOARD_TOOLBAR_RESERVED_SPACE = 56 + 8');
    expect(composeRouteSource).toContain("paddingBottom: Platform.OS === 'ios' ? IOS_RICH_NOTE_KEYBOARD_TOOLBAR_RESERVED_SPACE + keyboardViewportOverlap : 76");
    expect(composeRouteSource).toMatch(/Platform\.OS !== 'ios' \? \([\s\S]*?<NativeButton[\s\S]*?\) : null/);
    expect(composeRouteSource).not.toMatch(/Platform\.OS === 'ios'[\s\S]{0,500}<NativeButton/);
  });

  test('mounts one native toolbar continuously and anchors it to UIKit keyboard geometry', () => {
    expect(editorSource).not.toMatch(/InputAccessoryView|inputAccessoryViewID|ACCESSORY_ID/);
    expect(toolbarSource).toContain("requireNativeViewManager<NativeToolbarProps>(moduleName, 'Dock')");
    expect(toolbarNativeSource).toContain('ViewName("Dock")');
    expect(toolbarNativeSource).not.toMatch(/^\s+Name\("Dock"\)$/m);
    expect(toolbarNativeSource).not.toContain('usesBottomSafeArea = true');
    expect(toolbarNativeSource).toContain('parentView.keyboardLayoutGuide.followsUndockedKeyboard = true');
    expect(toolbarNativeSource).toContain('parentView.keyboardLayoutGuide.topAnchor');
    expect(toolbarNativeSource).toContain('host.view.bottomAnchor.constraint(equalTo: parentView.keyboardLayoutGuide.topAnchor, constant: -8)');
    expect(toolbarNativeSource).toContain('host.view.isHidden = !isActive');
    expect(toolbarNativeSource).toContain('.fill(.regularMaterial)');
    expect(toolbarNativeSource).toContain('.glassEffect(.regular.interactive(), in: Capsule())');
    expect(toolbarNativeSource).toContain('if #available(iOS 26.0, *)');
    expect(toolbarNativeSource).toContain('.frame(width: controlSize, height: controlSize)');
    expect(toolbarNativeSource.match(/toolbarButton\("/g)).toHaveLength(4);
    for (const label of ['Formatação', 'Inserir checklist', 'Inserir imagem', 'Inserir link', 'Mais opções']) {
      expect(toolbarNativeSource).toContain(`label: "${label}"`);
    }
    expect(toolbarNativeSource).toContain('label: model.keyboardVisible ? "Recolher teclado" : "Mostrar teclado"');
    for (const action of [
      'format.body',
      'format.title',
      'format.subtitle',
      'format.bold',
      'format.italic',
      'format.underline',
      'format.bullet',
      'format.numbered',
      'insertChecklist',
      'insertImage',
      'insertLink',
      'toggleKeyboard',
      'undo',
    ]) {
      expect(toolbarNativeSource).toContain(action);
      expect(editorSource).toContain(action);
    }
    for (const formatting of ['Texto normal', 'Título', 'Subtítulo', 'Negrito', 'Itálico', 'Sublinhado', 'Lista com marcadores', 'Lista numerada']) {
      expect(toolbarNativeSource).toContain(formatting);
    }
    expect(composeRouteSource).toMatch(/<RichNoteKeyboardToolbar[\s\S]*?active=\{isFocused && !auxiliaryPresentationVisible\}/);
    expect(detailRouteSource).toMatch(/<RichNoteKeyboardToolbar[\s\S]*?active=\{isFocused && !auxiliaryPresentationVisible && savedText != null && document != null\}/);
    expect(composeRouteSource).not.toContain('<KeyboardAvoidingView');
    expect(detailRouteSource).not.toContain('<KeyboardAvoidingView');
    expect(composeRouteSource).not.toContain('keyboardVisible');
    expect(detailRouteSource).not.toContain('keyboardVisible');
    expect(composeRouteSource).toContain('automaticallyAdjustKeyboardInsets={false}');
    expect(detailRouteSource).toContain('automaticallyAdjustKeyboardInsets: Platform.OS === \'ios\'');
    expect(composeRouteSource.indexOf('</ScrollView>')).toBeLessThan(composeRouteSource.indexOf('<RichNoteKeyboardToolbar'));
    expect(detailRouteSource.indexOf('</ProgressiveCollapsibleScreen>')).toBeLessThan(detailRouteSource.indexOf('<RichNoteKeyboardToolbar'));
    const keyboardObserver = toolbarNativeSource.match(/private func observeKeyboard\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
    expect(keyboardObserver).toContain('keyboardWillShowNotification');
    expect(keyboardObserver).toContain('model.keyboardVisible = true');
    expect(keyboardObserver).toContain('keyboardWillHideNotification');
    expect(keyboardObserver).toContain('model.keyboardVisible = false');
    expect(keyboardObserver).not.toMatch(/layoutIfNeeded|setNeedsLayout|NSLayoutConstraint|\.constant\s*=|\.frame\s*=/);
    expect(toolbarNativeSource).not.toMatch(/keyboardDidShow|keyboardDidHide/);
  });

  test('keeps the automatic header inset and measures keyboard overlap for scrollable content', () => {
    const scrollStart = composeRouteSource.indexOf('<ScrollView');
    const scrollEnd = composeRouteSource.indexOf('</ScrollView>', scrollStart);
    const scrollSource = composeRouteSource.slice(scrollStart, scrollEnd);

    expect(scrollSource).toContain("contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : undefined}");
    expect(scrollSource).toContain('automaticallyAdjustKeyboardInsets={false}');
    expect(composeRouteSource).toContain("Keyboard.addListener('keyboardWillChangeFrame'");
    expect(composeRouteSource).toContain('Keyboard.scheduleLayoutAnimation(event)');
    expect(composeRouteSource).toContain('viewport.measureInWindow');
    expect(composeRouteSource).toContain('IOS_RICH_NOTE_KEYBOARD_TOOLBAR_RESERVED_SPACE + keyboardViewportOverlap');
    expect(composeRouteSource).toContain('initialFocus={shouldFocusInput}');
    expect(scrollSource).not.toContain('flexGrow: 1');
    expect(scrollSource).not.toMatch(/<View\s+style=\{\{\s*flex:\s*1/);
    expect(scrollSource).not.toMatch(/contentInset=|contentOffset=|scrollTo(?:End)?\s*\(/);
    expect(composeRouteSource).toContain("<SafeAreaView edges={['bottom']}");
    expect(composeRouteSource).not.toContain('<KeyboardAvoidingView');
    expect(composeRouteSource).toContain("Keyboard.addListener('keyboardWillChangeFrame'");
    expect(composeRouteSource).toContain('Keyboard.scheduleLayoutAnimation(event)');
    expect(editorSource).toContain('<View onLayout={handleEditorLayout} style={{ width: \'100%\' }}>');
    expect(editorSource).not.toContain('style={{ flexGrow: 1, width: \'100%\' }}');
  });

  test('blank taps toggle the keyboard while drags and interactive editor touches are ignored', () => {
    const hookStart = editorSource.indexOf('export function useRichNoteKeyboardInteractions');
    const hookSource = editorSource.slice(hookStart);

    expect(composeRouteSource).toContain('onTouchStartCapture={pageTouches.onTouchStartCapture}');
    expect(composeRouteSource).toContain('onTouchMove={pageTouches.onTouchMove}');
    expect(composeRouteSource).toContain('onTouchEnd={pageTouches.onTouchEnd}');
    expect(hookSource).toContain('touch.moved = true');
    expect(hookSource).toContain('touchRef.current.touchedInteractive = true');
    expect(hookSource).toContain('if (!touch || touch.moved || touch.touchedInteractive) return;');
    expect(hookSource).toContain('keyboardWasVisible: Keyboard.isVisible()');
    expect(hookSource).toContain("if (touch.keyboardWasVisible) editorRef.current?.dismissKeyboard()");
    expect(hookSource).toContain("else editorRef.current?.handleToolbarAction('focusAtEnd')");
  });

  test('lets long paragraphs and checklist tasks expand in the editor scroll view', () => {
    expect(editorSource).toMatch(/onContentSizeChange=\{\(event\) => measureInput\(block\.id, event\.nativeEvent\.contentSize\.height, lineHeight, lineHeight, 0, block\.text\)\}[\s\S]*?scrollEnabled=\{false\}[\s\S]*?value=\{block\.text\}/);
    expect(editorSource).toMatch(/onContentSizeChange=\{\(event\) => measureChecklistInput\(item\.id, event\.nativeEvent\.contentSize\.height, item\.text\)\}[\s\S]*?scrollEnabled=\{false\}[\s\S]*?value=\{item\.text\}/);
    expect(editorSource).toContain('preserveExplicitLines(block.id, text, lineHeight)');
    expect(editorSource).toContain('getBoundedChecklistTaskInputHeight');
  });

  test('inserts local multiple images and safe asynchronous link previews at the active position', () => {
    expect(editorSource).toContain("mediaTypes: ['images']");
    expect(editorSource).toContain('allowsMultipleSelection: replaceBlockId == null');
    expect(editorSource).toContain('orderedSelection: true');
    expect(editorSource).toContain('getLinkPreview(url, controller.signal)');
    expect(editorSource).toMatch(/if \(nextPresentation === 'preview'\) requestPreviewMetadata\(block\.id, block\.url\)/);
    expect(editorSource).toContain('attemptedPreviewUrlsRef');
    expect(librarySource).toContain('materializeRichNoteAssets');
    expect(editorSource).toContain('normalizeWebLink(linkURL)');
    expect(editorSource).toContain('insertAtAnchor([block], linkComposer.anchor, false)');
    expect(editorSource).toContain('renderInlineLinkComposer');
    expect(editorSource).toContain("(['preview', 'text'] as const)");
    expect(editorSource).not.toMatch(/<BottomSheet|<TextField|presentationDetents/);
    expect(editorSource).toContain('<NativeCardContextMenu');
    expect(editorSource).not.toContain('<Modal');
    expect(editorSource).toContain('onError={() => setFailedPreviewIds');
    expect(editorSource).toContain('confirmSavedLinkOpen');
  });

  test('preserves the existing SQLite row and exposes plain text to Home for rich notes', () => {
    expect(librarySource).toContain('UPDATE saved_content SET text_content = ?');
    expect(librarySource).toContain('withExclusiveTransactionAsync');
    expect(librarySource).not.toMatch(/CREATE TABLE.*rich_note/s);
    expect(librarySource).toContain('encodePersistedRichNote');
    expect(librarySource).toContain('materializeRichNoteAssets');
    expect(librarySource).toContain('cleanupOrphanedRichNoteAssets');
    expect(catalogSource).toContain('getRichNotePlainText(parsedNote.document)');
    expect(detailRouteSource).toContain('createTextAutoSaveController');
    expect(detailRouteSource).toContain('controller.flush()');
    expect(controllerSource).toContain('saveText(text, controller.signal)');
  });

  test('keeps the non-blocking native link progress feedback', () => {
    expect(linkSavingSource).toMatch(/<Host[\s\S]*?matchContents=\{false\}/);
    expect(linkSavingSource).toMatch(/pointerEvents="none"/);
    expect(linkSavingSource).toMatch(/<ProgressView/);
    expect(linkSavingSource).toMatch(/material: 'regular'/);
    expect(linkSavingSource).not.toMatch(/Rectangle|Modal|Alert|NavigationStack/);
  });
});
