import { sizes } from './sizes';
import { spacing } from './spacing';

export const layout = {
  screenHorizontalPadding: spacing.screen,
  screenHorizontalPaddingWide: spacing.lg,
  sectionSpacing: spacing.section,
  formGroupSpacing: spacing.formGroup,
  contentMaxWidth: 720,
  tabBarHeight: sizes.tabBarHeight,
  safeAreaMinimum: spacing.safeAreaMinimum,
  keyboardBottomSpacing: spacing.md,
} as const;

export type Layout = typeof layout;
