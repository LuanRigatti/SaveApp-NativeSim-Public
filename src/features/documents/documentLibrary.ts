import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { Alert } from 'react-native';

import { getSaveAppDatabase } from '@/features/photos/photoLibrary';
import {
  readHomeFolderAssociation,
  restoreHomeFolderAssociation,
} from '@/features/home-folders/folderAssociationDatabase';

import { savedDocumentRowToModel, type SavedDocumentRow } from './documentCatalog';
import { deleteDocumentWithPersistence } from './documentDeletionPipeline';
import { importDocumentAssets, type DocumentImportAdapter } from './documentImportPipeline';
import { previewSavedDocument } from './documentPreviewPipeline';
import { isPlainTextDocument, readDocumentTextExcerpt } from './documentTextExcerpt';
import type { DocumentMetadataInput, DocumentImportAsset, SavedDocument } from './documentTypes';

const DOCUMENT_DIRECTORY_NAME = 'documents';
const SAFE_DOCUMENT_PATH = /^documents\/document-[0-9]+-[a-z0-9]+(?:\.[a-z0-9]{1,16})?$/i;
const SAFE_STAGED_DOCUMENT_PATH =
  /^documents\/\.delete-document-[0-9]+-[0-9]+-[a-z0-9]+(?:\.[a-z0-9]{1,16})?$/i;
const SAFE_DOCUMENT_THUMBNAIL_PATH = /^document-thumbnails\/document-[0-9]+\.jpg$/i;
const SAFE_STAGED_THUMBNAIL_PATH =
  /^document-thumbnails\/\.delete-thumbnail-[0-9]+-[0-9]+-[a-z0-9]+\.jpg$/i;

function isSafeDocumentPath(relativePath: string): boolean {
  return SAFE_DOCUMENT_PATH.test(relativePath) || SAFE_STAGED_DOCUMENT_PATH.test(relativePath);
}

function fileForDocumentPath(relativePath: string): File {
  if (!isSafeDocumentPath(relativePath)) {
    throw new Error('Invalid local document path');
  }
  return new File(Paths.document, ...relativePath.split('/'));
}

function isSafeDocumentThumbnailPath(relativePath: string, documentId?: number): boolean {
  if (!SAFE_DOCUMENT_THUMBNAIL_PATH.test(relativePath)) return false;
  return documentId == null || relativePath === `document-thumbnails/document-${documentId}.jpg`;
}

function fileForManagedDocumentPath(relativePath: string): File {
  if (
    !isSafeDocumentPath(relativePath) &&
    !isSafeDocumentThumbnailPath(relativePath) &&
    !SAFE_STAGED_THUMBNAIL_PATH.test(relativePath)
  ) {
    throw new Error('Invalid private document path');
  }
  return new File(Paths.document, ...relativePath.split('/'));
}

function thumbnailPathForDocument(id: number): string {
  return `document-thumbnails/document-${id}.jpg`;
}

async function ensureDocumentDirectory(): Promise<Directory> {
  const directory = new Directory(Paths.document, DOCUMENT_DIRECTORY_NAME);
  await directory.create({ idempotent: true, intermediates: true });
  return directory;
}

async function insertDocumentMetadata(input: DocumentMetadataInput): Promise<SavedDocument> {
  const database = await getSaveAppDatabase();
  const result = await database.runAsync(
    `INSERT INTO saved_documents
       (original_name, mime_type, extension, size_bytes, relative_path, created_at, text_excerpt)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    input.originalName,
    input.mimeType,
    input.extension,
    input.sizeBytes,
    input.relativePath,
    input.createdAt,
    input.textExcerpt,
  );

  return {
    id: result.lastInsertRowId,
    contentType: 'document',
    ...input,
    thumbnailRelativePath: null,
    thumbnailUri: null,
    uri: fileForDocumentPath(input.relativePath).uri,
  };
}

async function readTextExcerpt(asset: DocumentImportAsset): Promise<string | null> {
  if (!isPlainTextDocument(asset)) return null;
  const file = new File(asset.uri);
  const handle = file.open(FileMode.ReadOnly);
  try {
    return await readDocumentTextExcerpt(asset, (length) => handle.readBytes(length));
  } finally {
    handle.close();
  }
}

async function removeDocumentFile(relativePath: string): Promise<void> {
  const file = fileForDocumentPath(relativePath);
  if (file.exists) file.delete();
  if (file.exists) throw new Error('The local document could not be removed');
}

async function copyDocumentToPrivateStorage(
  sourceUri: string,
  relativePath: string,
  expectedSizeBytes: number | null,
): Promise<number> {
  await ensureDocumentDirectory();
  const source = new File(sourceUri);
  const destination = fileForDocumentPath(relativePath);
  if (!source.exists || destination.exists) {
    throw new Error('The selected document or its destination is unavailable');
  }
  if (
    expectedSizeBytes != null &&
    Number.isFinite(expectedSizeBytes) &&
    expectedSizeBytes > 0 &&
    Paths.availableDiskSpace < expectedSizeBytes
  ) {
    throw new Error('There is not enough local storage for this document');
  }

  try {
    await source.copy(destination);
    const copiedSize = destination.size;
    if (
      !destination.exists ||
      copiedSize == null ||
      (expectedSizeBytes != null && copiedSize !== expectedSizeBytes)
    ) {
      throw new Error('The private document copy is incomplete');
    }
    return copiedSize;
  } catch (error) {
    try {
      if (destination.exists) destination.delete();
    } catch {
      // Preserve the original copy error; no metadata has been written.
    }
    throw error;
  }
}

const documentImportAdapter: DocumentImportAdapter = {
  copyToPrivateStorage: copyDocumentToPrivateStorage,
  insertMetadata: insertDocumentMetadata,
  removeFile: removeDocumentFile,
  readTextExcerpt,
};

function documentFromRow(row: SavedDocumentRow): SavedDocument | null {
  try {
    const document = savedDocumentRowToModel(row, {
      isSafeDocumentPath: (path) => SAFE_DOCUMENT_PATH.test(path),
      isSafeThumbnailPath: (path, documentId) => isSafeDocumentThumbnailPath(path, documentId),
      uriForPath: (path) => fileForManagedDocumentPath(path).uri,
    });
    if (
      document?.thumbnailRelativePath &&
      !fileForManagedDocumentPath(document.thumbnailRelativePath).exists
    ) {
      return { ...document, thumbnailUri: null };
    }
    return document;
  } catch {
    return null;
  }
}

async function getDocumentFromDatabase(id: number, includeRecentlyDeleted = false): Promise<SavedDocument | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const database = await getSaveAppDatabase();
  const row = await database.getFirstAsync<SavedDocumentRow>(
    `SELECT id, original_name, mime_type, extension, size_bytes, relative_path, thumbnail_relative_path, created_at, text_excerpt FROM saved_documents WHERE id = ?${includeRecentlyDeleted ? '' : ' AND deleted_at IS NULL'};`,
    id,
  );
  return row ? documentFromRow(row) : null;
}

export async function listSavedDocuments(): Promise<SavedDocument[]> {
  const database = await getSaveAppDatabase();
  const rows = await database.getAllAsync<SavedDocumentRow>(
    'SELECT id, original_name, mime_type, extension, size_bytes, relative_path, thumbnail_relative_path, created_at, text_excerpt FROM saved_documents WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC;',
  );

  const documents: SavedDocument[] = [];
  for (const row of rows) {
    const item = documentFromRow(row);
    if (!item) continue;
    try {
      if (fileForDocumentPath(item.relativePath).exists) {
        documents.push(item);
      }
    } catch {
      // Keep invalid or unavailable private paths out of the visible feed.
    }
  }
  return documents;
}

export async function getSavedDocument(id: number): Promise<SavedDocument | null> {
  return getDocumentFromDatabase(id);
}

export async function importSelectedDocuments(
  assets: readonly DocumentImportAsset[],
): Promise<Awaited<ReturnType<typeof importDocumentAssets>>> {
  await getSaveAppDatabase();
  await ensureDocumentDirectory();
  return importDocumentAssets(assets, documentImportAdapter);
}

export async function reserveSavedDocumentThumbnail(
  document: SavedDocument,
  thumbnailRelativePath: string,
): Promise<boolean> {
  if (
    !Number.isSafeInteger(document.id) ||
    document.id <= 0 ||
    !SAFE_DOCUMENT_PATH.test(document.relativePath) ||
    !isSafeDocumentThumbnailPath(thumbnailRelativePath, document.id)
  ) {
    return false;
  }

  const database = await getSaveAppDatabase();
  const result = await database.runAsync(
    `UPDATE saved_documents
       SET thumbnail_relative_path = ?
     WHERE id = ? AND relative_path = ?
       AND deleted_at IS NULL AND (thumbnail_relative_path IS NULL OR thumbnail_relative_path = ?);`,
    thumbnailRelativePath,
    document.id,
    document.relativePath,
    document.thumbnailRelativePath,
  );
  return result.changes === 1;
}

export async function isSavedDocumentThumbnailReservationCurrent(
  document: SavedDocument,
  thumbnailRelativePath: string,
): Promise<boolean> {
  if (!isSafeDocumentThumbnailPath(thumbnailRelativePath, document.id)) return false;
  const current = await getSavedDocument(document.id);
  return Boolean(
    current &&
      current.relativePath === document.relativePath &&
      current.thumbnailRelativePath === thumbnailRelativePath &&
      fileForDocumentPath(current.relativePath).exists &&
      fileForManagedDocumentPath(thumbnailRelativePath).exists,
  );
}

export async function clearSavedDocumentThumbnailReservation(
  document: SavedDocument,
  thumbnailRelativePath: string,
): Promise<void> {
  if (!isSafeDocumentThumbnailPath(thumbnailRelativePath, document.id)) {
    throw new Error('Invalid private thumbnail path');
  }
  const database = await getSaveAppDatabase();
  await database.runAsync(
    'UPDATE saved_documents SET thumbnail_relative_path = NULL WHERE id = ? AND relative_path = ? AND thumbnail_relative_path = ? AND deleted_at IS NULL;',
    document.id,
    document.relativePath,
    thumbnailRelativePath,
  );
}

export async function removeSavedDocumentThumbnailFile(relativePath: string): Promise<void> {
  if (!isSafeDocumentThumbnailPath(relativePath)) throw new Error('Invalid private thumbnail path');
  const file = fileForManagedDocumentPath(relativePath);
  if (file.exists) file.delete();
  if (file.exists) throw new Error('The local document thumbnail could not be removed');
}

export async function openSavedDocument(document: SavedDocument): Promise<void> {
  const status = await previewSavedDocument(document, {
    fileExists: (relativePath) => fileForDocumentPath(relativePath).exists,
    canPreview: async (item) => {
      const file = fileForDocumentPath(item.relativePath);
      return file.canPreview(item.mimeType ? { mimeType: item.mimeType } : undefined);
    },
    preview: async (item) => {
      const file = fileForDocumentPath(item.relativePath);
      await file.preview({
        title: item.originalName,
        ...(item.mimeType ? { mimeType: item.mimeType } : {}),
      });
    },
  });

  if (status === 'unsupported') {
    Alert.alert('Formato não compatível', 'Este tipo de arquivo não pode ser aberto neste dispositivo.');
  } else if (status === 'missing') {
    Alert.alert('Arquivo indisponível', 'A cópia local deste arquivo não está mais disponível.');
  } else if (status === 'failed') {
    Alert.alert('Não foi possível abrir o arquivo', 'Tente novamente. O arquivo salvo foi preservado.');
  }
}

export async function deleteSavedDocument(id: number): Promise<boolean> {
  const database = await getSaveAppDatabase();
  const folderId = await readHomeFolderAssociation(database, 'document', id);
  return deleteDocumentWithPersistence(id, {
    getDocument: (documentId) => getDocumentFromDatabase(documentId, true),
    fileExists(relativePath) {
      return fileForManagedDocumentPath(relativePath).exists;
    },
    createTemporaryPath(document) {
      const suffix = Math.random().toString(36).slice(2, 10) || 'cleanup';
      const extension = document.extension ? `.${document.extension}` : '';
      return `documents/.delete-document-${document.id}-${Date.now()}-${suffix}${extension}`;
    },
    thumbnailPath(document) {
      return document.thumbnailRelativePath ?? thumbnailPathForDocument(document.id);
    },
    createTemporaryThumbnailPath(document) {
      const suffix = Math.random().toString(36).slice(2, 10) || 'cleanup';
      return `document-thumbnails/.delete-thumbnail-${document.id}-${Date.now()}-${suffix}.jpg`;
    },
    async moveFile(sourcePath, destinationPath) {
      const source = fileForManagedDocumentPath(sourcePath);
      const destination = fileForManagedDocumentPath(destinationPath);
      if (!source.exists || destination.exists) {
        throw new Error('The local document cannot be staged');
      }
      await source.move(destination);
      if (!destination.exists) throw new Error('The staged document file is missing');
    },
    async deleteFile(relativePath) {
      const file = fileForManagedDocumentPath(relativePath);
      if (file.exists) file.delete();
      if (file.exists) throw new Error('The local document file could not be removed');
    },
    async deleteMetadata(documentId) {
      const database = await getSaveAppDatabase();
      const result = await database.runAsync('DELETE FROM saved_documents WHERE id = ?;', documentId);
      return result.changes === 1;
    },
    async restoreMetadata(document) {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          `INSERT INTO saved_documents
             (id, original_name, mime_type, extension, size_bytes, relative_path, thumbnail_relative_path, created_at, text_excerpt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          document.id,
          document.originalName,
          document.mimeType,
          document.extension,
          document.sizeBytes,
          document.relativePath,
          document.thumbnailRelativePath,
          document.createdAt,
          document.textExcerpt,
        );
        await restoreHomeFolderAssociation(transaction, 'document', document.id, folderId);
      });
    },
  });
}
