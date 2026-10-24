import type { PhotoImportAsset } from './photoTypes';
import { isScreenshotFileName } from './photoTitle';

export type PhotoSubtypeReader = (assetReference: string) => Promise<readonly string[] | null>;
export type PickedAssetSubtypeReader = (assetId: string) => Promise<readonly string[] | null>;

/** Converts ImagePicker's iOS local identifier to the PHAsset URI accepted by expo-media-library. */
export function toIosPhotoLibraryAssetReference(assetId: string | null | undefined): string | null {
  const normalized = assetId?.trim();
  if (!normalized) {
    return null;
  }

  return /^ph:\/\//i.test(normalized) ? normalized : `ph://${normalized}`;
}

/** Builds a reader only after confirming existing access; it never asks the user for permission. */
export async function createExistingPermissionPhotoSubtypeReader(
  platform: string,
  checkExistingReadPermission: () => Promise<boolean>,
  readSubtypes: PhotoSubtypeReader,
): Promise<PickedAssetSubtypeReader | undefined> {
  if (platform !== 'ios') {
    return undefined;
  }

  try {
    if (!(await checkExistingReadPermission())) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  return async (assetId) => {
    const reference = toIosPhotoLibraryAssetReference(assetId);
    if (!reference) {
      return null;
    }

    try {
      return await readSubtypes(reference);
    } catch {
      return null;
    }
  };
}

/** Native subtypes are authoritative when available; explicit filenames are a safe fallback. */
export async function resolvePhotoScreenshotClassification(
  asset: PhotoImportAsset,
  readSubtypes?: PickedAssetSubtypeReader,
  screenshotSubtype = 'screenshot',
): Promise<boolean> {
  if (asset.assetId && readSubtypes) {
    try {
      const subtypes = await readSubtypes(asset.assetId);
      if (subtypes) {
        return subtypes.includes(screenshotSubtype);
      }
    } catch {
      // Metadata access is optional and never blocks importing the selected image.
    }
  }

  return isScreenshotFileName(asset.fileName);
}
