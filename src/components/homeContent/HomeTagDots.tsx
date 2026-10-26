import { StyleSheet, View } from 'react-native';

import { getAccentColorTokens } from '@/theme/colors';
import { useAppTheme } from '@/theme';
import type { SavedTagAssignment } from '@/features/home-tags/tagTypes';

export function HomeTagDots({ tags }: { tags: readonly SavedTagAssignment[] }) {
  const { resolvedMode } = useAppTheme();
  if (tags.length === 0) return null;

  return (
    <View
      accessibilityLabel="Conteúdo etiquetado"
      accessible
      pointerEvents="none"
      style={{ alignItems: 'center', flexDirection: 'row', gap: 3, flexShrink: 0 }}
    >
      {tags.slice(0, 2).map((tag) => (
        <View
          key={tag.tagId}
          style={[
            styles.dot,
            { backgroundColor: getAccentColorTokens(tag.color, resolvedMode).primary },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
});
