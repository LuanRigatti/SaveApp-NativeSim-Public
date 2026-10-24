import { fallbackLinkTitle, normalizeWebLink } from './linkValidation';
import type { SavedHomeContent, SavedLink, SavedText } from './homeContentTypes';

export type SavedContentRow = {
  id: number;
  content_type: string;
  created_at: number;
  url: string | null;
  normalized_url: string | null;
  title: string | null;
  description: string | null;
  domain: string | null;
  image_url: string | null;
  favicon_url: string | null;
  preview_image_relative_path: string | null;
  preview_image_mime_type: string | null;
  text_content: string | null;
};

export type SavedContentPathAccess = {
  isSafePreviewPath: (path: string) => boolean;
  fileExists: (path: string) => boolean;
  uriForPath: (path: string) => string;
};

function safeRemoteImageUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname ? url.href : null;
  } catch {
    return null;
  }
}

export function savedContentRowToModel(
  row: SavedContentRow,
  paths: SavedContentPathAccess,
): SavedHomeContent | null {
  if (!Number.isSafeInteger(row.id) || row.id <= 0 || !Number.isFinite(row.created_at)) {
    return null;
  }

  if (row.content_type === 'text') {
    if (row.text_content == null || !row.text_content.trim()) return null;
    const text: SavedText = {
      id: row.id,
      contentType: 'text',
      createdAt: row.created_at,
      text: row.text_content,
    };
    return text;
  }

  if (row.content_type !== 'link' || !row.url || !row.normalized_url) return null;

  try {
    const normalized = normalizeWebLink(row.normalized_url);
    const original = normalizeWebLink(row.url);
    if (
      normalized.url !== row.normalized_url ||
      original.url !== row.url ||
      normalized.url !== original.url
    ) {
      return null;
    }
    const previewPath = row.preview_image_relative_path;
    const safePreviewPath = previewPath && paths.isSafePreviewPath(previewPath) ? previewPath : null;
    const previewImageUri = safePreviewPath && paths.fileExists(safePreviewPath)
      ? paths.uriForPath(safePreviewPath)
      : null;

    const link: SavedLink = {
      id: row.id,
      contentType: 'link',
      createdAt: row.created_at,
      url: original.url,
      normalizedUrl: normalized.url,
      title: row.title?.trim() || fallbackLinkTitle(normalized.url),
      description: row.description,
      domain: row.domain?.trim() || normalized.domain,
      imageUrl: safeRemoteImageUrl(row.image_url),
      faviconUrl: safeRemoteImageUrl(row.favicon_url),
      previewImageRelativePath: safePreviewPath,
      previewImageMimeType: safePreviewPath ? row.preview_image_mime_type : null,
      previewImageUri,
    };
    return link;
  } catch {
    return null;
  }
}
