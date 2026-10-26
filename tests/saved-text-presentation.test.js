/* global describe, expect, test */

const {
  getSavedTextPresentation,
  getSavedTextPreviewSize,
} = require('../src/features/home-content/savedTextPresentation');
const { getLinkPreviewSize } = require('../src/features/home-content/linkPreviewLayout');

describe('saved text presentation', () => {
  test('uses the first non-empty line as the title and keeps the remaining text as its summary', () => {
    expect(getSavedTextPresentation('  Ideias para viagem\r\n\r\n  Comprar passagem\nSeparar documentos  ')).toEqual({
      title: 'Ideias para viagem',
      secondaryText: 'Comprar passagem Separar documentos',
      thumbnailText: 'Ideias para viagem\n\n  Comprar passagem\nSeparar documentos',
      previewText: 'Ideias para viagem\n\n  Comprar passagem\nSeparar documentos',
    });
  });

  test('falls back safely for whitespace-only legacy values', () => {
    expect(getSavedTextPresentation(' \n  ')).toEqual({
      title: 'Texto salvo',
      secondaryText: null,
      thumbnailText: 'Texto salvo',
      previewText: 'Texto salvo',
    });
  });

  test('matches the full vertical link preview dimensions on each device width', () => {
    for (const screenWidth of [320, 390, 400]) {
      expect(getSavedTextPreviewSize(screenWidth)).toEqual(
        getLinkPreviewSize(screenWidth, true, true),
      );
    }

    expect(getSavedTextPreviewSize(390)).toEqual({ width: 342, height: 372 });
    expect(getSavedTextPreviewSize(320)).toEqual({ width: 272, height: 333 });
  });

  test('keeps the outer preview size unchanged for short and long notes', () => {
    const expectedSize = getLinkPreviewSize(390, true, true);

    expect(getSavedTextPreviewSize(390, 'Uma palavra')).toEqual(expectedSize);
    expect(getSavedTextPreviewSize(390, 'Nota longa '.repeat(500))).toEqual(expectedSize);
  });
});
