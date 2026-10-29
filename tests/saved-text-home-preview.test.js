/* global describe, expect, test, __dirname */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const gallerySource = readFileSync(
  join(__dirname, '../src/components/photos/PhotoMasonryGallery.tsx'),
  'utf8',
);
const thumbnailSource = readFileSync(
  join(__dirname, '../src/components/homeContent/SavedTextThumbnail.tsx'),
  'utf8',
);
const previewSource = readFileSync(
  join(__dirname, '../src/components/homeContent/SavedTextPreviewContent.tsx'),
  'utf8',
);
const detailSource = readFileSync(join(__dirname, '../src/app/texts/[id].tsx'), 'utf8');

describe('saved text Home presentation and native interactions', () => {
  test('uses a content-based thumbnail in list rows and the shared fixed-card grid', () => {
    expect(gallerySource).toMatch(/const isListView = viewMode === 'list' \|\| viewMode === 'compact-list' \|\| isSingleLineView/);
    expect(gallerySource).toMatch(/SavedTextThumbnail height=\{listThumbnailSize\} text=\{item\.text\} width=\{listThumbnailSize\}/);
    expect(gallerySource).toMatch(/<HomeGridCard[\s\S]*?height=\{gridCardMetrics\.previewHeight\}[\s\S]*?width=\{gridCardMode === 'small' \? gridCardMetrics\.previewHeight : gridCardMetrics\.width\}/);
    expect(gallerySource).toMatch(/borderRadius=\{0\}/);
    expect(gallerySource).toMatch(/getListRowLayoutStyle\(theme, listRowHeight, isCompactListView\)/);
    expect(thumbnailSource).toMatch(/presentation\.thumbnailText/);
    expect(thumbnailSource).toMatch(/overflow: 'hidden'/);
    expect(thumbnailSource).not.toMatch(/Ionicons|Image/);
  });

  test('opens the existing text detail on tap and adds iOS native preview and deletion on long press', () => {
    expect(gallerySource).toMatch(/pathname: '\/texts\/\[id\]', params: \{ id: String\(item\.id\) \}/);
    expect(gallerySource).toMatch(/Platform\.OS === 'ios' \? \(\s*<Link\.Preview style=\{textPreviewSize\}>[\s\S]*?<SavedTextPreviewContent[\s\S]*?height=\{textPreviewSize\.height\}[\s\S]*?text=\{item\.text\}[\s\S]*?width=\{textPreviewSize\.width\}[\s\S]*?\/>[\s\S]*?<\/Link\.Preview>/);
    expect(gallerySource).toMatch(/<Link\.MenuAction title="Apagar texto" icon="trash" destructive onPress=\{deleteItem\} \/>/);
    expect(previewSource).toMatch(/presentation\.previewText/);
    expect(detailSource).toMatch(/getText\(id\)/);
    expect(detailSource).toContain('document={document}');
    expect(detailSource).toContain('savedText.richDocument');
    expect(detailSource).toContain('initialText: savedText.storageText');
    expect(detailSource).not.toContain('{savedText.text}');
    expect(detailSource).not.toContain('presentation.body');
    expect(detailSource).not.toContain('getSavedTextDetailPresentation');
    expect(detailSource).toContain('compactTitle="Texto"');
    expect(detailSource).toContain('nativeHeader');
    expect(detailSource).toContain('<ProgressiveCollapsibleScreen');
  });

  test('uses the same preferred preview dimensions for every note instead of fetching extra content', () => {
    expect(gallerySource).toMatch(/getSavedTextPreviewSize\(screenWidth\)/);
    expect(previewSource).toMatch(/borderRadius: theme\.radius\.linkCard,[\s\S]*?height,[\s\S]*?width,/);
    expect(previewSource).toMatch(/numberOfLines=\{previewLineCount\}/);
    expect(previewSource).toMatch(/Math\.floor\(\(height - theme\.spacing\.lg \* 2\) \/ PREVIEW_TEXT_LINE_HEIGHT\)/);
    expect(previewSource).toMatch(/textAlignVertical: 'top'/);
    expect(previewSource).not.toMatch(/fetch\(|Linking\.openURL|Image/);
  });
});
