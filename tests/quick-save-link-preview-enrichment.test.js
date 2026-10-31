/* global describe, expect, test, jest */

const {
  createQuickSaveLinkPreviewEnricher,
} = require('../src/features/home-content/quickSaveLinkPreviewEnrichment');

const candidate = (overrides = {}) => ({
  id: 41,
  url: 'https://example.test/article',
  normalizedUrl: 'https://example.test/article',
  title: 'article',
  description: null,
  domain: 'example.test',
  imageUrl: null,
  faviconUrl: null,
  previewImageRelativePath: null,
  previewImageMimeType: null,
  ...overrides,
});

const metadata = {
  title: 'A saved article',
  description: 'An article description',
  domain: 'example.test',
  imageUrl: 'https://cdn.example.test/cover.png',
  faviconUrl: null,
};

function createAdapter(overrides = {}) {
  return {
    getPreview: jest.fn(async () => metadata),
    cachePreview: jest.fn(async () => ({
      relativePath: 'home-content/link-previews/preview-test.png',
      mimeType: 'image/png',
    })),
    updateIfUnchanged: jest.fn(async () => true),
    isPreviewReferenced: jest.fn(async () => false),
    deletePreview: jest.fn(async () => undefined),
    onUpdated: jest.fn(),
    ...overrides,
  };
}

describe('Quick Save link preview enrichment', () => {
  test('enriches the committed link row with title, description and cached image', async () => {
    const adapter = createAdapter();
    const enricher = createQuickSaveLinkPreviewEnricher(adapter);

    await expect(enricher.schedule(candidate())).resolves.toBe('updated');

    expect(adapter.getPreview).toHaveBeenCalledWith(candidate().normalizedUrl);
    expect(adapter.cachePreview).toHaveBeenCalledWith(metadata.imageUrl);
    expect(adapter.updateIfUnchanged).toHaveBeenCalledWith(
      candidate(),
      metadata,
      { relativePath: 'home-content/link-previews/preview-test.png', mimeType: 'image/png' },
      true,
    );
    expect(adapter.onUpdated).toHaveBeenCalledTimes(1);
  });

  test('updates the Live Activity favicon only after the same Quick Save row commits', async () => {
    const previewWithFavicon = { ...metadata, faviconUrl: 'https://example.test/favicon.png' };
    const adapter = createAdapter({
      getPreview: jest.fn(async () => previewWithFavicon),
      cacheLockScreenFavicon: jest.fn(async () => true),
    });
    const enricher = createQuickSaveLinkPreviewEnricher(adapter);

    await expect(enricher.schedule(candidate())).resolves.toBe('updated');
    await Promise.resolve();

    expect(adapter.updateIfUnchanged).toHaveBeenCalledTimes(1);
    expect(adapter.cacheLockScreenFavicon).toHaveBeenCalledWith(candidate(), previewWithFavicon.faviconUrl);
    expect(adapter.onUpdated).toHaveBeenCalledTimes(2);
  });

  test('keeps a committed preview when optional favicon caching fails offline', async () => {
    const previewWithFavicon = { ...metadata, faviconUrl: 'https://example.test/favicon.png' };
    const adapter = createAdapter({
      getPreview: jest.fn(async () => previewWithFavicon),
      cacheLockScreenFavicon: jest.fn(async () => { throw new Error('offline'); }),
    });
    const enricher = createQuickSaveLinkPreviewEnricher(adapter);

    await expect(enricher.schedule(candidate())).resolves.toBe('updated');
    expect(adapter.updateIfUnchanged).toHaveBeenCalledTimes(1);
    expect(adapter.onUpdated).toHaveBeenCalledTimes(1);
  });

  test('coalesces concurrent requests for the same normalized URL', async () => {
    let finishPreview;
    const adapter = createAdapter({
      getPreview: jest.fn(() => new Promise((resolve) => { finishPreview = resolve; })),
    });
    const enricher = createQuickSaveLinkPreviewEnricher(adapter);

    const first = enricher.schedule(candidate());
    const second = enricher.schedule(candidate({ id: 42 }));
    expect(adapter.getPreview).toHaveBeenCalledTimes(1);
    finishPreview(metadata);
    await expect(Promise.all([first, second])).resolves.toEqual(['updated', 'updated']);
    expect(adapter.updateIfUnchanged).toHaveBeenCalledTimes(1);
  });

  test('does not overwrite a user edit or leave an unreferenced downloaded image', async () => {
    const adapter = createAdapter({ updateIfUnchanged: jest.fn(async () => false) });
    const enricher = createQuickSaveLinkPreviewEnricher(adapter);

    await expect(enricher.schedule(candidate())).resolves.toBe('unchanged');
    expect(adapter.deletePreview).toHaveBeenCalledWith('home-content/link-previews/preview-test.png');
    expect(adapter.onUpdated).not.toHaveBeenCalled();
  });

  test('keeps a useful text preview if caching its image fails', async () => {
    const adapter = createAdapter({ cachePreview: jest.fn(async () => { throw new Error('offline'); }) });
    const enricher = createQuickSaveLinkPreviewEnricher(adapter);

    await expect(enricher.schedule(candidate())).resolves.toBe('updated');
    expect(adapter.updateIfUnchanged).toHaveBeenCalledWith(candidate(), metadata, null, false);
  });

  test('uses existing metadata to retry only the local image cache', async () => {
    const enrichedCandidate = candidate({
      title: metadata.title,
      description: metadata.description,
      imageUrl: metadata.imageUrl,
    });
    const adapter = createAdapter();
    const enricher = createQuickSaveLinkPreviewEnricher(adapter);

    await expect(enricher.schedule(enrichedCandidate)).resolves.toBe('updated');
    expect(adapter.getPreview).not.toHaveBeenCalled();
    expect(adapter.cachePreview).toHaveBeenCalledWith(metadata.imageUrl);
  });

  test('limits retries and applies a cooldown to old fallback-only links', async () => {
    let now = 100_000;
    const adapter = createAdapter({
      getPreview: jest.fn(async () => ({
        title: 'article',
        description: null,
        domain: 'example.test',
        imageUrl: null,
        faviconUrl: null,
      })),
    });
    const enricher = createQuickSaveLinkPreviewEnricher(adapter, {
      maxAttemptsPerUrl: 2,
      retryDelayMs: 30_000,
      now: () => now,
    });

    await expect(enricher.schedule(candidate())).resolves.toBe('unchanged');
    await expect(enricher.schedule(candidate())).resolves.toBe('retry_deferred');
    now += 30_000;
    await expect(enricher.schedule(candidate())).resolves.toBe('unchanged');
    now += 30_000;
    await expect(enricher.schedule(candidate())).resolves.toBe('retry_limited');
    expect(adapter.getPreview).toHaveBeenCalledTimes(2);
  });

  test('claims each network attempt durably before fetching and respects the retry cap', async () => {
    const adapter = createAdapter({ claimAttempt: jest.fn(async () => false) });
    const enricher = createQuickSaveLinkPreviewEnricher(adapter, {
      maxAttemptsPerUrl: 2,
      retryDelayMs: 30_000,
      now: () => 123_000,
    });

    await expect(enricher.schedule(candidate())).resolves.toBe('retry_limited');
    expect(adapter.claimAttempt).toHaveBeenCalledWith(candidate(), {
      maxAttempts: 2,
      retryDelayMs: 30_000,
      now: 123_000,
    });
    expect(adapter.getPreview).not.toHaveBeenCalled();
    expect(adapter.cachePreview).not.toHaveBeenCalled();
  });

  test('respects deletion or a concurrent change when the SQLite compare-and-update declines', async () => {
    const adapter = createAdapter({
      cachePreview: jest.fn(async () => ({
        relativePath: 'home-content/link-previews/preview-test.png',
        mimeType: 'image/png',
      })),
      updateIfUnchanged: jest.fn(async () => false),
      isPreviewReferenced: jest.fn(async () => false),
    });
    const enricher = createQuickSaveLinkPreviewEnricher(adapter);

    await expect(enricher.schedule(candidate())).resolves.toBe('unchanged');
    expect(adapter.deletePreview).toHaveBeenCalledTimes(1);
  });

  test('retains an image file after an uncertain database result if the row references it', async () => {
    const adapter = createAdapter({
      updateIfUnchanged: jest.fn(async () => { throw new Error('uncertain commit'); }),
      isPreviewReferenced: jest.fn(async () => true),
    });
    const enricher = createQuickSaveLinkPreviewEnricher(adapter);

    await expect(enricher.schedule(candidate())).resolves.toBe('failed');
    expect(adapter.deletePreview).not.toHaveBeenCalled();
  });

  test('rejects malformed or non-HTTP candidates without calling the preview pipeline', async () => {
    const adapter = createAdapter();
    const enricher = createQuickSaveLinkPreviewEnricher(adapter);

    await expect(enricher.schedule(candidate({ url: 'file:///private/data' }))).resolves.toBe('ineligible');
    await expect(enricher.schedule(candidate({ normalizedUrl: 'https://other.test/' }))).resolves.toBe('ineligible');
    expect(adapter.getPreview).not.toHaveBeenCalled();
    expect(adapter.cachePreview).not.toHaveBeenCalled();
  });

  test('limits concurrent background fetches and scans beyond exhausted rows', async () => {
    let now = 100_000;
    let active = 0;
    let maximumActive = 0;
    const adapter = createAdapter({
      getPreview: jest.fn(async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 0));
        active -= 1;
        return metadata;
      }),
    });
    const enricher = createQuickSaveLinkPreviewEnricher(adapter, {
      maxConcurrent: 2,
      maxPending: 8,
      maxAttemptsPerUrl: 1,
      now: () => now,
    });
    const candidates = Array.from({ length: 6 }, (_, index) => candidate({
      id: index + 1,
      url: `https://example.test/${index}`,
      normalizedUrl: `https://example.test/${index}`,
      title: `${index}`,
    }));

    await expect(enricher.scheduleBatch(candidates, 6)).resolves.toHaveLength(6);
    expect(maximumActive).toBeLessThanOrEqual(2);
    now += 1;
  });
});
