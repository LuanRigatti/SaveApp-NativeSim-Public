import type { SFSymbol } from 'sf-symbols-typescript';

import type { SavedDocument } from './documentTypes';

export type DocumentThumbnailIcon =
  | 'document-text-outline'
  | 'document-outline'
  | 'archive-outline'
  | 'grid-outline'
  | 'easel-outline'
  | 'image-outline';

export function isPdfDocument(document: Pick<SavedDocument, 'extension' | 'mimeType'>): boolean {
  const extension = document.extension?.toLowerCase();
  const mimeType = document.mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  return extension === 'pdf' || mimeType === 'application/pdf';
}

const DISPLAYABLE_IMAGE_EXTENSIONS = new Set(['avif', 'gif', 'heic', 'heif', 'jpg', 'jpeg', 'png', 'webp']);
const TEXT_DOCUMENT_EXTENSIONS = new Set([
  'csv',
  'htm',
  'html',
  'json',
  'log',
  'md',
  'markdown',
  'txt',
  'xml',
  'yaml',
  'yml',
]);
const ARCHIVE_EXTENSIONS = new Set(['7z', 'gz', 'rar', 'tar', 'zip']);

export function canRenderDocumentImage(
  document: Pick<SavedDocument, 'extension' | 'mimeType'>,
): boolean {
  const extension = document.extension?.toLowerCase();
  const mimeType = document.mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  if (!extension || !DISPLAYABLE_IMAGE_EXTENSIONS.has(extension)) return false;
  return !mimeType || mimeType === 'application/octet-stream' || mimeType.startsWith('image/');
}

export function canGenerateNativeDocumentThumbnail(
  document: Pick<SavedDocument, 'extension' | 'mimeType' | 'textExcerpt'>,
): boolean {
  if (document.textExcerpt?.trim()) return false;
  const extension = document.extension?.toLowerCase() ?? '';
  const mimeType = document.mimeType?.split(';', 1)[0]?.trim().toLowerCase() ?? '';

  if (isPdfDocument(document)) return true;
  if (
    !extension ||
    DISPLAYABLE_IMAGE_EXTENSIONS.has(extension) ||
    TEXT_DOCUMENT_EXTENSIONS.has(extension) ||
    ARCHIVE_EXTENSIONS.has(extension) ||
    mimeType.startsWith('text/') ||
    mimeType.startsWith('image/') ||
    mimeType === 'application/zip'
  ) {
    return false;
  }

  return true;
}

export function getDocumentThumbnailIcon(extension: string | null): DocumentThumbnailIcon {
  switch (extension?.toLowerCase()) {
    case 'avif':
    case 'gif':
    case 'heic':
    case 'heif':
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'webp':
      return 'image-outline';
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return 'archive-outline';
    case 'xls':
    case 'xlsx':
      return 'grid-outline';
    case 'ppt':
    case 'pptx':
      return 'easel-outline';
    case 'pdf':
    case 'doc':
    case 'docx':
    case 'txt':
    case 'md':
    case 'rtf':
      return 'document-text-outline';
    default:
      return 'document-outline';
  }
}

export function getDocumentThumbnailSymbol(extension: string | null): SFSymbol {
  const normalized = extension?.toLowerCase() ?? '';
  if (DISPLAYABLE_IMAGE_EXTENSIONS.has(normalized)) return 'photo';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(normalized)) return 'doc.zipper';
  if (['xls', 'xlsx', 'ods', 'csv'].includes(normalized)) return 'tablecells';
  if (['txt', 'md', 'markdown', 'log', 'yaml', 'yml', 'json', 'xml'].includes(normalized)) {
    return 'doc.plaintext';
  }
  if (normalized === 'pdf') return 'doc.text';
  if (['doc', 'docx', 'odt', 'pages', 'ppt', 'pptx', 'rtf'].includes(normalized)) {
    return 'doc.richtext';
  }
  return 'doc';
}

export function getDocumentTypeLabel(extension: string | null): string {
  switch (extension?.toLowerCase()) {
    case 'pdf':
      return 'PDF';
    case 'doc':
    case 'docx':
      return 'Word';
    case 'xls':
    case 'xlsx':
      return 'Excel';
    case 'ppt':
    case 'pptx':
      return 'PowerPoint';
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return 'Arquivo compactado';
    case 'txt':
    case 'md':
    case 'markdown':
    case 'csv':
    case 'json':
    case 'xml':
    case 'html':
    case 'htm':
    case 'log':
    case 'yaml':
    case 'yml':
      return 'Texto';
    default:
      return extension ? extension.toUpperCase() : 'Arquivo';
  }
}

export function formatDocumentSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return '';
  if (sizeBytes < 1024) return `${sizeBytes} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = sizeBytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(size)} ${units[unitIndex]}`;
}
