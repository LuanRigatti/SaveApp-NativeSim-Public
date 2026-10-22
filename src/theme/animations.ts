import { Easing } from 'react-native-reanimated';

/**
 * Motion tokens for short, purposeful transitions. Components should use
 * these values instead of defining timing and spring curves locally.
 */
export const animations = {
  duration: {
    instant: 0,
    fast: 160,
    standard: 260,
    slow: 420,
  },
  easing: {
    linear: Easing.linear,
    standard: Easing.out(Easing.cubic),
    emphasized: Easing.out(Easing.exp),
    entrance: Easing.out(Easing.quad),
    exit: Easing.in(Easing.quad),
  },
  spring: {
    gentle: {
      damping: 20,
      stiffness: 180,
      mass: 1,
    },
    responsive: {
      damping: 24,
      stiffness: 300,
      mass: 1,
    },
  },
  scale: {
    pressed: 0.97,
    subtle: 0.98,
  },
  reducedMotion: {
    duration: 0,
    scale: 1,
  },
} as const;

export type Animations = typeof animations;
