import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform } from 'react-native';

import type { NativeCapabilities } from '@/types/native-ui';

import { getRuntimeEnvironment } from './runtimeEnvironment';
import { hasExpoUiNativeModule } from './nativeModules';

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

export function getNativeCapabilities(): NativeCapabilities {
  const environment = getRuntimeEnvironment();
  const canUseExpoUI =
    environment === 'development-build' && Platform.OS === 'ios' && hasExpoUiNativeModule();

  return {
    environment,
    canUseExpoUI,
    canUseNativeMenu: environment !== 'web',
    canUseNativeSheet: canUseExpoUI,
    canUseNativePicker: canUseExpoUI,
    canUseNativeTabs: environment !== 'web',
    canUseLiquidGlass: canUseLiquidGlass(),
  };
}
