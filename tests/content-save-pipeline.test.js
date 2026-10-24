const {
  DuplicateSavedLinkError,
  EmptySavedTextError,
  saveLinkWithPreview,
  saveTextContent,
} = require('../src/features/home-content/contentSavePipeline');

function makeLinkAdapter(overrides = {}) {
  return {
    hasLink: jest.fn(async () => false),
    getPreview: jest.fn(async (url) => ({
      title: 'Page title',
      description: 'Short description',
      domain: new URL(url).hostname,
      imageUrl: 'https://example.com/cover.jpg',
      faviconUrl: null,
    })),
    cachePreview: jest.fn(async () => ({
      relativePath: 'home-content/link-previews/preview-1.jpg',
      uri: 'file:///documents/home-content/link-previews/preview-1.jpg',
      mimeType: 'image/jpeg',
    })),
    deletePreview: jest.fn(async () => undefined),
    insertLink: jest.fn(async (input) => ({ id: 4, contentType: 'link', ...input })),
    deleteInsertedLink: jest.fn(async () => undefined),
    now: () => 1_800_000_000_000,
    ...overrides,
  };
}

describe('saved content write pipelines', () => {
  test('persists normalized URL and extracted metadata with a local preview path', async () => {
    const adapter = makeLinkAdapter();
    const saved = await saveLinkWithPreview('Example.com/path', adapter);

    expect(adapter.hasLink).toHaveBeenCalledWith('https://example.com/path');
    expect(adapter.getPreview).toHaveBeenCalledWith('https://example.com/path', undefined);
    expect(adapter.insertLink).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com/path',
      normalizedUrl: 'https://example.com/path',
      title: 'Page title',
      preview: expect.objectContaining({ relativePath: 'home-content/link-previews/preview-1.jpg' }),
      createdAt: 1_800_000_000_000,
    }));
    expect(saved.id).toBe(4);
  });

  test('saves a usable domain/title fallback if metadata or the preview image is unavailable', async () => {
    const adapter = makeLinkAdapter({
      getPreview: jest.fn(async () => { throw new Error('blocked by website'); }),
      cachePreview: jest.fn(async () => { throw new Error('image unavailable'); }),
    });

    await expect(saveLinkWithPreview('https://example.com/interesting-page', adapter)).resolves.toMatchObject({
      title: 'interesting page',
      domain: 'example.com',
      preview: null,
    });
    expect(adapter.insertLink).toHaveBeenCalledTimes(1);
  });

  test('persists long valid URLs when optional metadata extraction times out', async () => {
    const url = 'https://ge.globo.com/futebol/times/exemplo/noticia/2026/10/23/uma-materia-com-caminho-longo-e-varios-detalhes-sobre-o-jogo.ghtml?utm_source=app';
    const timeout = new Error('request aborted by timeout');
    timeout.name = 'AbortError';
    const adapter = makeLinkAdapter({ getPreview: jest.fn(async () => { throw timeout; }) });

    const saved = await saveLinkWithPreview(url, adapter);

    expect(saved.url).toBe(url);
    expect(saved.normalizedUrl).toBe(url);
    expect(saved.domain).toBe('ge.globo.com');
    expect(saved.title).toBe('uma materia com caminho longo e varios detalhes sobre o jogo.ghtml');
    expect(saved.preview).toBeNull();
    expect(adapter.insertLink).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['https://www.instagram.com/p/example/', 'instagram.com', 'example'],
    ['https://youtu.be/example123', 'youtu.be', 'example123'],
    ['https://example.com/story/important-report', 'example.com', 'important report'],
  ])('persists %s with URL-derived fallback when no preview metadata exists', async (url, domain, title) => {
    const adapter = makeLinkAdapter({
      getPreview: jest.fn(async () => { throw new Error('metadata unavailable'); }),
    });

    await expect(saveLinkWithPreview(url, adapter)).resolves.toMatchObject({
      url,
      normalizedUrl: url,
      domain,
      title,
      description: null,
      imageUrl: null,
      faviconUrl: null,
      preview: null,
    });
    expect(adapter.insertLink).toHaveBeenCalledTimes(1);
  });

  test('does not let a preview-image timeout prevent SQLite persistence', async () => {
    const timeout = new Error('image request aborted by timeout');
    timeout.name = 'AbortError';
    const adapter = makeLinkAdapter({
      getPreview: jest.fn(async () => ({
        title: 'A page',
        description: null,
        domain: 'example.com',
        imageUrl: 'https://example.com/cover.jpg',
        faviconUrl: null,
      })),
      cachePreview: jest.fn(async () => { throw timeout; }),
    });

    await expect(saveLinkWithPreview('https://example.com/story', adapter)).resolves.toMatchObject({
      title: 'A page',
      imageUrl: 'https://example.com/cover.jpg',
      preview: null,
    });
    expect(adapter.insertLink).toHaveBeenCalledTimes(1);
  });

  test('blocks duplicate links before fetching or inserting', async () => {
    const adapter = makeLinkAdapter({ hasLink: jest.fn(async () => true) });

    await expect(saveLinkWithPreview('https://example.com', adapter)).rejects.toBeInstanceOf(DuplicateSavedLinkError);
    expect(adapter.getPreview).not.toHaveBeenCalled();
    expect(adapter.insertLink).not.toHaveBeenCalled();
  });

  test('a completed save is recognized on retry and does not insert a duplicate', async () => {
    const savedUrls = new Set();
    const insertLink = jest.fn(async (input) => {
      savedUrls.add(input.normalizedUrl);
      return { id: 17, contentType: 'link', ...input };
    });
    const adapter = makeLinkAdapter({
      hasLink: jest.fn(async (url) => savedUrls.has(url)),
      insertLink,
    });

    await expect(saveLinkWithPreview('https://example.com/saved', adapter)).resolves.toMatchObject({ id: 17 });
    await expect(saveLinkWithPreview('https://example.com/saved', adapter)).rejects.toBeInstanceOf(DuplicateSavedLinkError);
    expect(insertLink).toHaveBeenCalledTimes(1);
  });

  test('cleans a persistent preview file if the SQLite insert fails', async () => {
    const adapter = makeLinkAdapter({ insertLink: jest.fn(async () => { throw new Error('SQLite insert failed'); }) });

    await expect(saveLinkWithPreview('https://example.com', adapter)).rejects.toThrow('SQLite insert failed');
    expect(adapter.deletePreview).toHaveBeenCalledWith('home-content/link-previews/preview-1.jpg');
  });

  test('cancellation before persistence creates no row or preview file', async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = makeLinkAdapter();

    await expect(saveLinkWithPreview('https://example.com', adapter, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(adapter.getPreview).not.toHaveBeenCalled();
    expect(adapter.insertLink).not.toHaveBeenCalled();
  });

  test('rolls back an inserted link and its cached preview if cancellation races with SQLite', async () => {
    const controller = new AbortController();
    let finishInsert;
    const adapter = makeLinkAdapter({
      insertLink: jest.fn(() => new Promise((resolve) => { finishInsert = resolve; })),
    });
    const pendingSave = saveLinkWithPreview('https://example.com', adapter, controller.signal);

    while (!finishInsert) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    controller.abort();
    finishInsert({ id: 4, contentType: 'link' });

    await expect(pendingSave).rejects.toMatchObject({ name: 'AbortError' });
    expect(adapter.deleteInsertedLink).toHaveBeenCalledWith(4);
    expect(adapter.deletePreview).toHaveBeenCalledWith('home-content/link-previews/preview-1.jpg');
  });

  test('preserves newlines in text and rejects whitespace-only content', async () => {
    const insertText = jest.fn(async (text, createdAt) => ({ id: 9, contentType: 'text', text, createdAt }));
    const saved = await saveTextContent('linha 1\n\nlinha 2', { insertText, now: () => 123 });

    expect(saved.text).toBe('linha 1\n\nlinha 2');
    expect(insertText).toHaveBeenCalledWith('linha 1\n\nlinha 2', 123);
    await expect(saveTextContent(' \n  ', { insertText })).rejects.toBeInstanceOf(EmptySavedTextError);
  });

  test('rolls back text inserted after the editor was cancelled', async () => {
    const controller = new AbortController();
    let finishInsert;
    const adapter = {
      insertText: jest.fn(() => new Promise((resolve) => { finishInsert = resolve; })),
      deleteInsertedText: jest.fn(async () => undefined),
    };
    const pendingSave = saveTextContent('draft', adapter, controller.signal);

    while (!finishInsert) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    controller.abort();
    finishInsert({ id: 23, contentType: 'text', text: 'draft', createdAt: 123 });

    await expect(pendingSave).rejects.toMatchObject({ name: 'AbortError' });
    expect(adapter.deleteInsertedText).toHaveBeenCalledWith(23);
  });
});
