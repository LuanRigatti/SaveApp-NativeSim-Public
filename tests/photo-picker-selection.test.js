/* global describe, expect, test */

const {
  countUnsupportedPickedVideos,
  groupPickedMediaAssets,
} = require('../src/features/photos/photoPickerSelection');

const createPhoto = (name) => ({
  uri: `file:///picker/${name}.jpg`,
  width: 1200,
  height: 800,
  fileName: `${name}.jpg`,
  mimeType: 'image/jpeg',
  type: 'image',
});

const createVideo = (name) => ({
  uri: `file:///picker/${name}.mp4`,
  width: 1920,
  height: 1080,
  duration: 12_500,
  fileSize: 2_000_000,
  fileName: `${name}.mp4`,
  mimeType: 'video/mp4',
  type: 'video',
});

describe('mixed photo library selection', () => {
  test('groups a photo-only selection for the existing photo import pipeline', () => {
    const assets = [createPhoto('one'), createPhoto('two')];

    expect(groupPickedMediaAssets(assets)).toEqual([
      { kind: 'photo', assets },
    ]);
    expect(countUnsupportedPickedVideos(assets)).toBe(0);
  });

  test('groups a video-only selection for the existing video import pipeline', () => {
    const assets = [createVideo('one'), createVideo('two')];

    expect(groupPickedMediaAssets(assets)).toEqual([
      { kind: 'video', assets },
    ]);
    expect(countUnsupportedPickedVideos(assets)).toBe(0);
  });

  test('keeps mixed selection order and separates photo and video storage paths', () => {
    const assets = [
      createPhoto('first-photo'),
      createVideo('first-video'),
      createVideo('second-video'),
      createPhoto('last-photo'),
    ];

    expect(groupPickedMediaAssets(assets)).toEqual([
      { kind: 'photo', assets: [assets[0]] },
      { kind: 'video', assets: [assets[1], assets[2]] },
      { kind: 'photo', assets: [assets[3]] },
    ]);
  });

  test('does not route unsupported video formats into either persistence pipeline', () => {
    const unsupportedVideo = createVideo('unsupported');
    unsupportedVideo.fileName = 'unsupported.avi';
    unsupportedVideo.uri = 'file:///picker/unsupported.avi';
    unsupportedVideo.mimeType = 'video/x-msvideo';

    expect(groupPickedMediaAssets([unsupportedVideo])).toEqual([]);
    expect(countUnsupportedPickedVideos([unsupportedVideo])).toBe(1);
  });
});
