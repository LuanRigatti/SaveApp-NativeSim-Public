import { Paths } from 'expo-file-system';
import { getInfoAsync, readDirectoryAsync } from 'expo-file-system/legacy';

import { measureStorageUsage, type StorageFileSystem, type StorageUsageSnapshot } from './storageUsage';

const fileSystem: StorageFileSystem = {
  join: (parentUri, childName) => Paths.join(parentUri, childName),
  readDirectory: readDirectoryAsync,
  async getInfo(uri) {
    const info = await getInfoAsync(uri);
    return info.exists
      ? { exists: true, isDirectory: info.isDirectory, size: info.size }
      : { exists: false, isDirectory: false };
  },
};

/** Measures logical file sizes in the app's accessible Documents and Cache roots. */
export function getSaveAppStorageUsage(): Promise<StorageUsageSnapshot> {
  return measureStorageUsage(fileSystem, {
    documents: Paths.document.uri,
    cache: Paths.cache.uri,
  });
}
