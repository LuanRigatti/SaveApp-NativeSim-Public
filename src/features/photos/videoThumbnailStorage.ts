import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import { createVideoPlayer, type VideoPlayer, type VideoThumbnail } from 'expo-video';
import { File } from 'expo-file-system';

import { waitForVideoPlayerReady } from './videoPlayerReadiness';
import type { VideoThumbnailMetadata } from './videoImportPipeline';

export async function createPersistentVideoThumbnail(
  videoUri: string,
  destination: File,
  durationMs: number | null,
): Promise<VideoThumbnailMetadata> {
  const player: VideoPlayer = createVideoPlayer(videoUri);
  let temporaryImage: File | null = null;

  try {
    await waitForVideoPlayerReady(player);

    const playerDurationMs = Number.isFinite(player.duration) && player.duration > 0
      ? player.duration * 1000
      : durationMs;
    const thumbnailTimeSeconds = playerDurationMs != null && playerDurationMs > 0
      ? playerDurationMs / 2000
      : 0;

    let thumbnail: VideoThumbnail | undefined;
    [thumbnail] = await player.generateThumbnailsAsync(
      thumbnailTimeSeconds,
      { maxWidth: 720, maxHeight: 720 },
    );
    if (!thumbnail) {
      throw new Error('The video player returned no thumbnail for the loaded video');
    }

    const trackSize = player.availableVideoTracks.find(({ size }) =>
      Number.isFinite(size.width) && size.width > 0 && Number.isFinite(size.height) && size.height > 0,
    )?.size;
    const trackNeedsRotation = trackSize != null &&
      ((trackSize.width > trackSize.height) !== (thumbnail.width > thumbnail.height));
    const thumbnailMetadata = {
      width: trackSize ? (trackNeedsRotation ? trackSize.height : trackSize.width) : thumbnail.width,
      height: trackSize ? (trackNeedsRotation ? trackSize.width : trackSize.height) : thumbnail.height,
      durationMs: playerDurationMs,
    };

    let context: ReturnType<typeof ImageManipulator.manipulate> | null = null;
    let renderedImage: ImageRef | null = null;
    try {
      let savedThumbnail: Awaited<ReturnType<ImageRef['saveAsync']>>;
      context = ImageManipulator.manipulate(thumbnail, { maxWidth: 720, maxHeight: 720 });
      renderedImage = await context.renderAsync();
      savedThumbnail = await renderedImage.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.82,
      });

      temporaryImage = new File(savedThumbnail.uri);
      await temporaryImage.copy(destination);
      if (!destination.exists || !destination.size || destination.size <= 0) {
        throw new Error('The persistent video thumbnail is empty');
      }
    } finally {
      context?.release();
      renderedImage?.release();
      thumbnail.release();
    }

    return thumbnailMetadata;
  } catch (error) {
    if (destination.exists) {
      try {
        destination.delete();
      } catch {
        // Preserve the generation/copy error. The importer will also attempt cleanup.
      }
    }
    throw error;
  } finally {
    if (temporaryImage?.exists) {
      try {
        temporaryImage.delete();
      } catch {
        // The temporary output is in cache and is never stored as persistent metadata.
      }
    }
    player.release();
  }
}
