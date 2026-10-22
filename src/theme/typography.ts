import { Platform, type TextStyle } from 'react-native';

import { fonts } from './fonts';

const activeFontFamily = fonts.family[fonts.activeFamily];

const systemFontFamily =
  Platform.select({
    ios: activeFontFamily,
    android: 'sans-serif',
    web: 'system-ui',
    default: 'sans-serif',
  }) ?? 'sans-serif';

const largeTitle = {
  fontFamily: systemFontFamily,
  fontSize: 34,
  lineHeight: 41,
  fontWeight: fonts.weight.bold,
} satisfies TextStyle;

const title1 = {
  fontFamily: systemFontFamily,
  fontSize: 28,
  lineHeight: 34,
  fontWeight: fonts.weight.bold,
} satisfies TextStyle;

const title2 = {
  fontFamily: systemFontFamily,
  fontSize: 22,
  lineHeight: 28,
  fontWeight: fonts.weight.bold,
} satisfies TextStyle;

const title3 = {
  fontFamily: systemFontFamily,
  fontSize: 20,
  lineHeight: 25,
  fontWeight: fonts.weight.semibold,
} satisfies TextStyle;

const headline = {
  fontFamily: systemFontFamily,
  fontSize: 17,
  lineHeight: 22,
  fontWeight: fonts.weight.semibold,
} satisfies TextStyle;

const body = {
  fontFamily: systemFontFamily,
  fontSize: 17,
  lineHeight: 22,
  fontWeight: fonts.weight.regular,
} satisfies TextStyle;

const callout = {
  fontFamily: systemFontFamily,
  fontSize: 16,
  lineHeight: 21,
  fontWeight: fonts.weight.regular,
} satisfies TextStyle;

const subheadline = {
  fontFamily: systemFontFamily,
  fontSize: 15,
  lineHeight: 20,
  fontWeight: fonts.weight.regular,
} satisfies TextStyle;

const footnote = {
  fontFamily: systemFontFamily,
  fontSize: 13,
  lineHeight: 18,
  fontWeight: fonts.weight.regular,
} satisfies TextStyle;

const caption = {
  fontFamily: systemFontFamily,
  fontSize: 12,
  lineHeight: 16,
  fontWeight: fonts.weight.medium,
} satisfies TextStyle;

const metricLarge = {
  ...title1,
  fontSize: 32,
  lineHeight: 38,
  fontVariant: ['tabular-nums'],
} satisfies TextStyle;

const metricMedium = {
  ...title2,
  fontSize: 24,
  lineHeight: 30,
  fontVariant: ['tabular-nums'],
} satisfies TextStyle;

const currency = {
  ...headline,
  fontVariant: ['tabular-nums'],
} satisfies TextStyle;

export const typography = {
  fontFamily: {
    system: systemFontFamily,
    rounded: fonts.family.rounded,
    monospaced: fonts.family.monospaced,
  },
  fontWeight: fonts.weight,
  largeTitle,
  title1,
  title2,
  title3,
  headline,
  body,
  callout,
  subheadline,
  footnote,
  caption,
  metricLarge,
  metricMedium,
  currency,
  // Compatibility aliases for the current component foundation.
  display: largeTitle,
  heading1: title1,
  heading2: title2,
  heading3: title3,
  bodyEmphasized: headline,
} as const;

export type Typography = typeof typography;
