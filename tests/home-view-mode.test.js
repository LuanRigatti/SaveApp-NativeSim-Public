/* global describe, expect, test */

const {
  DEFAULT_HOME_VIEW_MODE,
  HOME_VIEW_MODE_STORAGE_KEY,
  getHomeGridCardMetrics,
  getHomeGalleryEntrySpan,
  getHomeListMetrics,
  getHomeViewLayout,
  isHomeViewMode,
  persistHomeViewMode,
  restoreHomeViewMode,
} = require('../src/features/home-content/homeViewMode');
const { buildHomeGalleryEntries } = require('../src/features/home-content/homeFeed');

describe('Home view mode preference and layout', () => {
  test('uses Maiores as the first-use default and rejects unknown stored modes', async () => {
    expect(DEFAULT_HOME_VIEW_MODE).toBe('large');
    expect(isHomeViewMode('list')).toBe(true);
    expect(isHomeViewMode('compact-list')).toBe(true);
    expect(isHomeViewMode('single-line')).toBe(true);
    expect(isHomeViewMode('small')).toBe(true);
    expect(isHomeViewMode('large')).toBe(true);
    expect(isHomeViewMode('invalid')).toBe(false);
    expect(await restoreHomeViewMode({ getItem: async () => null, setItem: async () => {} })).toBe(
      'large',
    );
    expect(
      await restoreHomeViewMode({ getItem: async () => 'invalid', setItem: async () => {} }),
    ).toBe('large');
  });

  test('persists and restores the selected mode under the SaveApp preference key', async () => {
    const values = new Map();
    const storage = {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => values.set(key, value),
    };

    await persistHomeViewMode('single-line', storage);

    expect(values.get(HOME_VIEW_MODE_STORAGE_KEY)).toBe('single-line');
    expect(await restoreHomeViewMode(storage)).toBe('single-line');
  });

  test('restores each known stored mode value without migration or reset', async () => {
    for (const legacyMode of ['large', 'small', 'list', 'compact-list', 'single-line']) {
      await expect(
        restoreHomeViewMode({ getItem: async () => legacyMode, setItem: async () => {} }),
      ).resolves.toBe(legacyMode);
    }
  });

  test('keeps storage failures non-fatal and falls back to Maiores', async () => {
    const brokenStorage = {
      getItem: async () => {
        throw new Error('read failed');
      },
      setItem: async () => {
        throw new Error('write failed');
      },
    };

    await expect(restoreHomeViewMode(brokenStorage)).resolves.toBe('large');
    await expect(persistHomeViewMode('list', brokenStorage)).resolves.toBeUndefined();
  });

  test.each([
    ['large', { key: 'home-gallery-large', masonry: false, numColumns: 2 }],
    ['small', { key: 'home-gallery-small', masonry: false, numColumns: 2 }],
    ['list', { key: 'home-gallery-list', masonry: false, numColumns: 1 }],
    ['compact-list', { key: 'home-gallery-compact-list', masonry: false, numColumns: 1 }],
    ['single-line', { key: 'home-gallery-single-line', masonry: false, numColumns: 1 }],
  ])('maps %s to its intended FlashList layout', (mode, expected) => {
    expect(getHomeViewLayout(mode)).toEqual(expected);
  });

  test('uses equal responsive fixed card dimensions for each grid mode', () => {
    const large = getHomeGridCardMetrics('large', 390, 0, 4);
    const small = getHomeGridCardMetrics('small', 390, 8, 8);
    const narrowSmall = getHomeGridCardMetrics('small', 320, 8, 8);
    const widerSmall = getHomeGridCardMetrics('small', 430, 8, 8);
    const narrowLarge = getHomeGridCardMetrics('large', 320, 0, 4);
    const widerLarge = getHomeGridCardMetrics('large', 430, 0, 4);
    const unscaledLargeWidth = (390 - 4 * 4) / 2;

    expect(large).toEqual({
      columns: 2,
      width: 168.3,
      previewHeight: 131,
      contentHeight: 94,
      height: 225,
    });
    expect(small).toEqual({
      columns: 2,
      width: 171,
      previewHeight: 52,
      contentHeight: 82,
      height: 98,
    });
    expect(narrowSmall).toMatchObject({ width: 136, previewHeight: 45, height: 98 });
    expect(widerSmall).toMatchObject({ width: 191, previewHeight: 52, height: 98 });
    expect(narrowLarge).toMatchObject({ width: 136.8, previewHeight: 107, contentHeight: 94, height: 201 });
    expect(widerLarge).toMatchObject({ width: 186.3, previewHeight: 145, contentHeight: 98, height: 243 });
    expect(large.width / unscaledLargeWidth).toBeCloseTo(0.9, 5);
    expect(widerLarge.width).toBeGreaterThan(large.width);
    expect(widerSmall.width).toBeGreaterThan(small.width);
    expect(getHomeGridCardMetrics('large', 390, 0, 4, 1.5).height).toBeGreaterThan(large.height);
    expect(getHomeGridCardMetrics('large', 390, 0, 4, 1.5).contentHeight).toBe(133);
    expect(getHomeGridCardMetrics('small', 390, 8, 8, 1.5).height).toBeGreaterThan(small.height);
  });

  test('keeps the original List metrics and uses compact metrics with Dynamic Type room', () => {
    expect(getHomeListMetrics('list')).toEqual({ rowHeight: 96, thumbnailSize: 72 });
    expect(getHomeListMetrics('compact-list')).toEqual({ rowHeight: 76, thumbnailSize: 52 });
    expect(getHomeListMetrics('compact-list', 1.5)).toEqual({ rowHeight: 108, thumbnailSize: 52 });
    expect(getHomeListMetrics('list', 1.5)).toEqual({ rowHeight: 96, thumbnailSize: 72 });
    expect(getHomeListMetrics('list', 2.5)).toEqual({ rowHeight: 107, thumbnailSize: 72 });
    expect(getHomeListMetrics('list', 3)).toEqual({ rowHeight: 126, thumbnailSize: 72 });
    expect(getHomeListMetrics('single-line')).toEqual({ rowHeight: 52, thumbnailSize: 34 });
    expect(getHomeListMetrics('single-line', 2)).toEqual({ rowHeight: 64, thumbnailSize: 34 });
  });

  test('sets day separators to full span and leaves content items in stable individual cells', () => {
    const daySeparator = { kind: 'day-separator', id: 'day:2026-10-23', dayKey: '2026-10-23', title: 'Hoje' };
    const content = { kind: 'content', id: 'content:photo:4', content: { id: 4 } };

    expect(getHomeGalleryEntrySpan(daySeparator, 1)).toBe(1);
    expect(getHomeGalleryEntrySpan(daySeparator, 2)).toBe(2);
    expect(getHomeGalleryEntrySpan(daySeparator, 3)).toBe(3);
    expect(getHomeGalleryEntrySpan(content, 3)).toBeUndefined();
  });

  test('preserves empty and mixed-feed entries, order, day groups, and stable IDs for every mode', () => {
    const now = new Date(2026, 9, 23, 15, 0, 0);
    const items = [
      { id: 7, mediaType: 'photo', createdAt: new Date(2026, 9, 23, 8).getTime(), width: 120, height: 180 },
      { id: 2, contentType: 'text', createdAt: new Date(2026, 9, 22, 20).getTime(), text: 'Nota' },
      { id: 5, mediaType: 'video', createdAt: now.getTime(), width: 180, height: 120 },
      { id: 6, contentType: 'document', createdAt: new Date(2026, 9, 23, 10).getTime(), originalName: 'Relatorio.pdf', extension: 'pdf', sizeBytes: 512 },
      { id: 3, contentType: 'link', createdAt: new Date(2026, 9, 21, 12).getTime(), title: 'Link', domain: 'example.com' },
    ];
    const expectedIds = [
      'day:2026-10-23',
      'content:video:5',
      'content:document:6',
      'content:photo:7',
      'day:2026-10-22',
      'content:text:2',
      'day:2026-10-21',
      'content:link:3',
    ];

    expect(buildHomeGalleryEntries([], now)).toEqual([]);

    for (const mode of ['large', 'small', 'list', 'compact-list', 'single-line']) {
      expect(getHomeViewLayout(mode).numColumns).toBeGreaterThan(0);
      expect(buildHomeGalleryEntries(items, now).map((entry) => entry.id)).toEqual(expectedIds);
    }
  });
});
