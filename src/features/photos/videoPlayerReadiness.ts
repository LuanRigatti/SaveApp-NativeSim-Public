import type { VideoPlayer } from 'expo-video';

export class VideoPlayerReadinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoPlayerReadinessError';
  }
}

export function waitForVideoPlayerReady(
  player: Pick<VideoPlayer, 'status' | 'addListener'>,
  timeoutMs = 30_000,
): Promise<void> {
  if (player.status === 'readyToPlay') {
    return Promise.resolve();
  }
  if (player.status === 'error') {
    return Promise.reject(new VideoPlayerReadinessError('The video player could not load the selected video'));
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let subscription: ReturnType<typeof player.addListener> | null = null;

    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      subscription?.remove();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    subscription = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'readyToPlay') {
        finish();
      } else if (status === 'error') {
        finish(new VideoPlayerReadinessError(error?.message || 'The video player could not load the selected video'));
      }
    });

    // The status can change between the first read and listener registration.
    if (player.status === 'readyToPlay') {
      finish();
      return;
    }
    if (player.status === 'error') {
      finish(new VideoPlayerReadinessError('The video player could not load the selected video'));
      return;
    }

    timeout = setTimeout(() => {
      finish(new VideoPlayerReadinessError('Timed out while loading the selected video'));
    }, timeoutMs);
  });
}
