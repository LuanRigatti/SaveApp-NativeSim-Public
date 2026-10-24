const { waitForVideoPlayerReady } = require('../src/features/photos/videoPlayerReadiness');

function createMockPlayer(initialStatus = 'loading', onSubscribe) {
  let currentStatus = initialStatus;
  const listeners = new Set();
  const player = {
    get status() {
      return currentStatus;
    },
    addListener: jest.fn((_eventName, listener) => {
      listeners.add(listener);
      onSubscribe?.(() => {
        currentStatus = 'readyToPlay';
      });
      return {
        remove: jest.fn(() => listeners.delete(listener)),
      };
    }),
    changeStatus(status, error) {
      currentStatus = status;
      for (const listener of listeners) {
        listener({ status, error });
      }
    },
    listenerCount: () => listeners.size,
  };
  return player;
}

describe('video player readiness before thumbnail generation', () => {
  test('returns immediately when the source is already ready', async () => {
    const player = createMockPlayer('readyToPlay');
    await expect(waitForVideoPlayerReady(player)).resolves.toBeUndefined();
    expect(player.addListener).not.toHaveBeenCalled();
  });

  test('waits for readyToPlay and removes its listener', async () => {
    const player = createMockPlayer();
    const ready = waitForVideoPlayerReady(player, 1000);
    expect(player.listenerCount()).toBe(1);
    player.changeStatus('readyToPlay');
    await expect(ready).resolves.toBeUndefined();
    expect(player.listenerCount()).toBe(0);
  });

  test('rechecks status after subscription to close the registration race', async () => {
    const player = createMockPlayer('loading', (markReady) => markReady());
    await expect(waitForVideoPlayerReady(player, 1000)).resolves.toBeUndefined();
    expect(player.listenerCount()).toBe(0);
  });

  test('rejects native player errors and removes its listener', async () => {
    const player = createMockPlayer();
    const ready = waitForVideoPlayerReady(player, 1000);
    player.changeStatus('error', { message: 'unsupported local media' });
    await expect(ready).rejects.toThrow('unsupported local media');
    expect(player.listenerCount()).toBe(0);
  });

  test('times out and removes its listener when loading never completes', async () => {
    jest.useFakeTimers();
    try {
      const player = createMockPlayer();
      const ready = waitForVideoPlayerReady(player, 250);
      jest.advanceTimersByTime(250);
      await expect(ready).rejects.toThrow('Timed out');
      expect(player.listenerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
