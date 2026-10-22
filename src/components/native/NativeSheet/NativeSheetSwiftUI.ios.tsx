import { BottomSheet, Group, Host, Spacer, ZStack } from '@expo/ui/swift-ui';
import { useWindowDimensions } from 'react-native';
import {
  frame,
  glassEffect,
  presentationBackground,
  presentationBackgroundInteraction as setPresentationBackgroundInteraction,
  presentationDetents,
  presentationDragIndicator,
} from '@expo/ui/swift-ui/modifiers';

import { useAppTheme } from '@/theme';
import type { NativeSheetProps } from '@/types/native-ui';

import { NATIVE_SHEET_TRANSPARENT_BACKGROUND } from '../nativeSheetBackground';

export default function NativeSheetSwiftUI({
  children,
  detents,
  glassSurface = false,
  glassTint,
  onDismiss,
  onVisibleChange,
  presentationBackgroundInteraction: backgroundInteraction = 'enabled',
  presentationBackgroundColor,
  visible,
}: NativeSheetProps) {
  const { resolvedMode, theme } = useAppTheme();
  const { width } = useWindowDimensions();
  const sheetDetents = detents ?? [{ fraction: 0.48 }, 'large'];
  const presentationModifiers = [
    presentationDetents([...sheetDetents]),
    presentationDragIndicator('visible'),
    setPresentationBackgroundInteraction(backgroundInteraction),
    ...(glassSurface
      ? [presentationBackground(NATIVE_SHEET_TRANSPARENT_BACKGROUND)]
      : presentationBackgroundColor
        ? [presentationBackground(presentationBackgroundColor)]
        : []),
  ];
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
      {children}
    </ZStack>
  ) : (
    children
  );

  return (
    <Host
      colorScheme={glassSurface ? resolvedMode : undefined}
      matchContents={glassSurface ? false : true}
      style={glassSurface ? { position: 'absolute', width } : undefined}
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
