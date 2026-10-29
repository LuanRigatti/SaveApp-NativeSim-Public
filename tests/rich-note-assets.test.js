/* global describe, expect, jest, test */

const {
  getRichNoteAssetPaths,
  isRichNoteAssetReservedForPersistence,
  isSafeRichNoteAssetPath,
  materializeRichNoteAssets,
  releaseRichNoteAssetReservations,
} = require('../src/features/home-content/richNoteAssets');

function makeAdapter({ failUri } = {}) {
  const files = new Map();
  return {
    files,
    exists: jest.fn((path) => files.has(path)),
    copy: jest.fn(async (sourceUri, path) => {
      if (sourceUri === failUri) throw new Error('copy failed');
      files.set(path, sourceUri);
    }),
    remove: jest.fn(async (path) => { files.delete(path); }),
  };
}

function image(id, uri) {
  return { id: `block-${id}`, type: 'image', assetId: id, sourceUri: uri, mimeType: 'image/jpeg', width: 120, height: 80, size: 'full' };
}

describe('rich note private image assets', () => {
  test('copies picked files into a safe private relative path and removes temporary URIs from saved blocks', async () => {
    const adapter = makeAdapter();
    const result = await materializeRichNoteAssets({ format: 'saveapp-rich-note', version: 1, blocks: [image('image-a1', 'file:///picker/photo.jpg')] }, null, adapter);

    expect(adapter.copy).toHaveBeenCalledWith('file:///picker/photo.jpg', 'notes/assets/image-image-a1.jpg');
    expect(result.createdPaths).toEqual(['notes/assets/image-image-a1.jpg']);
    expect(result.document.blocks[0]).toMatchObject({ relativePath: 'notes/assets/image-image-a1.jpg' });
    expect(result.document.blocks[0].sourceUri).toBeUndefined();
    expect(isSafeRichNoteAssetPath(result.document.blocks[0].relativePath)).toBe(true);
  });

  test('reuses a committed asset when the same note is edited without recopying it', async () => {
    const adapter = makeAdapter();
    adapter.files.set('notes/assets/image-image-a1.jpg', 'existing file');
    const previous = { format: 'saveapp-rich-note', version: 1, blocks: [{ ...image('image-a1', 'file:///picker/old.jpg'), relativePath: 'notes/assets/image-image-a1.jpg', sourceUri: undefined }] };
    const next = { format: 'saveapp-rich-note', version: 1, blocks: [{ ...image('image-a1', 'file:///picker/temporary-copy.jpg') }] };

    const result = await materializeRichNoteAssets(next, previous, adapter);
    expect(adapter.copy).not.toHaveBeenCalled();
    expect(result.createdPaths).toEqual([]);
    expect(result.document.blocks[0].relativePath).toBe('notes/assets/image-image-a1.jpg');
    expect(getRichNoteAssetPaths(result.document)).toEqual(['notes/assets/image-image-a1.jpg']);
  });

  test('cleans files copied earlier in the same batch when a later copy fails', async () => {
    const adapter = makeAdapter({ failUri: 'file:///picker/bad.jpg' });
    const document = { format: 'saveapp-rich-note', version: 1, blocks: [image('image-one', 'file:///picker/ok.jpg'), image('image-two', 'file:///picker/bad.jpg')] };

    await expect(materializeRichNoteAssets(document, null, adapter)).rejects.toThrow('copy failed');
    expect(adapter.files.size).toBe(0);
    expect(adapter.remove).toHaveBeenCalledWith('notes/assets/image-image-one.jpg');
  });

  test('reserves files while copying and releases them after the SQLite write is finished', async () => {
    const adapter = makeAdapter();
    let finishCopy;
    adapter.copy.mockImplementationOnce(() => new Promise((resolve) => { finishCopy = resolve; }));
    const pending = materializeRichNoteAssets({ format: 'saveapp-rich-note', version: 1, blocks: [image('image-a1', 'file:///picker/photo.jpg')] }, null, adapter);
    await Promise.resolve();
    const path = 'notes/assets/image-image-a1.jpg';
    expect(isRichNoteAssetReservedForPersistence(path)).toBe(true);
    finishCopy();
    const result = await pending;
    releaseRichNoteAssetReservations(result.createdPaths);
    expect(isRichNoteAssetReservedForPersistence(path)).toBe(false);
  });

  test('rejects traversal paths and unsupported image extensions', () => {
    expect(isSafeRichNoteAssetPath('../notes/image.jpg')).toBe(false);
    expect(isSafeRichNoteAssetPath('notes/assets/image-one.exe')).toBe(false);
    expect(isSafeRichNoteAssetPath('notes/assets/image-one.heic')).toBe(true);
  });
});
