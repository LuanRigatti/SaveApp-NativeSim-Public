import {
  Button,
  HStack,
  Host,
  ProgressView,
  Spacer,
  Text,
  TextField,
  VStack,
  ZStack,
  useNativeState,
} from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  autocorrectionDisabled,
  background,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  lineLimit,
  padding,
  shapes,
  textFieldStyle,
  textInputAutocapitalization,
  textSelection,
} from '@expo/ui/swift-ui/modifiers';
import type { TextFieldRef } from '@expo/ui/swift-ui';
import { useEffect, useMemo, useRef } from 'react';
import { useWindowDimensions } from 'react-native';

import { useAppTheme, useVisualCapabilities } from '@/theme';

const BASE_CARD_HEIGHT = 330;
const CARD_CORNER_RADIUS = 36;

type HomeContentComposerSwiftUIProps = {
  canSave: boolean;
  clearError: () => void;
  errorMessage: string | null;
  isSaving: boolean;
  onDraftChange: (value: string) => void;
  onSave: (value: string) => void;
  shouldFocusInput: boolean;
  title: string;
};

export default function HomeContentComposerSwiftUI({
  canSave,
  clearError,
  errorMessage,
  isSaving,
  onDraftChange,
  onSave,
  shouldFocusInput,
  title,
}: HomeContentComposerSwiftUIProps) {
  const { resolvedMode, theme } = useAppTheme();
  const { useGlass } = useVisualCapabilities();
  const { fontScale } = useWindowDimensions();
  const textState = useNativeState('');
  const textFieldRef = useRef<TextFieldRef>(null);

  useEffect(() => {
    if (shouldFocusInput) {
      void textFieldRef.current?.focus();
    }
  }, [shouldFocusInput]);

  const accessibilityScale = Math.max(1, Math.min(fontScale, 1.2));
  const cardHeight = BASE_CARD_HEIGHT * accessibilityScale;
  const cardCornerRadius = CARD_CORNER_RADIUS;
  const cardShape = useMemo(
    () =>
      shapes.roundedRectangle({
        cornerRadius: cardCornerRadius,
      }),
    [cardCornerRadius],
  );
  const cardSurfaceModifier = useMemo(
    () =>
      useGlass
        ? glassEffect({
            glass: { variant: 'regular', interactive: true },
            cornerRadius: cardCornerRadius,
            shape: 'roundedRectangle',
          })
        : background({ type: 'material', material: 'regular' }, cardShape),
    [cardCornerRadius, cardShape, useGlass],
  );

  return (
    <Host
      colorScheme={resolvedMode}
      ignoreSafeArea="container"
      matchContents={false}
      seedColor={theme.colors.info}
      style={{ flex: 1 }}
    >
      <ZStack
        alignment="center"
        modifiers={[
          frame({ maxWidth: Infinity, maxHeight: Infinity }),
          background(theme.colors.background),
        ]}
      >
        <VStack
          alignment="leading"
          spacing={theme.spacing.md}
          modifiers={[
            frame({ maxWidth: 560 }),
            padding({ horizontal: theme.spacing.md }),
          ]}
        >
          <Text
            modifiers={[
              font({ textStyle: 'largeTitle', design: 'rounded', weight: 'bold' }),
              foregroundStyle(theme.colors.textPrimary),
              frame({ maxWidth: Infinity, alignment: 'leading' }),
            ]}
          >
            {title}
          </Text>
          <VStack
            alignment="leading"
            spacing={theme.spacing.sm}
            modifiers={[
              padding({ all: theme.spacing.lg }),
              frame({ height: cardHeight }),
              frame({ maxWidth: Infinity, alignment: 'topLeading' }),
              cardSurfaceModifier,
            ]}
          >
            <TextField
              axis="vertical"
              ref={textFieldRef}
              onTextChange={(value) => {
                onDraftChange(value);
                if (errorMessage) clearError();
              }}
              placeholder="Comece a escrever..."
              text={textState}
              modifiers={[
                textFieldStyle('plain'),
                textInputAutocapitalization('sentences'),
                autocorrectionDisabled(false),
                lineLimit({ min: 1, max: 12 }),
                textSelection(true),
                accessibilityLabel('Texto para salvar'),
                foregroundStyle(theme.colors.textPrimary),
                frame({
                  maxWidth: Infinity,
                  maxHeight: Infinity,
                  minHeight: theme.spacing.xxxl,
                  alignment: 'topLeading',
                }),
              ]}
            />

            {errorMessage ? (
              <Text
                modifiers={[
                  font({ textStyle: 'footnote' }),
                  foregroundStyle(theme.colors.danger),
                  lineLimit(2),
                ]}
              >
                {errorMessage}
              </Text>
            ) : null}

            <HStack alignment="center" spacing={theme.spacing.sm}>
              <Spacer />
              <Button
                onPress={() => onSave(textState.get())}
                modifiers={[
                  buttonStyle('glass'),
                  buttonBorderShape('capsule'),
                  controlSize('regular'),
                  disabled(isSaving || !canSave),
                  accessibilityLabel(isSaving ? 'Salvando texto' : 'Salvar'),
                ]}
              >
                <HStack alignment="center" spacing={theme.spacing.xs}>
                  {isSaving ? <ProgressView /> : null}
                  <Text
                    modifiers={[
                      font({ textStyle: 'body', weight: 'semibold' }),
                      foregroundStyle(resolvedMode === 'dark' ? '#FFFFFF' : '#000000'),
                    ]}
                  >
                    Salvar
                  </Text>
                </HStack>
              </Button>
            </HStack>
          </VStack>
        </VStack>
      </ZStack>
    </Host>
  );
}
