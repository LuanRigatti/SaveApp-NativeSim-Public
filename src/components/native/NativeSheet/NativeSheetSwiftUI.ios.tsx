import { BottomSheet, Group, Host, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as setAccessibilityLabel,
  font,
  frame,
  glassEffect,
  padding,
  presentationBackground,
  presentationBackgroundInteraction as setPresentationBackgroundInteraction,
  presentationDetents,
  presentationDragIndicator,
  foregroundStyle,
} from '@expo/ui/swift-ui/modifiers';
import { useCallback, useState } from 'react';

import { useAppTheme } from '@/theme';
import type { NativeSheetDetent, NativeSheetProps } from '@/types/native-ui';

import { NATIVE_SHEET_TRANSPARENT_BACKGROUND } from '../nativeSheetBackground';

function detentKey(detent: NativeSheetDetent): string {
  if (typeof detent === 'string') return detent;
  return 'fraction' in detent ? `fraction:${detent.fraction}` : `height:${detent.height}`;
}

export default function NativeSheetSwiftUI({
  children,
  detents,
  glassSurface = false,
  glassTint,
  title,
  accessibilityLabel,
  onDismiss,
  onVisibleChange,
  presentationBackgroundInteraction: backgroundInteraction = 'enabled',
  presentationBackgroundColor,
  visible,
}: NativeSheetProps) {
  const { resolvedMode, theme } = useAppTheme();
  const sheetDetents: readonly NativeSheetDetent[] = detents?.length
    ? detents
    : [{ fraction: 0.48 }, 'large'];
  const initialDetent = sheetDetents[0] ?? 'medium';
  const [selectedDetent, setSelectedDetent] = useState<NativeSheetDetent>(initialDetent);
  const effectiveSelectedDetent = sheetDetents.find(
    (detent) => detentKey(detent) === detentKey(selectedDetent),
  ) ?? initialDetent;
  const handleDetentSelectionChange = useCallback((nextDetent: NativeSheetDetent) => {
    setSelectedDetent(nextDetent);
  }, []);

  const presentationModifiers = [
    presentationDetents([...sheetDetents], {
      onSelectionChange: handleDetentSelectionChange,
      selection: effectiveSelectedDetent,
    }),
    presentationDragIndicator('visible'),
    setPresentationBackgroundInteraction(backgroundInteraction),
    ...(glassSurface
      ? [presentationBackground(NATIVE_SHEET_TRANSPARENT_BACKGROUND)]
      : presentationBackgroundColor
        ? [presentationBackground(presentationBackgroundColor)]
        : []),
  ];
  const sheetBody = (
    <VStack
      alignment="leading"
      spacing={theme.spacing.md}
      modifiers={[
        frame({ maxWidth: Infinity, alignment: 'leading' }),
        padding({ horizontal: theme.spacing.lg, vertical: theme.spacing.lg }),
      ]}
    >
      {title ? (
        <Text
          modifiers={[
            font({ size: theme.typography.title3.fontSize, weight: 'semibold' }),
            foregroundStyle(theme.colors.textPrimary),
            ...(accessibilityLabel ? [setAccessibilityLabel(accessibilityLabel)] : []),
          ]}
        >
          {title}
        </Text>
      ) : null}
      {children}
    </VStack>
  );
  const sheetContent = glassSurface ? (
    <ZStack
      alignment="topLeading"
      modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' })]}
    >
      <ZStack
        modifiers={[
          frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
          glassEffect({
            glass: {
              interactive: true,
              variant: 'regular',
              ...(glassTint ? { tint: glassTint } : {}),
            },
            cornerRadius: theme.radius.card,
            shape: 'roundedRectangle',
          }),
        ]}
      >
        <Spacer />
      </ZStack>
      {sheetBody}
    </ZStack>
  ) : (
    sheetBody
  );

  return (
    <Host
      colorScheme={glassSurface ? resolvedMode : undefined}
      matchContents={false}
      pointerEvents="box-none"
      style={{ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}
      useViewportSizeMeasurement={glassSurface ? true : undefined}
    >
      <BottomSheet
        isPresented={visible}
        onDismiss={onDismiss}
        onIsPresentedChange={onVisibleChange}
      >
        <Group modifiers={presentationModifiers}>{sheetContent}</Group>
      </BottomSheet>
    </Host>
  );
}
