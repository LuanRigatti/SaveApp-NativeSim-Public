export type ThemeColors = {
  background: string;
  backgroundSecondary: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  contrastSurface: string;
  contrastContent: string;
  selectionSurface: string;
  selectionContent: string;
  textDisabled: string;
  separator: string;
  borderStrong: string;
  focus: string;
  primary: string;
  primaryPressed: string;
  secondary: string;
  brand: string;
  brandStrong: string;
  success: string;
  successSurface: string;
  warning: string;
  warningSurface: string;
  danger: string;
  dangerSurface: string;
  info: string;
  infoSurface: string;
  glassSurface: string;
  glassBorder: string;
  overlay: string;
};

export const lightColors: ThemeColors = {
  background: '#F7F8FC',
  backgroundSecondary: '#EEF1F7',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#F1F3F8',
  textPrimary: '#171A22',
  textSecondary: '#555D6D',
  textTertiary: '#7D8492',
  textInverse: '#FFFFFF',
  contrastSurface: '#171A22',
  contrastContent: '#FFFFFF',
  selectionSurface: '#E6ECFF',
  selectionContent: '#1F3F9A',
  textDisabled: '#A6ACB8',
  separator: '#E2E5EC',
  borderStrong: '#C9CFDA',
  focus: '#315AE8',
  primary: '#315AE8',
  primaryPressed: '#2448C7',
  secondary: '#6854D9',
  brand: '#DBE4FF',
  brandStrong: '#AEBFFF',
  success: '#157347',
  successSurface: '#E8F6EE',
  warning: '#8A5700',
  warningSurface: '#FFF4D8',
  danger: '#B42318',
  dangerSurface: '#FDEBE9',
  info: '#315AE8',
  infoSurface: '#EAF0FF',
  glassSurface: 'rgba(255, 255, 255, 0.78)',
  glassBorder: 'rgba(23, 26, 34, 0.10)',
  overlay: 'rgba(23, 26, 34, 0.42)',
};

export const darkColors: ThemeColors = {
  background: '#0D0F14',
  backgroundSecondary: '#151820',
  surface: '#171A22',
  surfaceElevated: '#1D212B',
  surfaceMuted: '#222733',
  textPrimary: '#F5F6FA',
  textSecondary: '#B7BECC',
  textTertiary: '#9099AA',
  textInverse: '#11131A',
  contrastSurface: '#F5F6FA',
  contrastContent: '#11131A',
  selectionSurface: '#28365E',
  selectionContent: '#D9E2FF',
  textDisabled: '#6D7482',
  separator: '#303542',
  borderStrong: '#424958',
  focus: '#86A1FF',
  primary: '#86A1FF',
  primaryPressed: '#A5B7FF',
  secondary: '#B4A5FF',
  brand: '#293657',
  brandStrong: '#415A94',
  success: '#67D49A',
  successSurface: '#163326',
  warning: '#F2BD5B',
  warningSurface: '#3C3019',
  danger: '#FF817A',
  dangerSurface: '#432321',
  info: '#86A1FF',
  infoSurface: '#202D4C',
  glassSurface: 'rgba(37, 41, 52, 0.82)',
  glassBorder: 'rgba(245, 246, 250, 0.14)',
  overlay: 'rgba(0, 0, 0, 0.60)',
};

export const GLASS_LIGHT_TINT_OPACITY = 0.6 as const;
export const GLASS_DARK_TINT_OPACITY = 0.85 as const;
export const lightModeLiquidGlassTint =
  'rgba(255, 255, 255, ' + GLASS_LIGHT_TINT_OPACITY + ')';
export const darkModeLiquidGlassTint =
  'rgba(29, 33, 43, ' + GLASS_DARK_TINT_OPACITY + ')';
export const darkModeCardSurface = '#101218' as const;
export const darkModeInsetSurface = '#1B1E27' as const;

export function getCardSurfaceColor(mode: 'light' | 'dark', lightSurface: string): string {
  return mode === 'dark' ? darkModeCardSurface : lightSurface;
}

export function getInsetSurfaceColor(mode: 'light' | 'dark', lightSurface: string): string {
  return mode === 'dark' ? darkModeInsetSurface : lightSurface;
}

export function getLiquidGlassTint(mode: 'light' | 'dark'): string {
  return mode === 'dark' ? darkModeLiquidGlassTint : lightModeLiquidGlassTint;
}
