/* global describe, expect, test, __dirname */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { getHomeSingleLineTitle } = require('../src/features/home-content/homeSingleLinePresentation');
const { getHomeListMetrics, getHomeViewLayout } = require('../src/features/home-content/homeViewMode');

const gallerySource = readFileSync(join(__dirname, '../src/components/photos/PhotoMasonryGallery.tsx'), 'utf8');
const toolbarSource = readFileSync(join(__dirname, '../src/features/home-folders/homeFolderToolbarMenu.tsx'), 'utf8');

describe('Home Linha única view', () => {
  test('uses a single FlashList column, a compact touch row, and a 34pt thumbnail', () => {
    expect(getHomeViewLayout('single-line')).toEqual({
      key: 'home-gallery-single-line',
      masonry: false,
      numColumns: 1,
    });
    expect(getHomeListMetrics('single-line')).toEqual({ rowHeight: 52, thumbnailSize: 34 });
    expect(getHomeListMetrics('single-line', 2).rowHeight).toBeGreaterThanOrEqual(52);
    expect(gallerySource).toMatch(/function getSingleLineRowLayoutStyle[\s\S]*?height: rowHeight[\s\S]*?paddingHorizontal: theme\.spacing\.xs/);
    expect(gallerySource).toMatch(/viewMode === 'single-line'/);
    expect(gallerySource).toMatch(/key=\{viewLayout\.key\}[\s\S]*?numColumns=\{viewLayout\.numColumns\}/);
  });

  test('keeps saved titles for all five content types without showing a link URL', () => {
    expect(getHomeSingleLineTitle({
      id: 1,
      mediaType: 'photo',
      isScreenshot: false,
      customTitle: 'Foto da viagem',
    })).toBe('Foto da viagem');
    expect(getHomeSingleLineTitle({ id: 2, mediaType: 'video' })).toBe('Vídeo');
    expect(getHomeSingleLineTitle({
      id: 3,
      contentType: 'link',
      title: 'RAP FORTE no Instagram: Tyler, The Creator',
      url: 'https://instagram.com/a-very-long-path',
      normalizedUrl: 'https://instagram.com/a-very-long-path',
      domain: 'instagram.com',
    })).toBe('RAP FORTE no Instagram: Tyler, The Creator');
    expect(getHomeSingleLineTitle({ id: 4, contentType: 'text', text: 'Captura de tela\nNota salva' })).toBe('Captura de tela');
    expect(getHomeSingleLineTitle({ id: 5, contentType: 'document', originalName: 'Catalogo.pdf' })).toBe('Catalogo.pdf');
  });

  test('shows one truncated title and a bounded folder indicator beside real thumbnails', () => {
    expect(gallerySource).toMatch(/numberOfLines=\{1\}[\s\S]*?getHomeSingleLineTitle\(item\)/);
    expect(gallerySource).toMatch(/numberOfLines=\{1\}[\s\S]*?getHomeSingleLineTitle\(document\)/);
    expect((gallerySource.match(/<HomeFolderIndicator flexShrink=\{0\} maxWidth="42%" folderColor=\{folder\?\.color \?\? null\} name=\{folderName\} \/>/g) ?? [])).toHaveLength(5);
    expect(gallerySource).toMatch(/item\.previewImageUri[\s\S]*?contentFit="cover"[\s\S]*?link-outline/);
    expect(gallerySource).toMatch(/SavedTextThumbnail height=\{listThumbnailSize\} text=\{item\.text\} width=\{listThumbnailSize\}/);
    expect(gallerySource).toMatch(/<SavedDocumentThumbnail[\s\S]*?height=\{listThumbnailSize\}[\s\S]*?width=\{listThumbnailSize\}/);
    expect(gallerySource).toMatch(/source=\{\{ uri: previewUri \}\}/);
  });

  test('lets titles shrink before a width-bounded folder indicator on every row type', () => {
    expect(gallerySource).toMatch(/function getSingleLineTitleTextStyle\(theme: AppTheme\): TextStyle[\s\S]*?flexBasis: 0,[\s\S]*?flexGrow: 1,[\s\S]*?flexShrink: 1,[\s\S]*?minWidth: 0/);
    expect((gallerySource.match(/getSingleLineTitleTextStyle\(theme\)/g) ?? [])).toHaveLength(5);
    expect((gallerySource.match(/<HomeFolderIndicator flexShrink=\{0\} maxWidth="42%"/g) ?? [])).toHaveLength(5);
    expect(gallerySource).toMatch(/function getSingleLineRowLayoutStyle[\s\S]*?gap: theme\.spacing\.xs/);
    expect(gallerySource).toMatch(/const trigger = isSingleLineView \? \([\s\S]*?HomeFolderIndicator flexShrink=\{0\} maxWidth="42%"[\s\S]*?<HomeTagDots[\s\S]*?\) : isListView/);
    expect(gallerySource).not.toMatch(/maxWidth="(?:24|28)%" folderColor=\{folder\?\.color \?\? null\} name=\{folderName\}/);
    expect(gallerySource).toMatch(/ellipsizeMode="tail"[\s\S]*?numberOfLines=\{1\}[\s\S]*?flexShrink: 1, minWidth: 0[\s\S]*?\{compactProgress\}/);
  });

  test('adds the native submenu selection after the four existing modes', () => {
    const labels = ['Maiores', 'Menores', 'Lista', 'Lista compacta', 'Linha única'];
    const positions = labels.map((label) => toolbarSource.indexOf(label));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(toolbarSource).toMatch(/isOn=\{viewMode === 'single-line'\}[\s\S]*?onSelectViewMode\('single-line'\)/);
    expect(toolbarSource).toMatch(/icon="line\.3\.horizontal"[\s\S]*?isOn=\{viewMode === 'single-line'\}[\s\S]*?>\s*Linha única/);
  });
});
