const { requestConfirmedPhotoDeletion } = require('../src/features/photos/photoDeletionPipeline');
const { deleteVideoWithPersistence } = require('../src/features/photos/videoDeletionPipeline');
const { removeSavedMediaById } = require('../src/features/photos/photoGalleryState');

const video = {
  id: 41,
  relativePath: 'videos/video-1800000000000-a1b2c3d4/video.mp4',
  thumbnailRelativePath: 'videos/video-1800000000000-a1b2c3d4/thumbnail.jpg',
  width: 1920,
  height: 1080,
  createdAt: 1_800_000_000_000,
  mimeType: 'video/mp4',
  mediaType: 'video',
  durationMs: 12_500,
};

function createAdapter(overrides = {}) {
  const directoryPath = 'videos/video-1800000000000-a1b2c3d4';
  const directories = new Set([directoryPath]);
  const metadata = new Map([[video.id, video]]);
  const adapter = {
    getVideo: async (id) => metadata.get(id) ?? null,
    getStorageDirectory: () => directoryPath,
    directoryExists: (path) => directories.has(path),
    createTemporaryDirectory: () => 'videos/.delete-video-41-temporary',
    moveDirectory: async (source, destination) => {
      if (!directories.has(source) || directories.has(destination)) {
        throw new Error('directory move failed');
      }
      directories.delete(source);
      directories.add(destination);
    },
    deleteDirectory: async (path) => {
      if (!directories.delete(path)) {
        throw new Error('staged folder missing');
      }
    },
    deleteMetadata: async (id) => metadata.delete(id),
    restoreMetadata: async (entry) => metadata.set(entry.id, entry),
    directories,
    metadata,
  };
  return { ...adapter, ...overrides, directories, metadata };
}

describe('video deletion pipeline', () => {
  test('removes the video and thumbnail directory together with its metadata', async () => {
    const adapter = createAdapter();

    await expect(deleteVideoWithPersistence(video.id, adapter)).resolves.toBe(true);
    expect(adapter.directories.size).toBe(0);
    expect(adapter.metadata.has(video.id)).toBe(false);
  });

  test('restores the complete video directory when SQLite deletion fails', async () => {
    const adapter = createAdapter({
      deleteMetadata: async () => {
        throw new Error('SQLite unavailable');
      },
    });

    await expect(deleteVideoWithPersistence(video.id, adapter)).rejects.toThrow('SQLite unavailable');
    expect(adapter.directories).toEqual(new Set(['videos/video-1800000000000-a1b2c3d4']));
    expect(adapter.metadata.has(video.id)).toBe(true);
  });

  test('restores directory and metadata when final folder removal fails', async () => {
    const adapter = createAdapter({
      deleteDirectory: async () => {
        throw new Error('filesystem failed');
      },
    });

    await expect(deleteVideoWithPersistence(video.id, adapter)).rejects.toThrow('filesystem failed');
    expect(adapter.directories).toEqual(new Set(['videos/video-1800000000000-a1b2c3d4']));
    expect(adapter.metadata.has(video.id)).toBe(true);
  });

  test('cancellation preserves video and metadata and does not animate the gallery', async () => {
    const adapter = createAdapter();
    const deleteVideo = jest.fn(() => deleteVideoWithPersistence(video.id, adapter));
    const animate = jest.fn();

    await expect(
      requestConfirmedPhotoDeletion(video.id, {
        confirm: async () => false,
        deletePhoto: deleteVideo,
        onDeleted: animate,
      }),
    ).resolves.toBe('cancelled');
    expect(deleteVideo).not.toHaveBeenCalled();
    expect(animate).not.toHaveBeenCalled();
    expect(adapter.directories).toEqual(new Set(['videos/video-1800000000000-a1b2c3d4']));
    expect(adapter.metadata.has(video.id)).toBe(true);
  });

  test('mixed gallery removal preserves stable order and geometry for the remaining media', () => {
    const media = [
      { id: 31, mediaType: 'photo', width: 500, height: 900 },
      { id: 41, mediaType: 'video', width: 1920, height: 1080 },
      { id: 52, mediaType: 'photo', width: 1200, height: 800 },
    ];

    expect(removeSavedMediaById(media, video.id)).toEqual([media[0], media[2]]);
  });
});
