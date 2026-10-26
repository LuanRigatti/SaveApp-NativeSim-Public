/* global describe, expect, jest, test */

const { deleteDocumentWithPersistence, requestConfirmedDocumentDeletion } = require('../src/features/documents/documentDeletionPipeline');

function createState() {
  const document = {
    id: 12,
    contentType: 'document',
    createdAt: 1_800_000_000_000,
    originalName: 'Original.pdf',
    mimeType: 'application/pdf',
    extension: 'pdf',
    sizeBytes: 512,
    relativePath: 'documents/document-1-a.pdf',
    thumbnailRelativePath: null,
    thumbnailUri: null,
    textExcerpt: null,
    uri: 'file:///documents/document-1-a.pdf',
  };
  const files = new Map([[document.relativePath, 'SaveApp private copy']]);
  const databaseRows = new Map([[document.id, document]]);
  const sourceFiles = new Map([['file:///picker/Original.pdf', 'Unchanged picker original']]);

  return {
    document,
    files,
    databaseRows,
    sourceFiles,
    adapter: {
      getDocument: async (id) => databaseRows.get(id) ?? null,
      fileExists: (path) => files.has(path),
      createTemporaryPath: () => 'documents/.delete-document-12-2-a.pdf',
      async moveFile(source, destination) {
        if (!files.has(source) || files.has(destination)) throw new Error('move failed');
        files.set(destination, files.get(source));
        files.delete(source);
      },
      async deleteFile(path) { files.delete(path); },
      async deleteMetadata(id) { return databaseRows.delete(id); },
      async restoreMetadata(value) { databaseRows.set(value.id, value); },
    },
  };
}

describe('local document deletion', () => {
  test('removes only the SaveApp copy and metadata, preserving the selected source file', async () => {
    const state = createState();
    const deleted = await deleteDocumentWithPersistence(state.document.id, state.adapter);

    expect(deleted).toBe(true);
    expect(state.files.size).toBe(0);
    expect(state.databaseRows.size).toBe(0);
    expect(state.sourceFiles.get('file:///picker/Original.pdf')).toBe('Unchanged picker original');
  });

  test('restores the file and row if SQLite deletion fails', async () => {
    const state = createState();
    state.adapter.deleteMetadata = async () => { throw new Error('sqlite unavailable'); };

    await expect(deleteDocumentWithPersistence(state.document.id, state.adapter)).rejects.toThrow('sqlite unavailable');
    expect(state.files.get(state.document.relativePath)).toBe('SaveApp private copy');
    expect(state.databaseRows.has(state.document.id)).toBe(true);
    expect(state.sourceFiles.get('file:///picker/Original.pdf')).toBe('Unchanged picker original');
  });

  test('stages and removes the cached thumbnail with the document', async () => {
    const state = createState();
    const thumbnailPath = 'document-thumbnails/document-12.jpg';
    const temporaryThumbnailPath = 'document-thumbnails/.delete-thumbnail-12-2-a.jpg';
    state.document.thumbnailRelativePath = thumbnailPath;
    state.document.thumbnailUri = `file:///saveapp-private/${thumbnailPath}`;
    state.files.set(thumbnailPath, 'JPEG thumbnail');
    state.adapter.thumbnailPath = () => thumbnailPath;
    state.adapter.createTemporaryThumbnailPath = () => temporaryThumbnailPath;

    const deleted = await deleteDocumentWithPersistence(state.document.id, state.adapter);

    expect(deleted).toBe(true);
    expect(state.files.size).toBe(0);
    expect(state.databaseRows.size).toBe(0);
  });

  test('restores a thumbnail that fails while being staged and preserves both database values', async () => {
    const state = createState();
    const thumbnailPath = 'document-thumbnails/document-12.jpg';
    state.document.thumbnailRelativePath = thumbnailPath;
    state.document.thumbnailUri = `file:///saveapp-private/${thumbnailPath}`;
    state.files.set(thumbnailPath, 'JPEG thumbnail');
    state.adapter.thumbnailPath = () => thumbnailPath;
    state.adapter.createTemporaryThumbnailPath = () => 'document-thumbnails/.delete-thumbnail-12-2-a.jpg';
    state.adapter.moveFile = async (source, destination) => {
      if (source === thumbnailPath) throw new Error('thumbnail stage failed');
      if (!state.files.has(source) || state.files.has(destination)) throw new Error('move failed');
      state.files.set(destination, state.files.get(source));
      state.files.delete(source);
    };

    await expect(deleteDocumentWithPersistence(state.document.id, state.adapter)).rejects.toThrow(
      'thumbnail stage failed',
    );
    expect(state.files.get(state.document.relativePath)).toBe('SaveApp private copy');
    expect(state.files.get(thumbnailPath)).toBe('JPEG thumbnail');
    expect(state.databaseRows.get(state.document.id).thumbnailRelativePath).toBe(thumbnailPath);
  });

  test('does not leave a thumbnail referenced after restoring a document whose cache was already removed', async () => {
    const state = createState();
    const thumbnailPath = 'document-thumbnails/document-12.jpg';
    const temporaryThumbnailPath = 'document-thumbnails/.delete-thumbnail-12-2-a.jpg';
    state.document.thumbnailRelativePath = thumbnailPath;
    state.document.thumbnailUri = `file:///saveapp-private/${thumbnailPath}`;
    state.files.set(thumbnailPath, 'JPEG thumbnail');
    state.adapter.thumbnailPath = () => thumbnailPath;
    state.adapter.createTemporaryThumbnailPath = () => temporaryThumbnailPath;
    state.adapter.deleteFile = async (path) => {
      if (path === state.adapter.createTemporaryPath()) throw new Error('original cleanup failed');
      state.files.delete(path);
    };

    await expect(deleteDocumentWithPersistence(state.document.id, state.adapter)).rejects.toThrow(
      'original cleanup failed',
    );
    expect(state.files.get(state.document.relativePath)).toBe('SaveApp private copy');
    expect(state.files.has(thumbnailPath)).toBe(false);
    expect(state.databaseRows.get(state.document.id).thumbnailRelativePath).toBeNull();
  });

  test('does not delete after the user cancels the native confirmation', async () => {
    const deleteDocument = jest.fn(async () => true);
    const result = await requestConfirmedDocumentDeletion(12, {
      confirm: async () => false,
      deleteDocument,
    });

    expect(result).toBe('cancelled');
    expect(deleteDocument).not.toHaveBeenCalled();
  });

  test('rechecks authorization after confirmation before deleting', async () => {
    const deleteDocument = jest.fn(async () => true);
    const authorizeBeforeDelete = jest.fn(async () => false);
    const result = await requestConfirmedDocumentDeletion(12, {
      confirm: async () => true,
      authorizeBeforeDelete,
      deleteDocument,
    });

    expect(result).toBe('cancelled');
    expect(authorizeBeforeDelete).toHaveBeenCalledTimes(1);
    expect(deleteDocument).not.toHaveBeenCalled();
  });
});
