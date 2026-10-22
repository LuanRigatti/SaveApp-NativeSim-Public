import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ComponentProps } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useAppTheme } from '@/theme';
import { triggerNativeButtonHaptic } from '@/utils/haptics';
import type { NativeButtonHaptic, NativeButtonProps } from '@/types/native-ui';

import { GlassSurface } from './GlassSurface';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type GlassButtonVariant = 'glass' | 'primary' | 'secondary' | 'destructive' | 'contrast';

export type GlassButtonProps = {
  label: string;
  onPress: () => void;
  variant?: GlassButtonVariant;
  controlSize?: NonNullable<NativeButtonProps['controlSize']>;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  haptic?: NativeButtonHaptic;
};

export function GlassButton({
  label,
  onPress,
  variant = 'glass',
  controlSize = 'regular',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  haptic = 'light',
}: GlassButtonProps) {
  const { reduceMotionEnabled, theme } = useAppTheme();
  const isDisabled = disabled || loading;
  const isGlass = variant === 'glass';
  const scale = useSharedValue(1);
  const backgroundColor = {
    glass: theme.colors.glassSurface,
    primary: theme.colors.primary,
    secondary: theme.colors.surfaceMuted,
    destructive: theme.colors.danger,
    contrast: theme.colors.contrastSurface,
  }[variant];
  const foregroundColor =
    variant === 'contrast'
      ? theme.colors.contrastContent
      : variant === 'primary' || variant === 'destructive'
        ? theme.colors.textInverse
        : theme.colors.textPrimary;
  const controlMetrics = {
    mini: {
      minHeight: theme.spacing.xxl + theme.spacing.xxs,
      paddingHorizontal: theme.spacing.md,
      typography: theme.typography.footnote,
    },
    small: {
      minHeight: theme.spacing.xxl + theme.spacing.xs,
      paddingHorizontal: theme.spacing.md,
      typography: theme.typography.footnote,
    },
    regular: {
      minHeight: theme.sizes.touchTargetMinimum,
      paddingHorizontal: theme.spacing.lg,
      typography: theme.typography.headline,
    },
    large: {
      minHeight: theme.sizes.buttonHeight,
      paddingHorizontal: theme.spacing.xl,
      typography: theme.typography.headline,
    },
    extraLarge: {
      minHeight: theme.sizes.buttonHeight + theme.spacing.xs,
      paddingHorizontal: theme.spacing.xl,
      typography: theme.typography.title3,
    },
  }[controlSize];

  const content = (
    <View style={[styles.content, { gap: theme.spacing.xs }]}>
      {loading ? (
        <ActivityIndicator color={foregroundColor} />
      ) : icon ? (
        <Ionicons name={icon} size={theme.sizes.iconSmall} color={foregroundColor} />
      ) : null}
      <Text style={[controlMetrics.typography, { color: foregroundColor }]}>{label}</Text>
    </View>
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pressSpring = (toValue: number) => {
    // Reanimated shared values intentionally use imperative mutation.
    // eslint-disable-next-line react-hooks/immutability
    scale.value = withSpring(
      reduceMotionEnabled ? 1 : toValue,
      reduceMotionEnabled ? undefined : theme.animations.spring.responsive,
    );
  };

  const button = (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={() => {
          triggerNativeButtonHaptic(haptic);
          onPress();
        }}
        onPressIn={() => pressSpring(theme.animations.scale.pressed)}
        onPressOut={() => pressSpring(1)}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: isGlass
              ? pressed
                ? theme.colors.glassBorder
                : 'transparent'
              : backgroundColor,
            borderColor: isGlass ? 'transparent' : backgroundColor,
            borderRadius: theme.radius.pill,
            minHeight: controlMetrics.minHeight,
            paddingHorizontal: controlMetrics.paddingHorizontal,
            opacity: isDisabled ? theme.opacities.disabled : 1,
          },
          fullWidth && styles.fullWidth,
        ]}
      >
        {content}
      </Pressable>
    </Animated.View>
  );

  return isGlass ? (
    <GlassSurface interactive style={fullWidth && styles.fullWidth}>
      {button}
    </GlassSurface>
  ) : (
    button
  );
}

const styles = StyleSheet.create({
  button: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  fullWidth: { width: '100%' },
});
