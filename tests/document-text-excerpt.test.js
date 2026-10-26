/* global describe, expect, test */

const {
  isPlainTextDocument,
  MAX_DOCUMENT_EXCERPT_BYTES,
  decodeDocumentTextFallback,
  readDocumentTextExcerpt,
} = require('../src/features/documents/documentTextExcerpt');

describe('bounded local document text excerpts', () => {
  test('the runtime fallback decodes UTF-8 without requiring TextDecoder', () => {
    const content = new TextEncoder().encode('\uFEFFOlá 🌱');

    expect(decodeDocumentTextFallback(content)).toBe('Olá 🌱');
    expect(decodeDocumentTextFallback(Uint8Array.from([0xe2, 0x82]))).toBe('\uFFFD\uFFFD');
  });

  test('reads a short excerpt from text documents using a fixed byte limit', async () => {
    const asset = { name: 'Notas.txt', mimeType: 'text/plain' };
    const input = new TextEncoder().encode('Primeira linha\nSegunda linha');
    const requests = [];
    const excerpt = await readDocumentTextExcerpt(asset, async (length) => {
      requests.push(length);
      return input.slice(0, length);
    });

    expect(isPlainTextDocument(asset)).toBe(true);
    expect(requests).toEqual([MAX_DOCUMENT_EXCERPT_BYTES]);
    expect(excerpt).toBe('Primeira linha\nSegunda linha');
  });

  test('does not read binary office or PDF documents for text excerpts', async () => {
    const readBytes = async () => {
      throw new Error('binary documents must not be read for a text thumbnail');
    };

    await expect(
      readDocumentTextExcerpt({ name: 'Relatorio.pdf', mimeType: 'application/pdf' }, readBytes),
    ).resolves.toBeNull();
    await expect(
      readDocumentTextExcerpt({ name: 'Planilha.xlsx', mimeType: 'application/zip' }, readBytes),
    ).resolves.toBeNull();
  });
});
