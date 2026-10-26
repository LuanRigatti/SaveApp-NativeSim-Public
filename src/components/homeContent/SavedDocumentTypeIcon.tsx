import { Ionicons } from '@expo/vector-icons';

import { getDocumentThumbnailIcon } from '@/features/documents/documentPresentation';
import type { SavedDocument } from '@/features/documents/documentTypes';

type SavedDocumentTypeIconProps = {
  color: string;
  document: SavedDocument;
  size: number;
};

export function SavedDocumentTypeIcon({ color, document, size }: SavedDocumentTypeIconProps) {
  return <Ionicons color={color} name={getDocumentThumbnailIcon(document.extension)} size={size} />;
}
