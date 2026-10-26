import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View, type DimensionValue } from 'react-native';

import { canRenderDocumentImage } from '@/features/documents/documentPresentation';
import type { SavedDocument } from '@/features/documents/documentTypes';
import { useAppTheme } from '@/theme';

import { SavedDocumentTypeIcon } from './SavedDocumentTypeIcon';

type SavedDocumentThumbnailProps = {
  borderRadius?: number;
  document: SavedDocument;
  height: number;
  width: DimensionValue;
};

export function SavedDocumentThumbnail({ borderRadius, document, height, width }: SavedDocumentThumbnailProps) {
  const { theme } = useAppTheme();
  const [failedThumbnailUri, setFailedThumbnailUri] = useState<string | null>(null);
  const excerpt = document.textExcerpt?.trim();
  const canShowCachedThumbnail = Boolean(
    !excerpt && document.thumbnailUri && failedThumbnailUri !== document.thumbnailUri,
  );
  const canShowImage = !excerpt && (canShowCachedThumbnail || canRenderDocumentImage(document));
  const inset = height < 60 ? theme.spacing.xxs : theme.spacing.xs;
  const iconSize = Math.max(20, Math.min(44, Math.round(height * 0.44)));
  const thumbnailRadius = borderRadius ?? theme.radius.md;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{
        alignItems: 'center',
        backgroundColor: theme.colors.surfaceMuted,
        borderColor: theme.colors.separator,
        borderRadius: thumbnailRadius,
        borderWidth: StyleSheet.hairlineWidth,
        flexShrink: 0,
        height,
        justifyContent: 'center',
        overflow: 'hidden',
        padding: canShowImage ? 0 : inset,
        width,
      }}
    >
      {excerpt ? (
        <Text
          ellipsizeMode="tail"
          numberOfLines={Math.max(2, Math.min(5, Math.floor((height - inset * 2) / 16)))}
          style={[theme.typography.caption, { color: theme.colors.textSecondary, flex: 1, fontSize: height < 60 ? 7 : undefined, lineHeight: height < 60 ? 9 : 17 }]}
        >
          {excerpt}
        </Text>
      ) : canShowCachedThumbnail && document.thumbnailUri ? (
        <Image
          allowDownscaling
          cachePolicy="none"
          contentFit="contain"
          onError={() => setFailedThumbnailUri(document.thumbnailUri)}
          recyclingKey={document.thumbnailUri}
          source={{ uri: document.thumbnailUri }}
          style={StyleSheet.absoluteFill}
        />
      ) : canShowImage ? (
        <SavedDocumentImage document={document} iconSize={iconSize} key={document.id} />
      ) : (
        <SavedDocumentTypeIcon color={theme.colors.info} document={document} size={iconSize} />
      )}
    </View>
  );
}

function SavedDocumentImage({ document, iconSize }: { document: SavedDocument; iconSize: number }) {
  const { theme } = useAppTheme();
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <SavedDocumentTypeIcon color={theme.colors.info} document={document} size={iconSize} />;
  }

  return (
    <Image
      allowDownscaling
      cachePolicy="none"
      contentFit="contain"
      onError={() => setFailed(true)}
      recyclingKey={document.uri}
      source={{ uri: document.uri }}
      style={StyleSheet.absoluteFill}
    />
  );
}
