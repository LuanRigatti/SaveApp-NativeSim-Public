/* global describe, expect, test */

const {
  DEFAULT_HOME_VIEW_MODE,
  HOME_VIEW_MODE_STORAGE_KEY,
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

    await persistHomeViewMode('compact-list', storage);

    expect(values.get(HOME_VIEW_MODE_STORAGE_KEY)).toBe('compact-list');
    expect(await restoreHomeViewMode(storage)).toBe('compact-list');
  });

  test('continues restoring existing stored mode values without migration or reset', async () => {
    for (const legacyMode of ['large', 'small', 'list']) {
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
    ['large', { key: 'home-gallery-large', masonry: true, numColumns: 2 }],
    ['small', { key: 'home-gallery-small', masonry: true, numColumns: 3 }],
    ['list', { key: 'home-gallery-list', masonry: false, numColumns: 1 }],
    ['compact-list', { key: 'home-gallery-compact-list', masonry: false, numColumns: 1 }],
  ])('maps %s to its intended FlashList layout', (mode, expected) => {
    expect(getHomeViewLayout(mode)).toEqual(expected);
  });

  test('keeps the original List metrics and uses compact metrics with Dynamic Type room', () => {
    expect(getHomeListMetrics('list')).toEqual({ rowHeight: 96, thumbnailSize: 72 });
    expect(getHomeListMetrics('compact-list')).toEqual({ rowHeight: 76, thumbnailSize: 52 });
    expect(getHomeListMetrics('compact-list', 1.5)).toEqual({ rowHeight: 108, thumbnailSize: 52 });
    expect(getHomeListMetrics('list', 1.5)).toEqual({ rowHeight: 96, thumbnailSize: 72 });
    expect(getHomeListMetrics('list', 2.5)).toEqual({ rowHeight: 107, thumbnailSize: 72 });
    expect(getHomeListMetrics('list', 3)).toEqual({ rowHeight: 126, thumbnailSize: 72 });
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
      { id: 3, contentType: 'link', createdAt: new Date(2026, 9, 21, 12).getTime(), title: 'Link', domain: 'example.com' },
    ];
    const expectedIds = [
      'day:2026-10-23',
      'content:video:5',
      'content:photo:7',
      'day:2026-10-22',
      'content:text:2',
      'day:2026-10-21',
      'content:link:3',
    ];

    expect(buildHomeGalleryEntries([], now)).toEqual([]);

    for (const mode of ['large', 'small', 'list', 'compact-list']) {
      expect(getHomeViewLayout(mode).numColumns).toBeGreaterThan(0);
      expect(buildHomeGalleryEntries(items, now).map((entry) => entry.id)).toEqual(expectedIds);
    }
  });
});
