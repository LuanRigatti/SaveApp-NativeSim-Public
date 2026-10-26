import { Directory, File, Paths } from 'expo-file-system';

import { getSaveAppDatabase } from '@/features/photos/photoLibrary';
import {
  readHomeFolderAssociation,
  restoreHomeFolderAssociation,
} from '@/features/home-folders/folderAssociationDatabase';

import { deleteSavedContentWithPersistence } from './contentDeletionPipeline';
import { savedContentRowToModel, type SavedContentRow } from './savedContentCatalog';
import { downloadLinkPreviewImage, getLinkPreview } from './linkPreview';
import { saveLinkWithPreview, saveTextContent } from './contentSavePipeline';
import type { SavedHomeContent, SavedLink, SavedText } from './homeContentTypes';

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

export async function saveSavedText(text: string, signal?: AbortSignal): Promise<SavedText> {
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
      return { id: result.lastInsertRowId, contentType: 'text', createdAt, text: value };
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

export async function listSavedHomeContent(): Promise<SavedHomeContent[]> {
  const database = await getSaveAppDatabase();
  const rows = await database.getAllAsync<SavedContentRow>(
    'SELECT id, content_type, created_at, url, normalized_url, title, description, domain, image_url, favicon_url, preview_image_relative_path, preview_image_mime_type, text_content FROM saved_content WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC;',
  );
  return rows.flatMap((row) => {
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

export async function deleteSavedHomeContent(
  id: number,
  type: SavedHomeContent['contentType'],
): Promise<boolean> {
  const database = await getSaveAppDatabase();
  const folderId = await readHomeFolderAssociation(database, type, id);
  return deleteSavedContentWithPersistence(id, type, {
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
            content.text,
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
}
