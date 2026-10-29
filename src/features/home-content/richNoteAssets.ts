import { Directory, File, Paths } from 'expo-file-system';

import { parseRichNoteStorage, type RichNoteDocument } from './richNoteDocument';

const ASSET_ROOT = 'notes/assets';
const SAFE_ASSET_PATH = /^notes\/assets\/image-[a-z0-9-]+\.(?:avif|gif|heic|heif|jpe?g|png|tiff?|webp)$/i;
const reservedAssetPaths = new Set<string>();

function assetDirectory(): Directory {
  return new Directory(Paths.document, ...ASSET_ROOT.split('/'));
}

export type RichNoteAssetAdapter = {
  exists: (relativePath: string) => boolean;
  copy: (sourceUri: string, relativePath: string) => Promise<void>;
  remove: (relativePath: string) => Promise<void>;
};

export type MaterializedRichNote = {
  document: RichNoteDocument;
  createdPaths: string[];
};

function extensionFromMimeType(mimeType: string | null): string {
  switch (mimeType?.split(';')[0].trim().toLowerCase()) {
    case 'image/avif': return 'avif';
    case 'image/gif': return 'gif';
    case 'image/heic': return 'heic';
    case 'image/heif': return 'heif';
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/tiff': return 'tiff';
    case 'image/webp': return 'webp';
    default: return 'jpg';
  }
}

export function isSafeRichNoteAssetPath(relativePath: string): boolean {
  return SAFE_ASSET_PATH.test(relativePath);
}

function fileForRichNoteAsset(relativePath: string): File {
  if (!isSafeRichNoteAssetPath(relativePath)) throw new Error('Invalid rich note asset path.');
  return new File(Paths.document, ...relativePath.split('/'));
}

export function getRichNoteAssetUri(relativePath: string): string {
  return fileForRichNoteAsset(relativePath).uri;
}

function createFileSystemAdapter(): RichNoteAssetAdapter {
  return {
    exists(relativePath) {
      return fileForRichNoteAsset(relativePath).exists;
    },
    async copy(sourceUri, relativePath) {
      const destination = fileForRichNoteAsset(relativePath);
      const directory = assetDirectory();
      await directory.create({ idempotent: true, intermediates: true });
      if (destination.exists) throw new Error('The note image destination already exists.');
      try {
        await new File(sourceUri).copy(destination);
        if (!destination.exists || !destination.size || destination.size <= 0) {
          throw new Error('The selected note image could not be copied.');
        }
      } catch (error) {
        if (destination.exists) destination.delete();
        throw error;
      }
    },
    async remove(relativePath) {
      const file = fileForRichNoteAsset(relativePath);
      if (file.exists) file.delete();
      if (file.exists) throw new Error('The note image could not be removed.');
    },
  };
}

const fileSystemAdapter = createFileSystemAdapter();

function previousImagePaths(document: RichNoteDocument | null): Map<string, string> {
  const paths = new Map<string, string>();
  for (const block of document?.blocks ?? []) {
    if (block.type === 'image' && block.relativePath && isSafeRichNoteAssetPath(block.relativePath)) {
      paths.set(block.assetId, block.relativePath);
    }
  }
  return paths;
}

/** Copies picked photos into private app Documents before the SQLite JSON is committed. */
export async function materializeRichNoteAssets(
  document: RichNoteDocument,
  previousDocument: RichNoteDocument | null,
  adapter: RichNoteAssetAdapter = fileSystemAdapter,
): Promise<MaterializedRichNote> {
  const previousImages = previousImagePaths(previousDocument);
  const createdPaths: string[] = [];

  try {
    const blocks = [];
    for (const block of document.blocks) {
      if (block.type !== 'image') {
        blocks.push(block);
        continue;
      }
      if (block.relativePath) {
        if (!isSafeRichNoteAssetPath(block.relativePath)) throw new Error('Invalid saved note image path.');
        if (!adapter.exists(block.relativePath)) throw new Error('The saved note image is unavailable.');
        blocks.push({ ...block, sourceUri: undefined });
        continue;
      }

      const previousPath = previousImages.get(block.assetId);
      if (previousPath && adapter.exists(previousPath)) {
        blocks.push({ ...block, relativePath: previousPath, sourceUri: undefined });
        continue;
      }
      if (!block.sourceUri) throw new Error('The note image is no longer available.');

      const relativePath = `${ASSET_ROOT}/image-${block.assetId.toLowerCase()}.${extensionFromMimeType(block.mimeType)}`;
      if (adapter.exists(relativePath)) throw new Error('The note image identifier is already in use.');
      createdPaths.push(relativePath);
      reservedAssetPaths.add(relativePath);
      await adapter.copy(block.sourceUri, relativePath);
      blocks.push({ ...block, relativePath, sourceUri: undefined });
    }

    return { document: { ...document, blocks }, createdPaths };
  } catch (error) {
    await removeRichNoteAssetPaths(createdPaths, adapter);
    releaseRichNoteAssetReservations(createdPaths);
    throw error;
  }
}

/** Prevents catalog cleanup from deleting files copied for a note whose SQLite write is still in flight. */
export function releaseRichNoteAssetReservations(relativePaths: readonly string[]): void {
  for (const relativePath of relativePaths) reservedAssetPaths.delete(relativePath);
}

export function isRichNoteAssetReservedForPersistence(relativePath: string): boolean {
  return reservedAssetPaths.has(relativePath);
}

export async function removeRichNoteAssetPaths(
  relativePaths: readonly string[],
  adapter: RichNoteAssetAdapter = fileSystemAdapter,
): Promise<void> {
  for (const relativePath of new Set(relativePaths)) {
    if (!isSafeRichNoteAssetPath(relativePath)) continue;
    try {
      await adapter.remove(relativePath);
    } catch {
      // The next safe catalog cleanup retries unreferenced files.
    }
  }
}

export function getRichNoteAssetPaths(document: RichNoteDocument): string[] {
  return [...new Set(document.blocks.flatMap((block) =>
    block.type === 'image' && block.relativePath && isSafeRichNoteAssetPath(block.relativePath)
      ? [block.relativePath]
      : [],
  ))];
}

/** Reads active and trashed note values before deleting only unreferenced generated files. */
export async function cleanupOrphanedRichNoteAssets(
  serializedNotes: readonly string[],
  rootDirectory = assetDirectory(),
): Promise<void> {
  const referenced = new Set<string>();
  for (const serialized of serializedNotes) {
    if (!serialized.startsWith('SAVEAPP_RICH_NOTE_V1:')) continue;
    const parsed = parseRichNoteStorage(serialized);
    // Unknown/corrupt versions fail closed: retain all files until their references are understood.
    if (!parsed.isRich) return;
    for (const path of getRichNoteAssetPaths(parsed.document)) referenced.add(path);
  }

  if (!rootDirectory.exists) return;
  for (const child of rootDirectory.list()) {
    if (!(child instanceof File)) continue;
    const relativePath = `${ASSET_ROOT}/${child.name}`;
    if (isSafeRichNoteAssetPath(relativePath) && !referenced.has(relativePath) && !reservedAssetPaths.has(relativePath)) {
      try {
        child.delete();
      } catch {
        // Retry during the next catalog refresh.
      }
    }
  }
}
