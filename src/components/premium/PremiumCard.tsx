import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { darkModeCardSurface, useAppTheme } from '@/theme';

import { AnimatedPressable, type AnimatedPressableProps } from './AnimatedPressable';

export type PremiumCardProps = {
  children: ReactNode;
  disablePressAnimation?: boolean;
  onPress?: AnimatedPressableProps['onPress'];
  preservePressableIdentity?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function PremiumCard({
  children,
  disablePressAnimation,
  onPress,
  preservePressableIdentity = false,
  style,
  accessibilityLabel,
}: PremiumCardProps) {
  const { resolvedMode, theme } = useAppTheme();
  const cardStyle = [
    styles.card,
    {
      backgroundColor: resolvedMode === 'dark' ? darkModeCardSurface : theme.colors.surface,
      borderColor: theme.colors.separator,
      borderRadius: theme.radius.card,
      padding: theme.spacing.lg,
    },
    resolvedMode === 'dark' ? theme.shadows.none : theme.shadows.card,
    style,
  ];
  if (onPress || preservePressableIdentity) {
    return (
      <AnimatedPressable
        disablePressAnimation={disablePressAnimation || !onPress}
        disabled={!onPress}
        onPress={onPress}
        style={cardStyle}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={onPress ? accessibilityLabel : undefined}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 0 },
});
