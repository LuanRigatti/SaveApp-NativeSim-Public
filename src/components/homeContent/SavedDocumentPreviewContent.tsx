import { Text, View } from 'react-native';

import {
  canRenderDocumentImage,
  formatDocumentSize,
  getDocumentTypeLabel,
} from '@/features/documents/documentPresentation';
import type { SavedDocument } from '@/features/documents/documentTypes';
import { useAppTheme } from '@/theme';

import { SavedDocumentThumbnail } from './SavedDocumentThumbnail';

type SavedDocumentPreviewContentProps = {
  document: SavedDocument;
  height: number;
  width: number;
};

export function SavedDocumentPreviewContent({
  document,
  height,
  width,
}: SavedDocumentPreviewContentProps) {
  const { theme } = useAppTheme();
  const size = formatDocumentSize(document.sizeBytes);
  const excerpt = document.textExcerpt?.trim();
  const metadata = (
    <View style={{ gap: theme.spacing.xxs, minWidth: 0 }}>
      <Text
        ellipsizeMode="tail"
        numberOfLines={2}
        style={[theme.typography.headline, { color: theme.colors.textPrimary }]}
      >
        {document.originalName}
      </Text>
      <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
        {getDocumentTypeLabel(document.extension)}{size ? ` · ${size}` : ''}
      </Text>
    </View>
  );

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.separator,
        borderRadius: theme.radius.linkCard,
        borderWidth: 0.5,
        gap: theme.spacing.sm,
        height,
        overflow: 'hidden',
        padding: theme.spacing.lg,
        width,
      }}
    >
      {excerpt ? (
        <View style={{ flex: 1, gap: theme.spacing.sm }}>
          {metadata}
          <Text
            ellipsizeMode="tail"
            numberOfLines={Math.max(3, Math.floor((height - 112) / 22))}
            style={[theme.typography.body, { color: theme.colors.textSecondary, flex: 1, lineHeight: 22 }]}
          >
            {excerpt}
          </Text>
        </View>
      ) : document.thumbnailUri || canRenderDocumentImage(document) ? (
        <View style={{ flex: 1, gap: theme.spacing.sm, minHeight: 0 }}>
          <SavedDocumentThumbnail
            document={document}
            height={Math.max(1, height - 112)}
            width={width - theme.spacing.lg * 2}
          />
          {metadata}
        </View>
      ) : (
        <View style={{ alignItems: 'center', flex: 1, gap: theme.spacing.md, justifyContent: 'center' }}>
          <SavedDocumentThumbnail document={document} height={104} width={88} />
          <View style={{ alignItems: 'center', maxWidth: '100%' }}>{metadata}</View>
        </View>
      )}
    </View>
  );
}
