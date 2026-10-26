import type { SavedDocument } from './documentTypes';

export type DocumentDeletionAdapter = {
  getDocument: (id: number) => Promise<SavedDocument | null>;
  fileExists: (relativePath: string) => boolean | Promise<boolean>;
  createTemporaryPath: (document: SavedDocument) => string;
  thumbnailPath?: (document: SavedDocument) => string | null;
  createTemporaryThumbnailPath?: (document: SavedDocument) => string;
  moveFile: (sourcePath: string, destinationPath: string) => Promise<void>;
  deleteFile: (relativePath: string) => Promise<void>;
  deleteMetadata: (id: number) => Promise<boolean>;
  restoreMetadata: (document: SavedDocument) => Promise<void>;
};

export type ConfirmedDocumentDeletionAdapter = {
  confirm: () => Promise<boolean>;
  authorizeBeforeDelete?: () => Promise<boolean>;
  deleteDocument: () => Promise<boolean>;
  onDeleted?: () => void | Promise<void>;
  onMissing?: () => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
};

export type DocumentDeletionRequestResult = 'deleted' | 'cancelled' | 'missing' | 'failed' | 'in-progress';

const deletionRequestsInProgress = new Set<number>();

function attachRollbackFailure(operationError: unknown, rollbackError: unknown): Error {
  const error = new Error('Document deletion could not be fully rolled back.') as Error & {
    errors?: unknown[];
  };
  error.errors = [operationError, rollbackError];
  return error;
}

/** Stages only the SaveApp copy while updating SQLite, with compensating rollback on failure. */
export async function deleteDocumentWithPersistence(
  id: number,
  adapter: DocumentDeletionAdapter,
): Promise<boolean> {
  if (!Number.isSafeInteger(id) || id <= 0) return false;

  const document = await adapter.getDocument(id);
  if (!document) return false;

  const stagedFiles: { originalPath: string; temporaryPath: string }[] = [];
  const thumbnailPath = adapter.thumbnailPath?.(document) ?? document.thumbnailRelativePath;

  const restoreStagedFiles = async () => {
    for (const staged of [...stagedFiles].reverse()) {
      if (await adapter.fileExists(staged.temporaryPath)) {
        await adapter.moveFile(staged.temporaryPath, staged.originalPath);
      }
    }
  };

  try {
    if (await adapter.fileExists(document.relativePath)) {
      const temporaryPath = adapter.createTemporaryPath(document);
      await adapter.moveFile(document.relativePath, temporaryPath);
      stagedFiles.push({ originalPath: document.relativePath, temporaryPath });
    }

    if (
      thumbnailPath &&
      adapter.createTemporaryThumbnailPath &&
      await adapter.fileExists(thumbnailPath)
    ) {
      const temporaryPath = adapter.createTemporaryThumbnailPath(document);
      await adapter.moveFile(thumbnailPath, temporaryPath);
      stagedFiles.push({ originalPath: thumbnailPath, temporaryPath });
    }
  } catch (error) {
    try {
      await restoreStagedFiles();
    } catch (rollbackError) {
      throw attachRollbackFailure(error, rollbackError);
    }
    throw error;
  }

  let metadataDeleted: boolean;
  try {
    metadataDeleted = await adapter.deleteMetadata(id);
  } catch (error) {
    try {
      await restoreStagedFiles();
    } catch (rollbackError) {
      throw attachRollbackFailure(error, rollbackError);
    }
    throw error;
  }

  if (!metadataDeleted) {
    await restoreStagedFiles();
    return false;
  }

  const stagedThumbnail = stagedFiles.find((item) => item.originalPath === thumbnailPath);
  let thumbnailWasDeleted = false;
  if (stagedThumbnail) {
    try {
      await adapter.deleteFile(stagedThumbnail.temporaryPath);
      thumbnailWasDeleted = true;
    } catch (error) {
      try {
        const thumbnailStillExists = await adapter.fileExists(stagedThumbnail.temporaryPath);
        await restoreStagedFiles();
        await adapter.restoreMetadata(
          thumbnailStillExists
            ? document
            : { ...document, thumbnailRelativePath: null, thumbnailUri: null },
        );
      } catch (rollbackError) {
        throw attachRollbackFailure(error, rollbackError);
      }
      throw error;
    }
  }

  const stagedDocument = stagedFiles.find((item) => item.originalPath === document.relativePath);
  if (!stagedDocument) return true;

  try {
    await adapter.deleteFile(stagedDocument.temporaryPath);
    return true;
  } catch (error) {
    try {
      const documentStillExists = await adapter.fileExists(stagedDocument.temporaryPath);
      if (!documentStillExists) {
        throw new Error('The staged document cannot be restored after deletion failed.');
      }
      await adapter.moveFile(stagedDocument.temporaryPath, document.relativePath);
      await adapter.restoreMetadata(
        thumbnailWasDeleted
          ? { ...document, thumbnailRelativePath: null, thumbnailUri: null }
          : document,
      );
    } catch (rollbackError) {
      throw attachRollbackFailure(error, rollbackError);
    }
    throw error;
  }
}

export async function requestConfirmedDocumentDeletion(
  id: number,
  adapter: ConfirmedDocumentDeletionAdapter,
): Promise<DocumentDeletionRequestResult> {
  if (!Number.isSafeInteger(id) || id <= 0) return 'missing';
  if (deletionRequestsInProgress.has(id)) return 'in-progress';
  deletionRequestsInProgress.add(id);

  try {
    if (!(await adapter.confirm())) return 'cancelled';
    if (adapter.authorizeBeforeDelete && !(await adapter.authorizeBeforeDelete())) return 'cancelled';
    let deleted: boolean;
    try {
      deleted = await adapter.deleteDocument();
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
      // A UI refresh failure must not leave the duplicate-request guard set.
    }
    return 'failed';
  } finally {
    deletionRequestsInProgress.delete(id);
  }
}
