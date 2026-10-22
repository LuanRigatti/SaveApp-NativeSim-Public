import type { Animations } from './animations';
import type { Borders } from './borders';
import type { ThemeColors } from './colors';
import type { IconTokens } from './icons';
import type { Layout } from './layout';
import type { Opacities } from './opacities';
import type { Radius } from './radius';
import type { Shadows } from './shadows';
import type { Sizes } from './sizes';
import type { Spacing } from './spacing';
import type { Typography } from './typography';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedThemeMode = Exclude<ThemeMode, 'system'>;

export type AppTheme = {
  colors: ThemeColors;
  typography: Typography;
  spacing: Spacing;
  radius: Radius;
  borders: Borders;
  shadows: Shadows;
  animations: Animations;
  icons: IconTokens;
  sizes: Sizes;
  layout: Layout;
  opacities: Opacities;
};

export type ThemeContextValue = {
  theme: AppTheme;
  mode: ThemeMode;
  resolvedMode: ResolvedThemeMode;
  isReady: boolean;
  reduceMotionEnabled: boolean;
  setMode: (mode: ThemeMode) => void;
};
