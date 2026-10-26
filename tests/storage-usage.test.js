/* global describe, expect, test */

const { formatStorageBytes, measureStorageUsage } = require('../src/features/storage/storageUsage');

function createFileSystem({ directories, files, failures = new Set() }) {
  return {
    join: (parent, child) => `${parent}/${child}`,
    async readDirectory(uri) {
      if (failures.has(uri)) throw new Error('unreadable directory');
      if (!(uri in directories)) throw new Error('directory missing');
      return directories[uri];
    },
    async getInfo(uri) {
      if (failures.has(uri)) throw new Error('unreadable file');
      if (uri in directories) return { exists: true, isDirectory: true };
      if (uri in files) return { exists: true, isDirectory: false, size: files[uri] };
      return { exists: false, isDirectory: false };
    },
  };
}

describe('SaveApp local storage measurement', () => {
  test('sums actual files once across media, documents, SQLite, thumbnails and cache', async () => {
    const fileSystem = createFileSystem({
      directories: {
        'file:///documents': ['photos', 'videos', 'documents', 'document-thumbnails', 'SQLite', 'home-content'],
        'file:///documents/photos': ['photo.jpg'],
        'file:///documents/videos': ['video-1'],
        'file:///documents/videos/video-1': ['video.mp4', 'thumbnail.jpg'],
        'file:///documents/documents': ['document.pdf'],
        'file:///documents/document-thumbnails': ['document-1.jpg'],
        'file:///documents/SQLite': ['saveapp-photos.db', 'saveapp-photos.db-wal', 'saveapp-photos.db-shm'],
        'file:///documents/home-content': ['link-previews'],
        'file:///documents/home-content/link-previews': ['preview.jpg'],
        'file:///cache': ['import-preview.tmp'],
      },
      files: {
        'file:///documents/photos/photo.jpg': 100,
        'file:///documents/videos/video-1/video.mp4': 500,
        'file:///documents/videos/video-1/thumbnail.jpg': 30,
        'file:///documents/documents/document.pdf': 700,
        'file:///documents/document-thumbnails/document-1.jpg': 40,
        'file:///documents/SQLite/saveapp-photos.db': 200,
        'file:///documents/SQLite/saveapp-photos.db-wal': 50,
        'file:///documents/SQLite/saveapp-photos.db-shm': 20,
        'file:///documents/home-content/link-previews/preview.jpg': 60,
        'file:///cache/import-preview.tmp': 10,
      },
    });

    await expect(measureStorageUsage(fileSystem, {
      documents: 'file:///documents',
      cache: 'file:///cache',
    })).resolves.toEqual({
      photos: 100,
      videos: 500,
      documents: 700,
      other: 410,
      total: 1710,
    });
  });

  test('marks only affected categories and total unknown when a file cannot be measured', async () => {
    const fileSystem = createFileSystem({
      directories: {
        'file:///documents': ['photos', 'documents'],
        'file:///documents/photos': ['photo.jpg'],
        'file:///documents/documents': ['document.pdf'],
        'file:///cache': [],
      },
      files: {
        'file:///documents/photos/photo.jpg': 100,
        'file:///documents/documents/document.pdf': 700,
      },
      failures: new Set(['file:///documents/documents/document.pdf']),
    });

    await expect(measureStorageUsage(fileSystem, {
      documents: 'file:///documents',
      cache: 'file:///cache',
    })).resolves.toEqual({
      photos: 100,
      videos: 0,
      documents: null,
      other: 0,
      total: null,
    });
  });

  test('marks mixed video storage unknown if a video directory cannot be enumerated', async () => {
    const fileSystem = createFileSystem({
      directories: {
        'file:///documents': ['videos'],
        'file:///documents/videos': ['video-1'],
        'file:///cache': [],
      },
      files: {},
      failures: new Set(['file:///documents/videos/video-1']),
    });

    await expect(measureStorageUsage(fileSystem, {
      documents: 'file:///documents',
      cache: 'file:///cache',
    })).resolves.toEqual({
      photos: 0,
      videos: null,
      documents: 0,
      other: null,
      total: null,
    });
  });

  test('formats logical byte values in binary KB, MB and GB units', () => {
    expect(formatStorageBytes(0)).toBe('0 KB');
    expect(formatStorageBytes(1024)).toBe('1 KB');
    expect(formatStorageBytes(1024 ** 2)).toBe('1 MB');
    expect(formatStorageBytes(1024 ** 3)).toBe('1 GB');
    expect(formatStorageBytes(null)).toBe('Não foi possível medir');
  });
});
