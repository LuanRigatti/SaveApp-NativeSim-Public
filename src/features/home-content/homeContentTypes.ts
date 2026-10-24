import type { SavedMedia } from '@/features/photos/photoTypes';

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
  text: string;
};

export type SavedHomeContent = SavedLink | SavedText;
export type SavedHomeItem = SavedMedia | SavedHomeContent;

export type HomeGalleryEntry =
  | { kind: 'day-separator'; id: string; dayKey: string; title: string }
  | { kind: 'content'; id: string; content: SavedHomeItem };

export function getSavedHomeItemKey(item: SavedHomeItem): string {
  if ('mediaType' in item) {
    return `${item.mediaType}:${item.id}`;
  }

  return `${item.contentType}:${item.id}`;
}
