const {
  deletePhotoWithPersistence,
  requestConfirmedPhotoDeletion,
} = require('../src/features/photos/photoDeletionPipeline');
const { removeSavedPhotoById } = require('../src/features/photos/photoGalleryState');

const photo = {
  id: 7,
  relativePath: 'photos/photo-1800000000000-a1b2c3d4.jpg',
  width: 1200,
  height: 800,
  createdAt: 1_800_000_000_000,
  mimeType: 'image/jpeg',
  customTitle: 'Viagem',
  isScreenshot: false,
};

function createPersistenceAdapter(overrides = {}) {
  const files = new Set([photo.relativePath]);
  const metadata = new Map([[photo.id, photo]]);

  const adapter = {
    getPhoto: async (id) => metadata.get(id) ?? null,
    fileExists: (path) => files.has(path),
    createTemporaryPath: () => 'photos/photo-delete-7-test.jpg',
    moveFile: async (source, destination) => {
      if (!files.has(source) || files.has(destination)) {
        throw new Error('move failed');
      }
      files.delete(source);
      files.add(destination);
    },
    deleteFile: async (path) => {
      if (!files.delete(path)) {
        throw new Error('file missing');
      }
    },
    deleteMetadata: async (id) => metadata.delete(id),
    restoreMetadata: async (entry) => metadata.set(entry.id, entry),
    files,
    metadata,
  };

  return { ...adapter, ...overrides, files, metadata };
}

describe('photo deletion pipeline', () => {
  test('removes the app-owned photo file and its SQLite metadata', async () => {
    const adapter = createPersistenceAdapter();

    await expect(deletePhotoWithPersistence(photo.id, adapter)).resolves.toBe(true);
    expect(adapter.files).toEqual(new Set());
    expect(adapter.metadata.has(photo.id)).toBe(false);
  });

  test('restores the local file when deleting SQLite metadata fails', async () => {
    const adapter = createPersistenceAdapter({
      deleteMetadata: async () => {
        throw new Error('SQLite is unavailable');
      },
    });

    await expect(deletePhotoWithPersistence(photo.id, adapter)).rejects.toThrow(
      'SQLite is unavailable',
    );
    expect(adapter.files).toEqual(new Set([photo.relativePath]));
    expect(adapter.metadata.has(photo.id)).toBe(true);
    expect(adapter.metadata.get(photo.id)).toMatchObject({ customTitle: 'Viagem', isScreenshot: false });
  });

  test('restores the file and metadata when deleting the staged file fails', async () => {
    const adapter = createPersistenceAdapter({
      deleteFile: async () => {
        throw new Error('File deletion failed');
      },
    });

    await expect(deletePhotoWithPersistence(photo.id, adapter)).rejects.toThrow(
      'File deletion failed',
    );
    expect(adapter.files).toEqual(new Set([photo.relativePath]));
    expect(adapter.metadata.has(photo.id)).toBe(true);
  });

  test('canceling native confirmation does not touch local persistence', async () => {
    const deletePhoto = jest.fn(async () => true);
    const onDeleted = jest.fn();

    await expect(
      requestConfirmedPhotoDeletion(photo.id, {
        confirm: async () => false,
        deletePhoto,
        onDeleted,
      }),
    ).resolves.toBe('cancelled');
    expect(deletePhoto).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  test('runs the gallery removal callback only after persistence succeeds', async () => {
    const events = [];

    await expect(
      requestConfirmedPhotoDeletion(photo.id, {
        confirm: async () => {
          events.push('confirmed');
          return true;
        },
        deletePhoto: async () => {
          events.push('persisted');
          return true;
        },
        onDeleted: () => events.push('gallery-update'),
      }),
    ).resolves.toBe('deleted');

    expect(events).toEqual(['confirmed', 'persisted', 'gallery-update']);
  });

  test('removes photos from any position and preserves remaining order and aspect metadata', () => {
    const photos = [
      { id: 21, width: 600, height: 900 },
      { id: 22, width: 1200, height: 800 },
      { id: 23, width: 720, height: 1280 },
      { id: 24, width: 1600, height: 600 },
    ];

    for (const deletedId of [photos[0].id, photos[1].id, photos[3].id]) {
      const remaining = removeSavedPhotoById(photos, deletedId);
      expect(remaining.map(({ id }) => id)).toEqual(
        photos.filter(({ id }) => id !== deletedId).map(({ id }) => id),
      );
      expect(remaining).toEqual(photos.filter(({ id }) => id !== deletedId));
    }

    expect(removeSavedPhotoById([photos[3]], photos[3].id)).toEqual([]);
  });

  test('supports sequential removals without changing the order of remaining photos', () => {
    let visiblePhotos = [photo, { ...photo, id: 8 }, { ...photo, id: 9 }];

    visiblePhotos = removeSavedPhotoById(visiblePhotos, 8);
    visiblePhotos = removeSavedPhotoById(visiblePhotos, 7);

    expect(visiblePhotos.map(({ id }) => id)).toEqual([9]);
  });

  test('runs one deletion when the same photo receives duplicate requests', async () => {
    let resolveConfirmation;
    const deletePhoto = jest.fn(async () => true);
    const firstRequest = requestConfirmedPhotoDeletion(photo.id, {
      confirm: () =>
        new Promise((resolve) => {
          resolveConfirmation = resolve;
        }),
      deletePhoto,
    });

    await Promise.resolve();
    await expect(
      requestConfirmedPhotoDeletion(photo.id, {
        confirm: async () => true,
        deletePhoto,
      }),
    ).resolves.toBe('in-progress');

    resolveConfirmation(true);
    await expect(firstRequest).resolves.toBe('deleted');
    expect(deletePhoto).toHaveBeenCalledTimes(1);
  });

  test('reports persistence failures without rejecting the menu action callback', async () => {
    const onError = jest.fn();
    const onDeleted = jest.fn();
    const persistenceError = new Error('SQLite write failed');

    await expect(
      requestConfirmedPhotoDeletion(photo.id, {
        confirm: async () => true,
        deletePhoto: async () => {
          throw persistenceError;
        },
        onDeleted,
        onError,
      }),
    ).resolves.toBe('failed');
    expect(onError).toHaveBeenCalledWith(persistenceError);
    expect(onDeleted).not.toHaveBeenCalled();
  });

  test('rechecks authorization after confirmation before deleting', async () => {
    const events = [];
    const deletePhoto = jest.fn(async () => true);
    const authorizeBeforeDelete = jest.fn(async () => {
      events.push('authorization');
      return false;
    });

    await expect(requestConfirmedPhotoDeletion(photo.id, {
      confirm: async () => {
        events.push('confirmation');
        return true;
      },
      authorizeBeforeDelete,
      deletePhoto,
    })).resolves.toBe('cancelled');

    expect(events).toEqual(['confirmation', 'authorization']);
    expect(deletePhoto).not.toHaveBeenCalled();
  });
});
