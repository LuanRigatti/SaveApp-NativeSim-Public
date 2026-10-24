import type { SavedMedia } from './photoTypes';

export type MediaRow = {
  id: number;
  relative_path: string;
  width: number;
  height: number;
  created_at: number;
  mime_type: string | null;
  media_type: string;
  duration_ms: number | null;
  thumbnail_relative_path: string | null;
  custom_title: string | null;
  is_screenshot: number;
};

export type MediaPathValidators = {
  isPhotoPath: (path: string) => boolean;
  isVideoPath: (path: string) => boolean;
  isThumbnailPath: (path: string) => boolean;
  uriForPath: (path: string) => string;
};

export function mediaRowToSavedMedia(
  row: MediaRow,
  paths: MediaPathValidators,
): SavedMedia | null {
  if (
    !Number.isSafeInteger(row.id) ||
    row.id <= 0 ||
    !Number.isFinite(row.width) ||
    !Number.isFinite(row.height) ||
    row.width <= 0 ||
    row.height <= 0 ||
    !Number.isFinite(row.created_at)
  ) {
    return null;
  }

  if (row.media_type === 'photo') {
    if (!paths.isPhotoPath(row.relative_path)) {
      return null;
    }

    return {
      id: row.id,
      relativePath: row.relative_path,
      width: row.width,
      height: row.height,
      createdAt: row.created_at,
      mimeType: row.mime_type,
      customTitle: typeof row.custom_title === 'string' ? row.custom_title : null,
      isScreenshot: row.is_screenshot === 1,
      mediaType: 'photo',
      durationMs: null,
      thumbnailRelativePath: null,
      uri: paths.uriForPath(row.relative_path),
    };
  }

  if (
    row.media_type !== 'video' ||
    (row.duration_ms != null &&
      (!Number.isFinite(row.duration_ms) || row.duration_ms <= 0)) ||
    !row.mime_type?.toLowerCase().startsWith('video/') ||
    !row.thumbnail_relative_path ||
    !paths.isVideoPath(row.relative_path) ||
    !paths.isThumbnailPath(row.thumbnail_relative_path)
  ) {
    return null;
  }

  const videoDirectory = row.relative_path.slice(0, row.relative_path.lastIndexOf('/'));
  const thumbnailDirectory = row.thumbnail_relative_path.slice(
    0,
    row.thumbnail_relative_path.lastIndexOf('/'),
  );
  if (videoDirectory !== thumbnailDirectory) {
    return null;
  }

  return {
    id: row.id,
    relativePath: row.relative_path,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    mimeType: row.mime_type,
    mediaType: 'video',
    durationMs: row.duration_ms,
    thumbnailRelativePath: row.thumbnail_relative_path,
    uri: paths.uriForPath(row.relative_path),
    thumbnailUri: paths.uriForPath(row.thumbnail_relative_path),
  };
}

export function sortSavedMediaChronologically<T extends Pick<SavedMedia, 'createdAt' | 'id'>>(
  media: readonly T[],
): T[] {
  return [...media].sort((first, second) => second.createdAt - first.createdAt || second.id - first.id);
}
