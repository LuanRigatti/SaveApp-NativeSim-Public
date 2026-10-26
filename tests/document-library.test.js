/* global beforeEach, describe, expect, jest, test */

const mockRows = [];
const mockFileStore = new Map();
let mockNextId = 0;

const mockDatabase = {
  async runAsync(sql, ...parameters) {
    if (/INSERT INTO saved_documents/i.test(sql)) {
      const [originalName, mimeType, extension, sizeBytes, relativePath, createdAt, textExcerpt] = parameters;
      mockNextId += 1;
      mockRows.push({
        id: mockNextId,
        original_name: originalName,
        mime_type: mimeType,
        extension,
        size_bytes: sizeBytes,
        relative_path: relativePath,
        thumbnail_relative_path: null,
        created_at: createdAt,
        text_excerpt: textExcerpt,
      });
      return { lastInsertRowId: mockNextId, changes: 1 };
    }

    if (/SET thumbnail_relative_path = \?/i.test(sql)) {
      const [thumbnailPath, id, documentPath, previousThumbnailPath] = parameters;
      const row = mockRows.find((candidate) => candidate.id === id);
      if (
        row &&
        row.relative_path === documentPath &&
        (row.thumbnail_relative_path == null || row.thumbnail_relative_path === previousThumbnailPath)
      ) {
        row.thumbnail_relative_path = thumbnailPath;
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    if (/SET thumbnail_relative_path = NULL/i.test(sql)) {
      const [id, documentPath, thumbnailPath] = parameters;
      const row = mockRows.find((candidate) => candidate.id === id);
      if (row && (!documentPath || row.relative_path === documentPath) && row.thumbnail_relative_path === thumbnailPath) {
        row.thumbnail_relative_path = null;
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    throw new Error(`Unexpected SQLite statement in test: ${sql}`);
  },
  async getAllAsync() {
    return mockRows.map((row) => ({ ...row }));
  },
  async getFirstAsync(_sql, id) {
    return mockRows.find((row) => row.id === id) ?? null;
  },
};

jest.mock('@/features/photos/photoLibrary', () => ({
  getSaveAppDatabase: async () => mockDatabase,
}), { virtual: true });

jest.mock('expo-file-system', () => {
  const files = mockFileStore;

  class File {
    constructor(...parts) {
      this.uri = parts.length > 1
        ? `${String(parts[0]).replace(/\/$/, '')}/${parts.slice(1).map((part) => String(part).replace(/^\//, '')).join('/')}`
        : String(parts[0]);
    }

    get exists() { return files.has(this.uri); }
    get size() { return files.get(this.uri)?.byteLength ?? null; }
    async copy(destination) {
      const content = files.get(this.uri);
      if (!content) throw new Error('source missing');
      files.set(destination.uri, content.slice());
    }
    delete() { files.delete(this.uri); }
    async move(destination) {
      const content = files.get(this.uri);
      if (!content) throw new Error('source missing');
      files.set(destination.uri, content);
      files.delete(this.uri);
    }
    canPreview() { return true; }
    async preview() {}
  }

  class Directory {
    async create() {}
  }

  return {
    Directory,
    File,
    FileMode: { ReadOnly: 'read-only' },
    Paths: { document: 'file:///saveapp-private', availableDiskSpace: 100_000 },
    __testFiles: files,
  };
});

const { __testFiles } = require('expo-file-system');
const documentLibrary = require('../src/features/documents/documentLibrary');
const { importSelectedDocuments } = documentLibrary;

describe('local document library persistence', () => {
  beforeEach(() => {
    mockRows.length = 0;
    mockNextId = 0;
    __testFiles.clear();
  });

  test('reopens saved metadata from SQLite while keeping the picker original untouched', async () => {
    const pickerUri = 'file:///picker/Relatorio.pdf';
    __testFiles.set(pickerUri, Uint8Array.from([37, 80, 68, 70, 45, 49]));

    const imported = await importSelectedDocuments([
      {
        uri: pickerUri,
        name: 'Relatorio.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 6,
      },
    ]);

    expect(imported.documents).toHaveLength(1);
    const privateCopy = imported.documents[0];
    expect(privateCopy.uri).not.toBe(pickerUri);
    expect(__testFiles.has(pickerUri)).toBe(true);

    // A fresh catalog read models the Home provider being created again after app relaunch.
    jest.resetModules();
    const reopenedLibrary = require('../src/features/documents/documentLibrary');
    const reopenedDocuments = await reopenedLibrary.listSavedDocuments();

    expect(reopenedDocuments).toMatchObject([
      {
        id: privateCopy.id,
        originalName: 'Relatorio.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        sizeBytes: 6,
        relativePath: privateCopy.relativePath,
      },
    ]);
    expect(__testFiles.has(privateCopy.uri)).toBe(true);
    expect(mockRows).toHaveLength(1);
  });

  test('persists and reopens one private thumbnail path while a missing cache remains eligible for recovery', async () => {
    const pickerUri = 'file:///picker/Catalogo.pdf';
    __testFiles.set(pickerUri, Uint8Array.from([37, 80, 68, 70]));
    const imported = await importSelectedDocuments([
      { uri: pickerUri, name: 'Catalogo.pdf', mimeType: 'application/pdf', sizeBytes: 4 },
    ]);
    const document = imported.documents[0];
    const thumbnailPath = `document-thumbnails/document-${document.id}.jpg`;
    const thumbnailUri = `file:///saveapp-private/${thumbnailPath}`;

    expect(await documentLibrary.reserveSavedDocumentThumbnail(document, thumbnailPath)).toBe(true);
    expect(await documentLibrary.isSavedDocumentThumbnailReservationCurrent(document, thumbnailPath)).toBe(false);
    __testFiles.set(thumbnailUri, Uint8Array.from([255, 216, 255]));

    const reopened = await documentLibrary.getSavedDocument(document.id);
    expect(reopened).toMatchObject({
      relativePath: document.relativePath,
      thumbnailRelativePath: thumbnailPath,
      thumbnailUri,
    });
    expect(await documentLibrary.isSavedDocumentThumbnailReservationCurrent(document, thumbnailPath)).toBe(true);

    __testFiles.delete(thumbnailUri);
    const missingCache = await documentLibrary.getSavedDocument(document.id);
    expect(missingCache).toMatchObject({ thumbnailRelativePath: thumbnailPath, thumbnailUri: null });

    expect(await documentLibrary.reserveSavedDocumentThumbnail(missingCache, thumbnailPath)).toBe(true);
    __testFiles.set(thumbnailUri, Uint8Array.from([255, 216, 255]));
    await documentLibrary.clearSavedDocumentThumbnailReservation(document, thumbnailPath);
    expect((await documentLibrary.getSavedDocument(document.id)).thumbnailRelativePath).toBeNull();
    await documentLibrary.removeSavedDocumentThumbnailFile(thumbnailPath);
    expect(__testFiles.has(thumbnailUri)).toBe(false);
  });
});
