import type { VideoMetadata } from './photoTypes';

export type VideoDeletionPersistenceAdapter = {
  getVideo: (id: number) => Promise<VideoMetadata | null>;
  getStorageDirectory: (video: VideoMetadata) => string;
  directoryExists: (relativePath: string) => boolean | Promise<boolean>;
  createTemporaryDirectory: (video: VideoMetadata) => string;
  moveDirectory: (sourcePath: string, destinationPath: string) => Promise<void>;
  deleteDirectory: (relativePath: string) => Promise<void>;
  deleteMetadata: (id: number) => Promise<boolean>;
  restoreMetadata: (video: VideoMetadata) => Promise<void>;
};

function withRollbackError(message: string, operationError: unknown, rollbackError: unknown): Error {
  const error = new Error(message) as Error & { errors?: unknown[] };
  error.errors = [operationError, rollbackError];
  return error;
}

export async function deleteVideoWithPersistence(
  id: number,
  adapter: VideoDeletionPersistenceAdapter,
): Promise<boolean> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    return false;
  }

  const video = await adapter.getVideo(id);
  if (!video) {
    return false;
  }

  const storageDirectory = adapter.getStorageDirectory(video);
  const hasDirectory = await adapter.directoryExists(storageDirectory);
  const temporaryDirectory = hasDirectory ? adapter.createTemporaryDirectory(video) : null;

  if (temporaryDirectory) {
    await adapter.moveDirectory(storageDirectory, temporaryDirectory);
  }

  let metadataDeleted: boolean;
  try {
    metadataDeleted = await adapter.deleteMetadata(id);
  } catch (error) {
    if (temporaryDirectory) {
      try {
        await adapter.moveDirectory(temporaryDirectory, storageDirectory);
      } catch (rollbackError) {
        throw withRollbackError('Could not restore the video after its metadata failed to delete.', error, rollbackError);
      }
    }
    throw error;
  }

  if (!metadataDeleted) {
    if (temporaryDirectory) {
      await adapter.moveDirectory(temporaryDirectory, storageDirectory);
    }
    return false;
  }

  if (!temporaryDirectory) {
    return true;
  }

  try {
    await adapter.deleteDirectory(temporaryDirectory);
    return true;
  } catch (error) {
    let rollbackError: unknown;
    let directoryRestored = false;
    try {
      if (await adapter.directoryExists(temporaryDirectory)) {
        await adapter.moveDirectory(temporaryDirectory, storageDirectory);
        directoryRestored = true;
      } else {
        throw new Error('The staged video directory is no longer available');
      }
    } catch (restoreError) {
      rollbackError = restoreError;
    }

    if (directoryRestored) {
      try {
        await adapter.restoreMetadata(video);
      } catch (restoreError) {
        rollbackError = restoreError;
      }
    }

    if (rollbackError) {
      throw withRollbackError('Video deletion failed and could not be fully rolled back.', error, rollbackError);
    }
    throw error;
  }
}
