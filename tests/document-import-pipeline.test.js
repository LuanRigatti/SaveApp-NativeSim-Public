/* global describe, expect, test */

const {
  importDocumentAssets,
  importDocumentPickerResult,
} = require('../src/features/documents/documentImportPipeline');

const createAsset = (name, overrides = {}) => ({
  uri: `file:///picker/${name}`,
  name,
  mimeType: name.endsWith('.pdf') ? 'application/pdf' : 'text/plain; charset=utf-8',
  sizeBytes: 2048,
  ...overrides,
});

function createAdapter() {
  const files = new Map();
  const rows = [];
  const removedPaths = [];
  let pathIndex = 0;

  return {
    files,
    rows,
    removedPaths,
    adapter: {
      now: () => 1_800_000_000_000,
      createRelativePath: (asset, timestamp) => {
        pathIndex += 1;
        const extension = asset.name.split('.').pop().toLowerCase();
        return `documents/document-${timestamp}-${pathIndex}.${extension}`;
      },
      async copyToPrivateStorage(uri, relativePath, expectedSizeBytes) {
        if (uri.includes('copy-failure')) throw new Error('disk copy failed');
        const size = expectedSizeBytes ?? 0;
        files.set(relativePath, { uri, size });
        return size;
      },
      async insertMetadata(input) {
        if (input.originalName.includes('db-failure')) throw new Error('sqlite insert failed');
        const document = {
          id: rows.length + 1,
          contentType: 'document',
          ...input,
          uri: `file:///${input.relativePath}`,
        };
        rows.push(document);
        return document;
      },
      async removeFile(relativePath) {
        removedPaths.push(relativePath);
        files.delete(relativePath);
      },
    },
  };
}

describe('local document import pipeline', () => {
  test('persists one PDF with its source name, MIME, extension, actual size, and private path', async () => {
    const state = createAdapter();
    const result = await importDocumentAssets([createAsset('Relatorio.pdf')], state.adapter);

    expect(result.failedCount).toBe(0);
    expect(result.documents).toMatchObject([
      {
        id: 1,
        contentType: 'document',
        originalName: 'Relatorio.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        sizeBytes: 2048,
        relativePath: expect.stringMatching(/^documents\/document-/),
      },
    ]);
    expect(state.files.size).toBe(1);
    expect(state.rows).toHaveLength(1);
  });

  test('imports multiple files in selection order and derives a missing extension from MIME', async () => {
    const state = createAdapter();
    const result = await importDocumentAssets(
      [
        createAsset('Planilha.xlsx', { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        createAsset('Notas', { mimeType: 'text/plain' }),
        createAsset('Banner', { mimeType: 'image/png' }),
      ],
      state.adapter,
    );

    expect(result.failedCount).toBe(0);
    expect(result.documents.map((document) => document.originalName)).toEqual(['Planilha.xlsx', 'Notas', 'Banner']);
    expect(result.documents.map((document) => document.extension)).toEqual(['xlsx', 'txt', 'png']);
    expect(result.documents.map((document) => document.id)).toEqual([1, 2, 3]);
  });

  test('treats picker cancellation and an empty selection as no-ops', async () => {
    const state = createAdapter();
    await expect(
      importDocumentPickerResult({ canceled: true, result: null }, state.adapter),
    ).resolves.toEqual({ documents: [], failedCount: 0 });
    await expect(
      importDocumentPickerResult({ canceled: false, result: [] }, state.adapter),
    ).resolves.toEqual({ documents: [], failedCount: 0 });
    expect(state.files.size).toBe(0);
    expect(state.rows).toHaveLength(0);
  });

  test('continues after copy and SQLite failures and removes a copied file if its row insert fails', async () => {
    const state = createAdapter();
    const result = await importDocumentAssets(
      [
        createAsset('first.txt'),
        createAsset('copy-failure.txt'),
        createAsset('db-failure.txt'),
        createAsset('last.zip', { mimeType: 'application/zip' }),
      ],
      state.adapter,
    );

    expect(result.documents.map((document) => document.originalName)).toEqual(['first.txt', 'last.zip']);
    expect(result.failedCount).toBe(2);
    expect(state.rows).toHaveLength(2);
    expect(state.removedPaths).toHaveLength(1);
    expect(state.files.size).toBe(2);
  });

  test('does not record an item when its copy cannot complete', async () => {
    const state = createAdapter();
    const result = await importDocumentAssets(
      [createAsset('copy-failure.pdf')],
      state.adapter,
    );

    expect(result).toEqual({ documents: [], failedCount: 1 });
    expect(state.rows).toHaveLength(0);
    expect(state.files.size).toBe(0);
  });
});
