const {
  deleteSavedContentWithPersistence,
  requestConfirmedSavedContentDeletion,
} = require('../src/features/home-content/contentDeletionPipeline');

const link = {
  id: 8,
  contentType: 'link',
  createdAt: 1_800_000_000_000,
  url: 'https://example.com',
  normalizedUrl: 'https://example.com/',
  title: 'Example',
  description: null,
  domain: 'example.com',
  imageUrl: null,
  faviconUrl: null,
  previewImageRelativePath: 'home-content/link-previews/preview-1.jpg',
  previewImageMimeType: 'image/jpeg',
  previewImageUri: 'file:///documents/preview-1.jpg',
};

function makeAdapter(overrides = {}) {
  return {
    getContent: jest.fn(async () => link),
    fileExists: jest.fn(async () => true),
    createTemporaryPath: jest.fn(() => 'home-content/link-previews/.delete-preview-8.jpg'),
    moveFile: jest.fn(async () => undefined),
    deleteFile: jest.fn(async () => undefined),
    deleteMetadata: jest.fn(async () => true),
    restoreMetadata: jest.fn(async () => undefined),
    previewPath: jest.fn((content) => content.contentType === 'link' ? content.previewImageRelativePath : null),
    ...overrides,
  };
}

describe('saved link/text deletion', () => {
  test('stages only its preview, deletes its record, then removes the staged image', async () => {
    const adapter = makeAdapter();

    await expect(deleteSavedContentWithPersistence(8, 'link', adapter)).resolves.toBe(true);
    expect(adapter.moveFile).toHaveBeenCalledWith(
      'home-content/link-previews/preview-1.jpg',
      'home-content/link-previews/.delete-preview-8.jpg',
    );
    expect(adapter.deleteMetadata).toHaveBeenCalledWith(8, 'link');
    expect(adapter.deleteFile).toHaveBeenCalledWith('home-content/link-previews/.delete-preview-8.jpg');
  });

  test('restores the preview when the metadata delete fails', async () => {
    const adapter = makeAdapter({ deleteMetadata: jest.fn(async () => false) });

    await expect(deleteSavedContentWithPersistence(8, 'link', adapter)).resolves.toBe(false);
    expect(adapter.moveFile).toHaveBeenLastCalledWith(
      'home-content/link-previews/.delete-preview-8.jpg',
      'home-content/link-previews/preview-1.jpg',
    );
    expect(adapter.deleteFile).not.toHaveBeenCalled();
  });

  test('restores the row and preview if staged-file deletion fails', async () => {
    const adapter = makeAdapter({ deleteFile: jest.fn(async () => { throw new Error('disk failure'); }) });

    await expect(deleteSavedContentWithPersistence(8, 'link', adapter)).rejects.toThrow('disk failure');
    expect(adapter.restoreMetadata).toHaveBeenCalledWith(link);
    expect(adapter.moveFile).toHaveBeenLastCalledWith(
      'home-content/link-previews/.delete-preview-8.jpg',
      'home-content/link-previews/preview-1.jpg',
    );
  });

  test('deletes text metadata without touching a preview file', async () => {
    const text = { id: 4, contentType: 'text', createdAt: 99, text: 'offline note' };
    const adapter = makeAdapter({
      getContent: jest.fn(async () => text),
      fileExists: jest.fn(async () => false),
      previewPath: jest.fn(() => null),
    });

    await expect(deleteSavedContentWithPersistence(4, 'text', adapter)).resolves.toBe(true);
    expect(adapter.moveFile).not.toHaveBeenCalled();
    expect(adapter.deleteFile).not.toHaveBeenCalled();
    expect(adapter.deleteMetadata).toHaveBeenCalledWith(4, 'text');
  });

  test('cancel leaves the saved content unchanged', async () => {
    const deleteContent = jest.fn();
    const result = await requestConfirmedSavedContentDeletion(8, 'link', {
      confirm: async () => false,
      deleteContent,
    });

    expect(result).toBe('cancelled');
    expect(deleteContent).not.toHaveBeenCalled();
  });

  test('prevents a second confirmation flow for the same content', async () => {
    let finishConfirmation;
    const firstRequest = requestConfirmedSavedContentDeletion(8, 'link', {
      confirm: () => new Promise((resolve) => { finishConfirmation = resolve; }),
      deleteContent: jest.fn(),
    });

    await Promise.resolve();
    await expect(requestConfirmedSavedContentDeletion(8, 'link', {
      confirm: async () => true,
      deleteContent: async () => true,
    })).resolves.toBe('in-progress');

    finishConfirmation(false);
    await expect(firstRequest).resolves.toBe('cancelled');
  });

  test('rechecks authorization after confirmation before deleting', async () => {
    const deleteContent = jest.fn(async () => true);
    const authorizeBeforeDelete = jest.fn(async () => false);

    await expect(requestConfirmedSavedContentDeletion(8, 'link', {
      confirm: async () => true,
      authorizeBeforeDelete,
      deleteContent,
    })).resolves.toBe('cancelled');

    expect(authorizeBeforeDelete).toHaveBeenCalledTimes(1);
    expect(deleteContent).not.toHaveBeenCalled();
  });
});
