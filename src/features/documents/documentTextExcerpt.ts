import type { DocumentImportAsset } from './documentTypes';

export const MAX_DOCUMENT_EXCERPT_BYTES = 4096;

const TEXT_EXTENSIONS = new Set([
  'csv',
  'htm',
  'html',
  'json',
  'log',
  'md',
  'markdown',
  'toml',
  'txt',
  'xml',
  'yaml',
  'yml',
]);

export function isPlainTextDocument(asset: Pick<DocumentImportAsset, 'name' | 'mimeType'>): boolean {
  const extension = asset.name.match(/\.([a-z0-9]{1,16})$/i)?.[1]?.toLowerCase();
  const mimeType = asset.mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  return Boolean((extension && TEXT_EXTENSIONS.has(extension)) || mimeType?.startsWith('text/'));
}

/** React Native/Hermes does not guarantee the TextDecoder global in every runtime. */
export function decodeDocumentTextFallback(bytes: Uint8Array): string {
  let decoded = '';
  let index = 0;

  while (index < bytes.length) {
    const first = bytes[index];
    let codePoint = 0xfffd;
    let sequenceLength = 1;

    if (first <= 0x7f) {
      codePoint = first;
    } else if (first >= 0xc2 && first <= 0xdf && index + 1 < bytes.length) {
      const second = bytes[index + 1];
      if (second >= 0x80 && second <= 0xbf) {
        codePoint = ((first & 0x1f) << 6) | (second & 0x3f);
        sequenceLength = 2;
      }
    } else if (first >= 0xe0 && first <= 0xef && index + 2 < bytes.length) {
      const second = bytes[index + 1];
      const third = bytes[index + 2];
      const validSecond =
        second >= 0x80 &&
        second <= 0xbf &&
        (first !== 0xe0 || second >= 0xa0) &&
        (first !== 0xed || second <= 0x9f);
      if (validSecond && third >= 0x80 && third <= 0xbf) {
        codePoint = ((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f);
        sequenceLength = 3;
      }
    } else if (first >= 0xf0 && first <= 0xf4 && index + 3 < bytes.length) {
      const second = bytes[index + 1];
      const third = bytes[index + 2];
      const fourth = bytes[index + 3];
      const validSecond =
        second >= 0x80 &&
        second <= 0xbf &&
        (first !== 0xf0 || second >= 0x90) &&
        (first !== 0xf4 || second <= 0x8f);
      if (
        validSecond &&
        third >= 0x80 &&
        third <= 0xbf &&
        fourth >= 0x80 &&
        fourth <= 0xbf
      ) {
        codePoint =
          ((first & 0x07) << 18) |
          ((second & 0x3f) << 12) |
          ((third & 0x3f) << 6) |
          (fourth & 0x3f);
        sequenceLength = 4;
      }
    }

    if (!(index === 0 && codePoint === 0xfeff)) {
      decoded += String.fromCodePoint(codePoint);
    }
    index += sequenceLength;
  }

  return decoded;
}

export function decodeDocumentText(bytes: Uint8Array): string {
  return typeof TextDecoder !== 'undefined'
    ? new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    : decodeDocumentTextFallback(bytes);
}

/** Reads a bounded prefix, so large text files are never loaded wholly just for a thumbnail. */
export async function readDocumentTextExcerpt(
  asset: Pick<DocumentImportAsset, 'name' | 'mimeType'>,
  readBytes: (length: number) => Promise<Uint8Array>,
): Promise<string | null> {
  if (!isPlainTextDocument(asset)) return null;

  const bytes = await readBytes(MAX_DOCUMENT_EXCERPT_BYTES);
  const text = decodeDocumentText(bytes)
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();

  return text ? text.slice(0, 500) : null;
}
