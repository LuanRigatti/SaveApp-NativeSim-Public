import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { GlassButton } from '@/components/premium';
import type { ComponentProps } from 'react';

import { useAppTheme } from '@/theme';
import type { NativeButtonProps } from '@/types/native-ui';
import { triggerNativeButtonHaptic } from '@/utils/haptics';

type NativeButtonPlainFallbackProps = Pick<
  NativeButtonProps,
  | 'accessibilityHint'
  | 'accessibilityLabel'
  | 'disabled'
  | 'fallbackIcon'
  | 'haptic'
  | 'label'
  | 'onPress'
>;

function NativeButtonPlainFallback({
  accessibilityHint,
  accessibilityLabel,
  disabled = false,
  fallbackIcon,
  haptic,
  label,
  onPress,
}: NativeButtonPlainFallbackProps) {
  const { theme } = useAppTheme();
  const foregroundColor = theme.colors.textPrimary;
  const icon = fallbackIcon as ComponentProps<typeof Ionicons>['name'] | undefined;

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: false }}
      disabled={disabled}
      onPress={() => {
        triggerNativeButtonHaptic(haptic ?? 'none');
        onPress();
      }}
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 44,
        opacity: disabled ? theme.opacities.disabled : 1,
        paddingHorizontal: 16,
      }}
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs }}>
        {icon ? (
          <Ionicons name={icon} size={theme.sizes.iconSmall} color={foregroundColor} />
        ) : null}
        <Text style={[theme.typography.headline, { color: foregroundColor }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

export default function NativeButtonExpo({
  accessibilityLabel,
  accessibilityHint,
  content,
  controlSize,
  destructive,
  disabled,
  fallbackIcon,
  haptic,
  label,
  onPress,
  variant,
}: NativeButtonProps) {
  const icon = fallbackIcon as ComponentProps<typeof Ionicons>['name'] | undefined;

  if (variant === 'plain') {
    return (
      <NativeButtonPlainFallback
        accessibilityHint={accessibilityHint}
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        fallbackIcon={fallbackIcon}
        haptic={haptic}
        label={label}
        onPress={onPress}
      />
    );
  }

  return (
    <GlassButton
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      controlSize={controlSize}
      disabled={disabled}
      icon={icon}
      haptic={haptic ?? 'none'}
      label={content?.type === 'stacked' ? `${content.title} ${content.subtitle}` : label}
      onPress={onPress}
      variant={
        destructive
          ? 'destructive'
          : variant === 'primary' || variant === 'filled'
            ? 'contrast'
            : variant === 'surface'
              ? 'secondary'
              : 'glass'
      }
    />
  );
}
