import { Stack, useNavigation, usePreventRemove, useRouter, type NativeStackNavigationProp } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  ScrollView,
  Text,
  View,
  type ViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NativeButton } from '@/components/native';
import { RichNoteEditor, useRichNoteKeyboardInteractions, type RichNoteEditorHandle } from '@/components/homeContent/RichNoteEditor';
import { RichNoteKeyboardToolbar } from '@/components/homeContent/RichNoteKeyboardToolbar';
import { useTextComposerController } from '@/components/homeContent/HomeContentComposerController';
import {
  createEmptyRichNoteDocument,
  encodeRichNoteDraft,
  hasRichNoteContent,
  type RichNoteDocument,
} from '@/features/home-content/richNoteDocument';
import {
  shouldPreventTextComposerRemoval,
  shouldFocusTextComposerAfterTransitionEnd,
} from '@/features/home-content/textComposerNavigation';
import { useAppTheme } from '@/theme';
import { getDockedKeyboardViewportOverlap } from '@/features/home-content/keyboardViewportOverlap';

const IOS_RICH_NOTE_KEYBOARD_TOOLBAR_RESERVED_SPACE = 56 + 8;

export default function ComposeTextScreen() {
  const router = useRouter();
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const { resolvedMode, theme } = useAppTheme();
  const { clearError, errorMessage, isSaving, submit } = useTextComposerController();
  const [document, setDocument] = useState<RichNoteDocument>(createEmptyRichNoteDocument);
  const [hasDraft, setHasDraft] = useState(false);
  const [allowRouteRemoval, setAllowRouteRemoval] = useState(false);
  const [shouldFocusInput, setShouldFocusInput] = useState(false);
  const editorRef = useRef<RichNoteEditorHandle>(null);
  const [isFocused, setIsFocused] = useState(navigation.isFocused());
  const [auxiliaryPresentationVisible, setAuxiliaryPresentationVisible] = useState(false);
  const [keyboardViewportOverlap, setKeyboardViewportOverlap] = useState(0);
  const pageTouches = useRichNoteKeyboardInteractions(editorRef);
  const focusRequestedRef = useRef(false);
  const isMountedRef = useRef(false);
  const pageViewportRef = useRef<ViewInstance | null>(null);
  const keyboardFrameSequenceRef = useRef(0);
  const shouldPreventRemoval = shouldPreventTextComposerRemoval({ allowRouteRemoval, hasDraft, isSaving });

  const onPreventedRemoval = useCallback(({ repeat }: { repeat: () => void }) => {
    if (isSaving) {
      Alert.alert('Salvando texto', 'Aguarde a conclusão para voltar.');
      return;
    }
    Alert.alert('Descartar rascunho?', 'A nota ainda não foi salva.', [
      { text: 'Continuar escrevendo', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: () => {
          setHasDraft(false);
          setAllowRouteRemoval(true);
          repeat();
        },
      },
    ]);
  }, [isSaving]);
  const disableRemovalPrevention = usePreventRemove(shouldPreventRemoval, onPreventedRemoval);

  useEffect(() => {
    const focus = navigation.addListener('focus', () => setIsFocused(true));
    const blur = navigation.addListener('blur', () => setIsFocused(false));
    return () => {
      focus();
      blur();
    };
  }, [navigation]);

  useEffect(() => {
    isMountedRef.current = true;
    const unsubscribe = navigation.addListener('transitionEnd', (event) => {
      if (!shouldFocusTextComposerAfterTransitionEnd({
        alreadyRequested: focusRequestedRef.current,
        closing: event.data.closing,
        isMounted: isMountedRef.current,
      })) return;
      focusRequestedRef.current = true;
      setShouldFocusInput(true);
    });
    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, [navigation]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const subscription = Keyboard.addListener('keyboardWillChangeFrame', (event) => {
      Keyboard.scheduleLayoutAnimation(event);
      const sequence = ++keyboardFrameSequenceRef.current;
      const viewport = pageViewportRef.current;
      if (!viewport) {
        setKeyboardViewportOverlap(0);
        return;
      }

      viewport.measureInWindow((x, y, width, height) => {
        if (sequence !== keyboardFrameSequenceRef.current) return;
        setKeyboardViewportOverlap(Math.round(getDockedKeyboardViewportOverlap({
          viewport: { x, y, width, height },
          keyboard: {
            x: event.endCoordinates.screenX,
            y: event.endCoordinates.screenY,
            width: event.endCoordinates.width,
            height: event.endCoordinates.height,
          },
        })));
      });
    });

    return () => {
      keyboardFrameSequenceRef.current += 1;
      subscription.remove();
    };
  }, []);

  const screenOptions = useMemo(() => ({
    animation: 'default' as const,
    contentStyle: { backgroundColor: theme.colors.background },
    gestureEnabled: !isSaving,
    headerBackTitle: '',
    headerShadowVisible: false,
    headerShown: true,
    headerTintColor: theme.colors.textPrimary,
    headerTitle: '',
    headerTransparent: Platform.OS === 'ios',
    presentation: 'card' as const,
  }), [isSaving, theme.colors.background, theme.colors.textPrimary]);

  const handleChange = useCallback((next: RichNoteDocument) => {
    setDocument(next);
    setHasDraft(hasRichNoteContent(next));
    if (errorMessage) clearError();
  }, [clearError, errorMessage]);

  const onSave = useCallback(async () => {
    const saved = await submit(encodeRichNoteDraft(document));
    if (!saved) return;
    setAllowRouteRemoval(true);
    disableRemovalPrevention();
    router.back();
  }, [disableRemovalPrevention, document, router, submit]);

  const saveLabel = isSaving ? 'Salvando…' : 'Adicionar';

  return (
    <>
      <Stack.Screen options={screenOptions}>
        <Stack.Screen.BackButton displayMode="minimal" />
      </Stack.Screen>
      {Platform.OS === 'ios' ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            accessibilityLabel={saveLabel}
            disabled={isSaving || !hasDraft}
            onPress={() => void onSave()}
            separateBackground={false}
          >
            <Stack.Toolbar.Label>{saveLabel}</Stack.Toolbar.Label>
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: theme.colors.background, flex: 1 }}>
          <View style={{ flex: 1 }}>
            <View
              ref={pageViewportRef}
              onTouchEnd={pageTouches.onTouchEnd}
              onTouchMove={pageTouches.onTouchMove}
              onTouchStartCapture={pageTouches.onTouchStartCapture}
              style={{ flex: 1 }}
            >
              <ScrollView
                contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : undefined}
                automaticallyAdjustKeyboardInsets={false}
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: theme.layout.screenHorizontalPadding, paddingTop: theme.spacing.lg, paddingBottom: Platform.OS === 'ios' ? IOS_RICH_NOTE_KEYBOARD_TOOLBAR_RESERVED_SPACE + keyboardViewportOverlap : 76 }}
              >
                <View style={{ gap: theme.spacing.lg }}>
                  <RichNoteEditor
                    document={document}
                    initialFocus={shouldFocusInput}
                    onChange={handleChange}
                    onAuxiliaryPresentationChange={setAuxiliaryPresentationVisible}
                    onInteractionStart={pageTouches.markInteractiveTouch}
                    ref={editorRef}
                  />
                  {errorMessage ? <Text accessibilityRole="alert" style={[theme.typography.footnote, { color: theme.colors.danger }]}>{errorMessage}</Text> : null}
                  {Platform.OS !== 'ios' ? (
                    <View onTouchStart={pageTouches.markInteractiveTouch} style={{ alignItems: 'flex-end', minHeight: 52, justifyContent: 'center', paddingVertical: theme.spacing.xs }}>
                      {isSaving ? <ActivityIndicator color={theme.colors.info} /> : null}
                      <NativeButton disabled={isSaving || !hasDraft} label={saveLabel} onPress={() => void onSave()} variant="primary" />
                    </View>
                  ) : null}
                </View>
              </ScrollView>
            </View>
            {Platform.OS === 'ios' ? (
              <RichNoteKeyboardToolbar
                active={isFocused && !auxiliaryPresentationVisible}
                colorScheme={resolvedMode}
                onAction={(action) => editorRef.current?.handleToolbarAction(action)}
              />
            ) : null}
          </View>
      </SafeAreaView>
    </>
  );
}
