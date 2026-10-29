import { Directory, File, Paths } from 'expo-file-system';

import { getSaveAppDatabase } from '@/features/photos/photoLibrary';
import {
  readHomeFolderAssociation,
  restoreHomeFolderAssociation,
} from '@/features/home-folders/folderAssociationDatabase';

import { deleteSavedContentWithPersistence } from './contentDeletionPipeline';
import { savedContentRowToModel, type SavedContentRow } from './savedContentCatalog';
import { downloadLinkPreviewImage, getLinkPreview } from './linkPreview';
import { EmptySavedTextError, saveLinkWithPreview, saveTextContent } from './contentSavePipeline';
import { fallbackLinkTitle, normalizeWebLink } from './linkValidation';
import type { SavedHomeContent, SavedLink, SavedText } from './homeContentTypes';
import { recordSaveAppDiagnosticEvent } from '../../../modules/clipboard-url-detection/src';
import type { PersistedQuickSaveLink } from '@/features/dynamic-island/quickSaveQueueImportPipeline';
import {
  encodePersistedRichNote,
  getRichNotePlainText,
  hasRichNoteContent,
  normalizeRichNoteForPersistence,
  parseRichNoteStorage,
  RICH_NOTE_STORAGE_PREFIX,
} from './richNoteDocument';
import {
  getRichNoteAssetPaths,
  cleanupOrphanedRichNoteAssets,
  materializeRichNoteAssets,
  releaseRichNoteAssetReservations,
  removeRichNoteAssetPaths,
} from './richNoteAssets';

const PREVIEW_DIRECTORY = 'home-content/link-previews';
const SAFE_PREVIEW_PATH =
  /^home-content\/link-previews\/(?:preview-[a-z0-9-]+\.(?:jpg|png|webp|gif)|\.delete-preview-[a-z0-9-]+\.(?:jpg|png|webp|gif))$/i;

function fileForPreviewPath(relativePath: string): File {
  if (!SAFE_PREVIEW_PATH.test(relativePath)) {
    throw new Error('Invalid saved content preview path');
  }
  return new File(Paths.document, ...relativePath.split('/'));
}

async function insertLinkRow(input: {
  url: string;
  normalizedUrl: string;
  createdAt: number;
  title: string;
  description: string | null;
  domain: string;
  imageUrl: string | null;
  faviconUrl: string | null;
  preview: { relativePath: string; uri: string; mimeType: string } | null;
}): Promise<SavedLink> {
  const database = await getSaveAppDatabase();
  const result = await database.runAsync(
    `INSERT INTO saved_content
       (content_type, created_at, url, normalized_url, title, description, domain,
        image_url, favicon_url, preview_image_relative_path, preview_image_mime_type, text_content)
     VALUES ('link', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
    input.createdAt,
    input.url,
    input.normalizedUrl,
    input.title,
    input.description,
    input.domain,
    input.imageUrl,
    input.faviconUrl,
    input.preview?.relativePath ?? null,
    input.preview?.mimeType ?? null,
  );

  return {
    id: result.lastInsertRowId,
    contentType: 'link',
    createdAt: input.createdAt,
    url: input.url,
    normalizedUrl: input.normalizedUrl,
    title: input.title,
    description: input.description,
    domain: input.domain,
    imageUrl: input.imageUrl,
    faviconUrl: input.faviconUrl,
    previewImageRelativePath: input.preview?.relativePath ?? null,
    previewImageMimeType: input.preview?.mimeType ?? null,
    previewImageUri: input.preview?.uri ?? null,
  };
}

export async function saveSavedLink(input: string, signal?: AbortSignal): Promise<SavedLink> {
  return saveLinkWithPreview(input, {
    async hasLink(normalizedUrl) {
      const database = await getSaveAppDatabase();
      const row = await database.getFirstAsync<{ id: number }>(
        "SELECT id FROM saved_content WHERE content_type = 'link' AND normalized_url = ? AND deleted_at IS NULL LIMIT 1;",
        normalizedUrl,
      );
      return row != null;
    },
    getPreview: (url, abortSignal) => getLinkPreview(url, abortSignal),
    async cachePreview(url, abortSignal) {
      const downloaded = await downloadLinkPreviewImage(url, abortSignal);
      const directory = new Directory(Paths.document, ...PREVIEW_DIRECTORY.split('/'));
      await directory.create({ idempotent: true, intermediates: true });
      const name = `preview-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${downloaded.extension}`;
      const relativePath = `${PREVIEW_DIRECTORY}/${name}`;
      const file = fileForPreviewPath(relativePath);

      try {
        file.create();
        await file.write(downloaded.bytes);
        if (!file.exists || !file.size || file.size <= 0) {
          throw new Error('The saved link preview image is empty.');
        }
      } catch (error) {
        if (file.exists) file.delete();
        throw error;
      }

      return { relativePath, uri: file.uri, mimeType: downloaded.mimeType };
    },
    async deletePreview(relativePath) {
      const file = fileForPreviewPath(relativePath);
      if (file.exists) file.delete();
      if (file.exists) throw new Error('The saved link preview could not be removed.');
    },
    insertLink: insertLinkRow,
    async deleteInsertedLink(id) {
      const database = await getSaveAppDatabase();
      const result = await database.runAsync(
        "DELETE FROM saved_content WHERE id = ? AND content_type = 'link';",
        id,
      );
      if (result.changes !== 1) throw new Error('The cancelled link insert could not be rolled back.');
    },
  }, signal);
}

/** Imports a durable App Group queue entry into the existing SQLite catalog without preview networking. */
export async function importQueuedQuickSaveLink(
  input: PersistedQuickSaveLink,
): Promise<'inserted' | 'alreadySaved'> {
  const normalized = normalizeWebLink(input.url);
  if (normalized.url !== input.normalizedUrl || input.createdAt <= 0) {
    throw new Error('Invalid queued quick-save record.');
  }

  const database = await getSaveAppDatabase();
  let result: 'inserted' | 'alreadySaved' = 'inserted';
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const findExisting = () => transaction.getFirstAsync<{ id: number }>(
      "SELECT id FROM saved_content WHERE content_type = 'link' AND normalized_url = ? AND deleted_at IS NULL LIMIT 1;",
      normalized.url,
    );
    if (await findExisting()) {
      result = 'alreadySaved';
      return;
    }

    try {
      await transaction.runAsync(
        `INSERT INTO saved_content
           (content_type, created_at, url, normalized_url, title, description, domain,
            image_url, favicon_url, preview_image_relative_path, preview_image_mime_type, text_content)
         VALUES ('link', ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, NULL, NULL);`,
        input.createdAt,
        normalized.url,
        normalized.url,
        fallbackLinkTitle(normalized.url),
        normalized.domain,
      );
    } catch (error) {
      // The partial unique index remains the final guard against a concurrent manual save.
      if (await findExisting()) {
        result = 'alreadySaved';
        return;
      }
      throw error;
    }
  });

  return result;
}

function savedTextFromStorage(id: number, createdAt: number, storageText: string): SavedText {
  const parsed = parseRichNoteStorage(storageText);
  return {
    id,
    contentType: 'text',
    createdAt,
    text: getRichNotePlainText(parsed.document),
    storageText,
    richDocument: parsed.document,
  };
}

function isValidStoredText(value: string): boolean {
  if (!value.startsWith(RICH_NOTE_STORAGE_PREFIX)) return value.trim().length > 0;
  const parsed = parseRichNoteStorage(value);
  return parsed.isRich && hasRichNoteContent(parsed.document);
}

export async function saveSavedText(text: string, signal?: AbortSignal): Promise<SavedText> {
  const isRichDraft = text.startsWith(RICH_NOTE_STORAGE_PREFIX);
  if (isRichDraft) {
    const parsed = parseRichNoteStorage(text);
    if (!parsed.isRich) throw new Error('The note draft could not be read.');
    const normalized = normalizeRichNoteForPersistence(parsed.document);
    if (!hasRichNoteContent(normalized)) throw new EmptySavedTextError();

    const materialized = await materializeRichNoteAssets(normalized, null);
    let persistedText: string;
    try {
      persistedText = encodePersistedRichNote(materialized.document);
    } catch (error) {
      await removeRichNoteAssetPaths(materialized.createdPaths);
      releaseRichNoteAssetReservations(materialized.createdPaths);
      throw error;
    }
    try {
      const saved = await saveTextContent(persistedText, {
        isTextValid: isValidStoredText,
        async insertText(value, createdAt) {
          const database = await getSaveAppDatabase();
          const result = await database.runAsync(
            `INSERT INTO saved_content
               (content_type, created_at, url, normalized_url, title, description, domain,
                image_url, favicon_url, preview_image_relative_path, preview_image_mime_type, text_content)
             VALUES ('text', ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?);`,
            createdAt,
            value,
          );
          return savedTextFromStorage(result.lastInsertRowId, createdAt, value);
        },
        async deleteInsertedText(id) {
          const database = await getSaveAppDatabase();
          const result = await database.runAsync(
            "DELETE FROM saved_content WHERE id = ? AND content_type = 'text';",
            id,
          );
          if (result.changes !== 1) throw new Error('The cancelled text insert could not be rolled back.');
        },
      }, signal);
      return saved;
    } catch (error) {
      const database = await getSaveAppDatabase().catch(() => null);
      if (database) {
        try {
          const persisted = await database.getFirstAsync<{ id: number }>(
            "SELECT id FROM saved_content WHERE content_type = 'text' AND text_content = ? LIMIT 1;",
            persistedText,
          );
          if (!persisted) await removeRichNoteAssetPaths(materialized.createdPaths);
        } catch {
          // An uncertain commit must retain its files; catalog cleanup can reconcile them later.
        }
      }
      throw error;
    } finally {
      releaseRichNoteAssetReservations(materialized.createdPaths);
    }
  }

  return saveTextContent(text, {
    async insertText(value, createdAt) {
      const database = await getSaveAppDatabase();
      const result = await database.runAsync(
        `INSERT INTO saved_content
           (content_type, created_at, url, normalized_url, title, description, domain,
            image_url, favicon_url, preview_image_relative_path, preview_image_mime_type, text_content)
         VALUES ('text', ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?);`,
        createdAt,
        value,
      );
      return savedTextFromStorage(result.lastInsertRowId, createdAt, value);
    },
    async deleteInsertedText(id) {
      const database = await getSaveAppDatabase();
      const result = await database.runAsync(
        "DELETE FROM saved_content WHERE id = ? AND content_type = 'text';",
        id,
      );
      if (result.changes !== 1) throw new Error('The cancelled text insert could not be rolled back.');
    },
  }, signal);
}

export async function cleanupUnreferencedSavedNoteAssets(): Promise<void> {
  const database = await getSaveAppDatabase();
  const rows = await database.getAllAsync<{ text_content: string | null }>(
    "SELECT text_content FROM saved_content WHERE content_type = 'text';",
  );
  await cleanupOrphanedRichNoteAssets(rows.flatMap((row) => row.text_content == null ? [] : [row.text_content]));
}

export async function listSavedHomeContent(): Promise<SavedHomeContent[]> {
  recordSaveAppDiagnosticEvent('home.catalog.query_started');
  try {
    const database = await getSaveAppDatabase();
    const rows = await database.getAllAsync<SavedContentRow>(
      'SELECT id, content_type, created_at, url, normalized_url, title, description, domain, image_url, favicon_url, preview_image_relative_path, preview_image_mime_type, text_content FROM saved_content WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC;',
    );
    const contents = rows.flatMap((row) => {
      try {
        const saved = savedContentRowToModel(row, {
          isSafePreviewPath: (path) => SAFE_PREVIEW_PATH.test(path),
          fileExists: (path) => fileForPreviewPath(path).exists,
          uriForPath: (path) => fileForPreviewPath(path).uri,
        });
        return saved ? [saved] : [];
      } catch {
        // Reading never deletes a row or file; an invalid preview only falls back to text.
        return [];
      }
    });
    recordSaveAppDiagnosticEvent(contents.some((item) => item.contentType === 'link')
      ? 'home.catalog.query_completed_links_present'
      : 'home.catalog.query_completed_links_absent');
    return contents;
  } catch (error) {
    recordSaveAppDiagnosticEvent('home.catalog.query_failed');
    throw error;
  }
}

export async function getSavedText(id: number): Promise<SavedText | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const database = await getSaveAppDatabase();
  const row = await database.getFirstAsync<SavedContentRow>(
    "SELECT id, content_type, created_at, url, normalized_url, title, description, domain, image_url, favicon_url, preview_image_relative_path, preview_image_mime_type, text_content FROM saved_content WHERE id = ? AND content_type = 'text' AND deleted_at IS NULL;",
    id,
  );
  const content = row
    ? savedContentRowToModel(row, {
        isSafePreviewPath: (path) => SAFE_PREVIEW_PATH.test(path),
        fileExists: (path) => fileForPreviewPath(path).exists,
        uriForPath: (path) => fileForPreviewPath(path).uri,
      })
    : null;
  return content?.contentType === 'text' ? content : null;
}

/** Updates only the text body in its existing row and resolves after SQLite commits. */
export async function updateSavedText(id: number, text: string): Promise<SavedText> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid saved text id.');

  const database = await getSaveAppDatabase();
  const currentRow = await database.getFirstAsync<{ text_content: string | null }>(
    "SELECT text_content FROM saved_content WHERE id = ? AND content_type = 'text' AND deleted_at IS NULL;",
    id,
  );
  if (currentRow?.text_content == null) throw new Error('The saved text is no longer available.');

  const isRichDraft = text.startsWith(RICH_NOTE_STORAGE_PREFIX);
  let nextStorageText = text;
  let createdPaths: string[] = [];
  let oldPaths: string[] = [];
  if (isRichDraft) {
    const parsedDraft = parseRichNoteStorage(text);
    if (!parsedDraft.isRich) throw new Error('The note draft could not be read.');
    const parsedCurrent = parseRichNoteStorage(currentRow.text_content);
    const previousDocument = parsedCurrent.isRich ? parsedCurrent.document : null;
    const normalized = normalizeRichNoteForPersistence(parsedDraft.document);
    const materialized = await materializeRichNoteAssets(normalized, previousDocument);
    try {
      nextStorageText = encodePersistedRichNote(materialized.document);
    } catch (error) {
      await removeRichNoteAssetPaths(materialized.createdPaths);
      releaseRichNoteAssetReservations(materialized.createdPaths);
      throw error;
    }
    createdPaths = materialized.createdPaths;
    if (previousDocument) oldPaths = getRichNoteAssetPaths(previousDocument);
  }

  let updatedText: SavedText | null = null;
  try {
    await database.withExclusiveTransactionAsync(async (transaction) => {
      const result = await transaction.runAsync(
        "UPDATE saved_content SET text_content = ? WHERE id = ? AND content_type = 'text' AND deleted_at IS NULL AND text_content = ?;",
        nextStorageText,
        id,
        currentRow.text_content,
      );
      if (result.changes !== 1) throw new Error('The saved text changed elsewhere; the latest edit was not overwritten.');

      const row = await transaction.getFirstAsync<{ id: number; created_at: number; text_content: string | null }>(
        "SELECT id, created_at, text_content FROM saved_content WHERE id = ? AND content_type = 'text' AND deleted_at IS NULL;",
        id,
      );
      if (!row || row.text_content == null) throw new Error('The saved text could not be confirmed.');
      updatedText = savedTextFromStorage(row.id, row.created_at, row.text_content);
    });
  } catch (error) {
    let confirmedNotCommitted = false;
    try {
      const committed = await database.getFirstAsync<{ id: number }>(
        "SELECT id FROM saved_content WHERE id = ? AND content_type = 'text' AND text_content = ?;",
        id,
        nextStorageText,
      );
      confirmedNotCommitted = !committed;
    } catch {
      // An uncertain commit must retain its files; catalog cleanup can reconcile them later.
    }
    if (confirmedNotCommitted) await removeRichNoteAssetPaths(createdPaths);
    throw error;
  } finally {
    releaseRichNoteAssetReservations(createdPaths);
  }

  const confirmedText = updatedText as SavedText | null;
  if (!confirmedText) throw new Error('The saved text could not be confirmed.');
  const newPaths = new Set(getRichNoteAssetPaths(confirmedText.richDocument));
  await removeRichNoteAssetPaths(oldPaths.filter((path) => !newPaths.has(path)));
  return confirmedText;
}

export async function deleteSavedHomeContent(
  id: number,
  type: SavedHomeContent['contentType'],
): Promise<boolean> {
  const database = await getSaveAppDatabase();
  const folderId = await readHomeFolderAssociation(database, type, id);
  const deleted = await deleteSavedContentWithPersistence(id, type, {
    async getContent(contentId, contentType) {
      const database = await getSaveAppDatabase();
      const row = await database.getFirstAsync<SavedContentRow>(
        'SELECT id, content_type, created_at, url, normalized_url, title, description, domain, image_url, favicon_url, preview_image_relative_path, preview_image_mime_type, text_content FROM saved_content WHERE id = ? AND content_type = ?;',
        contentId,
        contentType,
      );
      return row
        ? savedContentRowToModel(row, {
            isSafePreviewPath: (path) => SAFE_PREVIEW_PATH.test(path),
            fileExists: (path) => fileForPreviewPath(path).exists,
            uriForPath: (path) => fileForPreviewPath(path).uri,
          })
        : null;
    },
    fileExists(path) {
      return fileForPreviewPath(path).exists;
    },
    createTemporaryPath(content, originalPath) {
      const extension = originalPath.slice(originalPath.lastIndexOf('.'));
      const suffix = Math.random().toString(36).slice(2, 10);
      return `${PREVIEW_DIRECTORY}/.delete-preview-${content.id}-${Date.now()}-${suffix}${extension}`;
    },
    async moveFile(sourcePath, destinationPath) {
      const source = fileForPreviewPath(sourcePath);
      const destination = fileForPreviewPath(destinationPath);
      if (!source.exists || destination.exists) throw new Error('The link preview cannot be staged.');
      await source.move(destination);
      if (!destination.exists) throw new Error('The staged preview file was not created.');
    },
    async deleteFile(path) {
      const file = fileForPreviewPath(path);
      if (file.exists) file.delete();
      if (file.exists) throw new Error('The link preview could not be deleted.');
    },
    async deleteMetadata(contentId, contentType) {
      const database = await getSaveAppDatabase();
      const result = await database.runAsync(
        'DELETE FROM saved_content WHERE id = ? AND content_type = ?;',
        contentId,
        contentType,
      );
      return result.changes === 1;
    },
    async restoreMetadata(content) {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        if (content.contentType === 'text') {
          await transaction.runAsync(
            `INSERT INTO saved_content
               (id, content_type, created_at, url, normalized_url, title, description, domain,
                image_url, favicon_url, preview_image_relative_path, preview_image_mime_type, text_content)
             VALUES (?, 'text', ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?);`,
            content.id,
            content.createdAt,
            content.storageText,
          );
        } else {
          const row = content;
          await transaction.runAsync(
            `INSERT INTO saved_content
               (id, content_type, created_at, url, normalized_url, title, description, domain,
                image_url, favicon_url, preview_image_relative_path, preview_image_mime_type, text_content)
             VALUES (?, 'link', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
            row.id,
            row.createdAt,
            row.url,
            row.normalizedUrl,
            row.title,
            row.description,
            row.domain,
            row.imageUrl,
            row.faviconUrl,
            row.previewImageRelativePath,
            row.previewImageMimeType,
          );
        }
        await restoreHomeFolderAssociation(transaction, type, content.id, folderId);
      });
    },
    previewPath(content) {
      return content.contentType === 'link' ? content.previewImageRelativePath : null;
    },
  });
  if (deleted && type === 'text') {
    try {
      const rows = await database.getAllAsync<{ text_content: string | null }>(
        "SELECT text_content FROM saved_content WHERE content_type = 'text';",
      );
      await cleanupOrphanedRichNoteAssets(rows.flatMap((row) => row.text_content == null ? [] : [row.text_content]));
    } catch {
      // A failed cleanup must never turn a committed content deletion into a reported failure.
    }
  }
  return deleted;
}
