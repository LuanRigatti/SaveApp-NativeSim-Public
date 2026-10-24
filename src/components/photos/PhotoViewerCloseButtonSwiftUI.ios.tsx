import { Button, Host, Image } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  contentShape,
  controlSize,
  font,
  frame,
  preferredColorScheme,
  shapes,
} from '@expo/ui/swift-ui/modifiers';

import { useAppTheme } from '@/theme';

import type { PhotoViewerCloseButtonProps } from './PhotoViewerCloseButton.types';

const PHOTO_VIEWER_CLOSE_BUTTON_SIZE = 50;

export default function PhotoViewerCloseButtonSwiftUI({
  onPress,
  style,
}: PhotoViewerCloseButtonProps) {
  const { resolvedMode } = useAppTheme();

  return (
    <Host
      style={[
        { height: PHOTO_VIEWER_CLOSE_BUTTON_SIZE, width: PHOTO_VIEWER_CLOSE_BUTTON_SIZE },
        style,
      ]}
    >
      <Button
        onPress={onPress}
        modifiers={[
          buttonStyle('glass'),
          buttonBorderShape('circle'),
          controlSize('large'),
          preferredColorScheme(resolvedMode),
          frame({
            width: PHOTO_VIEWER_CLOSE_BUTTON_SIZE,
            height: PHOTO_VIEWER_CLOSE_BUTTON_SIZE,
            alignment: 'center',
          }),
          contentShape(shapes.circle()),
          accessibilityLabel('Fechar foto'),
        ]}
      >
        <Image modifiers={[font({ size: 18, weight: 'semibold' })]} systemName="xmark" />
      </Button>
    </Host>
  );
}
