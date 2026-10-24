import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Text, View, StyleSheet } from 'react-native';

import type { SavedLink } from '@/features/home-content/homeContentTypes';
import { useAppTheme } from '@/theme';

type SavedLinkPreviewContentProps = {
  link: SavedLink;
  width: number;
};

export function SavedLinkPreviewContent({ link, width }: SavedLinkPreviewContentProps) {
  const { theme } = useAppTheme();
  const hasImage = Boolean(link.previewImageUri);

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.separator,
        borderRadius: theme.radius.linkCard,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
        width,
      }}
    >
      {hasImage ? (
        <Image
          accessibilityLabel={`Imagem de prévia de ${link.domain}`}
          cachePolicy="disk"
          contentFit="cover"
          source={{ uri: link.previewImageUri! }}
          style={{
            aspectRatio: 16 / 9,
            borderTopLeftRadius: theme.radius.linkCard,
            borderTopRightRadius: theme.radius.linkCard,
            width,
          }}
          transition={120}
        />
      ) : null}
      <View style={{ gap: theme.spacing.xs, padding: theme.spacing.md }}>
        <Text
          ellipsizeMode="tail"
          numberOfLines={2}
          style={[theme.typography.title3, { color: theme.colors.textPrimary }]}
        >
          {link.title || link.domain}
        </Text>
        {link.description?.trim() ? (
          <Text
            ellipsizeMode="tail"
            numberOfLines={3}
            style={[theme.typography.body, { color: theme.colors.textSecondary }]}
          >
            {link.description.trim()}
          </Text>
        ) : null}
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xxs }}>
          <Ionicons color={theme.colors.textTertiary} name="link-outline" size={14} />
          <Text
            ellipsizeMode="tail"
            numberOfLines={1}
            style={[theme.typography.caption, { color: theme.colors.textSecondary }]}
          >
            {link.domain}
          </Text>
        </View>
      </View>
    </View>
  );
}
