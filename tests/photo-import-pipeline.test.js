/* global describe, expect, jest, test */

const { importPhotoAssets } = require('../src/features/photos/photoImportPipeline');

const createAsset = (name) => ({
  uri: `file:///picker/${name}.jpg`,
  width: 1200,
  height: 800,
  fileName: `${name}.jpg`,
  mimeType: 'image/jpeg',
  type: 'image',
});

function createAdapter() {
  let nextId = 1;
  let nextPath = 1;

  return {
    resolveDimensions: async (asset) => ({ width: asset.width, height: asset.height }),
    copyToPrivateStorage: async () => undefined,
    insertMetadata: async (photo) => ({ id: nextId++, ...photo }),
    removeFile: async () => undefined,
    now: () => 1_800_000_000_000,
    createRelativePath: () => `photos/photo-import-${nextPath++}.jpg`,
  };
}

describe('photo import pipeline', () => {
  test('copies valid still images before returning persisted metadata in selection order', async () => {
    const adapter = createAdapter();
    const copiedUris = [];
    adapter.copyToPrivateStorage = async (uri) => {
      copiedUris.push(uri);
    };

    const result = await importPhotoAssets([createAsset('first'), createAsset('second')], adapter);

    expect(copiedUris).toEqual(['file:///picker/first.jpg', 'file:///picker/second.jpg']);
    expect(result.failedCount).toBe(0);
    expect(result.photos).toMatchObject([
      {
        id: 1,
        relativePath: 'photos/photo-import-1.jpg',
        width: 1200,
        height: 800,
        customTitle: null,
        isScreenshot: false,
      },
      {
        id: 2,
        relativePath: 'photos/photo-import-2.jpg',
        width: 1200,
        height: 800,
        customTitle: null,
        isScreenshot: false,
      },
    ]);
  });

  test('persists screenshot classification only when the picker filename explicitly identifies it', async () => {
    const adapter = createAdapter();
    const result = await importPhotoAssets(
      [
        { ...createAsset('capture'), fileName: 'Screenshot_2026-10-23.png' },
        { ...createAsset('ordinary'), fileName: 'IMG_0420.PNG' },
      ],
      adapter,
    );

    expect(result.photos.map(({ isScreenshot, customTitle }) => ({ isScreenshot, customTitle }))).toEqual([
      { isScreenshot: true, customTitle: null },
      { isScreenshot: false, customTitle: null },
    ]);
  });

  test('persists a native screenshot hint and lets a readable native result override the filename', async () => {
    const adapter = createAdapter();
    const result = await importPhotoAssets(
      [
        { ...createAsset('native-screenshot'), fileName: 'IMG_1001.PNG', isScreenshot: true },
        { ...createAsset('native-photo'), fileName: 'Screenshot_looks-like-one.png', isScreenshot: false },
      ],
      adapter,
    );

    expect(result.failedCount).toBe(0);
    expect(result.photos.map(({ isScreenshot }) => isScreenshot)).toEqual([true, false]);
  });

  test('continues after a selected photo fails to copy and writes no metadata for it', async () => {
    const adapter = createAdapter();
    const copiedUris = [];
    const insertedPaths = [];
    adapter.copyToPrivateStorage = async (uri) => {
      copiedUris.push(uri);
      if (uri.includes('broken')) {
        throw new Error('copy failed');
      }
    };
    adapter.insertMetadata = async (photo) => {
      insertedPaths.push(photo.relativePath);
      return { id: insertedPaths.length, ...photo };
    };

    const result = await importPhotoAssets(
      [createAsset('first'), createAsset('broken'), createAsset('last')],
      adapter,
    );

    expect(result.photos).toHaveLength(2);
    expect(result.failedCount).toBe(1);
    expect(insertedPaths).toEqual(['photos/photo-import-1.jpg', 'photos/photo-import-3.jpg']);
    expect(copiedUris).toHaveLength(3);
  });

  test('removes a successfully copied file when writing its metadata fails', async () => {
    const adapter = createAdapter();
    const removedPaths = [];
    adapter.insertMetadata = async () => {
      throw new Error('database insert failed');
    };
    adapter.removeFile = async (relativePath) => {
      removedPaths.push(relativePath);
    };

    const result = await importPhotoAssets([createAsset('database-failure')], adapter);

    expect(result.photos).toEqual([]);
    expect(result.failedCount).toBe(1);
    expect(removedPaths).toEqual(['photos/photo-import-1.jpg']);
  });

  test('skips videos and invalid dimensions before copying', async () => {
    const adapter = createAdapter();
    const copy = jest.fn(adapter.copyToPrivateStorage);
    adapter.copyToPrivateStorage = copy;
    const video = { ...createAsset('video'), type: 'video' };
    const invalidDimensions = { ...createAsset('empty'), width: 0, height: 0 };

    const result = await importPhotoAssets([video, invalidDimensions], adapter);

    expect(result.photos).toEqual([]);
    expect(result.failedCount).toBe(2);
    expect(copy).not.toHaveBeenCalled();
  });
});
