const { importVideoAssets, isVideoAsset } = require('../src/features/photos/videoImportPipeline');

const createVideoAsset = (name, overrides = {}) => ({
  uri: `file:///picker/${name}.mp4`,
  width: 1920,
  height: 1080,
  duration: 12_500,
  fileSize: 2_000_000,
  fileName: `${name}.mp4`,
  mimeType: 'video/mp4',
  type: 'video',
  ...overrides,
});

function createVideoAdapter(overrides = {}) {
  let nextId = 1;
  let nextDirectory = 0;
  const files = new Set();
  const copied = [];
  const thumbnails = [];
  const removed = [];
  const metadata = [];

  return {
    files,
    copied,
    thumbnails,
    removed,
    metadata,
    ensureAvailableSpace: async () => undefined,
    copyVideoToPrivateStorage: async (uri, path) => {
      copied.push(uri);
      if (uri.includes('broken')) {
        throw new Error('copy failed');
      }
      files.add(path);
    },
    createPersistentThumbnail: async (_videoPath, path, durationMs) => {
      thumbnails.push(path);
      files.add(path);
      return { width: 1920, height: 1080, durationMs: durationMs ?? 12_500 };
    },
    insertMetadata: async (record) => {
      const saved = { id: nextId++, ...record };
      metadata.push(saved);
      return saved;
    },
    removeFile: async (path) => {
      removed.push(path);
      files.delete(path);
    },
    now: () => 1_800_000_000_000,
    createPaths: () => {
      nextDirectory += 1;
      const directory = `videos/video-import-${nextDirectory}`;
      return {
        videoRelativePath: `${directory}/video.mp4`,
        thumbnailRelativePath: `${directory}/thumbnail.jpg`,
      };
    },
    ...overrides,
  };
}

describe('video import pipeline', () => {
  test('accepts only videos and stores explicit duration, type, and stable per-item paths', async () => {
    const adapter = createVideoAdapter();
    const result = await importVideoAssets(
      [createVideoAsset('first'), createVideoAsset('second')],
      adapter,
    );

    expect(result.failedCount).toBe(0);
    expect(result).not.toHaveProperty('failures');
    expect(result.videos).toMatchObject([
      {
        id: 1,
        mediaType: 'video',
        mimeType: 'video/mp4',
        durationMs: 12_500,
        relativePath: 'videos/video-import-1/video.mp4',
        thumbnailRelativePath: 'videos/video-import-1/thumbnail.jpg',
      },
      {
        id: 2,
        mediaType: 'video',
        relativePath: 'videos/video-import-2/video.mp4',
      },
    ]);
    expect(adapter.files.size).toBe(4);
    expect(isVideoAsset(createVideoAsset('movie'))).toBe(true);
    expect(isVideoAsset(createVideoAsset('metadata-only', {
      type: null,
      fileName: null,
      mimeType: 'video/quicktime',
      uri: 'file:///picker/temporary-asset',
    }))).toBe(true);
    expect(isVideoAsset(createVideoAsset('photo', { type: 'image', mimeType: 'image/jpeg' }))).toBe(false);
  });

  test('continues after a copy failure without writing invalid metadata', async () => {
    const adapter = createVideoAdapter();
    const result = await importVideoAssets(
      [createVideoAsset('first'), createVideoAsset('broken'), createVideoAsset('last')],
      adapter,
    );

    expect(result.videos).toHaveLength(2);
    expect(result.failedCount).toBe(1);
    expect(adapter.copied).toHaveLength(3);
    expect(adapter.metadata.map(({ id }) => id)).toEqual([1, 2]);
    expect(adapter.files).toEqual(
      new Set([
        'videos/video-import-1/video.mp4',
        'videos/video-import-1/thumbnail.jpg',
        'videos/video-import-3/video.mp4',
        'videos/video-import-3/thumbnail.jpg',
      ]),
    );
    expect(adapter.removed).toEqual([
      'videos/video-import-2/thumbnail.jpg',
      'videos/video-import-2/video.mp4',
    ]);
  });

  test('rejects non-video files and recovers missing picker metadata after thumbnail generation', async () => {
    const adapter = createVideoAdapter();
    const result = await importVideoAssets(
      [
        createVideoAsset('photo', { type: 'image', fileName: 'photo.jpg', mimeType: 'image/jpeg' }),
        createVideoAsset('bad-size', { width: 0 }),
        createVideoAsset('bad-duration', { duration: null, height: 0 }),
        createVideoAsset('unsupported', { fileName: 'clip.mkv', mimeType: 'video/x-matroska' }),
      ],
      adapter,
    );

    expect(result.videos).toHaveLength(2);
    expect(result.videos[0]).toMatchObject({ width: 1920, height: 1080, durationMs: 12_500 });
    expect(result.videos[1]).toMatchObject({ width: 1920, height: 1080, durationMs: 12_500 });
    expect(result.failedCount).toBe(2);
    expect(adapter.copied).toHaveLength(2);
    expect(adapter.thumbnails).toHaveLength(2);
  });

  test('keeps a valid video when its duration remains unavailable after loading', async () => {
    const adapter = createVideoAdapter();
    adapter.createPersistentThumbnail = async (_videoPath, path) => {
      adapter.files.add(path);
      return { width: 1920, height: 1080, durationMs: null };
    };
    const result = await importVideoAssets([createVideoAsset('unknown-duration', { duration: null })], adapter);

    expect(result.failedCount).toBe(0);
    expect(result.videos[0]).toMatchObject({ durationMs: null, width: 1920, height: 1080 });
  });

  test('counts thumbnail and SQLite failures without storing invalid media records', async () => {
    const thumbnailFailure = await importVideoAssets(
      [createVideoAsset('thumb-failure')],
      createVideoAdapter({ createPersistentThumbnail: async () => { throw new Error('thumbnail failed'); } }),
    );
    expect(thumbnailFailure).toMatchObject({ videos: [], failedCount: 1 });

    const databaseFailure = await importVideoAssets(
      [createVideoAsset('database-failure')],
      createVideoAdapter({ insertMetadata: async () => { throw new Error('SQLite unavailable'); } }),
    );
    expect(databaseFailure).toMatchObject({ videos: [], failedCount: 1 });
  });

  test('cleans both copied assets when thumbnail generation or metadata insertion fails', async () => {
    const thumbnailFailureAdapter = createVideoAdapter({
      createPersistentThumbnail: async () => {
        throw new Error('thumbnail failed');
      },
    });
    const thumbnailFailure = await importVideoAssets(
      [createVideoAsset('thumb-failure')],
      thumbnailFailureAdapter,
    );
    expect(thumbnailFailure).toMatchObject({ videos: [], failedCount: 1 });
    expect(thumbnailFailureAdapter.files.size).toBe(0);

    const databaseFailureAdapter = createVideoAdapter({
      insertMetadata: async () => {
        throw new Error('SQLite unavailable');
      },
    });
    const databaseFailure = await importVideoAssets(
      [createVideoAsset('database-failure')],
      databaseFailureAdapter,
    );
    expect(databaseFailure).toMatchObject({ videos: [], failedCount: 1 });
    expect(databaseFailureAdapter.files.size).toBe(0);
    expect(databaseFailureAdapter.removed).toEqual([
      'videos/video-import-1/thumbnail.jpg',
      'videos/video-import-1/video.mp4',
    ]);
  });

  test('reports low-storage rejection as a per-video failure', async () => {
    const adapter = createVideoAdapter({
      ensureAvailableSpace: async () => {
        throw new Error('not enough space');
      },
    });
    const result = await importVideoAssets([createVideoAsset('large')], adapter);

    expect(result).toMatchObject({ videos: [], failedCount: 1 });
    expect(adapter.copied).toEqual([]);
  });
});
