/* global describe, expect, jest, test */

const {
  createExistingPermissionPhotoSubtypeReader,
  resolvePhotoScreenshotClassification,
  toIosPhotoLibraryAssetReference,
} = require('../src/features/photos/photoScreenshotDetection');

const selectedAsset = (overrides = {}) => ({
  uri: 'file:///picker/selected-photo.jpg',
  width: 1200,
  height: 1600,
  type: 'image',
  fileName: 'IMG_1234.JPG',
  assetId: 'A1B2-C3D4',
  ...overrides,
});

describe('best-effort iOS screenshot classification', () => {
  test('converts ImagePicker local identifiers to the iOS Asset URI form', () => {
    expect(toIosPhotoLibraryAssetReference(' A1B2-C3D4 ')).toBe('ph://A1B2-C3D4');
    expect(toIosPhotoLibraryAssetReference('ph://A1B2-C3D4')).toBe('ph://A1B2-C3D4');
    expect(toIosPhotoLibraryAssetReference(null)).toBeNull();
    expect(toIosPhotoLibraryAssetReference('  ')).toBeNull();
  });

  test('uses the native SCREENSHOT subtype when the selected PHAsset can be read', async () => {
    const reader = await createExistingPermissionPhotoSubtypeReader(
      'ios',
      async () => true,
      async (reference) => {
        expect(reference).toBe('ph://A1B2-C3D4');
        return ['screenshot'];
      },
    );

    await expect(resolvePhotoScreenshotClassification(selectedAsset(), reader)).resolves.toBe(true);
  });

  test('treats available native subtype metadata as authoritative over a neutral filename', async () => {
    const reader = async () => [];

    await expect(
      resolvePhotoScreenshotClassification(
        selectedAsset({ fileName: 'IMG_1234.PNG' }),
        reader,
      ),
    ).resolves.toBe(false);
  });

  test('uses an explicit screenshot filename only when native metadata is unavailable', async () => {
    await expect(
      resolvePhotoScreenshotClassification(
        selectedAsset({ fileName: 'Screenshot_2026-10-23.png' }),
        undefined,
      ),
    ).resolves.toBe(true);
    await expect(
      resolvePhotoScreenshotClassification(
        selectedAsset({ fileName: 'Screenshot_2026-10-23.png', assetId: null }),
        async () => null,
      ),
    ).resolves.toBe(true);
    await expect(
      resolvePhotoScreenshotClassification(selectedAsset({ fileName: 'IMG_1234.PNG' })),
    ).resolves.toBe(false);
  });

  test('does not request media-library access and falls back when existing permission is absent', async () => {
    const readSubtypes = jest.fn(async () => ['screenshot']);
    const checkExistingPermission = jest.fn(async () => false);
    const reader = await createExistingPermissionPhotoSubtypeReader(
      'ios',
      checkExistingPermission,
      readSubtypes,
    );

    expect(reader).toBeUndefined();
    expect(checkExistingPermission).toHaveBeenCalledTimes(1);
    expect(readSubtypes).not.toHaveBeenCalled();
    await expect(
      resolvePhotoScreenshotClassification(
        selectedAsset({ fileName: 'Screenshot 2026-10-23.png' }),
        reader,
      ),
    ).resolves.toBe(true);
  });

  test('falls back safely when the permission check or native metadata lookup fails', async () => {
    const permissionReader = await createExistingPermissionPhotoSubtypeReader(
      'ios',
      async () => {
        throw new Error('permission status unavailable');
      },
      async () => ['screenshot'],
    );
    const metadataReader = await createExistingPermissionPhotoSubtypeReader(
      'ios',
      async () => true,
      async () => {
        throw new Error('asset metadata unavailable');
      },
    );

    await expect(
      resolvePhotoScreenshotClassification(
        selectedAsset({ fileName: 'Screen Shot 2026-10-23.png' }),
        permissionReader,
      ),
    ).resolves.toBe(true);
    await expect(
      resolvePhotoScreenshotClassification(
        selectedAsset({ fileName: 'IMG_1234.PNG' }),
        metadataReader,
      ),
    ).resolves.toBe(false);
  });

  test('does not attempt the iOS subtype API on other platforms or infer from image extensions', async () => {
    const readSubtypes = jest.fn(async () => ['screenshot']);
    const reader = await createExistingPermissionPhotoSubtypeReader(
      'android',
      async () => true,
      readSubtypes,
    );

    expect(reader).toBeUndefined();
    expect(readSubtypes).not.toHaveBeenCalled();
    await expect(
      resolvePhotoScreenshotClassification(
        selectedAsset({ fileName: 'IMG_1234.PNG', assetId: null }),
        reader,
      ),
    ).resolves.toBe(false);
  });
});
