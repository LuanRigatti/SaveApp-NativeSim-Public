import type { PhotoMetadata } from './photoTypes';

export type PhotoDeletionPersistenceAdapter = {
  getPhoto: (id: number) => Promise<PhotoMetadata | null>;
  fileExists: (relativePath: string) => boolean | Promise<boolean>;
  createTemporaryPath: (photo: PhotoMetadata) => string;
  moveFile: (sourcePath: string, destinationPath: string) => Promise<void>;
  deleteFile: (relativePath: string) => Promise<void>;
  deleteMetadata: (id: number) => Promise<boolean>;
  restoreMetadata: (photo: PhotoMetadata) => Promise<void>;
};

export type ConfirmedPhotoDeletionAdapter = {
  confirm: () => Promise<boolean>;
  authorizeBeforeDelete?: () => Promise<boolean>;
  deletePhoto: () => Promise<boolean>;
  onDeleted?: () => void | Promise<void>;
  onMissing?: () => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
};

export type PhotoDeletionRequestResult =
  | 'deleted'
  | 'cancelled'
  | 'missing'
  | 'failed'
  | 'in-progress';

const deletionRequestsInProgress = new Set<number>();

function errorWithRollbackFailure(
  message: string,
  operationError: unknown,
  rollbackError: unknown,
): Error {
  const error = new Error(message) as Error & { errors?: unknown[] };
  error.errors = [operationError, rollbackError];
  return error;
}

async function restoreStagedFile(
  photo: PhotoMetadata,
  temporaryPath: string | null,
  adapter: PhotoDeletionPersistenceAdapter,
): Promise<void> {
  if (temporaryPath) {
    await adapter.moveFile(temporaryPath, photo.relativePath);
  }
}

/**
 * Removes the local file and its SQLite row as one compensated operation.
 * A same-directory move keeps the original bytes available if either store fails.
 */
export async function deletePhotoWithPersistence(
  id: number,
  adapter: PhotoDeletionPersistenceAdapter,
): Promise<boolean> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    return false;
  }

  const photo = await adapter.getPhoto(id);
  if (!photo) {
    return false;
  }

  const hasFile = await adapter.fileExists(photo.relativePath);
  const temporaryPath = hasFile ? adapter.createTemporaryPath(photo) : null;

  if (temporaryPath) {
    await adapter.moveFile(photo.relativePath, temporaryPath);
  }

  let metadataDeleted: boolean;
  try {
    metadataDeleted = await adapter.deleteMetadata(id);
  } catch (error) {
    try {
      await restoreStagedFile(photo, temporaryPath, adapter);
    } catch (rollbackError) {
      throw errorWithRollbackFailure(
        'Could not remove photo metadata or restore its local file.',
        error,
        rollbackError,
      );
    }
    throw error;
  }

  if (!metadataDeleted) {
    await restoreStagedFile(photo, temporaryPath, adapter);
    return false;
  }

  if (!temporaryPath) {
    return true;
  }

  try {
    await adapter.deleteFile(temporaryPath);
    return true;
  } catch (error) {
    let fileRestored = false;
    let rollbackError: unknown;

    try {
      await restoreStagedFile(photo, temporaryPath, adapter);
      fileRestored = true;
    } catch (restoreError) {
      rollbackError = restoreError;
      try {
        await adapter.deleteFile(temporaryPath);
      } catch (cleanupError) {
        rollbackError = errorWithRollbackFailure(
          'Could not restore or clean up the staged photo file.',
          restoreError,
          cleanupError,
        );
      }
    }

    if (fileRestored) {
      try {
        await adapter.restoreMetadata(photo);
      } catch (restoreError) {
        rollbackError = restoreError;
        try {
          await adapter.deleteFile(photo.relativePath);
        } catch (cleanupError) {
          rollbackError = errorWithRollbackFailure(
            'Could not restore photo metadata or clean up its local file.',
            restoreError,
            cleanupError,
          );
        }
      }
    }

    if (rollbackError) {
      throw errorWithRollbackFailure(
        'Photo deletion failed and could not be fully rolled back.',
        error,
        rollbackError,
      );
    }

    throw error;
  }
}

/** Ensures cancel, native confirmation, and repeated action taps share one delete lifecycle. */
export async function requestConfirmedPhotoDeletion(
  id: number,
  adapter: ConfirmedPhotoDeletionAdapter,
): Promise<PhotoDeletionRequestResult> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    return 'missing';
  }

  if (deletionRequestsInProgress.has(id)) {
    return 'in-progress';
  }

  deletionRequestsInProgress.add(id);

  try {
    if (!(await adapter.confirm())) {
      return 'cancelled';
    }
    if (adapter.authorizeBeforeDelete && !(await adapter.authorizeBeforeDelete())) {
      return 'cancelled';
    }

    let deleted: boolean;
    try {
      deleted = await adapter.deletePhoto();
    } catch (error) {
      try {
        await adapter.onError?.(error);
      } catch {
        // Keep native confirmation handling from rejecting the event callback.
      }
      return 'failed';
    }

    if (!deleted) {
      await adapter.onMissing?.();
      return 'missing';
    }

    await adapter.onDeleted?.();
    return 'deleted';
  } catch (error) {
    try {
      await adapter.onError?.(error);
    } catch {
      // A UI refresh or alert failure must not leave the duplicate-request lock set.
    }
    return 'failed';
  } finally {
    deletionRequestsInProgress.delete(id);
  }
}
