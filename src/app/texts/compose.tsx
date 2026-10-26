import { Stack, useNavigation, usePreventRemove, useRouter, type NativeStackNavigationProp } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  type TextInputInstance,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NativeButton } from '@/components/native';
import { useTextComposerController } from '@/components/homeContent/HomeContentComposerController';
import {
  hasTextComposerDraft,
  shouldPreventTextComposerRemoval,
  shouldFocusTextComposerAfterTransitionEnd,
} from '@/features/home-content/textComposerNavigation';
import { getNativeCapabilities } from '@/platform/nativeCapabilities';
import { useAppTheme } from '@/theme';

export default function ComposeTextScreen() {
  const router = useRouter();
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const { theme } = useAppTheme();
  const { clearError, errorMessage, isSaving, submit } = useTextComposerController();
  const [hasDraft, setHasDraft] = useState(false);
  const [allowRouteRemoval, setAllowRouteRemoval] = useState(false);
  const [shouldFocusInput, setShouldFocusInput] = useState(false);
  const focusRequestedRef = useRef(false);
  const isMountedRef = useRef(false);
  const shouldPreventRemoval = shouldPreventTextComposerRemoval({
    allowRouteRemoval,
    hasDraft,
    isSaving,
  });

  const onPreventedRemoval = useCallback(
    ({ repeat }: { repeat: () => void }) => {
      if (isSaving) {
        Alert.alert('Salvando texto', 'Aguarde a conclusão para voltar.');
        return;
      }

      Alert.alert('Descartar rascunho?', 'O texto ainda não foi salvo.', [
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
    },
    [isSaving],
  );
  const disableRemovalPrevention = usePreventRemove(shouldPreventRemoval, onPreventedRemoval);

  useEffect(() => {
    isMountedRef.current = true;

    const unsubscribe = navigation.addListener('transitionEnd', (event) => {
      if (
        !shouldFocusTextComposerAfterTransitionEnd({
          alreadyRequested: focusRequestedRef.current,
          closing: event.data.closing,
          isMounted: isMountedRef.current,
        })
      ) {
        return;
      }

      focusRequestedRef.current = true;
      setShouldFocusInput(true);
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, [navigation]);

  const screenOptions = useMemo(
    () => ({
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
    }),
    [isSaving, theme.colors.background, theme.colors.textPrimary],
  );

  const onDraftChange = useCallback((value: string) => {
    const nextHasDraft = hasTextComposerDraft(value);
    setHasDraft((current) => (current === nextHasDraft ? current : nextHasDraft));
  }, []);

  const onSave = useCallback(
    async (value: string) => {
      const saved = await submit(value);
      if (!saved) return;

      setAllowRouteRemoval(true);
      disableRemovalPrevention();
      router.back();
    },
    [disableRemovalPrevention, router, submit],
  );

  const nativeSwiftUIAvailable =
    Platform.OS === 'ios' && getNativeCapabilities().canUseNativeSwiftUI;

  return (
    <>
      <Stack.Screen options={screenOptions}>
        <Stack.Screen.BackButton displayMode="minimal" />
      </Stack.Screen>
      {nativeSwiftUIAvailable ? (
        <NativeTextComposerView
          canSave={hasDraft}
          clearError={clearError}
          errorMessage={errorMessage}
          isSaving={isSaving}
          onDraftChange={onDraftChange}
          onSave={(value: string) => void onSave(value)}
          shouldFocusInput={shouldFocusInput}
          title="Adicionar texto"
        />
      ) : (
        <TextComposerFallback
          clearError={clearError}
          errorMessage={errorMessage}
          isSaving={isSaving}
          onDraftChange={onDraftChange}
          onSave={onSave}
          shouldFocusInput={shouldFocusInput}
          title="Adicionar texto"
        />
      )}
    </>
  );
}

function NativeTextComposerView(props: {
  canSave: boolean;
  clearError: () => void;
  errorMessage: string | null;
  isSaving: boolean;
  onDraftChange: (value: string) => void;
  onSave: (value: string) => void;
  shouldFocusInput: boolean;
  title: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const NativeTextComposer = require('@/components/homeContent/HomeContentComposerSwiftUI.ios').default;
  return <NativeTextComposer {...props} />;
}

function TextComposerFallback({
  clearError,
  errorMessage,
  isSaving,
  onDraftChange,
  onSave,
  shouldFocusInput,
  title,
}: {
  clearError: () => void;
  errorMessage: string | null;
  isSaving: boolean;
  onDraftChange: (value: string) => void;
  onSave: (value: string) => Promise<void>;
  shouldFocusInput: boolean;
  title: string;
}) {
  const { theme } = useAppTheme();
  const [text, setText] = useState('');
  const textInputRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    if (shouldFocusInput) {
      textInputRef.current?.focus();
    }
  }, [shouldFocusInput]);

  return (
    <SafeAreaView style={{ backgroundColor: theme.colors.background, flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, gap: theme.spacing.md, padding: theme.spacing.lg }}
      >
        <Text
          accessibilityRole="header"
          style={[
            theme.typography.largeTitle,
            {
              color: theme.colors.textPrimary,
              fontSize: theme.typography.largeTitle.fontSize + 2,
            },
          ]}
        >
          {title}
        </Text>
        <TextInput
          accessibilityLabel="Texto para salvar"
          autoCapitalize="sentences"
          multiline
          onChangeText={(value) => {
            setText(value);
            onDraftChange(value);
            if (errorMessage) clearError();
          }}
          placeholder="Comece a escrever..."
          placeholderTextColor={theme.colors.textTertiary}
          ref={textInputRef}
          selectionColor={theme.colors.primary}
          style={{
            backgroundColor: theme.colors.surfaceMuted,
            borderRadius: theme.radius.card,
            color: theme.colors.textPrimary,
            flex: 1,
            fontSize: 17,
            minHeight: 220,
            padding: theme.spacing.lg,
            textAlignVertical: 'top',
          }}
          value={text}
        />
        {errorMessage ? (
          <Text accessibilityRole="alert" style={[theme.typography.footnote, { color: theme.colors.danger }]}>
            {errorMessage}
          </Text>
        ) : null}
        <View style={{ alignItems: 'flex-end', minHeight: 44 }}>
          {isSaving ? <ActivityIndicator color={theme.colors.info} /> : null}
          <NativeButton
            disabled={isSaving || !hasTextComposerDraft(text)}
            label={isSaving ? 'Salvando…' : 'Adicionar'}
            onPress={() => void onSave(text)}
            variant="primary"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
