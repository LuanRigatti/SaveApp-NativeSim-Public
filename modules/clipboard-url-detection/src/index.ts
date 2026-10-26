import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type ClipboardURLDetectionSnapshot = {
  changeCount: number;
  hasURLItem: boolean;
  hasProbableWebURL: boolean;
};

type ClipboardURLDetectionNativeModule = {
  getDetectionSnapshotAsync: () => Promise<unknown>;
};

let cachedModule: ClipboardURLDetectionNativeModule | null | undefined;

function getNativeModule(): ClipboardURLDetectionNativeModule | null {
  if (Platform.OS !== 'ios') return null;
  if (cachedModule !== undefined) return cachedModule;
  try {
    cachedModule = requireOptionalNativeModule<ClipboardURLDetectionNativeModule>(
      'SaveAppClipboardURLDetection',
    );
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

export async function getClipboardURLDetectionSnapshot(): Promise<ClipboardURLDetectionSnapshot | null> {
  const nativeModule = getNativeModule();
  if (!nativeModule) return null;

  try {
    const result = (await nativeModule.getDetectionSnapshotAsync()) as Record<string, unknown> | null;
    if (
      !result ||
      !Number.isSafeInteger(result.changeCount) ||
      typeof result.hasURLItem !== 'boolean' ||
      typeof result.hasProbableWebURL !== 'boolean'
    ) {
      return null;
    }
    return {
      changeCount: result.changeCount as number,
      hasURLItem: result.hasURLItem,
      hasProbableWebURL: result.hasProbableWebURL,
    };
  } catch {
    return null;
  }
}
