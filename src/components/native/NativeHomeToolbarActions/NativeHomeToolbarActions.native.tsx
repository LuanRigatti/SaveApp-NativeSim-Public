import type { ComponentType } from 'react';

import { getNativeCapabilities } from '@/platform/nativeCapabilities';

import NativeHomeToolbarActionsFallback from './NativeHomeToolbarActionsFallback';
import type { NativeHomeToolbarActionsProps } from './NativeHomeToolbarActions.types';

export default function NativeHomeToolbarActionsNative(props: NativeHomeToolbarActionsProps) {
  const canUseExpoUI = getNativeCapabilities().canUseExpoUI;
  const NativeImplementation = canUseExpoUI
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('./NativeHomeToolbarActionsSwiftUI.ios')
        .default as ComponentType<NativeHomeToolbarActionsProps>)
    : null;

  return NativeImplementation ? (
    <NativeImplementation {...props} />
  ) : (
    <NativeHomeToolbarActionsFallback {...props} />
  );
}
