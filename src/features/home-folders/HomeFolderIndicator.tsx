import { Ionicons } from '@expo/vector-icons';
import { Text, View, type DimensionValue } from 'react-native';

import type { AccentColorName } from '@/theme/colors';
import { useAppTheme } from '@/theme';
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
  const { accentColor, resolvedMode, theme } = useAppTheme();
  const folderAccentColor = getHomeFolderAccentColor(folderColor, accentColor, resolvedMode);
  return (
    <View
      accessibilityLabel={`Pasta ${name}`}
      style={{ alignItems: 'center', flexDirection: 'row', flexShrink, gap: 3, maxWidth, minWidth: 0 }}
    >
      <Ionicons color={folderAccentColor} name="folder-outline" size={12} />
      <Text
        numberOfLines={1}
        style={[theme.typography.caption, { color: folderAccentColor, flexShrink: 1, minWidth: 0 }]}
      >
        {name}
      </Text>
    </View>
  );
}
