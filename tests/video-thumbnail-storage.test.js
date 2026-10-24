jest.mock('expo-video', () => ({
  createVideoPlayer: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg' },
}));

jest.mock('expo-file-system', () => ({
  File: class MockFile {
    constructor(uri) {
      this.uri = uri;
      this.exists = uri === 'file:///cache/video-thumbnail.jpg';
      this.size = this.exists ? 10 : 0;
    }

    async copy(destination) {
      destination.exists = true;
      destination.size = 256;
    }

    delete() {
      this.exists = false;
    }
  },
}));

const { createVideoPlayer } = require('expo-video');
const { ImageManipulator } = require('expo-image-manipulator');
const { File } = require('expo-file-system');
const { createPersistentVideoThumbnail } = require('../src/features/photos/videoThumbnailStorage');

describe('persistent video thumbnail generation', () => {
  test('waits for the local player to be ready and requests a midpoint in seconds', async () => {
    let status = 'loading';
    let statusListener;
    const thumbnail = { width: 720, height: 405, release: jest.fn() };
    const player = {
      get status() { return status; },
      duration: 10,
      availableVideoTracks: [{ size: { width: 1920, height: 1080 } }],
      addListener: jest.fn((_eventName, listener) => {
        statusListener = listener;
        return { remove: jest.fn() };
      }),
      generateThumbnailsAsync: jest.fn(async (timeSeconds) => {
        expect(status).toBe('readyToPlay');
        return timeSeconds === 5 ? [thumbnail] : [];
      }),
      release: jest.fn(),
    };
    const renderedImage = {
      saveAsync: jest.fn(async () => ({ uri: 'file:///cache/video-thumbnail.jpg' })),
      release: jest.fn(),
    };
    const context = { renderAsync: jest.fn(async () => renderedImage), release: jest.fn() };
    createVideoPlayer.mockReturnValue(player);
    ImageManipulator.manipulate.mockReturnValue(context);

    const destination = new File('file:///documents/videos/video-1/thumbnail.jpg');
    const pending = createPersistentVideoThumbnail('file:///documents/videos/video-1/video.mov', destination, null);
    expect(player.generateThumbnailsAsync).not.toHaveBeenCalled();
    status = 'readyToPlay';
    statusListener({ status: 'readyToPlay' });

    await expect(pending).resolves.toEqual({ width: 1920, height: 1080, durationMs: 10_000 });
    expect(player.generateThumbnailsAsync).toHaveBeenCalledWith(5, { maxWidth: 720, maxHeight: 720 });
    expect(destination.exists).toBe(true);
    expect(destination.size).toBe(256);
    expect(player.release).toHaveBeenCalledTimes(1);
    expect(thumbnail.release).toHaveBeenCalledTimes(1);
  });
});
