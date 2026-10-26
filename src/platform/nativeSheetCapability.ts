export function isNativeSheetSupported(platform: string, expoUiNativeModuleAvailable: boolean) {
  return platform === 'ios' && expoUiNativeModuleAvailable;
}
