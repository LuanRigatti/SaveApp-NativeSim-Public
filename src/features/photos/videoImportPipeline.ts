import type { PhotoDimensions, VideoImportAsset, VideoMetadata } from './photoTypes';

export type VideoMetadataInput = Omit<VideoMetadata, 'id'>;

export type VideoImportPaths = {
  videoRelativePath: string;
  thumbnailRelativePath: string;
};

export type VideoImportAdapter = {
  ensureAvailableSpace?: (asset: VideoImportAsset) => void | Promise<void>;
  copyVideoToPrivateStorage: (
    sourceUri: string,
    videoRelativePath: string,
    asset: VideoImportAsset,
  ) => Promise<void>;
  createPersistentThumbnail: (
    videoRelativePath: string,
    thumbnailRelativePath: string,
    durationMs: number | null,
  ) => Promise<VideoThumbnailMetadata | void>;
  insertMetadata: (input: VideoMetadataInput) => Promise<VideoMetadata>;
  removeFile: (relativePath: string) => Promise<void>;
  now?: () => number;
  createPaths?: (asset: VideoImportAsset, timestamp: number) => VideoImportPaths;
};

export type VideoThumbnailMetadata = {
  width?: number;
  height?: number;
  durationMs?: number | null;
};

export type VideoImportResult = {
  videos: VideoMetadata[];
  failedCount: number;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  '3gp': 'video/3gpp',
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
};

const EXTENSION_BY_MIME: Record<string, string> = {
  'video/3gpp': '3gp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
};

export function isVideoAsset(asset: VideoImportAsset): boolean {
  if (asset.type != null && asset.type !== 'video') {
    return false;
  }

  const mimeType = asset.mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  const filename = asset.fileName ?? asset.uri.split(/[?#]/, 1)[0]?.split('/').pop() ?? '';
  const extension = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();

  if (mimeType && !mimeType.startsWith('video/')) {
    return false;
  }

  return Boolean((extension && MIME_BY_EXTENSION[extension]) || (mimeType && EXTENSION_BY_MIME[mimeType]));
}

function videoFormat(asset: VideoImportAsset): { extension: string; mimeType: string } {
  const mimeType = asset.mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  const filename = asset.fileName ?? asset.uri.split(/[?#]/, 1)[0]?.split('/').pop() ?? '';
  const extension = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  const resolvedExtension = extension && MIME_BY_EXTENSION[extension]
    ? extension
    : mimeType
      ? EXTENSION_BY_MIME[mimeType]
      : undefined;

  if (!resolvedExtension) {
    throw new Error('Unsupported video format');
  }

  return {
    extension: resolvedExtension,
    mimeType: mimeType && EXTENSION_BY_MIME[mimeType] ? mimeType : MIME_BY_EXTENSION[resolvedExtension],
  };
}

function createPaths(asset: VideoImportAsset, timestamp: number): VideoImportPaths {
  const { extension } = videoFormat(asset);
  const suffix = Math.random().toString(36).slice(2, 10);
  const directory = `videos/video-${timestamp}-${suffix}`;
  return {
    videoRelativePath: `${directory}/video.${extension}`,
    thumbnailRelativePath: `${directory}/thumbnail.jpg`,
  };
}

function hasValidDimensions(dimensions: PhotoDimensions): boolean {
  return (
    Number.isFinite(dimensions.width) &&
    Number.isFinite(dimensions.height) &&
    dimensions.width > 0 &&
    dimensions.height > 0
  );
}

export async function importVideoAssets(
  assets: readonly VideoImportAsset[],
  adapter: VideoImportAdapter,
): Promise<VideoImportResult> {
  const videos: VideoMetadata[] = [];
  let failedCount = 0;

  for (const asset of assets) {
    let paths: VideoImportPaths | null = null;
    try {
      if (!asset.uri || !isVideoAsset(asset)) {
        throw new Error('Unsupported video asset');
      }

      await adapter.ensureAvailableSpace?.(asset);
      const createdAt = (adapter.now ?? Date.now)();
      paths = (adapter.createPaths ?? createPaths)(asset, createdAt);
      await adapter.copyVideoToPrivateStorage(asset.uri, paths.videoRelativePath, asset);

      const pickerDurationMs = Number.isFinite(asset.duration) && asset.duration != null && asset.duration > 0
        ? asset.duration
        : null;
      const thumbnailMetadata = await adapter.createPersistentThumbnail(
        paths.videoRelativePath,
        paths.thumbnailRelativePath,
        pickerDurationMs,
      );

      const dimensions = {
        width: hasValidDimensions({ width: asset.width, height: asset.height })
          ? asset.width
          : thumbnailMetadata?.width ?? 0,
        height: hasValidDimensions({ width: asset.width, height: asset.height })
          ? asset.height
          : thumbnailMetadata?.height ?? 0,
      };
      if (!hasValidDimensions(dimensions)) {
        throw new Error('Video dimensions were unavailable after loading the video');
      }

      const durationMs = pickerDurationMs ?? thumbnailMetadata?.durationMs ?? null;
      if (durationMs != null && (!Number.isFinite(durationMs) || durationMs <= 0)) {
        throw new Error('Video duration metadata is invalid');
      }

      const { mimeType } = videoFormat(asset);
      videos.push(
        await adapter.insertMetadata({
          relativePath: paths.videoRelativePath,
          width: Math.max(1, Math.round(dimensions.width)),
          height: Math.max(1, Math.round(dimensions.height)),
          createdAt,
          mimeType,
          mediaType: 'video',
          durationMs,
          thumbnailRelativePath: paths.thumbnailRelativePath,
        }),
      );
    } catch {
      failedCount += 1;
      if (paths) {
        for (const relativePath of [paths.thumbnailRelativePath, paths.videoRelativePath]) {
          try {
            await adapter.removeFile(relativePath);
          } catch {
            // A failed cleanup must not stop the remaining selected videos from importing.
          }
        }
      }
    }
  }

  return { videos, failedCount };
}
