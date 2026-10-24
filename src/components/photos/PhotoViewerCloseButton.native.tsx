import { Platform } from 'react-native';

import { hasExpoUiNativeModule } from '@/platform/nativeModules';
import { useVisualCapabilities } from '@/theme';

import PhotoViewerCloseButtonFallback from './PhotoViewerCloseButtonFallback';
import type { PhotoViewerCloseButtonProps } from './PhotoViewerCloseButton.types';

export default function PhotoViewerCloseButtonNative(props: PhotoViewerCloseButtonProps) {
  const { useGlass } = useVisualCapabilities();

  if (Platform.OS === 'ios' && useGlass && hasExpoUiNativeModule()) {
    // Keep the SwiftUI entry lazy so runtimes without ExpoUI can use GlassView instead.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PhotoViewerCloseButtonSwiftUI = require('./PhotoViewerCloseButtonSwiftUI.ios').default;

    return <PhotoViewerCloseButtonSwiftUI {...props} />;
  }

  return <PhotoViewerCloseButtonFallback {...props} glassAvailable={useGlass} />;
}
