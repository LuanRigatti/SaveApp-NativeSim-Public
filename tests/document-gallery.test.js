/* global describe, expect, test, __dirname */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { getHomeViewLayout } = require('../src/features/home-content/homeViewMode');
const {
  canRenderDocumentImage,
  canGenerateNativeDocumentThumbnail,
  isPdfDocument,
  formatDocumentSize,
  getDocumentThumbnailIcon,
  getDocumentThumbnailSymbol,
  getDocumentTypeLabel,
} = require('../src/features/documents/documentPresentation');

const gallerySource = readFileSync(join(__dirname, '../src/components/photos/PhotoMasonryGallery.tsx'), 'utf8');
const documentRendererStart = gallerySource.indexOf('const renderSavedDocumentItem = useCallback');
const documentRendererEnd = gallerySource.indexOf('const renderItem = useCallback', documentRendererStart);
const documentRendererSource = gallerySource.slice(documentRendererStart, documentRendererEnd);
const thumbnailSource = readFileSync(join(__dirname, '../src/components/homeContent/SavedDocumentThumbnail.tsx'), 'utf8');
const previewSource = readFileSync(join(__dirname, '../src/components/homeContent/SavedDocumentPreviewContent.tsx'), 'utf8');
const iosIconSource = readFileSync(join(__dirname, '../src/components/homeContent/SavedDocumentTypeIcon.ios.tsx'), 'utf8');
const providerSource = readFileSync(join(__dirname, '../src/features/documents/LocalDocumentLibraryProvider.tsx'), 'utf8');

describe('document cards in the existing Home gallery', () => {
  test.each(['large', 'small', 'list', 'compact-list', 'single-line'])(
    'retains the existing %s layout for document items',
    (mode) => {
      expect(getHomeViewLayout(mode).numColumns).toBeGreaterThan(0);
      expect(gallerySource).toMatch(/renderSavedDocumentItem\(item\.content\)/);
      expect(gallerySource).toMatch(/\[\.\.\.media, \.\.\.contents, \.\.\.documents, \.\.\.checklists\]/);
    },
  );

  test('uses local text excerpts, supported local image files, and format fallbacks', () => {
    expect(thumbnailSource).toMatch(/document\.textExcerpt/);
    expect(thumbnailSource).toMatch(/SavedDocumentTypeIcon/);
    expect(iosIconSource).toMatch(/@expo\/ui\/swift-ui/);
    expect(iosIconSource).toMatch(/<Host matchContents/);
    expect(iosIconSource).toMatch(/getDocumentThumbnailSymbol/);
    expect(thumbnailSource).not.toMatch(/GlassView|Host/);
    expect(thumbnailSource).toMatch(/source=\{\{ uri: document\.uri \}\}/);
    expect(thumbnailSource).toMatch(/source=\{\{ uri: document\.thumbnailUri \}\}/);
    expect(thumbnailSource).toMatch(/document\.thumbnailUri/);
    expect(thumbnailSource).toMatch(/contentFit="contain"/);
    expect(thumbnailSource).toMatch(/cachePolicy="none"/);
    expect(thumbnailSource).toMatch(/onError=\{\(\) => setFailed\(true\)\}/);
    expect(previewSource).toMatch(/textExcerpt/);
    expect(previewSource).toMatch(/document\.thumbnailUri \|\| canRenderDocumentImage/);
    expect(documentRendererSource.match(/<SavedDocumentThumbnail/g)).toHaveLength(2);
    expect(canRenderDocumentImage({ extension: 'png', mimeType: 'image/png' })).toBe(true);
    expect(canRenderDocumentImage({ extension: 'jpg', mimeType: 'application/octet-stream' })).toBe(true);
    expect(canRenderDocumentImage({ extension: 'pdf', mimeType: 'application/pdf' })).toBe(false);
    expect(canRenderDocumentImage({ extension: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).toBe(false);
    expect(canRenderDocumentImage({ extension: 'exe', mimeType: 'application/octet-stream' })).toBe(false);
    expect(getDocumentThumbnailIcon('pdf')).toBe('document-text-outline');
    expect(getDocumentThumbnailIcon('docx')).toBe('document-text-outline');
    expect(getDocumentThumbnailIcon('zip')).toBe('archive-outline');
    expect(getDocumentThumbnailIcon('unknown')).toBe('document-outline');
    expect(getDocumentThumbnailSymbol('pdf')).toBe('doc.text');
    expect(getDocumentThumbnailSymbol('docx')).toBe('doc.richtext');
    expect(getDocumentThumbnailSymbol('xlsx')).toBe('tablecells');
    expect(getDocumentThumbnailSymbol('zip')).toBe('doc.zipper');
    expect(getDocumentThumbnailSymbol('unknown')).toBe('doc');
    expect(getDocumentTypeLabel('xlsx')).toBe('Excel');
    expect(formatDocumentSize(1_572_864)).toBe('1,5 MB');
  });

  test('requests real thumbnails for PDFs and compatible office formats while preserving text and image previews', () => {
    expect(canGenerateNativeDocumentThumbnail({ extension: 'pdf', mimeType: 'application/pdf', textExcerpt: null })).toBe(true);
    expect(isPdfDocument({ extension: null, mimeType: 'application/pdf; charset=binary' })).toBe(true);
    const prioritizedDocuments = [
      { id: 1, extension: 'docx', mimeType: 'application/msword' },
      { id: 2, extension: 'pdf', mimeType: null },
      { id: 3, extension: 'xlsx', mimeType: 'application/vnd.ms-excel' },
    ].sort((left, right) => Number(isPdfDocument(right)) - Number(isPdfDocument(left)));
    expect(prioritizedDocuments.map(({ id }) => id)).toEqual([2, 1, 3]);
    expect(canGenerateNativeDocumentThumbnail({ extension: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', textExcerpt: null })).toBe(true);
    expect(canGenerateNativeDocumentThumbnail({ extension: 'xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', textExcerpt: null })).toBe(true);
    expect(canGenerateNativeDocumentThumbnail({ extension: 'pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', textExcerpt: null })).toBe(true);
    expect(canGenerateNativeDocumentThumbnail({ extension: 'txt', mimeType: 'text/plain', textExcerpt: 'Texto existente' })).toBe(false);
    expect(canGenerateNativeDocumentThumbnail({ extension: 'jpg', mimeType: 'image/jpeg', textExcerpt: null })).toBe(false);
    expect(canGenerateNativeDocumentThumbnail({ extension: 'zip', mimeType: 'application/zip', textExcerpt: null })).toBe(false);
  });

  test('keeps the native preview, Apagar arquivo action, and 30-day trash confirmation', () => {
    expect(gallerySource).toMatch(/<Link\.Preview style=\{previewSize\}>[\s\S]*?<Link\.Menu>/);
    expect(documentRendererSource).toMatch(/href=\{\{ pathname: '\/documents\/\[id\]'/);
    expect(documentRendererSource).toMatch(/<Link\.Trigger>\{trigger\}<\/Link\.Trigger>/);
    expect(documentRendererSource).not.toMatch(/event\.preventDefault\(\)/);
    expect(gallerySource).toMatch(/title="Apagar arquivo"/);
    expect(providerSource).toMatch(/O arquivo ficará disponível para restauração por 30 dias/);
    expect(providerSource).toMatch(/O original escolhido no seletor permanecerá no local de origem/);
    expect(providerSource).toMatch(/File\.pickFileAsync\(\{ multipleFiles: true, mimeTypes: '\*\/\*' \}\)/);
  });
});
