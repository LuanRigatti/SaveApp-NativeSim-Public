import { Stack, useNavigation, usePreventRemove, useRouter, type NativeStackNavigationProp } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Text,
  View,
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
  const pageTouches = useRichNoteKeyboardInteractions(editorRef);
  const focusRequestedRef = useRef(false);
  const isMountedRef = useRef(false);
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

  const screenOptions = useMemo(() => ({
    animation: 'default' as const,
    contentStyle: { backgroundColor: theme.colors.background },
    gestureEnabled: !isSaving,
    headerBackTitle: '',
    headerShadowVisible: false,
    headerShown: true,
    headerStyle: { backgroundColor: theme.colors.background },
    headerTintColor: theme.colors.textPrimary,
    headerTitle: '',
    headerTransparent: false,
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
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: theme.colors.background, flex: 1 }}>
          <View style={{ flex: 1 }}>
            <View
              onTouchEnd={pageTouches.onTouchEnd}
              onTouchMove={pageTouches.onTouchMove}
              onTouchStartCapture={pageTouches.onTouchStartCapture}
              style={{ flex: 1 }}
            >
              <ScrollView
                automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ flexGrow: 1, paddingHorizontal: theme.layout.screenHorizontalPadding, paddingTop: theme.spacing.lg, paddingBottom: 76 }}
              >
                <View style={{ flex: 1, gap: theme.spacing.lg }}>
                  <Text accessibilityRole="header" style={[theme.typography.largeTitle, { color: theme.colors.textPrimary, fontSize: theme.typography.largeTitle.fontSize + 2 }]}>
                    Adicionar texto
                  </Text>
                  <RichNoteEditor
                    document={document}
                    initialFocus={shouldFocusInput}
                    onChange={handleChange}
                    onAuxiliaryPresentationChange={setAuxiliaryPresentationVisible}
                    onInteractionStart={pageTouches.markInteractiveTouch}
                    ref={editorRef}
                  />
                  {errorMessage ? <Text accessibilityRole="alert" style={[theme.typography.footnote, { color: theme.colors.danger }]}>{errorMessage}</Text> : null}
                  <View onTouchStart={pageTouches.markInteractiveTouch} style={{ alignItems: 'flex-end', minHeight: 52, justifyContent: 'center', paddingVertical: theme.spacing.xs }}>
                    {isSaving ? <ActivityIndicator color={theme.colors.info} /> : null}
                    <NativeButton disabled={isSaving || !hasDraft} label={saveLabel} onPress={() => void onSave()} variant="primary" />
                  </View>
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
