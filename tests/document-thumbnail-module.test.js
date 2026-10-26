/* global describe, expect, jest, test */

let mockNativeModule = null;

jest.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: () => mockNativeModule,
}));

function loadModule() {
  jest.resetModules();
  return require('../modules/document-thumbnailing/src');
}

describe('optional iOS document thumbnail module bridge', () => {
  test('keeps Expo Go operational when the native module is absent', async () => {
    mockNativeModule = null;
    const bridge = loadModule();

    expect(bridge.isDocumentThumbnailingAvailable()).toBe(false);
    await expect(
      bridge.generateNativeDocumentThumbnail(7, 'documents/document-9-a.pdf'),
    ).resolves.toEqual({ status: 'failed' });
  });

  test('passes only a stable document ID and a validated managed relative path to native code', async () => {
    mockNativeModule = {
      generateThumbnailAsync: jest.fn(async () => ({
        status: 'generated',
        relativePath: 'document-thumbnails/document-7.jpg',
        width: 960,
        height: 1_280,
        sizeBytes: 42_000,
      })),
    };
    const bridge = loadModule();

    await expect(
      bridge.generateNativeDocumentThumbnail(7, 'documents/document-9-a.pdf'),
    ).resolves.toEqual({
      status: 'generated',
      relativePath: 'document-thumbnails/document-7.jpg',
      width: 960,
      height: 1_280,
      sizeBytes: 42_000,
    });
    expect(mockNativeModule.generateThumbnailAsync).toHaveBeenCalledWith(
      7,
      'documents/document-9-a.pdf',
    );
    expect(mockNativeModule.generateThumbnailAsync.mock.calls[0]).not.toContain(
      'file:///saveapp-private/documents/document-9-a.pdf',
    );
  });

  test('returns typed fallback results for unsupported, missing, malformed, and invalid files', async () => {
    const responses = [
      { status: 'unsupported' },
      { status: 'missing' },
      {
        status: 'generated',
        relativePath: 'documents/not-the-thumbnail.pdf',
        width: 100,
        height: 100,
        sizeBytes: 500,
      },
      {
        status: 'generated',
        relativePath: 'document-thumbnails/document-4.jpg',
        width: 4_000,
        height: 100,
        sizeBytes: 500,
      },
    ];
    mockNativeModule = {
      generateThumbnailAsync: jest.fn(async () => responses.shift()),
    };
    const bridge = loadModule();

    await expect(bridge.generateNativeDocumentThumbnail(4, 'documents/document-4-a.pdf'))
      .resolves.toEqual({ status: 'unsupported' });
    await expect(bridge.generateNativeDocumentThumbnail(4, 'documents/document-4-a.pdf'))
      .resolves.toEqual({ status: 'missing' });
    await expect(bridge.generateNativeDocumentThumbnail(4, 'documents/document-4-a.pdf'))
      .resolves.toEqual({ status: 'failed' });
    await expect(bridge.generateNativeDocumentThumbnail(4, 'documents/document-4-a.pdf'))
      .resolves.toEqual({ status: 'failed' });
    await expect(bridge.generateNativeDocumentThumbnail(4, '../private/file.pdf'))
      .resolves.toEqual({ status: 'invalidPath' });
    await expect(bridge.generateNativeDocumentThumbnail(0, 'documents/document-4-a.pdf'))
      .resolves.toEqual({ status: 'invalidInput' });
  });
});
