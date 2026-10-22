import { getNativeCapabilities } from '@/platform/nativeCapabilities';

import NativeSheetExpo from './NativeSheet.expo';
import type { NativeSheetProps } from './NativeSheet.types';

export default function NativeSheetNative(props: NativeSheetProps) {
  const canUseExpoUI = getNativeCapabilities().canUseNativeSheet;

  if (!canUseExpoUI) {
    return <NativeSheetExpo {...props} />;
  }

  // Select SwiftUI synchronously in an iOS Development Build.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const NativeSheetSwiftUI = require('./NativeSheetSwiftUI.ios').default;

  return <NativeSheetSwiftUI {...props} />;
}
