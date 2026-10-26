import { Host, Image } from '@expo/ui/swift-ui';

import { getDocumentThumbnailSymbol } from '@/features/documents/documentPresentation';
import type { SavedDocument } from '@/features/documents/documentTypes';

type SavedDocumentTypeIconProps = {
  color: string;
  document: SavedDocument;
  size: number;
};

export function SavedDocumentTypeIcon({ color, document, size }: SavedDocumentTypeIconProps) {
  return (
    <Host matchContents style={{ height: size, width: size }}>
      <Image color={color} size={size} systemName={getDocumentThumbnailSymbol(document.extension)} />
    </Host>
  );
}
