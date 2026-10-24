const { getLinkPreview, parseLinkPreviewHtml } = require('../src/features/home-content/linkPreview');

describe('local link metadata extraction', () => {
  test('reads Open Graph, Twitter, HTML title, relative image and favicon metadata', () => {
    const html = `
      <html><head>
        <meta property="og:title" content="A &amp; B page" />
        <meta name='og:description' content='A short description' />
        <meta property="og:image" content="/assets/cover.jpg" />
        <meta name="twitter:image" content="https://ignored.example/other.jpg" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <title>Fallback title</title>
      </head></html>`;

    expect(parseLinkPreviewHtml(html, 'https://example.com/article')).toEqual({
      title: 'A & B page',
      description: 'A short description',
      domain: 'example.com',
      imageUrl: 'https://example.com/assets/cover.jpg',
      faviconUrl: 'https://example.com/favicon.ico',
    });
  });

  test('uses HTML title and derives fallback title if metadata is absent', () => {
    expect(parseLinkPreviewHtml('<title>Plain &amp; simple</title>', 'https://example.com/path')).toMatchObject({
      title: 'Plain & simple',
      description: null,
      imageUrl: null,
      faviconUrl: null,
    });
    expect(parseLinkPreviewHtml('<html></html>', 'https://example.com/saved-link').title).toBe('saved link');
  });

  test('treats website blocks and fetch failures as optional preview failures', async () => {
    const failingFetcher = jest.fn(async () => {
      throw new Error('network unavailable');
    });

    await expect(getLinkPreview('https://example.com/article', undefined, failingFetcher)).resolves.toMatchObject({
      title: 'article',
      domain: 'example.com',
      imageUrl: null,
    });
    expect(failingFetcher).toHaveBeenCalledTimes(1);
  });

  test.each([403, 404, 500])('uses URL fallback when a website responds with HTTP %i', async (status) => {
    const fetcher = jest.fn(async () => ({
      status,
      ok: false,
      headers: { get: () => null },
      body: { cancel: jest.fn(async () => undefined) },
    }));

    await expect(getLinkPreview('https://example.com/report', undefined, fetcher)).resolves.toMatchObject({
      title: 'report',
      domain: 'example.com',
      description: null,
      imageUrl: null,
      faviconUrl: null,
    });
  });

  test('falls back when the internal request deadline aborts a stalled metadata request', async () => {
    jest.useFakeTimers();
    try {
      const fetcher = jest.fn((_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('request aborted by timeout');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      }));

      const result = getLinkPreview('https://example.com/slow-page', undefined, fetcher);
      await jest.advanceTimersByTimeAsync(3_500);

      await expect(result).resolves.toMatchObject({
        title: 'slow page',
        domain: 'example.com',
        imageUrl: null,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('keeps explicit user cancellation distinct from an internal timeout', async () => {
    const controller = new AbortController();
    const fetcher = jest.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('request aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }));

    const result = getLinkPreview('https://example.com/slow-page', controller.signal, fetcher);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('does not fetch a preview for a local/private destination', async () => {
    const fetcher = jest.fn();
    await expect(getLinkPreview('http://192.168.1.1/', undefined, fetcher)).resolves.toMatchObject({
      domain: '192.168.1.1',
      imageUrl: null,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
