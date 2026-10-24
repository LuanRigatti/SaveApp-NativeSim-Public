import type { PhotoDimensions, PhotoImportAsset, PhotoMetadata } from './photoTypes';
import { isScreenshotFileName } from './photoTitle';

export type PhotoMetadataInput = Omit<PhotoMetadata, 'id'>;

export type PhotoImportAdapter = {
  resolveDimensions: (asset: PhotoImportAsset) => Promise<PhotoDimensions>;
  copyToPrivateStorage: (sourceUri: string, relativePath: string) => Promise<void>;
  insertMetadata: (photo: PhotoMetadataInput) => Promise<PhotoMetadata>;
  removeFile: (relativePath: string) => Promise<void>;
  now?: () => number;
  createRelativePath?: (asset: PhotoImportAsset, timestamp: number) => string;
};

export type PhotoImportResult = {
  photos: PhotoMetadata[];
  failedCount: number;
};

const IMAGE_EXTENSIONS = new Set([
  'avif',
  'bmp',
  'gif',
  'heic',
  'heif',
  'jpeg',
  'jpg',
  'png',
  'tif',
  'tiff',
  'webp',
]);

const MIME_EXTENSIONS: Record<string, string> = {
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/tiff': 'tiff',
  'image/webp': 'webp',
};

export function isStillImageAsset(asset: PhotoImportAsset): boolean {
  if (asset.type === 'image') {
    return true;
  }

  if (asset.type != null) {
    return false;
  }

  if (asset.mimeType?.toLowerCase().startsWith('image/')) {
    return true;
  }

  const extension = asset.fileName?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return extension ? IMAGE_EXTENSIONS.has(extension) : false;
}

function imageExtension(asset: PhotoImportAsset): string {
  const filenameExtension = asset.fileName?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (filenameExtension && IMAGE_EXTENSIONS.has(filenameExtension)) {
    return filenameExtension;
  }

  const mimeType = asset.mimeType?.toLowerCase();
  return (mimeType && MIME_EXTENSIONS[mimeType]) || 'jpg';
}

function createRelativePath(asset: PhotoImportAsset, timestamp: number): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `photos/photo-${timestamp}-${suffix}.${imageExtension(asset)}`;
}

function hasValidDimensions(dimensions: PhotoDimensions): boolean {
  return (
    Number.isFinite(dimensions.width) &&
    Number.isFinite(dimensions.height) &&
    dimensions.width > 0 &&
    dimensions.height > 0
  );
}

export async function importPhotoAssets(
  assets: readonly PhotoImportAsset[],
  adapter: PhotoImportAdapter,
): Promise<PhotoImportResult> {
  const photos: PhotoMetadata[] = [];
  let failedCount = 0;

  for (const asset of assets) {
    let relativePath: string | null = null;
    let copied = false;
    try {
      if (!asset.uri || !isStillImageAsset(asset)) {
        throw new Error('Unsupported photo asset');
      }

      const dimensions = await adapter.resolveDimensions(asset);
      if (!hasValidDimensions(dimensions)) {
        throw new Error('Photo dimensions are unavailable');
      }

      const createdAt = (adapter.now ?? Date.now)();
      relativePath = (adapter.createRelativePath ?? createRelativePath)(asset, createdAt);
      await adapter.copyToPrivateStorage(asset.uri, relativePath);
      copied = true;

      const mimeType = asset.mimeType?.toLowerCase().startsWith('image/')
        ? asset.mimeType.toLowerCase()
        : null;
      photos.push(
        await adapter.insertMetadata({
          relativePath,
          width: Math.max(1, Math.round(dimensions.width)),
          height: Math.max(1, Math.round(dimensions.height)),
          createdAt,
          mimeType,
          customTitle: null,
          isScreenshot: asset.isScreenshot ?? isScreenshotFileName(asset.fileName),
          mediaType: 'photo',
          durationMs: null,
          thumbnailRelativePath: null,
        }),
      );
    } catch {
      failedCount += 1;
      if (relativePath && copied) {
        try {
          await adapter.removeFile(relativePath);
        } catch {
          // A failed cleanup must not stop the remaining selected photos from importing.
        }
      }
    }
  }

  return { photos, failedCount };
}
