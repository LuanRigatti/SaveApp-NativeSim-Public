import { AccessibilityInfo, Platform } from 'react-native';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useMemo, useState } from 'react';

import { useAppTheme } from './useAppTheme';

export type VisualCapabilities = {
  isLiquidGlassAvailable: boolean;
  isBlurAvailable: boolean;
  reduceTransparencyEnabled: boolean;
  reduceMotionEnabled: boolean;
  useGlass: boolean;
  useBlur: boolean;
};

function canUseLiquidGlass(): boolean {
  if (Platform.OS !== 'ios') {
    return false;
  }

  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

export function useVisualCapabilities(): VisualCapabilities {
  const { reduceMotionEnabled } = useAppTheme();
  const [reduceTransparencyEnabled, setReduceTransparencyEnabled] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (typeof AccessibilityInfo.isReduceTransparencyEnabled === 'function') {
      void AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
        if (isMounted) {
          setReduceTransparencyEnabled(enabled);
        }
      });
    }

    const subscription =
      Platform.OS === 'ios'
        ? AccessibilityInfo.addEventListener(
            'reduceTransparencyChanged',
            setReduceTransparencyEnabled,
          )
        : null;

    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, []);

  return useMemo(() => {
    const isLiquidGlassAvailable = canUseLiquidGlass();
    const isBlurAvailable = !reduceTransparencyEnabled;

    return {
      isLiquidGlassAvailable,
      isBlurAvailable,
      reduceTransparencyEnabled,
      reduceMotionEnabled,
      useGlass: isLiquidGlassAvailable && !reduceTransparencyEnabled,
      useBlur: !isLiquidGlassAvailable && isBlurAvailable,
    };
  }, [reduceMotionEnabled, reduceTransparencyEnabled]);
}
