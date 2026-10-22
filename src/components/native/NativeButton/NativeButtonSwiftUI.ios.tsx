import { Button, Circle, HStack, Host, Image, Label, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityHint,
  accessibilityValue,
  background,
  buttonStyle,
  contentShape,
  controlSize as controlSizeModifier,
  cornerRadius,
  disabled as disabledModifier,
  frame,
  foregroundColor,
  foregroundStyle,
  padding,
  shapes,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';

import type { NativeButtonProps } from '@/types/native-ui';
import { triggerNativeButtonHaptic } from '@/utils/haptics';

import { roundedFont } from '../nativeTypography';

export default function NativeButtonSwiftUI({
  disabled,
  destructive,
  glassTint,
  accessibilityHint: hint,
  accessibilityValue: value,
  color,
  backgroundColor,
  content,
  controlSize,
  horizontalPadding,
  haptic,
  label,
  minWidth,
  minHeight,
  onPress,
  gateDisabledAction,
  systemImage,
  variant,
}: NativeButtonProps) {
  const isFilledVariant = variant === 'filled' || variant === 'surface';
  const usesPlainVariant = variant === 'plain';
  const usesFixedFilledFrame =
    variant === 'filled' && minWidth !== undefined && minHeight !== undefined;
  const contentWidth =
    minWidth !== undefined ? Math.max(0, minWidth - (horizontalPadding ?? 0) * 2) : undefined;
  const verticalPadding =
    controlSize === 'mini'
      ? 6
      : controlSize === 'small'
        ? 8
        : controlSize === 'large'
          ? 16
          : controlSize === 'extraLarge'
            ? 20
            : 12;
  const buttonContent =
    content?.type === 'stacked' ? (
      <VStack alignment="center" modifiers={[frame({ width: minWidth, height: minHeight })]}>
        <Text
          modifiers={[
            roundedFont({ size: 11 }),
            foregroundColor(content.foregroundColor ?? color ?? '#000000'),
          ]}
        >
          {content.title}
        </Text>
        <Text
          modifiers={[
            roundedFont({ size: 16, weight: 'semibold' }),
            foregroundColor(content.foregroundColor ?? color ?? '#000000'),
          ]}
        >
          {content.subtitle}
        </Text>
        {content.indicator ? (
          <Circle
            modifiers={[
              frame({ width: 5, height: 5 }),
              foregroundStyle(
                content.indicatorColor ?? content.foregroundColor ?? color ?? '#000000',
              ),
            ]}
          />
        ) : null}
      </VStack>
    ) : isFilledVariant ? (
      usesFixedFilledFrame ? (
        <Text
          modifiers={[
            roundedFont({ size: 17, weight: 'semibold' }),
            foregroundStyle(color ?? '#000000'),
            padding({
              horizontal: horizontalPadding ?? 16,
              vertical: verticalPadding,
            }),
            frame({ width: minWidth, height: minHeight, alignment: 'center' }),
            background(backgroundColor ?? (variant === 'filled' ? '#000000' : '#FFFFFF')),
            cornerRadius(999),
            contentShape(shapes.capsule()),
          ]}
        >
          {label}
        </Text>
      ) : (
        <HStack
          modifiers={contentWidth !== undefined ? [frame({ width: contentWidth })] : undefined}
          spacing={6}
        >
          <Image color={color ?? '#000000'} size={18} systemName={systemImage as SFSymbol} />
          <Text modifiers={[roundedFont({}), foregroundColor(color ?? '#000000')]}>{label}</Text>
        </HStack>
      )
    ) : (
      <HStack modifiers={contentWidth !== undefined ? [frame({ width: contentWidth })] : undefined}>
        <Label
          modifiers={color ? [foregroundColor(color)] : undefined}
          title={label}
          systemImage={systemImage as SFSymbol | undefined}
        />
      </HStack>
    );

  return (
    <Host matchContents>
      <Button
        onPress={() => {
          if (disabled && gateDisabledAction) return;
          triggerNativeButtonHaptic(haptic);
          onPress();
        }}
        role={destructive ? 'destructive' : 'default'}
        modifiers={[
          buttonStyle(
            isFilledVariant || usesPlainVariant
              ? 'plain'
              : variant === 'primary'
                ? 'glassProminent'
                : 'glass',
          ),
          ...(glassTint ? [tint(glassTint)] : []),
          controlSizeModifier(controlSize ?? 'regular'),
          ...(disabled && !gateDisabledAction ? [disabledModifier(true)] : []),
          ...(usesPlainVariant
            ? [padding({ horizontal: horizontalPadding ?? 16, vertical: verticalPadding })]
            : []),
          ...(isFilledVariant && !usesFixedFilledFrame
            ? [
                foregroundStyle(color ?? '#000000'),
                padding({
                  horizontal: horizontalPadding ?? 16,
                  vertical: verticalPadding,
                }),
                background(backgroundColor ?? (variant === 'filled' ? '#000000' : '#FFFFFF')),
                cornerRadius(999),
              ]
            : []),
          ...(minWidth === undefined && horizontalPadding !== undefined && !usesPlainVariant
            ? [padding({ horizontal: horizontalPadding })]
            : []),
          ...(hint ? [accessibilityHint(hint)] : []),
          ...(value ? [accessibilityValue(value)] : []),
          roundedFont({}),
        ]}
      >
        {buttonContent}
      </Button>
    </Host>
  );
}
