const { prependSavedHomeContent } = require('../src/features/home-content/homeContentState');

describe('saved Home content state', () => {
  test('puts a saved link at the beginning of the mixed feed and replaces only the same link id', () => {
    const existingText = { id: 4, contentType: 'text', createdAt: 100, text: 'Nota' };
    const oldLink = {
      id: 8,
      contentType: 'link',
      createdAt: 90,
      url: 'https://example.com/old',
      normalizedUrl: 'https://example.com/old',
      title: 'Old',
      description: null,
      domain: 'example.com',
      imageUrl: null,
      faviconUrl: null,
      previewImageRelativePath: null,
      previewImageMimeType: null,
      previewImageUri: null,
    };
    const updatedLink = { ...oldLink, title: 'Updated' };
    const newLink = { ...oldLink, id: 9, title: 'New', createdAt: 110 };

    expect(prependSavedHomeContent([existingText, oldLink], newLink)).toEqual([
      newLink,
      existingText,
      oldLink,
    ]);
    expect(prependSavedHomeContent([existingText, oldLink], updatedLink)).toEqual([
      updatedLink,
      existingText,
    ]);
  });
});
