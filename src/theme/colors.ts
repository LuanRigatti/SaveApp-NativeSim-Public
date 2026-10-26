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

export type AccentColorName =
  | 'black'
  | 'blue'
  | 'purple'
  | 'green'
  | 'orange'
  | 'pink'
  | 'red'
  | 'gray'
  | 'cyan'
  | 'yellow'
  | 'indigo'
  | 'wine';
export type AccentColorTokens = Pick<
  ThemeColors,
  'focus' | 'primary' | 'primaryPressed' | 'selectionSurface' | 'selectionContent'
>;

export const ACCENT_COLOR_OPTIONS: readonly { id: AccentColorName; label: string }[] = [
  { id: 'black', label: 'Preto' },
  { id: 'blue', label: 'Azul' },
  { id: 'purple', label: 'Roxo' },
  { id: 'green', label: 'Verde' },
  { id: 'orange', label: 'Laranja' },
  { id: 'pink', label: 'Rosa' },
  { id: 'red', label: 'Vermelho' },
  { id: 'gray', label: 'Cinza' },
  { id: 'cyan', label: 'Ciano' },
  { id: 'yellow', label: 'Amarelo' },
  { id: 'indigo', label: 'Índigo' },
  { id: 'wine', label: 'Vinho' },
];

export const ACCENT_COLOR_COLUMNS = 6 as const;

export function getAccentColorRows() {
  return Array.from(
    { length: Math.ceil(ACCENT_COLOR_OPTIONS.length / ACCENT_COLOR_COLUMNS) },
    (_, rowIndex) => ACCENT_COLOR_OPTIONS.slice(
      rowIndex * ACCENT_COLOR_COLUMNS,
      (rowIndex + 1) * ACCENT_COLOR_COLUMNS,
    ),
  );
}

const accentPalette: Record<AccentColorName, Record<'light' | 'dark', AccentColorTokens>> = {
  black: {
    light: {
      focus: '#000000',
      primary: '#000000',
      primaryPressed: '#242424',
      selectionSurface: '#ECEEF2',
      selectionContent: '#171A22',
    },
    dark: {
      focus: '#C5CBD5',
      primary: '#C5CBD5',
      primaryPressed: '#E0E3E9',
      selectionSurface: '#343943',
      selectionContent: '#F1F3F7',
    },
  },
  blue: {
    light: {
      focus: '#315AE8',
      primary: '#315AE8',
      primaryPressed: '#2448C7',
      selectionSurface: '#E6ECFF',
      selectionContent: '#1F3F9A',
    },
    dark: {
      focus: '#86A1FF',
      primary: '#86A1FF',
      primaryPressed: '#A5B7FF',
      selectionSurface: '#28365E',
      selectionContent: '#D9E2FF',
    },
  },
  purple: {
    light: {
      focus: '#7047D1',
      primary: '#7047D1',
      primaryPressed: '#5933B7',
      selectionSurface: '#F0EAFE',
      selectionContent: '#4A2A9A',
    },
    dark: {
      focus: '#B6A0FF',
      primary: '#B6A0FF',
      primaryPressed: '#C6B8FF',
      selectionSurface: '#382D57',
      selectionContent: '#E7DDFF',
    },
  },
  green: {
    light: {
      focus: '#167A45',
      primary: '#167A45',
      primaryPressed: '#0E6236',
      selectionSurface: '#E4F4EA',
      selectionContent: '#145A35',
    },
    dark: {
      focus: '#67D49A',
      primary: '#67D49A',
      primaryPressed: '#8AE0AF',
      selectionSurface: '#1E4432',
      selectionContent: '#B6F3CF',
    },
  },
  orange: {
    light: {
      focus: '#AD5100',
      primary: '#AD5100',
      primaryPressed: '#8E4300',
      selectionSurface: '#FFF0E0',
      selectionContent: '#8A3F00',
    },
    dark: {
      focus: '#FFB36B',
      primary: '#FFB36B',
      primaryPressed: '#FFC58F',
      selectionSurface: '#4A321F',
      selectionContent: '#FFE0C2',
    },
  },
  pink: {
    light: {
      focus: '#B42368',
      primary: '#B42368',
      primaryPressed: '#921B53',
      selectionSurface: '#FBE8F1',
      selectionContent: '#86184A',
    },
    dark: {
      focus: '#F58BB8',
      primary: '#F58BB8',
      primaryPressed: '#F8A5C7',
      selectionSurface: '#4A2938',
      selectionContent: '#FFD3E5',
    },
  },
  red: {
    light: {
      focus: '#C6283D',
      primary: '#C6283D',
      primaryPressed: '#A91E32',
      selectionSurface: '#FCEBED',
      selectionContent: '#8E1D2A',
    },
    dark: {
      focus: '#FF6B5E',
      primary: '#FF6B5E',
      primaryPressed: '#FF897F',
      selectionSurface: '#4B252B',
      selectionContent: '#FFD7DA',
    },
  },
  gray: {
    light: {
      focus: '#505867',
      primary: '#505867',
      primaryPressed: '#3B424F',
      selectionSurface: '#EDF0F3',
      selectionContent: '#38404D',
    },
    dark: {
      focus: '#C0C7D4',
      primary: '#C0C7D4',
      primaryPressed: '#D2D7E0',
      selectionSurface: '#353A44',
      selectionContent: '#ECEFF4',
    },
  },
  cyan: {
    light: {
      focus: '#00677D',
      primary: '#00677D',
      primaryPressed: '#005469',
      selectionSurface: '#DDF4F8',
      selectionContent: '#00576B',
    },
    dark: {
      focus: '#55D8EC',
      primary: '#55D8EC',
      primaryPressed: '#7BE5F4',
      selectionSurface: '#1B424A',
      selectionContent: '#C4F5FC',
    },
  },
  yellow: {
    light: {
      focus: '#765400',
      primary: '#765400',
      primaryPressed: '#604400',
      selectionSurface: '#FFF3D1',
      selectionContent: '#624700',
    },
    dark: {
      focus: '#FFD166',
      primary: '#FFD166',
      primaryPressed: '#FFDF8B',
      selectionSurface: '#483A1E',
      selectionContent: '#FFE6A6',
    },
  },
  indigo: {
    light: {
      focus: '#4052A8',
      primary: '#4052A8',
      primaryPressed: '#34448F',
      selectionSurface: '#E9ECFA',
      selectionContent: '#303F85',
    },
    dark: {
      focus: '#A3B1FF',
      primary: '#A3B1FF',
      primaryPressed: '#BCC6FF',
      selectionSurface: '#2B335D',
      selectionContent: '#DDE3FF',
    },
  },
  wine: {
    light: {
      focus: '#8E345B',
      primary: '#8E345B',
      primaryPressed: '#74294B',
      selectionSurface: '#F8E8EF',
      selectionContent: '#702345',
    },
    dark: {
      focus: '#F094B7',
      primary: '#F094B7',
      primaryPressed: '#F6ADC8',
      selectionSurface: '#4B2939',
      selectionContent: '#FFD9E8',
    },
  },
};

const lightAccentSwatches: Partial<Record<AccentColorName, string>> = {
  cyan: '#00A6C8',
  yellow: '#E6AD22',
  indigo: '#4052A8',
  wine: '#8E345B',
};

export function getAccentColorTokens(
  name: AccentColorName,
  mode: 'light' | 'dark',
): AccentColorTokens {
  return accentPalette[name][mode];
}

export function isAccentColorName(value: unknown): value is AccentColorName {
  return typeof value === 'string' && ACCENT_COLOR_OPTIONS.some(({ id }) => id === value);
}

export function getAccentColorSwatch(name: AccentColorName, mode: 'light' | 'dark'): string {
  if (mode === 'light' && lightAccentSwatches[name]) return lightAccentSwatches[name]!;
  return accentPalette[name][mode].primary;
}

export function getAccentColorSwatchForeground(name: AccentColorName, mode: 'light' | 'dark'): string {
  if (mode === 'dark') return darkColors.textInverse;
  if (name === 'cyan' || name === 'yellow') return lightColors.textPrimary;
  return lightColors.textInverse;
}

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
  selectionSurface: '#ECEEF2',
  selectionContent: '#171A22',
  textDisabled: '#A6ACB8',
  separator: '#E2E5EC',
  borderStrong: '#C9CFDA',
  focus: '#000000',
  primary: '#000000',
  primaryPressed: '#242424',
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
  selectionSurface: '#343943',
  selectionContent: '#F1F3F7',
  textDisabled: '#6D7482',
  separator: '#303542',
  borderStrong: '#424958',
  focus: '#C5CBD5',
  primary: '#C5CBD5',
  primaryPressed: '#E0E3E9',
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
