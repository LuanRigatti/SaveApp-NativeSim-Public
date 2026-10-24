/* global describe, expect, test */

const {
  getAutomaticPhotoTitle,
  getPhotoDisplayTitle,
  getPhotoSavedDateLabel,
  normalizeCustomPhotoTitle,
} = require('../src/features/photos/photoTitle');

describe('photo title and saved date labels', () => {
  test('uses the automatic base title for old and new photos without combining the date', () => {
    expect(getAutomaticPhotoTitle({ isScreenshot: false })).toBe('Foto');
    expect(getAutomaticPhotoTitle({ isScreenshot: true })).toBe('Captura de tela');
    expect(getPhotoDisplayTitle({ isScreenshot: false, customTitle: null })).toBe('Foto');
    expect(getPhotoDisplayTitle({ isScreenshot: true, customTitle: null })).toBe('Captura de tela');
  });

  test('uses a custom title by itself so the timestamp stays in its separate row', () => {
    expect(getPhotoDisplayTitle({ isScreenshot: true, customTitle: '  Meu projeto  ' })).toBe(
      'Meu projeto',
    );
  });

  test('formats today, yesterday, and older dates from the persisted local timestamp', () => {
    const now = new Date(2026, 9, 23, 15, 42, 0);

    expect(getPhotoSavedDateLabel(new Date(2026, 9, 23, 9, 7, 0).getTime(), now)).toBe(
      'Hoje, 09:07',
    );
    expect(getPhotoSavedDateLabel(new Date(2026, 9, 22, 21, 18, 0).getTime(), now)).toBe(
      'Ontem, 21:18',
    );
    expect(getPhotoSavedDateLabel(new Date(2026, 9, 4, 7, 5, 0).getTime(), now)).toBe(
      '04/10, 07:05',
    );
  });

  test('returns no date label for invalid timestamps instead of inventing a date', () => {
    expect(getPhotoSavedDateLabel(Number.NaN, new Date(2026, 9, 23))).toBeNull();
    expect(getPhotoSavedDateLabel(-Infinity, new Date(2026, 9, 23))).toBeNull();
  });

  test('trims, limits, and clears custom titles without changing automatic names', () => {
    expect(normalizeCustomPhotoTitle('  Inspiração ✨  ')).toBe('Inspiração ✨');
    expect(normalizeCustomPhotoTitle('a'.repeat(120))).toBe('a'.repeat(100));
    expect(normalizeCustomPhotoTitle('   ')).toBeNull();
  });
});
