import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform } from 'react-native';

import type { NativeCapabilities } from '@/types/native-ui';

import { getRuntimeEnvironment } from './runtimeEnvironment';
import { hasExpoUiNativeModule } from './nativeModules';
import { isNativeSheetSupported } from './nativeSheetCapability';

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
  const expoUiNativeModuleAvailable = Platform.OS === 'ios' && hasExpoUiNativeModule();
  const canUseExpoUI =
    environment === 'development-build' && expoUiNativeModuleAvailable;

  return {
    environment,
    canUseExpoUI,
    canUseNativeSwiftUI: expoUiNativeModuleAvailable,
    canUseNativeMenu: environment !== 'web',
    canUseNativeSheet: isNativeSheetSupported(Platform.OS, expoUiNativeModuleAvailable),
    canUseNativePicker: canUseExpoUI,
    canUseNativeTabs: environment !== 'web',
    canUseLiquidGlass: canUseLiquidGlass(),
  };
}
