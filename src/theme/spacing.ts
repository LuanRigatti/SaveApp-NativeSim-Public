export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  screenLarge: 24,
  screen: 16,
  section: 24,
  formGroup: 24,
  safeAreaMinimum: 8,
} as const;

export type Spacing = typeof spacing;
