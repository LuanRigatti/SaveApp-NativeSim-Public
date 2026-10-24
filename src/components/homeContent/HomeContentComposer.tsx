import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';

import { NativeButton, NativeSheet } from '@/components/native';
import { useLocalSavedContent } from '@/features/home-content/LocalSavedContentProvider';
import { EmptySavedTextError } from '@/features/home-content/contentSavePipeline';
import { createLinkSaveSubmissionRunner } from '@/features/home-content/linkSaveSubmission';
import { useAppTheme } from '@/theme';

export type HomeComposerKind = 'link' | 'text' | null;

export function HomeContentComposer({
  kind,
  onClose,
}: {
  kind: HomeComposerKind;
  onClose: () => void;
}) {
  if (kind === 'link') return <AddLinkSheet onClose={onClose} />;
  if (kind === 'text') return <AddTextSheet onClose={onClose} />;
  return null;
}

function AddLinkSheet({ onClose }: { onClose: () => void }) {
  const { saveLink } = useLocalSavedContent();
  const { theme } = useAppTheme();
  const [link, setLink] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const linkAbortController = useRef<AbortController | null>(null);
  const isMounted = useRef(false);
  const didClose = useRef(false);
  const submissionRunner = useRef<ReturnType<typeof createLinkSaveSubmissionRunner> | null>(null);

  if (submissionRunner.current == null) {
    submissionRunner.current = createLinkSaveSubmissionRunner();
  }

  useEffect(() => {
    isMounted.current = true;
    didClose.current = false;

    return () => {
      isMounted.current = false;
      const controller = linkAbortController.current;
      linkAbortController.current = null;
      controller?.abort();
    };
  }, []);

  const close = () => {
    if (!isMounted.current || didClose.current) return;
    didClose.current = true;
    const controller = linkAbortController.current;
    linkAbortController.current = null;
    controller?.abort();
    setIsSaving(false);
    setErrorMessage(null);
    onClose();
  };

  const handleSave = async () => {
    if (isSaving || linkAbortController.current || !isMounted.current || didClose.current) return;
    const controller = new AbortController();
    linkAbortController.current = controller;
    await submissionRunner.current?.(
      () => saveLink(link, controller.signal),
      controller.signal,
      {
        isCurrent: () =>
          isMounted.current && !didClose.current && linkAbortController.current === controller,
        onSettled: () => {
          if (linkAbortController.current === controller) linkAbortController.current = null;
        },
        setErrorMessage,
        setSaving: setIsSaving,
        onSuccess: () => {
          if (linkAbortController.current !== controller || controller.signal.aborted) return;
          linkAbortController.current = null;
          close();
        },
      },
    );
  };

  const fieldStyle = {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.separator,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    color: theme.colors.textPrimary,
    fontSize: 17,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  } as const;

  return (
    <NativeSheet
      accessibilityLabel="Adicionar link"
      detents={[{ fraction: 0.44 }, 'large']}
      onVisibleChange={(visible) => {
        if (!visible) close();
      }}
      title="Adicionar link"
      visible
    >
      <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.sm }}>
        <TextInput
          accessibilityLabel="Endereço do link"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={(value) => {
            setLink(value);
            setErrorMessage(null);
          }}
          onSubmitEditing={() => void handleSave()}
          placeholder="Cole ou digite um endereço"
          placeholderTextColor={theme.colors.textTertiary}
          returnKeyType="done"
          selectionColor={theme.colors.primary}
          style={fieldStyle}
          value={link}
        />
        {isSaving ? (
          <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
            <ActivityIndicator color={theme.colors.primary} />
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
            label={isSaving ? 'Salvando…' : 'Salvar'}
            onPress={() => void handleSave()}
            variant="primary"
          />
        </View>
      </View>
    </NativeSheet>
  );
}

function AddTextSheet({ onClose }: { onClose: () => void }) {
  const { saveText } = useLocalSavedContent();
  const { theme } = useAppTheme();
  const [text, setText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const textAbortController = useRef<AbortController | null>(null);

  const close = () => {
    textAbortController.current?.abort();
    textAbortController.current = null;
    setIsSaving(false);
    setErrorMessage(null);
    onClose();
  };

  const handleSave = async () => {
    if (isSaving || textAbortController.current) return;
    const controller = new AbortController();
    textAbortController.current = controller;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await saveText(text, controller.signal);
      if (textAbortController.current !== controller || controller.signal.aborted) return;
      setIsSaving(false);
      textAbortController.current = null;
      onClose();
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return;
      setIsSaving(false);
      setErrorMessage(
        error instanceof EmptySavedTextError ? 'Escreva algo antes de salvar.' : 'Não foi possível salvar o texto.',
      );
    } finally {
      if (textAbortController.current === controller) {
        textAbortController.current = null;
        setIsSaving(false);
      }
    }
  };

  const fieldStyle = {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.separator,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    color: theme.colors.textPrimary,
    fontSize: 17,
    minHeight: 150,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    textAlignVertical: 'top' as const,
  };

  return (
    <NativeSheet
      accessibilityLabel="Adicionar texto"
      detents={[{ fraction: 0.52 }, 'large']}
      onVisibleChange={(visible) => {
        if (!visible) close();
      }}
      title="Adicionar texto"
      visible
    >
      <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.sm }}>
        <TextInput
          accessibilityLabel="Texto para salvar"
          autoCapitalize="sentences"
          multiline
          onChangeText={(value) => {
            setText(value);
            setErrorMessage(null);
          }}
          placeholder="Escreva ou cole um texto"
          placeholderTextColor={theme.colors.textTertiary}
          selectionColor={theme.colors.primary}
          style={fieldStyle}
          value={text}
        />
        {errorMessage ? (
          <Text accessibilityRole="alert" style={[theme.typography.footnote, { color: theme.colors.danger }]}>
            {errorMessage}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
          <NativeButton label="Cancelar" onPress={close} variant="plain" />
          <NativeButton
            disabled={isSaving || !text.trim()}
            label={isSaving ? 'Salvando…' : 'Salvar'}
            onPress={() => void handleSave()}
            variant="primary"
          />
        </View>
      </View>
    </NativeSheet>
  );
}
