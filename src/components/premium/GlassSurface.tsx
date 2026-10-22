import { BlurView } from 'expo-blur';
import { GlassView } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/theme';

import { useVisualCapabilities } from '@/theme/visualCapabilities';

export type GlassSurfaceProps = ViewProps & {
  children?: ReactNode;
  blurIntensity?: number;
  bordered?: boolean;
  interactive?: boolean;
  glassEffectStyle?: 'clear' | 'regular' | 'none';
};

export function GlassSurface({
  children,
  blurIntensity = 64,
  bordered = false,
  interactive = false,
  glassEffectStyle = 'regular',
  style,
  ...props
}: GlassSurfaceProps) {
  const { theme, resolvedMode } = useAppTheme();
  const { useGlass, useBlur } = useVisualCapabilities();
  const surfaceStyle: StyleProp<ViewStyle> = [
    styles.surface,
    {
      backgroundColor: theme.colors.glassSurface,
      borderRadius: theme.radius.pill,
    },
    bordered
      ? {
          borderColor: theme.colors.glassBorder,
          borderWidth: 1,
        }
      : undefined,
    style,
  ];

  if (useGlass) {
    return (
      <GlassView
        {...props}
        style={surfaceStyle}
        colorScheme={resolvedMode}
        glassEffectStyle={glassEffectStyle}
        isInteractive={interactive}
      >
        {children}
      </GlassView>
    );
  }

  if (useBlur) {
    return (
      <BlurView
        {...props}
        style={surfaceStyle}
        intensity={blurIntensity}
        tint={resolvedMode === 'dark' ? 'dark' : 'light'}
      >
        {children}
      </BlurView>
    );
  }

  return (
    <View {...props} style={surfaceStyle}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: { overflow: 'hidden' },
});
