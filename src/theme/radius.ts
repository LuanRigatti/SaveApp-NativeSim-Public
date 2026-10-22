export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  card: 20,
  xl: 22,
  pill: 999,
} as const;

export type Radius = typeof radius;
