import type { SavedMedia } from '@/features/photos/photoTypes';
import type { SavedDocument } from '@/features/documents/documentTypes';
import type { SavedChecklistSummary } from './checklistTypes';
import type { RichNoteDocument } from './richNoteDocument';

export type SavedLink = {
  id: number;
  contentType: 'link';
  createdAt: number;
  url: string;
  normalizedUrl: string;
  title: string;
  description: string | null;
  domain: string;
  imageUrl: string | null;
  faviconUrl: string | null;
  previewImageRelativePath: string | null;
  previewImageMimeType: string | null;
  previewImageUri: string | null;
};

export type SavedText = {
  id: number;
  contentType: 'text';
  createdAt: number;
  /** Plain-text projection used by Home search and previews. */
  text: string;
  /** Exact value stored in saved_content.text_content, for lossless editing/restoration. */
  storageText: string;
  /** Versioned editor model; legacy notes are projected to a single paragraph. */
  richDocument: RichNoteDocument;
};

export type SavedHomeContent = SavedLink | SavedText;
export type SavedHomeItem = SavedMedia | SavedHomeContent | SavedDocument | SavedChecklistSummary;

export type HomeGalleryEntry =
  | { kind: 'day-separator'; id: string; dayKey: string; title: string }
  | { kind: 'content'; id: string; content: SavedHomeItem };

export function getSavedHomeItemKey(item: SavedHomeItem): string {
  if ('mediaType' in item) {
    return `${item.mediaType}:${item.id}`;
  }

  return `${item.contentType}:${item.id}`;
}
