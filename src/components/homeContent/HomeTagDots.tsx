import { StyleSheet, Text, View, type DimensionValue } from 'react-native';

import { getAccentColorSwatch, getAccentColorSwatchForeground } from '@/theme/colors';
import { useAppTheme } from '@/theme';
import type { SavedTagAssignment } from '@/features/home-tags/tagTypes';

export function HomeTagDots({
  maxWidth = 112,
  tags,
}: {
  maxWidth?: DimensionValue;
  tags: readonly SavedTagAssignment[];
}) {
  const { resolvedMode, theme } = useAppTheme();
  if (tags.length === 0) return null;
  const visibleTags = tags.slice(0, 2);

  return (
    <View
      accessibilityLabel={`Etiquetas: ${visibleTags.map((tag) => tag.name).join(', ')}`}
      accessible
      pointerEvents="none"
      style={{ alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: 3, maxWidth, minWidth: 0 }}
    >
      {visibleTags.map((tag) => (
        <View
          key={tag.tagId}
          style={[
            styles.badge,
            { backgroundColor: getAccentColorSwatch(tag.color, resolvedMode) },
          ]}
        >
          <Text
            ellipsizeMode="tail"
            numberOfLines={1}
            style={[
              theme.typography.caption,
              styles.name,
              {
                color: getAccentColorSwatchForeground(tag.color, resolvedMode),
                fontSize: theme.typography.caption.fontSize - 1,
                lineHeight: 14,
              },
            ]}
          >
            {tag.name}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderRadius: 999,
    flexShrink: 1,
    minHeight: 16,
    minWidth: 0,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  name: {
    flexShrink: 1,
    minWidth: 0,
  },
});
