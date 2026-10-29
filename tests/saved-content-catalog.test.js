const { savedContentRowToModel } = require('../src/features/home-content/savedContentCatalog');

function makeRow(overrides = {}) {
  return {
    id: 17,
    content_type: 'link',
    created_at: 1_800_000_000_000,
    url: 'https://example.com/article',
    normalized_url: 'https://example.com/article',
    title: 'Article title',
    description: 'Short summary',
    domain: 'example.com',
    image_url: 'https://example.com/cover.jpg',
    favicon_url: null,
    preview_image_relative_path: 'home-content/link-previews/preview-1.jpg',
    preview_image_mime_type: 'image/jpeg',
    text_content: null,
    ...overrides,
  };
}

function makePaths({ exists = true, safe = true } = {}) {
  return {
    isSafePreviewPath: jest.fn(() => safe),
    fileExists: jest.fn(() => exists),
    uriForPath: jest.fn((path) => `file:///documents/${path}`),
  };
}

describe('saved content catalog mapping', () => {
  test('maps local links and all preview metadata without needing a network request', () => {
    const paths = makePaths();

    expect(savedContentRowToModel(makeRow(), paths)).toEqual({
      id: 17,
      contentType: 'link',
      createdAt: 1_800_000_000_000,
      url: 'https://example.com/article',
      normalizedUrl: 'https://example.com/article',
      title: 'Article title',
      description: 'Short summary',
      domain: 'example.com',
      imageUrl: 'https://example.com/cover.jpg',
      faviconUrl: null,
      previewImageRelativePath: 'home-content/link-previews/preview-1.jpg',
      previewImageMimeType: 'image/jpeg',
      previewImageUri: 'file:///documents/home-content/link-previews/preview-1.jpg',
    });
    expect(paths.fileExists).toHaveBeenCalledWith('home-content/link-previews/preview-1.jpg');
  });

  test('preserves text including line breaks and intentional empty edits while rejecting invalid records', () => {
    const textRow = makeRow({
      content_type: 'text',
      url: null,
      normalized_url: null,
      text_content: 'linha 1\n\nlinha 2',
    });

    expect(savedContentRowToModel(textRow, makePaths())).toMatchObject({
      id: 17,
      contentType: 'text',
      text: 'linha 1\n\nlinha 2',
    });
    expect(savedContentRowToModel({ ...textRow, text_content: '' }, makePaths())).toMatchObject({
      id: 17,
      contentType: 'text',
      text: '',
    });
    expect(savedContentRowToModel({ ...textRow, text_content: '  \n ' }, makePaths())).toMatchObject({
      id: 17,
      contentType: 'text',
      text: '  \n ',
    });
    expect(savedContentRowToModel({ ...textRow, text_content: null }, makePaths())).toBeNull();
    expect(savedContentRowToModel({ ...textRow, id: 0 }, makePaths())).toBeNull();
  });

  test('keeps a link if its preview file is missing and rejects an unsafe preview path', () => {
    const missingPreview = savedContentRowToModel(makeRow(), makePaths({ exists: false }));
    expect(missingPreview).toMatchObject({ contentType: 'link', previewImageRelativePath: 'home-content/link-previews/preview-1.jpg', previewImageUri: null });

    const unsafePreview = savedContentRowToModel(makeRow(), makePaths({ safe: false }));
    expect(unsafePreview).toMatchObject({ contentType: 'link', previewImageRelativePath: null, previewImageUri: null });
  });

  test('rejects unsafe URL schemes and malformed normalized data', () => {
    expect(savedContentRowToModel(makeRow({ url: 'javascript:alert(1)' }), makePaths())).toBeNull();
    expect(savedContentRowToModel(makeRow({ normalized_url: 'https://example.com/other' }), makePaths())).toBeNull();
  });
});
