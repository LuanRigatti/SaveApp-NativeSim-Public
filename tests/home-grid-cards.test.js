/* global describe, expect, test, __dirname */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const gallerySource = readFileSync(join(__dirname, '../src/components/photos/PhotoMasonryGallery.tsx'), 'utf8');
const cardSource = readFileSync(join(__dirname, '../src/components/homeContent/HomeGridCard.tsx'), 'utf8');
const viewModeSource = readFileSync(join(__dirname, '../src/features/home-content/homeViewMode.ts'), 'utf8');

describe('Home fixed grid cards', () => {
  test('renders every saved content type through the shared Maiores/Menores card', () => {
    const renderers = [
      gallerySource.slice(gallerySource.indexOf('const renderMediaItem'), gallerySource.indexOf('const renderSavedContentItem')),
      gallerySource.slice(gallerySource.indexOf('const renderSavedContentItem'), gallerySource.indexOf('const renderSavedDocumentItem')),
      gallerySource.slice(gallerySource.indexOf('const renderSavedDocumentItem'), gallerySource.indexOf('const renderSavedChecklistItem')),
      gallerySource.slice(gallerySource.indexOf('const renderSavedChecklistItem'), gallerySource.indexOf('const renderItem =')),
    ];

    for (const renderer of renderers) {
      expect(renderer).toMatch(/gridCardMode && gridCardMetrics/);
      expect(renderer).toContain('<HomeGridCard');
      expect(renderer).toContain('metrics={gridCardMetrics}');
      expect(renderer).toContain('mode={gridCardMode}');
    }

    expect(gallerySource).toContain('masonry={viewLayout.masonry}');
    expect(viewModeSource).toMatch(/case 'large':[\s\S]*?masonry: false, numColumns: 2/);
    expect(viewModeSource).toMatch(/case 'small':[\s\S]*?masonry: false, numColumns: 2/);
  });

  test('fixes card, preview and text-area dimensions independently of item content', () => {
    expect(cardSource).toMatch(/height: metrics\.height/);
    expect(cardSource).toMatch(/height: metrics\.previewHeight/);
    expect(cardSource).toMatch(/height: metrics\.contentHeight/);
    expect(cardSource).toContain('borderRadius: theme.radius.card');
    expect(cardSource).toMatch(/ellipsizeMode="tail"[\s\S]*?numberOfLines=\{2\}/);
    expect(cardSource).toMatch(/ellipsizeMode="tail"[\s\S]*?numberOfLines=\{1\}/);
    expect(viewModeSource).toMatch(/const height = isCompact[\s\S]*?previewHeight \+ largeContentHeight/);
    expect(cardSource).not.toMatch(/onLayout|onContentSizeChange|aspectRatio/);
  });

  test('scales Maiores proportionally while keeping titles compact and type responsive', () => {
    const largeCardStart = cardSource.indexOf('\n  return (', cardSource.indexOf('if (isCompact) {'));
    const largeCardSource = cardSource.slice(largeCardStart);

    expect(viewModeSource).toContain('const LARGE_GRID_CARD_SCALE = 0.9;');
    expect(viewModeSource).toContain('const LARGE_GRID_CARD_VERTICAL_COMPACT_RATIO = 0.84;');
    expect(viewModeSource).toContain('const LARGE_GRID_CARD_PREVIEW_WIDTH_RATIO = 0.78;');
    expect(viewModeSource).toContain('const LARGE_GRID_CARD_CONTENT_TEXT_HEIGHT = 78;');
    expect(viewModeSource).toContain('const LARGE_GRID_CARD_CONTENT_VERTICAL_SPACE = 16;');
    expect(gallerySource).toMatch(/if \(mode === 'large'\)[\s\S]*?alignSelf: 'center',[\s\S]*?width,/);
    expect(gallerySource.match(/getGridCardPressStyle\(theme, gridCardMode, gridCardMetrics\.width\)/g)).toHaveLength(5);
    expect(largeCardSource).toMatch(/height: metrics\.contentHeight,[\s\S]*?justifyContent: 'center'/);
    expect(largeCardSource).toMatch(/gap: theme\.spacing\.xxs,[\s\S]*?paddingVertical: theme\.spacing\.xxs/);
    expect(largeCardSource).not.toContain('flexGrow: 1');
    expect(largeCardSource).toMatch(/numberOfLines=\{2\}[\s\S]*?numberOfLines=\{1\}/);
    expect(largeCardSource).toContain('height: metrics.previewHeight');
    expect(cardSource).toContain('const { fontScale } = useWindowDimensions();');
    expect(largeCardSource).toMatch(/lineHeight: Math\.ceil\(theme\.typography\.headline\.lineHeight \* fontScale\)/);
    expect(largeCardSource).toMatch(/theme\.typography\.caption\.lineHeight \* fontScale/);
  });

  test('keeps Maiores vertical and makes Menores a compact horizontal card', () => {
    expect(gallerySource).toMatch(/contentFit="cover"[\s\S]*?height: '100%'/);
    expect(cardSource).toContain('!isCompact && detail');
    expect(cardSource).toMatch(/if \(isCompact\)[\s\S]*?flexDirection: 'row'/);
    expect(cardSource).toMatch(/if \(isCompact\)[\s\S]*?height: metrics\.previewHeight[\s\S]*?width: metrics\.previewHeight/);
    expect(cardSource).toMatch(/if \(isCompact\)[\s\S]*?numberOfLines=\{2\}[\s\S]*?numberOfLines=\{1\}/);
    expect(viewModeSource).toMatch(/const height = isCompact[\s\S]*?COMPACT_GRID_CARD_HEIGHT_BASE_SIZE \* COMPACT_GRID_CARD_SCALE/);
    expect(gallerySource).toContain('borderRadius={0}');
  });

  test('scales Maiores proportionally and keeps Menores gutters responsive', () => {
    expect(viewModeSource).toContain('const COMPACT_GRID_CARD_SCALE = 0.9;');
    expect(viewModeSource).toMatch(/COMPACT_GRID_CARD_PREVIEW_BASE_SIZE \* COMPACT_GRID_CARD_SCALE/);
    expect(viewModeSource).toMatch(/Math\.round\(width \/ 3\)/);
    expect(gallerySource).toMatch(/viewMode === 'small'[\s\S]*?paddingHorizontal: theme\.spacing\.xs/);
    expect(gallerySource).toMatch(/marginBottom: theme\.spacing\.md,[\s\S]*?marginHorizontal: theme\.spacing\.xs/);
    expect(gallerySource).toMatch(/const gridCardHorizontalMargin = gridCardMode === 'small' \? theme\.spacing\.xs : theme\.spacing\.xxs/);
    expect(gallerySource).toContain('contentContainerStyle={galleryContentContainerStyle}');
    expect(gallerySource).toMatch(/gridCardMode === 'small' \? theme\.spacing\.xs : theme\.layout\.screenHorizontalPadding/);
  });

  test('uses one card-clipped Glass surface for compact cards, not a text-column panel', () => {
    const smallCardSource = cardSource.slice(
      cardSource.indexOf('if (isCompact) {'),
      cardSource.indexOf('\n  return (', cardSource.indexOf('if (isCompact) {')),
    );

    expect(smallCardSource).toMatch(/borderRadius: theme\.radius\.card,[\s\S]*?overflow: 'hidden'/);
    expect(smallCardSource).toMatch(/position: 'relative'/);
    expect(smallCardSource.match(/<GlassView/g)).toHaveLength(1);
    expect(smallCardSource).toMatch(
      /<GlassView[\s\S]*?style=\{\[StyleSheet\.absoluteFill, \{ borderRadius: theme\.radius\.card \}\]\}/,
    );
    expect(smallCardSource.indexOf('<GlassView')).toBeLessThan(smallCardSource.indexOf('{preview}'));
    expect(smallCardSource.indexOf('<GlassView')).toBeLessThan(smallCardSource.indexOf('flex: 1'));
    expect(smallCardSource).toMatch(/ellipsizeMode="tail"[\s\S]*?numberOfLines=\{2\}/);
    expect(smallCardSource).toMatch(/ellipsizeMode="tail"[\s\S]*?numberOfLines=\{1\}/);
    expect(smallCardSource).toMatch(/metadata \?\? ''/);
  });

  test('passes the same theme Glass surface to every Menores content type only', () => {
    expect(gallerySource).toContain(
      'const smallGridCardGlassColorScheme = useGlass ? resolvedMode : undefined;',
    );
    expect(gallerySource.match(
      /glassColorScheme=\{gridCardMode === 'small' \? smallGridCardGlassColorScheme : undefined\}/g,
    )).toHaveLength(4);
    expect(gallerySource).toContain('glassColorScheme={useLinkCardGlass ? resolvedMode : undefined}');
  });
});
