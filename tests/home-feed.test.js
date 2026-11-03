const {
  areHomeFeedSourcesReady,
  buildHomeGalleryEntries,
  buildHomeGalleryEntriesWhenReady,
  formatLocalDayTitle,
  getLocalDayKey,
  shouldShowHomeCategoryEmptyState,
  shouldShowGlobalHomeEmptyState,
  sortHomeItemsChronologically,
} = require('../src/features/home-content/homeFeed');
const { filterHomeFolderItems } = require('../src/features/home-folders/homeFolderTypes');

const today = new Date(2026, 9, 23, 15, 0, 0);
const todayMorning = new Date(2026, 9, 23, 8, 0, 0).getTime();
const yesterdayEvening = new Date(2026, 9, 22, 20, 0, 0).getTime();
const previousDate = new Date(2026, 9, 21, 23, 59, 0).getTime();

const mixedItems = [
  { id: 7, mediaType: 'photo', createdAt: todayMorning, width: 100, height: 200 },
  { id: 2, contentType: 'text', createdAt: yesterdayEvening, text: 'Uma nota' },
  { id: 5, mediaType: 'video', createdAt: today.getTime(), width: 200, height: 100 },
  { id: 3, contentType: 'link', createdAt: previousDate, url: 'https://example.com', title: 'Example', domain: 'example.com' },
];

describe('Home mixed feed day grouping', () => {
  test('waits for media, saved content, and the persisted layout before populating a cold-start feed', () => {
    const readyState = {
      photoLibraryReady: true,
      savedContentReady: true,
      documentLibraryReady: true,
      checklistLibraryReady: true,
      viewModeReady: true,
      homeFoldersReady: true,
    };

    expect(areHomeFeedSourcesReady(readyState)).toBe(true);
    expect(
      areHomeFeedSourcesReady({ ...readyState, photoLibraryReady: false }),
    ).toBe(false);
    expect(
      areHomeFeedSourcesReady({ ...readyState, savedContentReady: false }),
    ).toBe(false);
    expect(
      areHomeFeedSourcesReady({ ...readyState, documentLibraryReady: false }),
    ).toBe(false);
    expect(
      areHomeFeedSourcesReady({ ...readyState, checklistLibraryReady: false }),
    ).toBe(false);
    expect(
      areHomeFeedSourcesReady({ ...readyState, viewModeReady: false }),
    ).toBe(false);
    expect(
      areHomeFeedSourcesReady({ ...readyState, homeFoldersReady: false }),
    ).toBe(false);
    expect(buildHomeGalleryEntriesWhenReady(mixedItems, today, false)).toEqual([]);
    expect(buildHomeGalleryEntriesWhenReady(mixedItems, today, true)).toEqual(
      buildHomeGalleryEntries(mixedItems, today),
    );
  });

  test('sorts four content kinds newest-first and inserts full-width day separators in local time', () => {
    const entries = buildHomeGalleryEntries(mixedItems, today);

    expect(entries.filter((entry) => entry.kind === 'day-separator').map((entry) => entry.title)).toEqual([
      'Hoje',
      'Ontem',
      '21 de outubro',
    ]);
    expect(entries.filter((entry) => entry.kind === 'content').map((entry) => entry.content.id)).toEqual([
      5,
      7,
      2,
      3,
    ]);
    expect(entries[0].id).toBe('day:2026-10-23');
    expect(entries[1].id).toBe('content:video:5');
    expect(entries[2].id).toBe('content:photo:7');
  });

  test('keeps two timestamps on opposite sides of local midnight in different groups', () => {
    const beforeMidnight = new Date(2026, 9, 22, 23, 59, 59, 999).getTime();
    const afterMidnight = new Date(2026, 9, 23, 0, 0, 0, 1).getTime();

    expect(getLocalDayKey(beforeMidnight)).toBe('2026-10-22');
    expect(getLocalDayKey(afterMidnight)).toBe('2026-10-23');
    expect(formatLocalDayTitle(beforeMidnight, today)).toBe('Ontem');
  });

  test('uses stable tie ordering and does not mutate the provider array', () => {
    const source = [...mixedItems];
    const sorted = sortHomeItemsChronologically(source);

    expect(sorted.map((item) => item.id)).toEqual([5, 7, 2, 3]);
    expect(source).toEqual(mixedItems);
  });

  test('adds documents to the same chronological day groups with stable document IDs', () => {
    const document = {
      id: 9,
      contentType: 'document',
      createdAt: new Date(2026, 9, 23, 10).getTime(),
      originalName: 'Relatorio.pdf',
      extension: 'pdf',
      sizeBytes: 1024,
    };
    const entries = buildHomeGalleryEntries([...mixedItems, document], today);

    expect(entries[0].id).toBe('day:2026-10-23');
    expect(entries.map((entry) => entry.id)).toContain('content:document:9');
    expect(entries.find((entry) => entry.id === 'content:document:9').kind).toBe('content');
  });
});

describe('global Home empty state eligibility', () => {
  const emptyLibrary = {
    catalogsLoadedSuccessfully: true,
    visibleItemCount: 0,
    mediaCount: 0,
    savedContentCount: 0,
    documentCount: 0,
    checklistCount: 0,
    searchQuery: '',
    favoritesOnly: false,
    folderFilterKind: 'all-items',
  };

  test('shows the first-content state in Todos after successful reads when no item is visible', () => {
    expect(shouldShowGlobalHomeEmptyState(emptyLibrary)).toBe(true);
    expect(shouldShowGlobalHomeEmptyState({ ...emptyLibrary, catalogsLoadedSuccessfully: false })).toBe(false);
  });

  test('shows the existing state when the last visible item was moved into a protected folder', () => {
    const link = { id: 11, contentType: 'link', createdAt: todayMorning, url: 'https://private.example' };
    const visibleItems = filterHomeFolderItems(
      [link],
      { kind: 'all-items' },
      new Map([['link:11', 'protected-folder']]),
      new Set(['protected-folder']),
      new Set(),
    );

    expect(visibleItems).toEqual([]);
    expect(shouldShowGlobalHomeEmptyState({
      ...emptyLibrary,
      savedContentCount: 1,
      visibleItemCount: visibleItems.length,
    })).toBe(true);
  });

  test('does not expose an item hidden by folder authorization', () => {
    const protectedLink = { id: 12, contentType: 'link', createdAt: todayMorning, url: 'https://protected.example' };
    const visibleItems = filterHomeFolderItems(
      [protectedLink],
      { kind: 'all-items' },
      new Map([['link:12', 'locked-folder']]),
      new Set(['locked-folder']),
      new Set(),
    );

    expect(visibleItems).toEqual([]);
    expect(shouldShowGlobalHomeEmptyState({
      ...emptyLibrary,
      savedContentCount: 1,
      visibleItemCount: visibleItems.length,
    })).toBe(true);
  });

  test.each([
    ['photo or video', { mediaCount: 1, visibleItemCount: 1 }],
    ['link', { savedContentCount: 1, visibleItemCount: 1 }],
    ['text', { savedContentCount: 1, visibleItemCount: 1 }],
    ['document', { documentCount: 1, visibleItemCount: 1 }],
    ['checklist', { checklistCount: 1, visibleItemCount: 1 }],
  ])('hides the state when a %s is visible in Todos', (_label, count) => {
    expect(shouldShowGlobalHomeEmptyState({ ...emptyLibrary, ...count })).toBe(false);
  });

  test.each([
    ['search', { searchQuery: 'sem resultados' }],
    ['favorites', { favoritesOnly: true }],
    ['folder', { folderFilterKind: 'folder' }],
    ['unfiled', { folderFilterKind: 'unfiled' }],
  ])('preserves the specific empty state for an active %s filter', (_label, filter) => {
    expect(shouldShowGlobalHomeEmptyState({ ...emptyLibrary, ...filter })).toBe(false);
  });

  test('automatically stops qualifying after the first saved item reaches its catalog', () => {
    expect(shouldShowGlobalHomeEmptyState({ ...emptyLibrary, savedContentCount: 1, visibleItemCount: 1 })).toBe(false);
  });

  test('automatically hides when new visible content arrives', () => {
    expect(shouldShowGlobalHomeEmptyState({ ...emptyLibrary, visibleItemCount: 1 })).toBe(false);
  });

  test('waits for catalog readiness and preserves specific empty states', () => {
    expect(shouldShowGlobalHomeEmptyState({ ...emptyLibrary, catalogsLoadedSuccessfully: false })).toBe(false);
    expect(shouldShowGlobalHomeEmptyState({ ...emptyLibrary, searchQuery: 'no match' })).toBe(false);
    expect(shouldShowGlobalHomeEmptyState({ ...emptyLibrary, favoritesOnly: true })).toBe(false);
    expect(shouldShowGlobalHomeEmptyState({ ...emptyLibrary, folderFilterKind: 'folder' })).toBe(false);
    expect(shouldShowGlobalHomeEmptyState({ ...emptyLibrary, folderFilterKind: 'unfiled' })).toBe(false);
  });

  test('keeps the global first-content state for an empty category only when the whole library is empty', () => {
    expect(shouldShowGlobalHomeEmptyState({ ...emptyLibrary, folderFilterKind: 'category' })).toBe(true);
    expect(shouldShowGlobalHomeEmptyState({ ...emptyLibrary, folderFilterKind: 'category', documentCount: 1 })).toBe(false);
  });
});

describe('Home category empty state eligibility', () => {
  const emptyCategory = {
    catalogsLoadedSuccessfully: true,
    totalItemCount: 1,
    categoryItemCount: 0,
    searchQuery: '',
    favoritesOnly: false,
  };

  test('shows a category empty state only after catalogs load and another category has content', () => {
    expect(shouldShowHomeCategoryEmptyState(emptyCategory)).toBe(true);
    expect(shouldShowHomeCategoryEmptyState({ ...emptyCategory, catalogsLoadedSuccessfully: false })).toBe(false);
    expect(shouldShowHomeCategoryEmptyState({ ...emptyCategory, totalItemCount: 0 })).toBe(false);
  });

  test('preserves search and favorites empty states over the category message', () => {
    expect(shouldShowHomeCategoryEmptyState({ ...emptyCategory, searchQuery: 'sem resultado' })).toBe(false);
    expect(shouldShowHomeCategoryEmptyState({ ...emptyCategory, favoritesOnly: true })).toBe(false);
  });
});
