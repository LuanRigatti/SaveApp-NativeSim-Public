import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NativeButton } from '@/components/native';
import { submitLinkFromNativePrompt } from '@/features/home-content/nativeLinkPromptSubmission';
import { getNativeCapabilities } from '@/platform/nativeCapabilities';
import { useAppTheme } from '@/theme';

import { useLinkComposerController, type HomeComposerKind } from './HomeContentComposerController';

export type { HomeComposerKind } from './HomeContentComposerController';

export function HomeContentComposer({
  kind,
  initialLink,
  onClose,
}: {
  kind: HomeComposerKind;
  initialLink?: string | null;
  onClose: () => void;
}) {
  if (!kind) return null;

  // Alert.prompt is backed by UIAlertController and remains native even when
  // Expo UI is unavailable in the current iOS runtime.
  if (kind === 'link' && Platform.OS === 'ios') {
    return <NativeLinkPrompt initialLink={initialLink} onClose={onClose} />;
  }

  if (kind === 'link') return <AddLinkFallback initialLink={initialLink} onClose={onClose} />;
  return null;
}

function NativeLinkPrompt({ initialLink, onClose }: { initialLink?: string | null; onClose: () => void }) {
  const { close, isSaving, submit } = useLinkComposerController({ onClose });
  const promptIsVisible = useRef(false);
  const initialValueRef = useRef(initialLink ?? '');
  const presentPromptRef = useRef<(initialValue: string) => void>(() => undefined);

  const presentPrompt = useCallback(
    (initialValue: string) => {
      if (promptIsVisible.current) return;
      promptIsVisible.current = true;

      Alert.prompt(
        'Adicionar link',
        'Cole aqui ou digite o endereço que deseja guardar.',
        [
          {
            text: 'Cancelar',
            style: 'cancel',
            onPress: () => {
              promptIsVisible.current = false;
              close();
            },
          },
          {
            text: 'Adicionar',
            onPress: (enteredValue) => {
              promptIsVisible.current = false;
              const submittedValue = enteredValue ?? initialValue;

              void submitLinkFromNativePrompt(submittedValue, submit, (message, retryValue) => {
                Alert.alert('Não foi possível adicionar o link', message, [
                  {
                    text: 'Cancelar',
                    style: 'cancel',
                    onPress: close,
                  },
                  {
                    text: 'Tentar novamente',
                    onPress: () => presentPromptRef.current(retryValue),
                  },
                ]);
              });
            },
          },
        ],
        'plain-text',
        initialValue,
        'url',
      );
    },
    [close, submit],
  );

  useEffect(() => {
    presentPromptRef.current = presentPrompt;
  }, [presentPrompt]);

  useEffect(() => {
    presentPromptRef.current(initialValueRef.current);
  }, []);

  if (isSaving && getNativeCapabilities().canUseNativeSwiftUI) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const NativeLinkSavingIndicator = require('./HomeContentComposerLinkSavingSwiftUI.ios').default;
    return <NativeLinkSavingIndicator />;
  }

  if (isSaving) {
    return (
      <View
        accessibilityLabel="Salvando link"
        accessibilityRole="progressbar"
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
        <ActivityIndicator style={{ flex: 1 }} />
      </View>
    );
  }

  return null;
}

function AddLinkFallback({ initialLink, onClose }: { initialLink?: string | null; onClose: () => void }) {
  const { theme } = useAppTheme();
  const [link, setLink] = useState(initialLink ?? '');
  const { clearError, close, errorMessage, isSaving, submit } = useLinkComposerController({
    onClose,
  });

  return (
    <Modal animationType="fade" onRequestClose={close} transparent visible>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <SafeAreaView
          edges={['top', 'bottom']}
          style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: theme.spacing.lg }}
        >
          <Pressable
            accessibilityLabel="Fechar compositor de link"
            onPress={close}
            style={{ backgroundColor: '#00000066', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}
          />
          <View
            style={{
              backgroundColor: theme.colors.surfaceElevated,
              borderColor: theme.colors.separator,
              borderRadius: theme.radius.xl,
              borderWidth: 1,
              gap: theme.spacing.md,
              maxWidth: 440,
              padding: theme.spacing.lg,
              width: '100%',
            }}
          >
            <View style={{ gap: theme.spacing.xs }}>
              <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>
                Adicionar link
              </Text>
              <Text style={[theme.typography.subheadline, { color: theme.colors.textSecondary }]}>
                Cole ou digite o endereço que deseja guardar.
              </Text>
            </View>
            <TextInput
              accessibilityLabel="Endereço do link"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={(value) => {
                setLink(value);
                clearError();
              }}
              onSubmitEditing={() => void submit(link)}
              placeholder="https://"
              placeholderTextColor={theme.colors.textTertiary}
              returnKeyType="done"
              selectionColor={theme.colors.primary}
              style={{
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.separator,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                color: theme.colors.textPrimary,
                fontSize: 17,
                minHeight: 50,
                paddingHorizontal: theme.spacing.md,
              }}
              value={link}
            />
            {isSaving ? (
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
                <ActivityIndicator color={theme.colors.info} />
                <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
                  Buscando prévia do site…
                </Text>
              </View>
            ) : null}
            {errorMessage ? (
              <Text accessibilityRole="alert" style={[theme.typography.footnote, { color: theme.colors.danger }]}>
                {errorMessage}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
              <NativeButton label="Cancelar" onPress={close} variant="plain" />
              <NativeButton
                disabled={isSaving || !link.trim()}
                label={isSaving ? 'Salvando…' : 'Adicionar'}
                onPress={() => void submit(link)}
                variant="primary"
              />
            </View>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
