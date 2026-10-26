import { HStack, Host, Image, Text } from '@expo/ui/swift-ui';
import {
  frame,
  foregroundStyle,
  font,
  lineLimit,
  truncationMode,
} from '@expo/ui/swift-ui/modifiers';
import type { DimensionValue } from 'react-native';

import { useAppTheme } from '@/theme';
import type { AccentColorName } from '@/theme/colors';
import { getHomeFolderAccentColor } from './homeFolderColor';

export default function HomeFolderIndicator({
  flexShrink = 1,
  folderColor = null,
  maxWidth = 132,
  name,
}: {
  flexShrink?: number;
  folderColor?: AccentColorName | null;
  maxWidth?: DimensionValue;
  name: string;
}) {
  const { accentColor, resolvedMode } = useAppTheme();
  const folderAccentColor = getHomeFolderAccentColor(folderColor, accentColor, resolvedMode);

  return (
    <Host
      ignoreSafeArea="all"
      matchContents
      style={{ flexShrink, maxWidth, minWidth: 0 }}
    >
      <HStack alignment="center" spacing={3}>
        <Image color={folderAccentColor} size={11} systemName="folder" />
        <Text
          modifiers={[
            font({ textStyle: 'caption2' }),
            foregroundStyle(folderAccentColor),
            lineLimit(1),
            truncationMode('tail'),
            frame({ maxWidth: 112, alignment: 'leading' }),
          ]}
        >
          {name}
        </Text>
      </HStack>
    </Host>
  );
}
