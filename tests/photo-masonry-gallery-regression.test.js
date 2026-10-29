/* global describe, expect, test, __dirname */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { StyleSheet } = require('react-native');

const gallerySource = readFileSync(
  join(__dirname, '../src/components/photos/PhotoMasonryGallery.tsx'),
  'utf8',
);
const gridCardSource = readFileSync(
  join(__dirname, '../src/components/homeContent/HomeGridCard.tsx'),
  'utf8',
);
const providerSource = readFileSync(
  join(__dirname, '../src/features/photos/LocalPhotoLibraryProvider.tsx'),
  'utf8',
);
const photoTitleSource = readFileSync(join(__dirname, '../src/features/photos/photoTitle.ts'), 'utf8');
const librarySource = readFileSync(
  join(__dirname, '../src/features/photos/photoLibrary.ts'),
  'utf8',
);
const videoViewerSource = readFileSync(join(__dirname, '../src/app/videos/[id].tsx'), 'utf8');
const radiusSource = readFileSync(join(__dirname, '../src/theme/radius.ts'), 'utf8');
const animationsSource = readFileSync(join(__dirname, '../src/theme/animations.ts'), 'utf8');
const viewModeSource = readFileSync(
  join(__dirname, '../src/features/home-content/homeViewMode.ts'),
  'utf8',
);
const linkPresentationSource = readFileSync(
  join(__dirname, '../src/features/home-content/savedLinkPresentation.ts'),
  'utf8',
);
const tabsLayoutSource = readFileSync(join(__dirname, '../src/app/(tabs)/_layout.tsx'), 'utf8');
const homeSource = readFileSync(join(__dirname, '../src/app/(tabs)/index.tsx'), 'utf8');
const homeToolbarMenuSource = readFileSync(join(__dirname, '../src/features/home-folders/homeFolderToolbarMenu.tsx'), 'utf8');
const homeViewModeProviderSource = readFileSync(
  join(__dirname, '../src/features/home-content/HomeViewModeProvider.tsx'),
  'utf8',
);

describe('mixed-media masonry regression contract', () => {
  test('keeps the Home title at the top while independent startup sources hydrate', () => {
    expect(homeSource).toMatch(/isReady: photoLibraryReady/);
    expect(homeSource).toMatch(/isReady: savedContentReady/);
    expect(homeSource).toMatch(/isReady: documentLibraryReady/);
    expect(homeSource).toMatch(/isReady: viewModeReady/);
    expect(homeSource).toMatch(/isReady: homeFoldersReady/);
    expect(homeSource).toMatch(/areHomeFeedSourcesReady\(\{/);
    expect(homeSource).toMatch(/isInitialFeedReady=\{homeFeedReady\}/);
    expect(homeViewModeProviderSource).toMatch(/const \[isReady, setIsReady\] = useState\(false\)/);
    expect(homeViewModeProviderSource).toMatch(/restoreHomeViewMode\(AsyncStorage\)\.then/);
    expect(homeViewModeProviderSource).toMatch(/setIsReady\(true\)/);
    expect(gallerySource).toMatch(/filterHomeFolderItems\([\s\S]*?catalogItems,[\s\S]*?folderFilter,[\s\S]*?folderIdByItemKey,[\s\S]*?protectedFolderIds,[\s\S]*?accessibleUnlockedFolderIds/);
    expect(gallerySource).toMatch(/buildHomeGalleryEntriesWhenReady\(filteredItems, now, isInitialFeedReady && homeFoldersReady\)/);
    expect(gallerySource).toMatch(/ListHeaderComponent=\{listHeader\}/);
    expect(gallerySource).toMatch(/if \(offset != null && offset > 0\)/);
  });

  test('shows the minimal first-content empty state only after successful unfiltered catalog reads', () => {
    const emptyStateStart = gallerySource.indexOf('ListEmptyComponent=');
    const emptyStateEnd = gallerySource.indexOf('masonry={viewLayout.masonry}', emptyStateStart);
    const emptyStateSource = gallerySource.slice(emptyStateStart, emptyStateEnd);

    expect(homeSource).toContain('homeCatalogsLoadedSuccessfully={homeCatalogsLoadedSuccessfully}');
    expect(homeSource).toContain('photoCatalogLoadSucceeded &&');
    expect(homeSource).toContain('savedContentLoadSucceeded &&');
    expect(homeSource).toContain('documentCatalogLoadSucceeded &&');
    expect(homeSource).toContain('checklistCatalogLoadSucceeded');
    expect(gallerySource).toContain('shouldShowGlobalHomeEmptyState({');
    expect(gallerySource).toContain('mediaCount: media.length');
    expect(gallerySource).toContain('savedContentCount: contents.length');
    expect(gallerySource).toContain('documentCount: documents.length');
    expect(gallerySource).toContain('checklistCount: checklists.length');
    expect(gallerySource).toMatch(/const hasSpecificEmptyState = searchQuery\.trim\(\)\.length > 0 \|\| favoritesOnly \|\|\s*folderFilter\.kind === 'folder' \|\| folderFilter\.kind === 'unfiled'/);
    expect(gallerySource).toContain("folderFilter.kind === 'category'");
    expect(emptyStateSource).toContain('canShowEmptyState ?');
    expect(emptyStateSource).toContain('Adicione seu primeiro conteúdo');
    expect(emptyStateSource).toContain('name="document-outline"');
    expect(emptyStateSource).toContain('backgroundColor: theme.colors.surfaceMuted');
    expect(emptyStateSource).toContain('color={theme.colors.textPrimary}');
    expect(emptyStateSource).toContain('color: theme.colors.textSecondary');
    expect(emptyStateSource).toContain('flexGrow: 1, justifyContent: \'center\'');
    expect(emptyStateSource).toContain('paddingBottom: theme.spacing.xxxl * 2');
    expect(emptyStateSource).not.toContain('numberOfLines=');
    expect(emptyStateSource).toContain('flexShrink: 1');
    expect(emptyStateSource).toContain('alignSelf: \'stretch\'');
    expect(gallerySource).toContain('Nenhum resultado encontrado');
    expect(gallerySource).toContain('Nenhum favorito ainda');
    expect(gallerySource).toContain('Nenhum item nesta pasta');
    expect(gallerySource).toContain('Nenhum item sem pasta');
  });

  test('presents links with a small source label and concise text only in the list modes', () => {
    const { getSavedLinkPresentation } = require('../src/features/home-content/savedLinkPresentation');
    const linkRowSource = gallerySource.slice(
      gallerySource.indexOf('const renderSavedContentItem'),
      gallerySource.indexOf('const renderItem'),
    );
    const listBranchStart = linkRowSource.indexOf('isListView ? (');
    const listBranchEnd = linkRowSource.indexOf(') : (', listBranchStart);
    const listBranch = linkRowSource.slice(listBranchStart, listBranchEnd);

    expect(linkPresentationSource).toMatch(/function detectPlatform\(hostname: string\)/);
    expect(linkPresentationSource).toMatch(/hostMatches\(hostname, 'instagram\.com'\)/);
    expect(linkPresentationSource).toMatch(/hostMatches\(hostname, 'x\.com'\)/);
    expect(linkPresentationSource).toMatch(/hostMatches\(hostname, 'twitter\.com'\)/);
    expect(linkPresentationSource).toMatch(/hostMatches\(hostname, 'youtube\.com'\)/);
    expect(linkPresentationSource).toMatch(/hostname === 'youtu\.be'/);
    expect(linkPresentationSource).toMatch(/hostMatches\(hostname, 'tiktok\.com'\)/);
    expect(linkRowSource).toMatch(/item\.contentType === 'link' && isListView \? getSavedLinkPresentation\(item\)/);
    expect(linkRowSource).toMatch(/color: theme\.colors\.textTertiary/);
    expect(linkRowSource).toMatch(/linkPresentation\?\.sourceLabel/);
    expect(linkRowSource).toMatch(/numberOfLines=\{1\}[\s\S]*?linkPresentation\?\.primaryText \?\? item\.title/);
    expect(linkRowSource).toMatch(/linkPresentation\?\.primaryText \?\? item\.title/);
    expect(linkRowSource).toMatch(/linkPresentation\?\.secondaryText \? \(/);
    expect(listBranch).not.toMatch(/<Ionicons/);
    expect(linkRowSource).toMatch(/<Link\.Preview style=\{previewSize\}>[\s\S]*?<Link\.Menu>/);

    expect(
      getSavedLinkPresentation({
        url: 'https://www.instagram.com/p/abc123/',
        normalizedUrl: 'https://www.instagram.com/p/abc123/',
        title: 'Luan Rigatti (@luan) • Instagram photos and videos',
        description: 'Uma legenda curta para a publicação.',
        domain: 'instagram.com',
      }),
    ).toEqual({
      sourceLabel: 'Instagram',
      primaryText: 'Luan Rigatti (@luan)',
      secondaryText: 'Uma legenda curta para a publicação.',
    });

    expect(
      getSavedLinkPresentation({
        url: 'https://x.com/example/status/123',
        normalizedUrl: 'https://x.com/example/status/123',
        title: 'Conta exemplo on X: Uma publicação curta',
        description: 'Uma publicação curta',
        domain: 'x.com',
      }),
    ).toEqual({ sourceLabel: 'X', primaryText: 'Conta exemplo', secondaryText: 'Uma publicação curta' });

    expect(
      getSavedLinkPresentation({
        url: 'https://youtu.be/abc123',
        normalizedUrl: 'https://youtu.be/abc123',
        title: 'Título do vídeo - YouTube',
        description: 'Nome do canal e uma descrição longa.',
        domain: 'youtu.be',
      }),
    ).toEqual({
      sourceLabel: 'YouTube',
      primaryText: 'Título do vídeo',
      secondaryText: 'Nome do canal e uma descrição longa.',
    });

    expect(
      getSavedLinkPresentation({
        url: 'https://www.tiktok.com/@creator/video/123',
        normalizedUrl: 'https://www.tiktok.com/@creator/video/123',
        title: 'Vídeo de exemplo | TikTok',
        description: null,
        domain: 'tiktok.com',
      }),
    ).toMatchObject({ sourceLabel: 'TikTok', primaryText: 'Vídeo de exemplo' });

    expect(
      getSavedLinkPresentation({
        url: 'https://mobile.twitter.com/example/status/456',
        normalizedUrl: 'https://mobile.twitter.com/example/status/456',
        title: 'Conta autora on X',
        description: 'Resumo da publicação.',
        domain: 'mobile.twitter.com',
      }),
    ).toEqual({ sourceLabel: 'X', primaryText: 'Conta autora', secondaryText: 'Resumo da publicação.' });

    expect(
      getSavedLinkPresentation({
        url: 'https://www.youtube.com/watch?v=abc123',
        normalizedUrl: 'https://www.youtube.com/watch?v=abc123',
        title: 'YouTube',
        description: 'Um título disponível na descrição.',
        domain: 'youtube.com',
      }),
    ).toEqual({
      sourceLabel: 'YouTube',
      primaryText: 'Um título disponível na descrição.',
      secondaryText: null,
    });
  });

  test('uses a friendly generic domain and conservative fallback without large icons', () => {
    const { getSavedLinkPresentation } = require('../src/features/home-content/savedLinkPresentation');

    expect(
      getSavedLinkPresentation({
        url: 'https://www.example.com/story',
        normalizedUrl: 'https://www.example.com/story',
        title: 'Um título informativo',
        description: 'Uma linha complementar.',
        domain: 'www.example.com',
      }),
    ).toEqual({
      sourceLabel: 'example.com',
      primaryText: 'Um título informativo',
      secondaryText: 'Uma linha complementar.',
    });

    expect(
      getSavedLinkPresentation({
        url: 'https://instagram.com.evil.example/path',
        normalizedUrl: 'https://instagram.com.evil.example/path',
        title: 'Título de fallback',
        description: null,
        domain: 'instagram.com.evil.example',
      }),
    ).toMatchObject({
      sourceLabel: 'instagram.com.evil.example',
      primaryText: 'Título de fallback',
      secondaryText: null,
    });

    expect(linkPresentationSource).not.toMatch(/Ionicons|Image|favicon/i);

    const longTitle = 'uma palavra '.repeat(20);
    const concise = getSavedLinkPresentation({
      url: 'https://example.com/long',
      normalizedUrl: 'https://example.com/long',
      title: longTitle,
      description: 'descrição '.repeat(20),
      domain: 'example.com',
    });
    expect(Array.from(concise.primaryText).length).toBeLessThanOrEqual(110);
    expect(Array.from(concise.secondaryText ?? '').length).toBeLessThanOrEqual(88);
    expect(concise.primaryText.endsWith('…')).toBe(true);
  });

  test('renders photos and videos directly in FlashList and marks both thumbnails for Apple Zoom', () => {
    expect(gallerySource).not.toMatch(/@expo\/ui|Host|RNHostView|matchContents/);
    expect(gallerySource).toMatch(/NativeCardContextMenu actions=\{contextActions\}/);
    expect(gallerySource).toMatch(/<FlashList[\s\S]*?data=\{entries\}/);
    expect(gallerySource).toMatch(/pathname: '\/photos\/\[id\]'/);
    expect(gallerySource).toMatch(/pathname: '\/videos\/\[id\]'/);
    expect(gallerySource).toMatch(/const zoomableMediaImage = supportsAppleZoom \? \([\s\S]*?<Link\.AppleZoom>\{mediaImage\}<\/Link\.AppleZoom>/);
    expect(gallerySource).toMatch(/contentFit="cover"/);
    expect(gallerySource).toMatch(/height: '100%',[\s\S]*?overflow: 'hidden',[\s\S]*?width: '100%'/);
    expect(gallerySource).toMatch(/width: '100%'/);
    expect(gallerySource).toMatch(/function getGridCardPressStyle\(theme: AppTheme, mode: HomeGridCardMode, width: number\): ViewStyle[\s\S]*?if \(mode === 'large'\)[\s\S]*?alignSelf: 'center',[\s\S]*?width,/);
    expect(gallerySource).toMatch(/marginBottom: theme\.spacing\.md,[\s\S]*?marginHorizontal: theme\.spacing\.xs/);
    expect(gallerySource).toMatch(/recyclingKey=\{`\$\{item\.mediaType\}-\$\{item\.id\}`\}/);
    expect(gallerySource).toMatch(/masonry=\{viewLayout\.masonry\}/);
    expect(gallerySource).toMatch(/numColumns=\{viewLayout\.numColumns\}/);
    expect(gallerySource).toMatch(/optimizeItemArrangement=\{false\}/);
    expect(gallerySource).toMatch(/getHomeGalleryEntrySpan\(item, viewLayout\.numColumns\)/);
    expect(gallerySource).toMatch(/onScroll=\{handleScroll\}/);
    expect(gallerySource).toMatch(/name="play"/);
    expect(gallerySource).toMatch(/formatVideoDuration\(item\.durationMs\)/);
  });

  test('keeps native context menus in Link and uses static media previews', () => {
    expect(gallerySource).toMatch(/const supportsNativeContextMenu = Platform.OS === 'ios';/);
    expect(gallerySource).not.toContain('NATIVE_PHOTO_CONTEXT_MENU_ENABLED');
    expect(gallerySource).toMatch(/if \(!supportsNativeContextMenu\)/);
    expect(gallerySource).toMatch(/<Link asChild href=\{href\}>[\s\S]*?<Link\.Trigger>\{mediaTrigger\}<\/Link\.Trigger>/);
    expect(gallerySource).toMatch(/source=\{\{ uri: previewUri \}\}/);
    expect(gallerySource).toMatch(/title=\{isVideo \? 'Apagar vídeo' : 'Apagar imagem'\}/);
    expect(gallerySource).toMatch(/icon="trash"[\s\S]*?destructive/);
    expect(gallerySource).toMatch(/requestDeleteMedia\([\s\S]*?prepareForMediaRemovalAnimation,[\s\S]*?authorizeItemForAction\(item\.mediaType, item\.id\)/);
    expect(gallerySource).toMatch(/<Link\.Preview style=\{\{ width: previewSize\.width, height: previewSize\.height \}\}>/);
  });

  test('shows automatic or custom photo titles only in list rows and preserves native photo actions', () => {
    const mediaRenderer = gallerySource.slice(
      gallerySource.indexOf('const renderMediaItem'),
      gallerySource.indexOf('const renderSavedContentItem'),
    );

    expect(mediaRenderer).toMatch(/isListView\s*\?\s*\([\s\S]*?getPhotoDisplayTitle\(item\)/);
    expect(mediaRenderer).toMatch(/getPhotoSavedDateLabel\(item\.createdAt, now\)/);
    expect(mediaRenderer).toMatch(/getPhotoDisplayTitle\(item\)[\s\S]*?photoDateLabel/);
    expect(mediaRenderer).toMatch(
      /\{!isVideo\s*\?\s*\([\s\S]*?title="Renomear"[\s\S]*?icon="pencil"[\s\S]*?requestRenamePhoto\(item\)[\s\S]*?\)\s*:\s*null\}/,
    );
    expect(mediaRenderer).toMatch(/title=\{isVideo \? 'Apagar vídeo' : 'Apagar imagem'\}[\s\S]*?destructive/);
    expect(mediaRenderer).toMatch(/<Link\.Preview[\s\S]*?<Link\.Menu>/);
    expect(mediaRenderer).toMatch(/supportsAppleZoom[\s\S]*?<Link\.AppleZoom>\{mediaImage\}<\/Link\.AppleZoom>/);
    expect(providerSource).toMatch(/Alert\.prompt\([\s\S]*?'Renomear foto'[\s\S]*?getPhotoDisplayTitle\(photo\)/);
    expect(providerSource).toMatch(/createPhotoRenamePromptButtons\(\(value\) =>/);
    expect(providerSource).toMatch(/createPhotoRenamePromptButtons,[\s\S]*?renamePhotoWithPersistence/);
    expect(providerSource).toMatch(/'plain-text'/);
    expect(gallerySource).toMatch(/import \{ getPhotoDisplayTitle, getPhotoSavedDateLabel \} from '\@\/features\/photos\/photoTitle'/);
    expect(photoTitleSource).toMatch(/new Intl\.DateTimeFormat\(undefined/);
  });

  test('persists titles by parameterized update without changing photo dates or paths', () => {
    expect(librarySource).toMatch(
      /UPDATE photos SET custom_title = \? WHERE id = \? AND media_type = \?/,
    );
    const updateFunction = librarySource.slice(
      librarySource.indexOf('export async function updateSavedPhotoTitle'),
      librarySource.indexOf('export async function getSavedVideo'),
    );
    expect(updateFunction).not.toMatch(/created_at|relative_path|DELETE FROM photos/);
  });

  test('renders link previews in the shared fixed grid frame above title and metadata', () => {
    const linkCardSource = gallerySource.slice(
      gallerySource.indexOf('const renderSavedContentItem'),
      gallerySource.indexOf('const renderItem'),
    );

    expect(linkCardSource).toMatch(/item\.previewImageUri \? \([\s\S]*?<Image/);
    expect(linkCardSource).toMatch(/contentFit="cover"/);
    expect(linkCardSource).toMatch(/preview=\{item\.previewImageUri \? \([\s\S]*?style=\{StyleSheet\.absoluteFill\}/);
    expect(gridCardSource).toMatch(/height: metrics\.previewHeight/);
    expect(gridCardSource).toMatch(/borderRadius: theme\.radius\.card/);
    expect(linkCardSource).toMatch(/transition=\{120\}/);
    expect(gridCardSource).toMatch(/overflow: 'hidden'/);
    expect(gridCardSource).toMatch(/ellipsizeMode="tail"[\s\S]*?numberOfLines=\{2\}/);
    expect(linkCardSource).toMatch(/title=\{item\.title\}/);
    expect(linkCardSource).toMatch(/metadata=\{item\.domain \|\| 'Link'\}/);
    expect(linkCardSource).toMatch(/name="link-outline"/);
    expect(linkCardSource).not.toMatch(/height: 52|width: 52/);
    expect(radiusSource).toMatch(/linkCard: 32/);
  });

  test('keeps link cards on regular native GlassView with a solid capability fallback', () => {
    const linkCardSource = gallerySource.slice(
      gallerySource.indexOf('const renderSavedContentItem'),
      gallerySource.indexOf('const renderItem'),
    );

    expect(gallerySource).toMatch(/const \{ useGlass \} = useVisualCapabilities\(\)/);
    expect(gallerySource).toMatch(/const useLinkCardGlass = useGlass;/);
    expect(gallerySource).not.toContain('LINK_CARD_LIQUID_GLASS_ENABLED');
    expect(linkCardSource).toMatch(/glassColorScheme=\{useLinkCardGlass \? resolvedMode : undefined\}/);
    expect(gridCardSource).toMatch(/glassEffectStyle="regular"/);
    expect(gridCardSource).toMatch(/pointerEvents="none"/);
    expect(gridCardSource).not.toMatch(/isInteractive/);
    expect(gridCardSource).toMatch(/backgroundColor: glassColorScheme \? 'transparent' : theme\.colors\.surface/);
    expect(gallerySource).toContain('glassColorScheme={useLinkCardGlass ? resolvedMode : undefined}');
    expect(linkCardSource).toMatch(/StyleSheet\.absoluteFill/);
  });

  test('keeps subtle link-card press feedback and selection haptic', () => {
    const pressableSource = gallerySource.slice(
      gallerySource.indexOf('const AnimatedNativePressable'),
      gallerySource.indexOf('type PhotoMasonryGalleryProps'),
    );

    expect(pressableSource).toMatch(/theme\.animations\.scale\.subtle/);
    expect(animationsSource).toMatch(/subtle: 0\.98/);
    expect(pressableSource).toMatch(/theme\.animations\.spring\.responsive/);
    expect(pressableSource).toMatch(/opacity: pressProgress\.value \* 0\.3/);
    expect(pressableSource).toMatch(/borderWidth: StyleSheet\.hairlineWidth/);
    expect(pressableSource).toMatch(/triggerSelectionHaptic\(\)/);
    expect(pressableSource).toMatch(/onPress=\{\(event\) => \{\s*triggerSelectionHaptic\(\);\s*onPress\?\.\(event\);/);
    expect(pressableSource).not.toMatch(/onPressIn=\{\(event\) => \{[\s\S]*triggerSelectionHaptic/);
    expect(pressableSource).toMatch(/if \(reduceMotionEnabled\)[\s\S]*pressProgress\.set\(0\)/);
    expect(pressableSource).toMatch(/<Animated\.View[\s\S]*?pointerEvents="none"/);
  });

  test('uses stable ids and the existing reduced-motion-aware masonry deletion animation', () => {
    expect(gallerySource).toMatch(/keyExtractor=\{\(item\) => item\.id\}/);
    expect(gallerySource).toMatch(/ref=\{listRef\}/);
    expect(gallerySource).toMatch(/list\.prepareForLayoutAnimationRender\(\);\s*LayoutAnimation\.configureNext\(/);
    expect(gallerySource).toMatch(/duration: theme\.animations\.duration\.standard/);
    expect(gallerySource).toMatch(/update: \{ type: LayoutAnimation\.Types\.easeInEaseOut \}/);
    expect(gallerySource).toMatch(/property: LayoutAnimation\.Properties\.opacity/);
    expect(gallerySource).toMatch(/reduceMotionEnabled \|\| Platform\.OS !== 'ios'/);
    expect(providerSource).toMatch(/onDeleted: \(\) => \{\s*prepareForRemovalAnimation\?\.\(\);\s*setMedia/);
  });

  test('keeps the combined folder and layout menu in the header and the native add menu at Home bottom', () => {
    const rightToolbar = tabsLayoutSource.slice(
      tabsLayoutSource.indexOf('<Stack.Toolbar placement="right">'),
      tabsLayoutSource.indexOf('</Stack.Toolbar>', tabsLayoutSource.indexOf('<Stack.Toolbar placement="right">')),
    );
    const bottomToolbar = homeSource.slice(
      homeSource.indexOf('<Stack.Toolbar placement="bottom">'),
      homeSource.indexOf('</Stack.Toolbar>', homeSource.indexOf('<Stack.Toolbar placement="bottom">')),
    );

    expect(rightToolbar).toMatch(/\{createHomeFolderToolbarMenu\([\s\S]*?hidden: !shouldShowHomeToolbarItems/);
    expect(rightToolbar).not.toMatch(/icon="plus"/);
    expect((tabsLayoutSource.match(/<Stack\.Toolbar placement="right">/g) ?? []).length).toBe(1);
    expect(tabsLayoutSource).toMatch(/shouldKeepHomeToolbarItemsMounted\(pathname\)/);
    const layoutOptionsOrder = [
      homeToolbarMenuSource.indexOf('Maiores'),
      homeToolbarMenuSource.indexOf('Menores'),
      homeToolbarMenuSource.indexOf('Lista'),
      homeToolbarMenuSource.indexOf('Lista compacta'),
      homeToolbarMenuSource.indexOf('Linha única'),
    ];
    expect(layoutOptionsOrder.every((position) => position >= 0)).toBe(true);
    expect(layoutOptionsOrder).toEqual([...layoutOptionsOrder].sort((left, right) => left - right));
    expect(bottomToolbar).toMatch(/<Stack\.Toolbar placement="bottom">[\s\S]*?<Stack\.Toolbar\.Spacer\s*\/>[\s\S]*?<Stack\.Toolbar\.Menu/);
    expect(bottomToolbar).toMatch(/accessibilityLabel="Adicionar"[\s\S]*?icon="plus"[\s\S]*?separateBackground/);
    expect(bottomToolbar).toMatch(/Adicionar mídia/);
    expect(bottomToolbar).toMatch(/Adicionar link/);
    expect(bottomToolbar).toMatch(/Adicionar texto/);
    expect(bottomToolbar).toMatch(/Adicionar arquivos/);
    expect(bottomToolbar).toMatch(/Adicionar lista/);
    expect(bottomToolbar.match(/<Stack\.Toolbar\.MenuAction/g)).toHaveLength(5);
    expect(bottomToolbar).toMatch(/icon="photo\.on\.rectangle\.angled"[\s\S]*?Adicionar mídia/);
    const addActionLabels = [
      'Adicionar mídia',
      'Adicionar link',
      'Adicionar texto',
      'Adicionar arquivos',
      'Adicionar lista',
    ];
    const addActionPositions = addActionLabels.map((label) => bottomToolbar.indexOf(label));
    expect(addActionPositions.every((position) => position >= 0)).toBe(true);
    expect(addActionPositions).toEqual([...addActionPositions].sort((left, right) => left - right));
  });

  test('remounts only the FlashList per layout, restores its approximate offset, and retains stable item keys', () => {
    expect(viewModeSource).toMatch(/'list'[\s\S]*numColumns: 1/);
    expect(viewModeSource).toMatch(/'compact-list'[\s\S]*numColumns: 1/);
    expect(viewModeSource).toMatch(/'single-line'[\s\S]*numColumns: 1/);
    expect(viewModeSource).toMatch(/'small'[\s\S]*numColumns: 2/);
    expect(viewModeSource).toMatch(/'large'[\s\S]*numColumns: 2/);
    expect(gallerySource).toMatch(/key=\{viewLayout\.key\}/);
    expect(gallerySource).toMatch(/pendingScrollRestoreRef\.current = scrollOffsetRef\.current/);
    expect(gallerySource).toMatch(/onLoad=\{handleListLoad\}/);
    expect(gallerySource).toMatch(/scrollToOffset\(\{ offset, animated: false \}\)/);
    expect(gallerySource).toMatch(/keyExtractor=\{\(item\) => item\.id\}/);
    expect(gallerySource).toMatch(/getItemType=\{getItemType\}/);
  });

  test('keeps the list rows connected to Apple Zoom, links, text reading, and native deletion menus', () => {
    expect(gallerySource).toMatch(/const mediaTrigger = isListView \? \([\s\S]*?flexDirection: 'row'/);
    expect(gallerySource).toMatch(/isVideo \? 'Vídeo' : getPhotoDisplayTitle\(item\)/);
    expect(gallerySource).toMatch(/<Link\.Menu>[\s\S]*?Apagar link[\s\S]*?Apagar texto/);
    expect(gallerySource).toMatch(/accessibilityLabel=\{`Abrir link \$\{item\.title\}`\}/);
    expect(gallerySource).toMatch(/accessibilityLabel="Ler texto salvo"/);
    expect(gallerySource).toMatch(/<SavedTextThumbnail[\s\S]*?text=\{item\.text\}/);
    expect(gallerySource).toMatch(/<Link\.Preview style=\{textPreviewSize\}>[\s\S]*?SavedTextPreviewContent/);
    expect(gallerySource).toMatch(/<Link\.MenuAction title="Apagar texto" icon="trash" destructive/);
  });

  test('renders plain List rows with fixed height and rounded, clipped thumbnails', () => {
    expect(viewModeSource).toMatch(/rowHeight: 96, thumbnailSize: 72/);
    expect(viewModeSource).toMatch(/rowHeight: Math\.max\(76,[\s\S]*thumbnailSize: 52/);
    expect(gallerySource).toMatch(/const isListView = viewMode === 'list' \|\| viewMode === 'compact-list' \|\| isSingleLineView/);
    expect(gallerySource).toMatch(
      /function getListRowLayoutStyle\(theme: AppTheme, rowHeight: number, isCompact: boolean\): ViewStyle/,
    );
    expect(gallerySource).toMatch(/alignSelf: 'stretch',[\s\S]*?height: rowHeight,[\s\S]*?marginBottom: isCompact \? theme\.spacing\.xxs : theme\.spacing\.xs,[\s\S]*?marginHorizontal: theme\.spacing\.xxs/);
    const listRowStyle = gallerySource.match(
      /function getListRowLayoutStyle\([\s\S]*?\n\}/,
    )?.[0];
    expect(listRowStyle).toBeDefined();
    expect(listRowStyle).not.toMatch(/backgroundColor|border(Color|Radius|Width)|shadow|overflow|GlassView/);
    expect(gallerySource).not.toMatch(/ListCardGlassLayer|getListCardContainerStyle/);
    expect(gallerySource.match(/getListRowLayoutStyle\(theme, listRowHeight, isCompactListView\)/g)).toHaveLength(5);

    const mediaRenderer = gallerySource.slice(
      gallerySource.indexOf('const renderMediaItem'),
      gallerySource.indexOf('const renderSavedContentItem'),
    );
    const savedContentRenderer = gallerySource.slice(
      gallerySource.indexOf('const renderSavedContentItem'),
      gallerySource.indexOf('const renderItem =', gallerySource.indexOf('const renderSavedContentItem')),
    );
    const listTextBranch =
      savedContentRenderer.match(
        /\) : isListView \? \(\s*(<Pressable[\s\S]*?accessibilityLabel="Ler texto salvo"[\s\S]*?<\/Pressable>)\s*\) : gridCardMode/,
      )?.[1] ?? '';

    expect(mediaRenderer).toMatch(/const mediaTrigger = isListView \? \([\s\S]*?style=\{isSingleLineView\s*\?\s*getSingleLineRowLayoutStyle\([\s\S]*?:\s*StyleSheet\.flatten\(\[/);
    expect(mediaRenderer).toMatch(/borderRadius: listThumbnailRadius,[\s\S]*?height: listThumbnailSize/);
    expect(mediaRenderer).toMatch(/height: listThumbnailSize,[\s\S]*?overflow: 'hidden'/);
    expect(mediaRenderer).toMatch(/name="play"/);
    expect(savedContentRenderer).toMatch(/getListRowLayoutStyle\(theme, listRowHeight, isCompactListView\)/);
    expect(savedContentRenderer).toMatch(/borderRadius: LIST_THUMBNAIL_IMAGE_RADIUS,[\s\S]*?height: listThumbnailSize,[\s\S]*?overflow: 'hidden'/);
    expect(savedContentRenderer).toMatch(/item\.previewImageUri/);
    expect(listTextBranch).not.toBe('');
    expect(listTextBranch).toMatch(/getListRowLayoutStyle\(theme, listRowHeight, isCompactListView\)/);
    expect(listTextBranch).not.toMatch(/GlassView|backgroundColor|border(Color|Radius|Width)|shadow/);
    expect(listTextBranch).toMatch(/numberOfLines=\{1\}/);
    expect(listTextBranch).not.toMatch(/<Image/);
    expect(listTextBranch).toMatch(/SavedTextThumbnail height=\{listThumbnailSize\} text=\{item\.text\} width=\{listThumbnailSize\}/);
    expect(listTextBranch).toMatch(/textPresentation\?\.title/);
    expect(listTextBranch).toMatch(/textPresentation\?\.secondaryText \?\? 'Nota salva'/);
    expect(gallerySource).toMatch(/contentFit="cover"/);
  });

  test('uses identical horizontal thumbnail padding for every content type in both list modes', () => {
    expect(gallerySource).toMatch(
      /function getListRowContentPaddingStyle\(theme: AppTheme, isCompact: boolean\): ViewStyle \{\s*const padding = isCompact \? theme\.spacing\.xxs : theme\.spacing\.xs;[\s\S]*?paddingHorizontal: padding,[\s\S]*?paddingVertical: padding/,
    );
    expect(gallerySource.match(/\.\.\.getListRowContentPaddingStyle\(theme, isCompactListView\)/g)).toHaveLength(5);
    expect(gallerySource).not.toMatch(
      /paddingHorizontal: isCompactListView \? theme\.spacing\.xs : theme\.spacing\.md/,
    );

    const mediaRenderer = gallerySource.slice(
      gallerySource.indexOf('const renderMediaItem'),
      gallerySource.indexOf('const renderSavedContentItem'),
    );
    const savedContentRenderer = gallerySource.slice(
      gallerySource.indexOf('const renderSavedContentItem'),
      gallerySource.indexOf('const renderItem =', gallerySource.indexOf('const renderSavedContentItem')),
    );

    expect(mediaRenderer).toMatch(/getListRowContentPaddingStyle\(theme, isCompactListView\)/);
    expect(savedContentRenderer.match(/getListRowContentPaddingStyle\(theme, isCompactListView\)/g)).toHaveLength(4);
    expect(gallerySource).toMatch(/height: listThumbnailSize,[\s\S]*?width: listThumbnailSize/);
    expect(gallerySource).toMatch(/gap: isCompactListView \? theme\.spacing\.xs : theme\.spacing\.sm/);
  });

  test('uses one 14pt radius for image thumbnails in both list modes', () => {
    const mediaRenderer = gallerySource.slice(
      gallerySource.indexOf('const renderMediaItem'),
      gallerySource.indexOf('const renderSavedContentItem'),
    );
    const savedContentRenderer = gallerySource.slice(
      gallerySource.indexOf('const renderSavedContentItem'),
      gallerySource.indexOf('const renderItem =', gallerySource.indexOf('const renderSavedContentItem')),
    );

    expect(gallerySource).toMatch(/const LIST_THUMBNAIL_IMAGE_RADIUS = 14/);
    expect(mediaRenderer).toMatch(
      /const listThumbnailRadius = isSingleLineView\s*\?\s*theme\.radius\.sm\s*:\s*isListView\s*\?\s*LIST_THUMBNAIL_IMAGE_RADIUS\s*:\s*theme\.radius\.md/,
    );
    expect(
      mediaRenderer.match(/borderRadius: listThumbnailRadius,[\s\S]*?overflow: 'hidden'/g),
    ).toHaveLength(2);
    expect(savedContentRenderer).toMatch(
      /<View\s+style=\{\{[\s\S]*?borderRadius: LIST_THUMBNAIL_IMAGE_RADIUS,[\s\S]*?height: listThumbnailSize,[\s\S]*?overflow: 'hidden',[\s\S]*?width: listThumbnailSize[\s\S]*?\}\}[\s\S]*?<Image[\s\S]*?borderRadius: LIST_THUMBNAIL_IMAGE_RADIUS,[\s\S]*?height: listThumbnailSize,[\s\S]*?overflow: 'hidden',[\s\S]*?width: listThumbnailSize/,
    );
    expect(savedContentRenderer).not.toMatch(/borderRadius: theme\.radius\.md,[\s\S]*?height: listThumbnailSize,[\s\S]*?overflow: 'hidden'/);
    expect(radiusSource).toMatch(/md: 12/);
  });

  test('flattens plain List row styles at Expo Router Slot child boundaries', () => {
    const mediaRenderer = gallerySource.slice(
      gallerySource.indexOf('const renderMediaItem'),
      gallerySource.indexOf('const renderSavedContentItem'),
    );
    const savedContentRenderer = gallerySource.slice(
      gallerySource.indexOf('const renderSavedContentItem'),
      gallerySource.indexOf('const renderItem =', gallerySource.indexOf('const renderSavedContentItem')),
    );

    expect(mediaRenderer).toMatch(
      /const mediaTrigger = isListView \? \([\s\S]*?<Pressable[\s\S]*?style=\{isSingleLineView\s*\?\s*getSingleLineRowLayoutStyle\([\s\S]*?:\s*StyleSheet\.flatten\(\[/,
    );
    expect(savedContentRenderer).toMatch(
      /<LinkCardPressable[\s\S]*?style=\{StyleSheet\.flatten\(\[/,
    );
    expect(savedContentRenderer).toMatch(
      /<Pressable[\s\S]*?accessibilityLabel="Ler texto salvo"[\s\S]*?style=\{StyleSheet\.flatten\(\[/,
    );
    expect(gallerySource).toMatch(/<Link\.Trigger>\{mediaTrigger\}<\/Link\.Trigger>/);
    expect(gallerySource).toMatch(/<Link\.Trigger>\{contentTrigger\}<\/Link\.Trigger>/);
    expect(gallerySource).toMatch(/<Link\.Preview[\s\S]*?<\/Link\.Preview>/);
    expect(gallerySource).toMatch(/<Link\.Menu>[\s\S]*?Apagar link[\s\S]*?<\/Link\.Menu>/);

    const flattenedStyle = StyleSheet.flatten([
      { height: 96, marginBottom: 4, marginHorizontal: 2 },
      { alignItems: 'center', flexDirection: 'row', padding: 8 },
    ]);

    expect(Array.isArray(flattenedStyle)).toBe(false);
    expect(flattenedStyle).toMatchObject({
      height: 96,
      marginBottom: 4,
      marginHorizontal: 2,
      alignItems: 'center',
      flexDirection: 'row',
      padding: 8,
    });
  });

  test('opens one mixed multi-select picker and routes each media type through its existing import pipeline', () => {
    const importFlowSource = providerSource.slice(
      providerSource.indexOf('const importMediaFromPhotoLibrary'),
      providerSource.indexOf('const requestDeleteMedia'),
    );
    expect(importFlowSource).toMatch(/mediaTypes: \['images', 'videos'\]/);
    expect(importFlowSource).toMatch(/allowsMultipleSelection: true/);
    expect(importFlowSource).toMatch(/selectionLimit: 0/);
    expect(importFlowSource).toMatch(/orderedSelection: true/);
    expect(importFlowSource).toMatch(/videoExportPreset: ImagePicker\.VideoExportPreset\.Passthrough/);
    expect(importFlowSource).toMatch(/Platform\.OS === 'ios'[\s\S]*?requestMediaLibraryPermissionsAsync\(false\)/);
    expect(importFlowSource).toMatch(/if \(!permission\.granted\) \{[\s\S]*?return;[\s\S]*?launchImageLibraryAsync/);
    expect(importFlowSource).toMatch(/if \(result\.canceled \|\| !result\.assets\?\.length\) \{\s*return;\s*\}/);
    expect(importFlowSource).toMatch(/resolvePhotoScreenshotClassification\([\s\S]*?MediaSubtype\.SCREENSHOT/);
    expect(importFlowSource).toMatch(/await importSelectedPhotos\(photosWithClassification\)/);
    expect(importFlowSource).toMatch(/await importSelectedVideos\(batch\.assets\)/);
    expect(importFlowSource).toMatch(/setMedia\(await listSavedMedia\(\)\)/);
    expect(importFlowSource).toMatch(/getPermissionsAsync\(false\)/);
    expect(importFlowSource).not.toMatch(/requestPermissionsAsync\(/);
    expect(providerSource).toMatch(/listSavedMedia\(\)\s*\.then\(setMedia\)/);
  });

  test('keeps the saved photo title and local date in distinct secondary-typography rows', () => {
    const mediaRenderer = gallerySource.slice(
      gallerySource.indexOf('const renderMediaItem'),
      gallerySource.indexOf('const renderSavedContentItem'),
    );
    const titleBlock = mediaRenderer.slice(
      mediaRenderer.indexOf('{isVideo ? \'Vídeo\' : getPhotoDisplayTitle(item)}'),
      mediaRenderer.indexOf(') : (', mediaRenderer.indexOf('{isVideo ? \'Vídeo\' : getPhotoDisplayTitle(item)}')),
    );

    expect(titleBlock).toMatch(/getPhotoDisplayTitle\(item\)/);
    expect(titleBlock).toMatch(/photoDateLabel/);
    expect(titleBlock).toMatch(/theme\.typography\.caption/);
    expect(titleBlock).toMatch(/theme\.colors\.textSecondary/);
    expect(titleBlock).not.toMatch(/getPhotoSavedDateLabel\(item\.createdAt, now\)[\s\S]*?getPhotoDisplayTitle\(item\)/);
  });

  test('does not clean missing files or rows during gallery reads', () => {
    expect(librarySource).not.toMatch(/cleanupStagedDeletionFiles|PHOTO_DELETION_STAGING_FILE/);
    const listFunction = librarySource.slice(
      librarySource.indexOf('export async function listSavedMedia'),
      librarySource.indexOf('export async function listSavedPhotos'),
    );
    const getFunction = librarySource.slice(
      librarySource.indexOf('async function getMediaFromDatabase'),
      librarySource.indexOf('export async function listSavedMedia'),
    );
    expect(listFunction).not.toMatch(/DELETE FROM photos|removeMediaFile/);
    expect(getFunction).not.toMatch(/DELETE FROM photos|removeMediaFile/);
    expect(listFunction).toMatch(/ORDER BY created_at DESC, id DESC/);
  });

  test('uses a dedicated native-controls video route that pauses when it leaves', () => {
    expect(videoViewerSource).toMatch(/useVideoPlayer\(video\?\.uri \?\? null/);
    expect(videoViewerSource).toMatch(/nativeControls/);
    expect(videoViewerSource).toMatch(/contentFit="contain"/);
    expect(videoViewerSource).toMatch(/<Link\.AppleZoomTarget>\{videoSurface\}<\/Link\.AppleZoomTarget>/);
    expect(videoViewerSource).toMatch(/source=\{\{ uri: video\.thumbnailUri \}\}/);
    expect(videoViewerSource).toMatch(/onFirstFrameRender=\{handleFirstFrameRender\}/);
    expect(videoViewerSource).toMatch(/const video = loadedVideo\?\.id === id \? loadedVideo\.video : videoFromGallery/);
    expect(videoViewerSource).toMatch(/return \(\) => player\.pause\(\)/);
    expect(videoViewerSource).toMatch(/<StatusBar style="light" \/>/);
  });
});
