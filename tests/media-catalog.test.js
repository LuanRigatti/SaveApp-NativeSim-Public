const {
  mediaRowToSavedMedia,
  sortSavedMediaChronologically,
} = require('../src/features/photos/mediaCatalog');

const validators = {
  isPhotoPath: (path) => /^photos\/photo-[a-z0-9-]+\.jpg$/i.test(path),
  isVideoPath: (path) => /^videos\/video-[a-z0-9-]+\/video\.(mp4|mov)$/i.test(path),
  isThumbnailPath: (path) => /^videos\/video-[a-z0-9-]+\/thumbnail\.jpg$/i.test(path),
  uriForPath: (path) => `file:///documents/${path}`,
};

const legacyPhotoRow = {
  id: 10,
  relative_path: 'photos/photo-1800000000000-a1b2c3d4.jpg',
  width: 1200,
  height: 800,
  created_at: 1_800_000_000_000,
  mime_type: 'image/jpeg',
  media_type: 'photo',
  duration_ms: null,
  thumbnail_relative_path: null,
  custom_title: null,
  is_screenshot: 0,
};

describe('mixed local media catalog', () => {
  test('maps legacy photo rows without changing their IDs or file paths', () => {
    expect(mediaRowToSavedMedia(legacyPhotoRow, validators)).toEqual({
      id: 10,
      relativePath: legacyPhotoRow.relative_path,
      width: 1200,
      height: 800,
      createdAt: 1_800_000_000_000,
      mimeType: 'image/jpeg',
      customTitle: null,
      isScreenshot: false,
      mediaType: 'photo',
      durationMs: null,
      thumbnailRelativePath: null,
      uri: `file:///documents/${legacyPhotoRow.relative_path}`,
    });
  });

  test('maps saved custom titles and explicit screenshot metadata for existing photo rows', () => {
    const titledScreenshot = mediaRowToSavedMedia(
      { ...legacyPhotoRow, custom_title: 'Inspiração', is_screenshot: 1 },
      validators,
    );

    expect(titledScreenshot).toMatchObject({
      id: legacyPhotoRow.id,
      customTitle: 'Inspiração',
      isScreenshot: true,
      createdAt: legacyPhotoRow.created_at,
    });
  });

  test('maps video metadata and its persistent thumbnail as a single stable media ID', () => {
    const videoRow = {
      ...legacyPhotoRow,
      id: 11,
      relative_path: 'videos/video-1800000000000-abcd1234/video.mov',
      mime_type: 'video/quicktime',
      media_type: 'video',
      duration_ms: 7_250,
      thumbnail_relative_path: 'videos/video-1800000000000-abcd1234/thumbnail.jpg',
    };

    expect(mediaRowToSavedMedia(videoRow, validators)).toMatchObject({
      id: 11,
      mediaType: 'video',
      relativePath: videoRow.relative_path,
      thumbnailRelativePath: videoRow.thumbnail_relative_path,
      durationMs: 7_250,
      uri: `file:///documents/${videoRow.relative_path}`,
      thumbnailUri: `file:///documents/${videoRow.thumbnail_relative_path}`,
    });
  });

  test('rejects incomplete video records without deleting their stored metadata', () => {
    const invalidVideo = {
      ...legacyPhotoRow,
      media_type: 'video',
      duration_ms: null,
      thumbnail_relative_path: null,
    };

    expect(mediaRowToSavedMedia(invalidVideo, validators)).toBeNull();
  });

  test('keeps a complete video record when duration metadata is unavailable', () => {
    const videoRowWithoutDuration = {
      ...legacyPhotoRow,
      id: 12,
      relative_path: 'videos/video-1800000000000-abcd1234/video.mov',
      mime_type: 'video/quicktime',
      media_type: 'video',
      duration_ms: null,
      thumbnail_relative_path: 'videos/video-1800000000000-abcd1234/thumbnail.jpg',
    };

    expect(mediaRowToSavedMedia(videoRowWithoutDuration, validators)).toMatchObject({
      id: 12,
      mediaType: 'video',
      durationMs: null,
      thumbnailRelativePath: videoRowWithoutDuration.thumbnail_relative_path,
    });
  });

  test('sorts photos and videos newest-first with a stable ID tie-breaker', () => {
    const mixed = [
      { id: 8, createdAt: 200, mediaType: 'photo' },
      { id: 9, createdAt: 300, mediaType: 'video' },
      { id: 12, createdAt: 200, mediaType: 'video' },
      { id: 4, createdAt: 200, mediaType: 'photo' },
    ];

    expect(sortSavedMediaChronologically(mixed).map(({ id }) => id)).toEqual([9, 12, 8, 4]);
    expect(mixed.map(({ id }) => id)).toEqual([8, 9, 12, 4]);
  });
});
