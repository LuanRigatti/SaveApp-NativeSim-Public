import { Image as NativeImage } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { ensureMixedMediaSchema } from './mediaSchemaMigration';
import { ensureSavedContentSchema } from '@/features/home-content/savedContentSchemaMigration';
import { ensureSavedDocumentsSchema } from '@/features/documents/documentSchemaMigration';
import { ensureHomeFolderSchema } from '@/features/home-folders/folderSchemaMigration';
import { ensureChecklistSchema } from '@/features/home-content/checklistSchemaMigration';
import { ensureSavedTagSchema } from '@/features/home-tags/tagSchemaMigration';
import { ensureRecentlyDeletedSchema } from '@/features/home-trash/trashSchemaMigration';
import { ensureSavedFavoritesSchema } from '@/features/home-content/favoritesSchemaMigration';
import { ensureQuickSavePreviewEnrichmentSchema } from '@/features/home-content/quickSavePreviewEnrichmentSchemaMigration';
import {
  readHomeFolderAssociation,
  restoreHomeFolderAssociation,
} from '@/features/home-folders/folderAssociationDatabase';
import { mediaRowToSavedMedia, sortSavedMediaChronologically, type MediaRow } from './mediaCatalog';
import {
  importPhotoAssets,
  type PhotoImportAdapter,
  type PhotoMetadataInput,
} from './photoImportPipeline';
import { deletePhotoWithPersistence } from './photoDeletionPipeline';
import type {
  PhotoDimensions,
  PhotoImportAsset,
  PhotoMetadata,
  SavedMedia,
  SavedPhoto,
  SavedVideo,
  VideoImportAsset,
  VideoMetadata,
} from './photoTypes';
import {
  importVideoAssets,
  type VideoImportAdapter,
  type VideoMetadataInput,
  type VideoImportResult,
} from './videoImportPipeline';
import { createPersistentVideoThumbnail } from './videoThumbnailStorage';
import { deleteVideoWithPersistence } from './videoDeletionPipeline';

const PHOTO_DIRECTORY_NAME = 'photos';
const VIDEO_DIRECTORY_NAME = 'videos';
const DATABASE_NAME = 'saveapp-photos.db';
const SAFE_PHOTO_PATH = /^photos\/photo-[a-z0-9-]+\.(avif|bmp|gif|heic|heif|jpe?g|png|tiff?|webp)$/i;
const SAFE_VIDEO_PATH = /^videos\/video-[a-z0-9-]+\/video\.(3gp|m4v|mov|mp4)$/i;
const SAFE_VIDEO_THUMBNAIL_PATH = /^videos\/video-[a-z0-9-]+\/thumbnail\.jpg$/i;
const SAFE_VIDEO_DIRECTORY_PATH = /^videos\/(?:video-[a-z0-9-]+|\.delete-video-[a-z0-9-]+)$/i;

let databasePromise: Promise<SQLiteDatabase> | null = null;

function getDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME)
      .then(async (database) => {
        await database.execAsync('PRAGMA journal_mode = WAL;');
        await database.execAsync('PRAGMA foreign_keys = ON;');
        await ensureMixedMediaSchema(database);
        await ensureSavedContentSchema(database);
        await ensureSavedDocumentsSchema(database);
        await ensureHomeFolderSchema(database);
        await ensureChecklistSchema(database);
        await ensureSavedTagSchema(database);
        await ensureRecentlyDeletedSchema(database);
        await ensureSavedFavoritesSchema(database);
        await ensureQuickSavePreviewEnrichmentSchema(database);
        return database;
      })
      .catch((error: unknown) => {
        databasePromise = null;
        throw error;
      });
  }

  return databasePromise;
}

/** Shares the existing local SQLite connection with additive Home content features. */
export async function getSaveAppDatabase(): Promise<SQLiteDatabase> {
  return getDatabase();
}

function isSafeMediaPath(relativePath: string): boolean {
  return (
    SAFE_PHOTO_PATH.test(relativePath) ||
    SAFE_VIDEO_PATH.test(relativePath) ||
    SAFE_VIDEO_THUMBNAIL_PATH.test(relativePath)
  );
}

function fileForRelativePath(relativePath: string): File {
  if (!isSafeMediaPath(relativePath)) {
    throw new Error('Invalid local media path');
  }

  return new File(Paths.document, ...relativePath.split('/'));
}

function directoryForRelativePath(relativePath: string): Directory {
  if (!SAFE_VIDEO_DIRECTORY_PATH.test(relativePath)) {
    throw new Error('Invalid local video directory');
  }

  return new Directory(Paths.document, ...relativePath.split('/'));
}

function videoDirectoryForPath(relativePath: string): string {
  if (!SAFE_VIDEO_PATH.test(relativePath)) {
    throw new Error('Invalid local video path');
  }

  return relativePath.slice(0, relativePath.lastIndexOf('/'));
}

function mediaFromRow(row: MediaRow): SavedMedia | null {
  try {
    return mediaRowToSavedMedia(row, {
      isPhotoPath: (path) => SAFE_PHOTO_PATH.test(path),
      isVideoPath: (path) => SAFE_VIDEO_PATH.test(path),
      isThumbnailPath: (path) => SAFE_VIDEO_THUMBNAIL_PATH.test(path),
      uriForPath: (path) => fileForRelativePath(path).uri,
    });
  } catch {
    return null;
  }
}

async function resolveImageDimensions(asset: PhotoImportAsset): Promise<PhotoDimensions> {
  if (asset.width > 0 && asset.height > 0) {
    return { width: asset.width, height: asset.height };
  }

  return new Promise((resolve, reject) => {
    NativeImage.getSize(
      asset.uri,
      (width, height) => resolve({ width, height }),
      reject,
    );
  });
}

async function ensurePhotoDirectory(): Promise<Directory> {
  const directory = new Directory(Paths.document, PHOTO_DIRECTORY_NAME);
  await directory.create({ idempotent: true, intermediates: true });
  return directory;
}

async function ensureVideoDirectory(): Promise<Directory> {
  const directory = new Directory(Paths.document, VIDEO_DIRECTORY_NAME);
  await directory.create({ idempotent: true, intermediates: true });
  return directory;
}

async function insertPhotoMetadata(input: PhotoMetadataInput): Promise<PhotoMetadata> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO photos
       (relative_path, width, height, created_at, mime_type, media_type, duration_ms,
        thumbnail_relative_path, custom_title, is_screenshot)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    input.relativePath,
    input.width,
    input.height,
    input.createdAt,
    input.mimeType,
    input.mediaType,
    input.durationMs,
    input.thumbnailRelativePath,
    input.customTitle,
    input.isScreenshot ? 1 : 0,
  );

  return { id: result.lastInsertRowId, ...input };
}

async function insertVideoMetadata(input: VideoMetadataInput): Promise<VideoMetadata> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO photos
       (relative_path, width, height, created_at, mime_type, media_type, duration_ms, thumbnail_relative_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    input.relativePath,
    input.width,
    input.height,
    input.createdAt,
    input.mimeType,
    input.mediaType,
    input.durationMs,
    input.thumbnailRelativePath,
  );

  return { id: result.lastInsertRowId, ...input };
}

async function removePartialCopy(destination: File): Promise<void> {
  if (destination.exists) {
    destination.delete();
  }
}

async function removeMediaFile(relativePath: string): Promise<void> {
  const file = fileForRelativePath(relativePath);
  if (file.exists) {
    file.delete();
  }

  if (SAFE_VIDEO_PATH.test(relativePath) || SAFE_VIDEO_THUMBNAIL_PATH.test(relativePath)) {
    const directory = directoryForRelativePath(relativePath.slice(0, relativePath.lastIndexOf('/')));
    if (directory.exists && directory.list().length === 0) {
      directory.delete();
    }
  }
}

const photoImportAdapter: PhotoImportAdapter = {
  resolveDimensions: resolveImageDimensions,
  async copyToPrivateStorage(sourceUri, relativePath) {
    await ensurePhotoDirectory();
    const source = new File(sourceUri);
    const destination = fileForRelativePath(relativePath);
    if (destination.exists) {
      throw new Error('The destination photo path already exists');
    }

    try {
      await source.copy(destination);
      if (!destination.exists) {
        throw new Error('The photo copy did not create a destination file');
      }
    } catch (error) {
      try {
        await removePartialCopy(destination);
      } catch {
        // Keep the original copy error; no SQLite metadata has been written yet.
      }
      throw error;
    }
  },
  insertMetadata: insertPhotoMetadata,
  removeFile: removeMediaFile,
};

const videoImportAdapter: VideoImportAdapter = {
  async ensureAvailableSpace(asset) {
    if (
      Number.isFinite(asset.fileSize) &&
      asset.fileSize != null &&
      asset.fileSize > 0 &&
      Paths.availableDiskSpace < asset.fileSize
    ) {
      throw new Error('There is not enough local storage for this video');
    }
  },
  async copyVideoToPrivateStorage(sourceUri, relativePath) {
    await ensureVideoDirectory();
    const directoryPath = relativePath.slice(0, relativePath.lastIndexOf('/'));
    const directory = directoryForRelativePath(directoryPath);
    await directory.create({ idempotent: true, intermediates: true });

    const source = new File(sourceUri);
    const destination = fileForRelativePath(relativePath);
    if (destination.exists) {
      throw new Error('The destination video path already exists');
    }

    try {
      await source.copy(destination);
      if (!destination.exists || !destination.size || destination.size <= 0) {
        throw new Error('The video copy did not create a valid destination file');
      }
    } catch (error) {
      try {
        await removePartialCopy(destination);
      } catch {
        // Keep the original copy error; no SQLite metadata has been written yet.
      }
      throw error;
    }
  },
  async createPersistentThumbnail(videoRelativePath, thumbnailRelativePath, durationMs) {
    const source = fileForRelativePath(videoRelativePath);
    const destination = fileForRelativePath(thumbnailRelativePath);
    if (!source.exists || destination.exists) {
      throw new Error('The video or thumbnail destination is unavailable');
    }

    return createPersistentVideoThumbnail(source.uri, destination, durationMs);
  },
  insertMetadata: insertVideoMetadata,
  removeFile: removeMediaFile,
};

async function getMediaFromDatabase(id: number, includeRecentlyDeleted = false): Promise<SavedMedia | null> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    return null;
  }

  const database = await getDatabase();
  const row = await database.getFirstAsync<MediaRow>(
    `SELECT id, relative_path, width, height, created_at, mime_type,
            media_type, duration_ms, thumbnail_relative_path, custom_title, is_screenshot
     FROM photos WHERE id = ?${includeRecentlyDeleted ? '' : ' AND deleted_at IS NULL'};`,
    id,
  );
  if (!row) {
    return null;
  }

  try {
    return mediaFromRow(row);
  } catch {
    return null;
  }
}

export async function listSavedMedia(): Promise<SavedMedia[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<MediaRow>(
    `SELECT id, relative_path, width, height, created_at, mime_type,
            media_type, duration_ms, thumbnail_relative_path, custom_title, is_screenshot
     FROM photos WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC;`,
  );
  const media: SavedMedia[] = [];

  for (const row of rows) {
    try {
      const saved = mediaFromRow(row);
      if (!saved || !fileForRelativePath(saved.relativePath).exists) {
        continue;
      }
      if (saved.mediaType === 'video' && !fileForRelativePath(saved.thumbnailRelativePath).exists) {
        continue;
      }
      media.push(saved);
    } catch {
      // Keep database rows and local files intact if a path is invalid or temporarily unavailable.
    }
  }

  return sortSavedMediaChronologically(media);
}

export async function listSavedPhotos(): Promise<SavedPhoto[]> {
  return (await listSavedMedia()).filter((item): item is SavedPhoto => item.mediaType === 'photo');
}

export async function getSavedMedia(id: number): Promise<SavedMedia | null> {
  const saved = await getMediaFromDatabase(id);
  if (!saved || !fileForRelativePath(saved.relativePath).exists) {
    return null;
  }
  if (saved.mediaType === 'video' && !fileForRelativePath(saved.thumbnailRelativePath).exists) {
    return null;
  }
  return saved;
}

export async function getSavedPhoto(id: number): Promise<SavedPhoto | null> {
  const saved = await getSavedMedia(id);
  return saved?.mediaType === 'photo' ? saved : null;
}

export async function updateSavedPhotoTitle(
  id: number,
  customTitle: string | null,
): Promise<boolean> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    return false;
  }

  const database = await getDatabase();
  const result = await database.runAsync(
    'UPDATE photos SET custom_title = ? WHERE id = ? AND media_type = ? AND deleted_at IS NULL;',
    customTitle,
    id,
    'photo',
  );
  return result.changes === 1;
}

export async function getSavedVideo(id: number): Promise<SavedVideo | null> {
  const saved = await getMediaFromDatabase(id);
  return saved?.mediaType === 'video' && fileForRelativePath(saved.relativePath).exists
    ? saved
    : null;
}

export async function importSelectedPhotos(
  assets: readonly PhotoImportAsset[],
): Promise<PhotoMetadata[]> {
  await getDatabase();
  await ensurePhotoDirectory();
  const result = await importPhotoAssets(assets, photoImportAdapter);
  return result.photos;
}

export async function importSelectedVideos(
  assets: readonly VideoImportAsset[],
): Promise<VideoImportResult> {
  await getDatabase();
  await ensureVideoDirectory();
  return importVideoAssets(assets, videoImportAdapter);
}

export async function deleteSavedPhoto(id: number): Promise<boolean> {
  const database = await getDatabase();
  const folderId = await readHomeFolderAssociation(database, 'photo', id);
  return deletePhotoWithPersistence(id, {
    async getPhoto(photoId) {
      const photo = await getMediaFromDatabase(photoId, true);
      if (!photo || photo.mediaType !== 'photo') {
        return null;
      }

      return {
        id: photo.id,
        relativePath: photo.relativePath,
        width: photo.width,
        height: photo.height,
        createdAt: photo.createdAt,
        mimeType: photo.mimeType,
        customTitle: photo.customTitle,
        isScreenshot: photo.isScreenshot,
        mediaType: photo.mediaType,
        durationMs: photo.durationMs,
        thumbnailRelativePath: photo.thumbnailRelativePath,
      };
    },
    fileExists(relativePath) {
      return fileForRelativePath(relativePath).exists;
    },
    createTemporaryPath(photo) {
      const extension = photo.relativePath.slice(photo.relativePath.lastIndexOf('.'));
      const suffix = Math.random().toString(36).slice(2, 10);
      return `photos/photo-delete-${photo.id}-${Date.now()}-${suffix}${extension}`;
    },
    async moveFile(sourcePath, destinationPath) {
      const source = fileForRelativePath(sourcePath);
      const destination = fileForRelativePath(destinationPath);
      if (!source.exists || destination.exists) {
        throw new Error('The local photo cannot be moved to its temporary path');
      }

      await source.move(destination);
      if (!fileForRelativePath(destinationPath).exists) {
        throw new Error('The local photo move did not create its destination');
      }
    },
    async deleteFile(relativePath) {
      const file = fileForRelativePath(relativePath);
      if (file.exists) {
        file.delete();
      }
      if (fileForRelativePath(relativePath).exists) {
        throw new Error('The local photo file could not be removed');
      }
    },
    async deleteMetadata(photoId) {
      const database = await getDatabase();
      const result = await database.runAsync('DELETE FROM photos WHERE id = ?;', photoId);
      return result.changes === 1;
    },
    async restoreMetadata(photo) {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          `INSERT INTO photos
             (id, relative_path, width, height, created_at, mime_type,
              media_type, duration_ms, thumbnail_relative_path, custom_title, is_screenshot)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          photo.id,
          photo.relativePath,
          photo.width,
          photo.height,
          photo.createdAt,
          photo.mimeType,
          photo.mediaType,
          photo.durationMs,
          photo.thumbnailRelativePath,
          photo.customTitle,
          photo.isScreenshot ? 1 : 0,
        );
        await restoreHomeFolderAssociation(transaction, 'photo', photo.id, folderId);
      });
    },
  });
}

export async function deleteSavedVideo(id: number): Promise<boolean> {
  const database = await getDatabase();
  const folderId = await readHomeFolderAssociation(database, 'video', id);
  return deleteVideoWithPersistence(id, {
    async getVideo(videoId): Promise<VideoMetadata | null> {
      const media = await getMediaFromDatabase(videoId, true);
      return media?.mediaType === 'video' ? media : null;
    },
    getStorageDirectory(video) {
      return videoDirectoryForPath(video.relativePath);
    },
    directoryExists(relativePath) {
      return directoryForRelativePath(relativePath).exists;
    },
    createTemporaryDirectory(video) {
      const suffix = Math.random().toString(36).slice(2, 10);
      return `videos/.delete-video-${video.id}-${Date.now()}-${suffix}`;
    },
    async moveDirectory(sourcePath, destinationPath) {
      const source = directoryForRelativePath(sourcePath);
      const destination = directoryForRelativePath(destinationPath);
      if (!source.exists || destination.exists) {
        throw new Error('The local video directory cannot be staged');
      }
      await source.move(destination);
      if (!destination.exists) {
        throw new Error('The video directory move did not create its destination');
      }
    },
    async deleteDirectory(relativePath) {
      const directory = directoryForRelativePath(relativePath);
      if (directory.exists) {
        directory.delete();
      }
      if (directoryForRelativePath(relativePath).exists) {
        throw new Error('The local video files could not be removed');
      }
    },
    async deleteMetadata(videoId) {
      const database = await getDatabase();
      const result = await database.runAsync('DELETE FROM photos WHERE id = ? AND media_type = ?;', videoId, 'video');
      return result.changes === 1;
    },
    async restoreMetadata(video) {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          `INSERT INTO photos
             (id, relative_path, width, height, created_at, mime_type,
              media_type, duration_ms, thumbnail_relative_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          video.id,
          video.relativePath,
          video.width,
          video.height,
          video.createdAt,
          video.mimeType,
          video.mediaType,
          video.durationMs,
          video.thumbnailRelativePath,
        );
        await restoreHomeFolderAssociation(transaction, 'video', video.id, folderId);
      });
    },
  });
}

export async function deleteSavedMedia(id: number): Promise<boolean> {
  const saved = await getMediaFromDatabase(id, true);
  if (!saved) {
    return false;
  }
  return saved.mediaType === 'video' ? deleteSavedVideo(id) : deleteSavedPhoto(id);
}
