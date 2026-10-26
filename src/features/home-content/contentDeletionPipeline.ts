import type { SavedHomeContent } from './homeContentTypes';

export type SavedContentDeletionAdapter = {
  getContent: (id: number, type: SavedHomeContent['contentType']) => Promise<SavedHomeContent | null>;
  fileExists: (path: string) => boolean | Promise<boolean>;
  createTemporaryPath: (content: SavedHomeContent, relativePath: string) => string;
  moveFile: (sourcePath: string, destinationPath: string) => Promise<void>;
  deleteFile: (relativePath: string) => Promise<void>;
  deleteMetadata: (id: number, type: SavedHomeContent['contentType']) => Promise<boolean>;
  restoreMetadata: (content: SavedHomeContent) => Promise<void>;
  previewPath: (content: SavedHomeContent) => string | null;
};

export type ConfirmedSavedContentDeletionAdapter = {
  confirm: () => Promise<boolean>;
  authorizeBeforeDelete?: () => Promise<boolean>;
  deleteContent: () => Promise<boolean>;
  onDeleted?: () => void | Promise<void>;
  onMissing?: () => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
};

export type SavedContentDeletionResult = 'deleted' | 'cancelled' | 'missing' | 'failed' | 'in-progress';

const deletionRequestsInProgress = new Set<string>();

function attachRollbackFailure(message: string, operationError: unknown, rollbackError: unknown): Error {
  const error = new Error(message) as Error & { errors?: unknown[] };
  error.errors = [operationError, rollbackError];
  return error;
}

async function restoreStagedFile(
  originalPath: string,
  temporaryPath: string | null,
  adapter: SavedContentDeletionAdapter,
): Promise<void> {
  if (temporaryPath) {
    await adapter.moveFile(temporaryPath, originalPath);
  }
}

export async function deleteSavedContentWithPersistence(
  id: number,
  type: SavedHomeContent['contentType'],
  adapter: SavedContentDeletionAdapter,
): Promise<boolean> {
  if (!Number.isSafeInteger(id) || id <= 0) return false;

  const content = await adapter.getContent(id, type);
  if (!content || content.contentType !== type) return false;

  const originalPath = adapter.previewPath(content);
  const temporaryPath =
    originalPath && (await adapter.fileExists(originalPath))
      ? adapter.createTemporaryPath(content, originalPath)
      : null;
  if (originalPath && temporaryPath) {
    await adapter.moveFile(originalPath, temporaryPath);
  }

  let deleted: boolean;
  try {
    deleted = await adapter.deleteMetadata(id, type);
  } catch (error) {
    try {
      await restoreStagedFile(originalPath ?? '', temporaryPath, adapter);
    } catch (rollbackError) {
      throw attachRollbackFailure('Saved content metadata failed to delete and its preview could not be restored.', error, rollbackError);
    }
    throw error;
  }

  if (!deleted) {
    await restoreStagedFile(originalPath ?? '', temporaryPath, adapter);
    return false;
  }
  if (!temporaryPath) return true;

  try {
    await adapter.deleteFile(temporaryPath);
    return true;
  } catch (error) {
    try {
      await restoreStagedFile(originalPath ?? '', temporaryPath, adapter);
      await adapter.restoreMetadata(content);
    } catch (rollbackError) {
      throw attachRollbackFailure('Saved content deletion could not be fully rolled back.', error, rollbackError);
    }
    throw error;
  }
}

export async function requestConfirmedSavedContentDeletion(
  id: number,
  type: SavedHomeContent['contentType'],
  adapter: ConfirmedSavedContentDeletionAdapter,
): Promise<SavedContentDeletionResult> {
  if (!Number.isSafeInteger(id) || id <= 0) return 'missing';
  const requestId = `${type}:${id}`;
  if (deletionRequestsInProgress.has(requestId)) return 'in-progress';
  deletionRequestsInProgress.add(requestId);

  try {
    if (!(await adapter.confirm())) return 'cancelled';
    if (adapter.authorizeBeforeDelete && !(await adapter.authorizeBeforeDelete())) return 'cancelled';
    let deleted: boolean;
    try {
      deleted = await adapter.deleteContent();
    } catch (error) {
      await adapter.onError?.(error);
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
      // Keep confirmation UI failures from retaining the duplicate-request guard.
    }
    return 'failed';
  } finally {
    deletionRequestsInProgress.delete(requestId);
  }
}
