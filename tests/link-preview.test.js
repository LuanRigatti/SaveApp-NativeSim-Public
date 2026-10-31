const {
  downloadLinkFaviconImage,
  getLinkPreview,
  parseLinkPreviewHtml,
} = require('../src/features/home-content/linkPreview');

const YOUTUBE_VIDEO_ID = 'abcDEF12345';

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

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

  test('prefers an official raster touch icon when the regular favicon is an ICO', () => {
    const metadata = parseLinkPreviewHtml(`
      <link rel="shortcut icon" href="/favicon.ico" />
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    `, 'https://github.com/example/repo');

    expect(metadata.faviconUrl).toBe('https://github.com/apple-touch-icon.png');
  });

  test('uses the site favicon.ico when the page declares only an unsupported SVG favicon', () => {
    const metadata = parseLinkPreviewHtml(
      '<link rel="icon" type="image/svg+xml" href="/assets/site-mark.svg">',
      'https://github.com/example/repo',
    );

    expect(metadata.faviconUrl).toBe('https://github.com/favicon.ico');
  });

  test('downloads a small raster or ICO favicon through the bounded safe request path', async () => {
    const body = Uint8Array.from([1, 2, 3, 4]);
    const fetcher = jest.fn(async () => new Response(body, {
      headers: { 'content-type': 'image/x-icon', 'content-length': String(body.length) },
    }));

    await expect(downloadLinkFaviconImage('https://example.com/favicon.ico', undefined, fetcher))
      .resolves.toMatchObject({ mimeType: 'image/x-icon', bytes: body });
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      credentials: 'omit',
      redirect: 'manual',
      headers: { Accept: expect.stringContaining('image/x-icon') },
    });
  });

  test('rejects an oversized favicon and keeps network failures optional', async () => {
    const oversizedFetcher = jest.fn(async () => new Response(null, {
      headers: { 'content-type': 'image/png', 'content-length': String(300 * 1024) },
    }));
    await expect(downloadLinkFaviconImage('https://example.com/favicon.png', undefined, oversizedFetcher))
      .rejects.toThrow('size limit');

    const offlineFetcher = jest.fn(async () => { throw new Error('offline'); });
    await expect(downloadLinkFaviconImage('https://example.com/favicon.png', undefined, offlineFetcher))
      .rejects.toThrow('offline');
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

  test.each([
    `https://www.youtube.com/watch?v=${YOUTUBE_VIDEO_ID}`,
    `https://m.youtube.com/watch?v=${YOUTUBE_VIDEO_ID}`,
    `https://youtu.be/${YOUTUBE_VIDEO_ID}`,
    `https://www.youtube.com/shorts/${YOUTUBE_VIDEO_ID}`,
    `https://youtube.com/live/${YOUTUBE_VIDEO_ID}`,
  ])('uses YouTube oEmbed metadata for recognized video URL %s', async (url) => {
    const fetcher = jest.fn(async () => jsonResponse({
      title: 'A real video title',
      author_name: 'SaveApp Channel',
      thumbnail_url: `https://i.ytimg.com/vi/${YOUTUBE_VIDEO_ID}/hqdefault.jpg`,
    }));

    await expect(getLinkPreview(url, undefined, fetcher)).resolves.toEqual({
      title: 'A real video title',
      description: 'SaveApp Channel',
      domain: new URL(url).hostname.replace(/^www\./, ''),
      imageUrl: `https://i.ytimg.com/vi/${YOUTUBE_VIDEO_ID}/hqdefault.jpg`,
      faviconUrl: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const request = new URL(fetcher.mock.calls[0][0]);
    expect(request.origin + request.pathname).toBe('https://www.youtube.com/oembed');
    expect(request.searchParams.get('url')).toBe(
      `https://www.youtube.com/watch?v=${YOUTUBE_VIDEO_ID}`,
    );
    expect(request.searchParams.get('format')).toBe('json');
  });

  test('ignores an untrusted thumbnail host returned by YouTube oEmbed', async () => {
    const fetcher = jest.fn(async () => jsonResponse({
      title: 'Video title',
      author_name: 'Channel',
      thumbnail_url: 'https://attacker.example/thumbnail.jpg',
    }));

    await expect(getLinkPreview(
      `https://youtu.be/${YOUTUBE_VIDEO_ID}`,
      undefined,
      fetcher,
    )).resolves.toMatchObject({
      title: 'Video title',
      description: 'Channel',
      imageUrl: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('falls back to a readable YouTube title when oEmbed and page metadata are unavailable', async () => {
    const fetcher = jest.fn(async () => new Response(null, { status: 403 }));

    await expect(getLinkPreview(
      `https://www.youtube.com/watch?v=${YOUTUBE_VIDEO_ID}`,
      undefined,
      fetcher,
    )).resolves.toMatchObject({
      title: 'Vídeo do YouTube',
      domain: 'youtube.com',
      description: null,
      imageUrl: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test('only requests oEmbed for an exact YouTube host and a valid video ID', async () => {
    const fetcher = jest.fn(async () => new Response(null, { status: 403 }));

    await getLinkPreview(`https://youtube.example.evil/watch?v=${YOUTUBE_VIDEO_ID}`, undefined, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(`https://youtube.example.evil/watch?v=${YOUTUBE_VIDEO_ID}`);

    fetcher.mockClear();
    await getLinkPreview('https://www.youtube.com/watch?v=short', undefined, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('https://www.youtube.com/watch?v=short');
  });

  test('returns a YouTube fallback after the shared metadata deadline expires', async () => {
    jest.useFakeTimers();
    try {
      const fetcher = jest.fn((_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('request aborted by timeout');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      }));
      const result = getLinkPreview(
        `https://www.youtube.com/watch?v=${YOUTUBE_VIDEO_ID}`,
        undefined,
        fetcher,
      );

      await jest.advanceTimersByTimeAsync(3_500);
      await expect(result).resolves.toMatchObject({
        title: 'Vídeo do YouTube',
        imageUrl: null,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('propagates explicit cancellation of the YouTube metadata request', async () => {
    const controller = new AbortController();
    const fetcher = jest.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('request aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }));
    const result = getLinkPreview(`https://youtu.be/${YOUTUBE_VIDEO_ID}`, controller.signal, fetcher);

    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
