import { requireOptionalNativeModule } from 'expo';

type ExpoUiNativeModuleMarker = object;

export function hasExpoUiNativeModule(): boolean {
  return requireOptionalNativeModule<ExpoUiNativeModuleMarker>('ExpoUI') !== null;
}

export function hasNativeModule(moduleName: string): boolean {
  return requireOptionalNativeModule<object>(moduleName) !== null;
}
