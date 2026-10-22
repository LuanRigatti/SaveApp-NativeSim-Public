import { StyleSheet } from 'react-native';

export const borders = {
  width: {
    hairline: StyleSheet.hairlineWidth,
    thin: 1,
    medium: 2,
    thick: 3,
    focus: 2,
  },
  style: 'solid',
} as const;

export type Borders = typeof borders;
