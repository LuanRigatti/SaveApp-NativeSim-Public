import type { SavedDocument } from './documentTypes';

export type SavedDocumentRow = {
  id: number;
  original_name: string | null;
  mime_type: string | null;
  extension: string | null;
  size_bytes: number;
  relative_path: string;
  thumbnail_relative_path?: string | null;
  created_at: number;
  text_excerpt: string | null;
};

export type SavedDocumentPathAccess = {
  isSafeDocumentPath: (path: string) => boolean;
  isSafeThumbnailPath: (path: string, documentId: number) => boolean;
  uriForPath: (path: string) => string;
};

export function savedDocumentRowToModel(
  row: SavedDocumentRow,
  paths: SavedDocumentPathAccess,
): SavedDocument | null {
  if (
    !Number.isSafeInteger(row.id) ||
    row.id <= 0 ||
    !Number.isFinite(row.created_at) ||
    !Number.isSafeInteger(row.size_bytes) ||
    row.size_bytes < 0 ||
    !row.original_name?.trim() ||
    !paths.isSafeDocumentPath(row.relative_path) ||
    (row.extension != null && !/^[a-z0-9]{1,16}$/i.test(row.extension))
  ) {
    return null;
  }

  const thumbnailRelativePath = row.thumbnail_relative_path &&
    paths.isSafeThumbnailPath(row.thumbnail_relative_path, row.id)
    ? row.thumbnail_relative_path
    : null;

  return {
    id: row.id,
    contentType: 'document',
    createdAt: row.created_at,
    originalName: row.original_name,
    mimeType: row.mime_type?.trim().toLowerCase() || null,
    extension: row.extension?.toLowerCase() || null,
    sizeBytes: row.size_bytes,
    relativePath: row.relative_path,
    thumbnailRelativePath,
    thumbnailUri: thumbnailRelativePath ? paths.uriForPath(thumbnailRelativePath) : null,
    textExcerpt: row.text_excerpt?.trim() || null,
    uri: paths.uriForPath(row.relative_path),
  };
}
