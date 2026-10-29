import { Stack, useLocalSearchParams, useNavigation, usePreventRemove } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Keyboard,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';

import { RichNoteEditor, useRichNoteKeyboardInteractions, type RichNoteEditorHandle } from '@/components/homeContent/RichNoteEditor';
import { RichNoteKeyboardToolbar } from '@/components/homeContent/RichNoteKeyboardToolbar';
import { ProgressiveCollapsibleScreen } from '@/components/premium';
import { HomeFolderAuthorizationPrompt } from '@/features/home-folders/HomeFolderAuthorizationPrompt';
import { useHomeFolderItemAuthorization } from '@/features/home-folders/useHomeFolderAuthorization';
import { useLocalSavedContent } from '@/features/home-content/LocalSavedContentProvider';
import type { TextAutoSaveController, TextAutoSaveState } from '@/features/home-content/textAutoSave';
import { createTextAutoSaveController } from '@/features/home-content/textAutoSave';
import type { SavedText } from '@/features/home-content/homeContentTypes';
import { encodeRichNoteDraft, type RichNoteDocument } from '@/features/home-content/richNoteDocument';
import { useAppSafeAreaInsets } from '@/providers';
import { useAppTheme } from '@/theme';

export default function SavedTextScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = useMemo(() => {
    const parsed = Number(Array.isArray(rawId) ? rawId[0] : rawId);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }, [rawId]);
  const authorization = useHomeFolderItemAuthorization('text', id);

  return (
    <>
      <Stack.Screen options={{ headerShadowVisible: false, headerTitle: '', headerTransparent: true }} />
      {authorization.isAuthorized ? <SavedTextContent id={id} /> : <HomeFolderAuthorizationPrompt authorization={authorization} />}
    </>
  );
}

function SavedTextContent({ id }: { id: number | null }) {
  const navigation = useNavigation();
  const { getText, updateText } = useLocalSavedContent();
  const { resolvedMode, theme } = useAppTheme();
  const insets = useAppSafeAreaInsets();
  const [loadedText, setLoadedText] = useState<{ id: number; value: SavedText | null } | null>(null);
  const [documentRecord, setDocumentRecord] = useState<{ id: number; value: RichNoteDocument } | null>(null);
  const [saveStateRecord, setSaveStateRecord] = useState<{ id: number; value: TextAutoSaveState } | null>(null);
  const saveControllerRef = useRef<TextAutoSaveController | null>(null);
  const editorRef = useRef<RichNoteEditorHandle>(null);
  const [isFocused, setIsFocused] = useState(navigation.isFocused());
  const [auxiliaryPresentationVisible, setAuxiliaryPresentationVisible] = useState(false);
  const navigationFlushRef = useRef(false);
  const latestDraftRef = useRef<string | null>(null);
  const pageTouches = useRichNoteKeyboardInteractions(editorRef);
  const savedText = id != null && loadedText?.id === id ? loadedText.value : null;
  const isLoading = id != null && loadedText?.id !== id;
  const document = savedText
    ? documentRecord?.id === savedText.id ? documentRecord.value : savedText.richDocument
    : null;
  const saveState = id != null && saveStateRecord?.id === id ? saveStateRecord.value : 'idle';
  const hasUnsavedChanges = saveState === 'pending' || saveState === 'saving' || saveState === 'error';

  useEffect(() => {
    const focus = navigation.addListener('focus', () => setIsFocused(true));
    const blur = navigation.addListener('blur', () => setIsFocused(false));
    return () => {
      focus();
      blur();
    };
  }, [navigation]);

  useEffect(() => {
    let isActive = true;
    if (id == null) return () => { isActive = false; };
    void getText(id).then((result) => {
      if (!isActive) return;
      setLoadedText({ id, value: result });
      latestDraftRef.current = result?.storageText ?? null;
      setDocumentRecord(result ? { id, value: result.richDocument } : null);
    });
    return () => { isActive = false; };
  }, [getText, id]);

  useEffect(() => {
    if (id == null || savedText?.id !== id) return;
    let isActive = true;
    const controller = createTextAutoSaveController({
      initialText: savedText.storageText,
      onStateChange: (value) => { if (isActive) setSaveStateRecord({ id, value }); },
      save: async (value) => {
        const updated = await updateText(id, value);
        if (latestDraftRef.current === value && isActive) {
          latestDraftRef.current = updated.storageText;
          setDocumentRecord({ id, value: updated.richDocument });
        }
      },
    });
    saveControllerRef.current = controller;
    return () => {
      isActive = false;
      if (saveControllerRef.current === controller) saveControllerRef.current = null;
      void controller.dispose().catch(() => undefined);
    };
  }, [id, savedText?.id, savedText?.storageText, updateText]);

  const onPreventedRemoval = useCallback(({ repeat }: { repeat: () => void }) => {
    if (navigationFlushRef.current) return;
    const controller = saveControllerRef.current;
    if (!controller) {
      repeat();
      return;
    }
    navigationFlushRef.current = true;
    void controller.flush().then(
      () => { navigationFlushRef.current = false; repeat(); },
      () => { navigationFlushRef.current = false; },
    );
  }, []);
  usePreventRemove(hasUnsavedChanges, onPreventedRemoval);

  const flushEdits = useCallback(() => {
    void saveControllerRef.current?.flush().catch(() => undefined);
  }, []);

  useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flushEdits();
    });
    const keyboard = Keyboard.addListener('keyboardDidHide', flushEdits);
    return () => {
      appState.remove();
      keyboard.remove();
    };
  }, [flushEdits]);

  const handleChange = useCallback((next: RichNoteDocument) => {
    if (id == null || !savedText) return;
    setDocumentRecord({ id, value: next });
    const serialized = encodeRichNoteDraft(next);
    latestDraftRef.current = serialized;
    saveControllerRef.current?.schedule(serialized);
  }, [id, savedText]);

  return (
      <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
        <View
          onTouchEnd={pageTouches.onTouchEnd}
          onTouchMove={pageTouches.onTouchMove}
          onTouchStartCapture={pageTouches.onTouchStartCapture}
          style={{ flex: 1 }}
        >
          <ProgressiveCollapsibleScreen
            compactTitle="Texto"
            contentGap={theme.spacing.md}
            contentTopInset={theme.spacing.xl + theme.spacing.xxl + theme.spacing.xxs * 2 + 2}
            largeTitle={<Text accessibilityRole="header" style={[theme.typography.largeTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.largeTitle.fontSize + 2 }]}>Texto</Text>}
            nativeHeader
            scrollContentContainerStyle={{ paddingBottom: insets.bottom + 76 }}
            scrollViewProps={{ automaticallyAdjustKeyboardInsets: Platform.OS === 'ios', keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : 'on-drag', keyboardShouldPersistTaps: 'handled' }}
          >
            {isLoading ? (
              <View style={{ alignItems: 'center', flexGrow: 1, justifyContent: 'center' }}><ActivityIndicator color={theme.colors.info} /></View>
            ) : savedText && document ? (
              <>
                <RichNoteEditor
                  document={document}
                  onBlur={flushEdits}
                  onChange={handleChange}
                  onAuxiliaryPresentationChange={setAuxiliaryPresentationVisible}
                  onInteractionStart={pageTouches.markInteractiveTouch}
                  ref={editorRef}
                />
                {saveState === 'error' ? (
                  <Pressable
                    accessibilityLabel="Tentar salvar a nota novamente"
                    accessibilityRole="button"
                    onPressIn={pageTouches.markInteractiveTouch}
                    onPress={flushEdits}
                    style={{ alignSelf: 'flex-start', justifyContent: 'center', minHeight: theme.sizes.touchTargetMinimum }}
                  >
                    <Text style={[theme.typography.footnote, { color: theme.colors.danger }]}>Não foi possível salvar. Toque para tentar novamente.</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Este texto não está disponível.</Text>
            )}
          </ProgressiveCollapsibleScreen>
        </View>
        {Platform.OS === 'ios' ? (
          <RichNoteKeyboardToolbar
            active={isFocused && !auxiliaryPresentationVisible && savedText != null && document != null}
            colorScheme={resolvedMode}
            onAction={(action) => editorRef.current?.handleToolbarAction(action)}
          />
        ) : null}
      </View>
  );
}
