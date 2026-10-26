/* global describe, expect, jest, test */

const { previewSavedDocument } = require('../src/features/documents/documentPreviewPipeline');

const document = {
  id: 4,
  contentType: 'document',
  createdAt: 1_800_000_000_000,
  originalName: 'Arquivo.xyz',
  mimeType: 'application/x-example',
  extension: 'xyz',
  sizeBytes: 100,
  relativePath: 'documents/document-1-a.xyz',
  textExcerpt: null,
  uri: 'file:///documents/document-1-a.xyz',
};

describe('native document preview handling', () => {
  test('returns unsupported without requesting preview when the native viewer cannot open a type', async () => {
    const preview = jest.fn();
    const status = await previewSavedDocument(document, {
      fileExists: () => true,
      canPreview: async () => false,
      preview,
    });

    expect(status).toBe('unsupported');
    expect(preview).not.toHaveBeenCalled();
  });

  test('opens an existing file through the native preview adapter', async () => {
    const preview = jest.fn(async () => undefined);
    const status = await previewSavedDocument(document, {
      fileExists: () => true,
      canPreview: async () => true,
      preview,
    });

    expect(status).toBe('opened');
    expect(preview).toHaveBeenCalledWith(document);
  });

  test('handles missing files and viewer failures without throwing', async () => {
    const missing = await previewSavedDocument(document, {
      fileExists: () => false,
      canPreview: async () => true,
      preview: async () => undefined,
    });
    const failed = await previewSavedDocument(document, {
      fileExists: () => true,
      canPreview: async () => { throw new Error('native preview failed'); },
      preview: async () => undefined,
    });

    expect(missing).toBe('missing');
    expect(failed).toBe('failed');
  });
});
