import { getNativeCapabilities } from '@/platform/nativeCapabilities';

import NativeButtonExpo from './NativeButton.expo';
import type { NativeButtonProps } from './NativeButton.types';

export default function NativeButtonNative(props: NativeButtonProps) {
  const canUseExpoUI = getNativeCapabilities().canUseExpoUI;

  if (!canUseExpoUI) {
    return <NativeButtonExpo {...props} />;
  }

  // Only Development Builds with Expo UI reach this branch. Keeping the
  // require conditional prevents Expo Go and Android from evaluating Expo UI.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const NativeButtonSwiftUI = require('./NativeButtonSwiftUI.ios').default;

  return <NativeButtonSwiftUI {...props} />;
}
