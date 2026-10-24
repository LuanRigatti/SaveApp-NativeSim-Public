/* global describe, expect, jest, test */

const {
  createPhotoRenamePromptButtons,
  renamePhotoWithPersistence,
} = require('../src/features/photos/photoRenamePipeline');

const photo = {
  id: 17,
  relativePath: 'photos/photo-1800000000000-abcd1234.jpg',
  width: 1000,
  height: 800,
  createdAt: 1_800_000_000_000,
  mimeType: 'image/jpeg',
  customTitle: null,
  isScreenshot: false,
  mediaType: 'photo',
  durationMs: null,
  thumbnailRelativePath: null,
  uri: 'file:///documents/photos/photo-1800000000000-abcd1234.jpg',
};

function createAdapter(overrides = {}) {
  let stored = { ...photo };
  const adapter = {
    getPhoto: async (id) => (id === stored.id ? { ...stored } : null),
    updateTitle: async (id, title) => {
      if (id !== stored.id) return null;
      stored = { ...stored, customTitle: title };
      return true;
    },
    getStored: () => ({ ...stored }),
  };
  return { ...adapter, ...overrides };
}

describe('photo rename persistence', () => {
  test('canceling the native prompt does not call the save action', () => {
    const save = jest.fn();
    const [cancelButton, saveButton] = createPhotoRenamePromptButtons(save);

    cancelButton.onPress?.();
    expect(save).not.toHaveBeenCalled();

    saveButton.onPress('Nome salvo');
    expect(save).toHaveBeenCalledWith('Nome salvo');
  });

  test('persists a normalized custom title against the stable photo ID', async () => {
    const adapter = createAdapter();

    const result = await renamePhotoWithPersistence(photo.id, '  Inspiração para interface  ', adapter);

    expect(result).toMatchObject({ status: 'renamed', photo: { id: photo.id, customTitle: 'Inspiração para interface' } });
    expect(adapter.getStored()).toMatchObject({
      id: photo.id,
      relativePath: photo.relativePath,
      createdAt: photo.createdAt,
      customTitle: 'Inspiração para interface',
    });
  });

  test('clearing the field stores null to restore the automatic name', async () => {
    const adapter = createAdapter();
    await renamePhotoWithPersistence(photo.id, 'Nome manual', adapter);

    const result = await renamePhotoWithPersistence(photo.id, '   ', adapter);

    expect(result).toMatchObject({ status: 'renamed', photo: { customTitle: null } });
    expect(adapter.getStored().customTitle).toBeNull();
  });

  test('avoids a duplicate database write when the same title is submitted again', async () => {
    const adapter = createAdapter();
    const updateTitle = jest.fn(adapter.updateTitle);
    adapter.updateTitle = updateTitle;

    await renamePhotoWithPersistence(photo.id, 'Mesmo nome', adapter);
    const second = await renamePhotoWithPersistence(photo.id, 'Mesmo nome', adapter);

    expect(second.status).toBe('unchanged');
    expect(updateTitle).toHaveBeenCalledTimes(1);
  });

  test('prevents concurrent saves for the same photo', async () => {
    let releaseUpdate;
    const adapter = createAdapter({
      updateTitle: () => new Promise((resolve) => { releaseUpdate = resolve; }),
    });

    const first = renamePhotoWithPersistence(photo.id, 'Primeiro nome', adapter);
    await Promise.resolve();
    const second = await renamePhotoWithPersistence(photo.id, 'Segundo nome', adapter);

    expect(second).toEqual({ status: 'in-progress' });
    releaseUpdate(true);
    await expect(first).resolves.toMatchObject({ status: 'renamed' });
  });

  test('does not persist when the photo is missing or the database update fails', async () => {
    const missing = createAdapter({ getPhoto: async () => null });
    await expect(renamePhotoWithPersistence(photo.id, 'Nome', missing)).resolves.toEqual({
      status: 'missing',
    });

    const failure = new Error('SQLite write failed');
    const broken = createAdapter({ updateTitle: async () => { throw failure; } });
    await expect(renamePhotoWithPersistence(photo.id, 'Nome', broken)).resolves.toEqual({
      status: 'failed',
      error: failure,
    });
    expect(broken.getStored().customTitle).toBeNull();
  });

  test('does not open a persistence operation for invalid IDs', async () => {
    const adapter = createAdapter();
    const getPhoto = jest.fn(adapter.getPhoto);

    await expect(renamePhotoWithPersistence(0, 'Nome', { ...adapter, getPhoto })).resolves.toEqual({
      status: 'missing',
    });
    expect(getPhoto).not.toHaveBeenCalled();
  });
});
