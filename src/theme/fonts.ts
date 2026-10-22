export const fonts = {
  family: {
    system: 'System',
    rounded: 'ui-rounded',
    monospaced: 'Menlo',
  },
  activeFamily: 'rounded',
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;

export type Fonts = typeof fonts;
