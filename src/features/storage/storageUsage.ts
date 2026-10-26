export type StorageCategory = 'photos' | 'videos' | 'documents' | 'other';

export type StorageUsageSnapshot = Record<StorageCategory, number | null> & {
  total: number | null;
};

export type StorageFileInfo = {
  exists: boolean;
  isDirectory: boolean;
  size?: number;
};

export type StorageFileSystem = {
  join: (parentUri: string, childName: string) => string;
  readDirectory: (directoryUri: string) => Promise<string[]>;
  getInfo: (uri: string) => Promise<StorageFileInfo>;
};

export type StorageRoots = {
  documents: string;
  cache: string;
};

const CATEGORIES: readonly StorageCategory[] = ['photos', 'videos', 'documents', 'other'];
const VIDEO_FILE_EXTENSION = /\.(3gp|m4v|mov|mp4)$/i;
const VIDEO_THUMBNAIL_NAME = 'thumbnail.jpg';
const MAX_DIRECTORY_DEPTH = 64;

function getFileCategory(root: 'documents' | 'cache', relativePath: readonly string[]): StorageCategory {
  if (root === 'cache') return 'other';

  const [firstSegment, ...rest] = relativePath;
  if (firstSegment === 'photos') return 'photos';
  if (firstSegment === 'documents') return 'documents';
  if (firstSegment === 'videos' && rest.at(-1) !== VIDEO_THUMBNAIL_NAME && VIDEO_FILE_EXTENSION.test(rest.at(-1) ?? '')) {
    return 'videos';
  }
  return 'other';
}

function getUnknownCategories(root: 'documents' | 'cache', relativePath: readonly string[]): StorageCategory[] {
  if (root === 'cache') return ['other'];
  if (relativePath.length === 0) return [...CATEGORIES];

  const [firstSegment, ...rest] = relativePath;
  if (firstSegment === 'photos') return ['photos'];
  if (firstSegment === 'documents') return ['documents'];
  if (firstSegment === 'videos') {
    if (rest.length === 0 || (rest.length === 1 && !VIDEO_FILE_EXTENSION.test(rest[0]))) {
      return ['videos', 'other'];
    }
    return [getFileCategory(root, relativePath)];
  }
  return ['other'];
}

/**
 * Sums each accessible file exactly once by its relative location. A null category
 * means at least one file or directory in that category could not be measured.
 */
export async function measureStorageUsage(
  fileSystem: StorageFileSystem,
  roots: StorageRoots,
): Promise<StorageUsageSnapshot> {
  const totals: Record<StorageCategory, number> = {
    photos: 0,
    videos: 0,
    documents: 0,
    other: 0,
  };
  const unknown = new Set<StorageCategory>();
  const visitedDirectories = new Set<string>();

  const markUnknown = (root: 'documents' | 'cache', relativePath: readonly string[]) => {
    for (const category of getUnknownCategories(root, relativePath)) unknown.add(category);
  };

  const scanDirectory = async (
    root: 'documents' | 'cache',
    rootUri: string,
    relativePath: string[],
    depth: number,
  ): Promise<void> => {
    const directoryUri = relativePath.reduce((uri, segment) => fileSystem.join(uri, segment), rootUri);
    if (visitedDirectories.has(directoryUri)) return;
    visitedDirectories.add(directoryUri);

    if (depth > MAX_DIRECTORY_DEPTH) {
      markUnknown(root, relativePath);
      return;
    }

    let entries: string[];
    try {
      entries = await fileSystem.readDirectory(directoryUri);
    } catch {
      markUnknown(root, relativePath);
      return;
    }

    for (const entryName of entries) {
      const childPath = [...relativePath, entryName];
      const childUri = fileSystem.join(directoryUri, entryName);
      let info: StorageFileInfo;
      try {
        info = await fileSystem.getInfo(childUri);
      } catch {
        markUnknown(root, childPath);
        continue;
      }

      if (!info.exists) {
        markUnknown(root, childPath);
        continue;
      }

      if (info.isDirectory) {
        await scanDirectory(root, rootUri, childPath, depth + 1);
        continue;
      }

      const category = getFileCategory(root, childPath);
      if (typeof info.size !== 'number' || !Number.isFinite(info.size) || info.size < 0) {
        unknown.add(category);
        continue;
      }
      totals[category] += info.size;
    }
  };

  await scanDirectory('documents', roots.documents, [], 0);
  await scanDirectory('cache', roots.cache, [], 0);

  const photos = unknown.has('photos') ? null : totals.photos;
  const videos = unknown.has('videos') ? null : totals.videos;
  const documents = unknown.has('documents') ? null : totals.documents;
  const other = unknown.has('other') ? null : totals.other;
  const total = photos === null || videos === null || documents === null || other === null
    ? null
    : photos + videos + documents + other;

  return { photos, videos, documents, other, total };
}

export function formatStorageBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return 'Não foi possível medir';

  let value = bytes / 1024;
  let unit: 'KB' | 'MB' | 'GB' = 'KB';
  if (value >= 1024) {
    value /= 1024;
    unit = 'MB';
  }
  if (value >= 1024) {
    value /= 1024;
    unit = 'GB';
  }

  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}
