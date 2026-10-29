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
    mediaCount: 0,
    savedContentCount: 0,
    documentCount: 0,
    checklistCount: 0,
    searchQuery: '',
    favoritesOnly: false,
    folderFilterKind: 'all-items',
  };

  test('shows the first-content state only after every catalog confirms zero items', () => {
    expect(shouldShowGlobalHomeEmptyState(emptyLibrary)).toBe(true);
    expect(shouldShowGlobalHomeEmptyState({ ...emptyLibrary, catalogsLoadedSuccessfully: false })).toBe(false);
  });

  test.each([
    ['photo or video', { mediaCount: 1 }],
    ['link', { savedContentCount: 1 }],
    ['text', { savedContentCount: 1 }],
    ['document', { documentCount: 1 }],
    ['checklist', { checklistCount: 1 }],
  ])('hides the global empty state when the library contains a %s', (_label, count) => {
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
    expect(shouldShowGlobalHomeEmptyState({ ...emptyLibrary, savedContentCount: 1 })).toBe(false);
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
