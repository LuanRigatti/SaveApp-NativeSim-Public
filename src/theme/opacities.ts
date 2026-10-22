export const opacities = {
  disabled: 0.48,
  secondary: 0.72,
  tertiary: 0.56,
  overlay: 0.42,
  pressed: 0.8,
  skeleton: 0.6,
} as const;

export type Opacities = typeof opacities;
