const { buildHomeGalleryEntries, formatLocalDayTitle, getLocalDayKey, sortHomeItemsChronologically } = require('../src/features/home-content/homeFeed');

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
});
