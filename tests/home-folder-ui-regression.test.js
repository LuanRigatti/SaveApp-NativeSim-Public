/* global describe, expect, test, __dirname */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { shouldKeepHomeToolbarItemsMounted } = require('../src/features/home-content/homeToolbarVisibility');
const { saveFolderSettingsName } = require('../src/features/home-folders/folderSettingsSave');

const readSource = (path) => readFileSync(join(__dirname, path), 'utf8');
const homeSource = readSource('../src/app/(tabs)/index.tsx');
const tabsLayoutSource = readSource('../src/app/(tabs)/_layout.tsx');
const rootSource = readSource('../src/app/_layout.tsx');
const progressiveSource = readSource('../src/components/premium/ProgressiveCollapsibleScreen.tsx');
const gallerySource = readSource('../src/components/photos/PhotoMasonryGallery.tsx');
const toolbarMenuSource = readSource('../src/features/home-folders/homeFolderToolbarMenu.tsx');
const overviewSource = readSource('../src/features/home-folders/HomeFolderOverview.tsx');
const folderScreenSource = readSource('../src/app/folders/[id].tsx');
const settingsSource = readSource('../src/components/native/HomeSettingsBottomSheet.ios.tsx');
const settingsProviderSource = readSource('../src/features/home-content/HomeSettingsSheetProvider.tsx');
const settingsFallbackSource = readSource('../src/app/settings-sheet-fallback.tsx');
const folderProviderSource = readSource('../src/features/home-folders/LocalHomeFolderProvider.tsx');
const selectionStorageSource = readSource('../src/features/home-folders/homeFolderSelectionStorage.ts');
const folderTypesSource = readSource('../src/features/home-folders/homeFolderTypes.ts');
const folderIndicatorIosSource = readSource('../src/features/home-folders/HomeFolderIndicator.ios.tsx');
const folderIndicatorFallbackSource = readSource('../src/features/home-folders/HomeFolderIndicator.tsx');
const folderFilterSource = readSource('../src/features/home-folders/HomeFolderFilterButton.tsx');
const folderFilterNativeSource = readSource('../src/features/home-folders/HomeFolderFilterButton.native.tsx');
const folderAssignmentSource = readSource('../src/features/home-folders/HomeFolderAssignmentPicker.tsx');
const contextMenuFallbackSource = readSource('../src/components/native/NativeCardContextMenu/NativeCardContextMenu.tsx');
const migrationSource = readSource('../src/features/home-folders/folderSchemaMigration.ts');
const photoLibrarySource = readSource('../src/features/photos/photoLibrary.ts');
const contentLibrarySource = readSource('../src/features/home-content/savedContentLibrary.ts');
const documentLibrarySource = readSource('../src/features/documents/documentLibrary.ts');

describe('home folder regression contract', () => {
  test('uses the native icon-only folder menu directly in the right toolbar', () => {
    expect(tabsLayoutSource).toMatch(/<Stack\.Toolbar placement="right">[\s\S]*?\{createHomeFolderToolbarMenu\([\s\S]*?hidden: !shouldShowHomeToolbarItems/);
    expect(tabsLayoutSource).not.toMatch(/<HomeFolderToolbarMenu\b/);
    expect((tabsLayoutSource.match(/<Stack\.Toolbar placement="right">/g) ?? []).length).toBe(1);
    expect(homeSource).not.toMatch(/<Stack\.Toolbar placement="right">/);
    expect(toolbarMenuSource).toMatch(/export function createHomeFolderToolbarMenu/);
    expect(toolbarMenuSource).toContain('accessibilityLabel={`Selecionar pasta. Atual: ${currentLabel}.`}');
    expect(toolbarMenuSource).toMatch(/<Stack\.Toolbar\.Menu[\s\S]*?accessibilityHint="Abre as opções de pastas e visualização\."[\s\S]*?hidden=\{hidden\}[\s\S]*?icon="folder"/);
    expect(toolbarMenuSource).not.toMatch(/<Stack\.Toolbar\.View|<Host|@expo\/ui\/swift-ui|frame\(|buttonStyle\(|buttonBorderShape\(|controlSize\(/);
    expect(toolbarMenuSource).not.toMatch(/title=\{currentLabel\}|>\s*\{currentLabel\}\s*</);
    expect(tabsLayoutSource).toMatch(/<Stack\.Toolbar\.Button[\s\S]*?icon=\{favoritesOnly \? 'star\.fill' : 'star'\}[\s\S]*?selected=\{favoritesOnly\}[\s\S]*?\{createHomeFolderToolbarMenu\(/);
    expect(tabsLayoutSource).toMatch(/selection\.kind === 'folder' \? selection\.folderId : null/);
    expect(tabsLayoutSource).toMatch(/currentFolder\?\.name \?\? \(\s*selectedCategory\s*\? getHomeCategoryDefinition\(selectedCategory\)\.label\s*:\s*view === 'folders' \? 'Pastas' : 'Todos'/);
    expect(toolbarMenuSource).toMatch(/>\s*Todos\s*<\/Stack\.Toolbar\.MenuAction>/);
    for (const fallbackSource of [
      readSource('../src/features/home-folders/HomeFolderFilterButton.native.tsx'),
      readSource('../src/features/home-folders/HomeFolderFilterButton.tsx'),
    ]) {
      expect(fallbackSource).toMatch(/currentLabel = selectedFolder\?\.name \?\? \(/);
      expect(fallbackSource).toMatch(/accessibilityLabel=\{favoritesOnly \? 'Desativar Favoritos' : 'Mostrar Favoritos'\}/);
      expect(fallbackSource).toContain('Selecionar pasta. Atual: ${currentLabel}.');
      expect(fallbackSource).toMatch(/setFavoritesOnly\(false\)/);
      expect(fallbackSource).not.toContain('Sem pasta');
      expect(fallbackSource).not.toContain("selectView('unfiled')");
    }
    expect(tabsLayoutSource).not.toMatch(/useWindowDimensions|menuMaxWidth/);
    expect(toolbarMenuSource).toMatch(/Todos[\s\S]*?Pastas[\s\S]*?inline title="CATEGORIAS"[\s\S]*?HOME_CATEGORIES\.map[\s\S]*?inline title="MINHAS PASTAS"[\s\S]*?icon="square\.grid\.2x2" title="Visualização"[\s\S]*?Maiores[\s\S]*?Menores[\s\S]*?Lista[\s\S]*?Lista compacta[\s\S]*?Linha única/);
    expect(toolbarMenuSource).not.toContain('Pastas existentes');
    expect(toolbarMenuSource).not.toContain('Sem pasta');
    expect(toolbarMenuSource).not.toContain("onSelectHomeView('unfiled')");
    expect(toolbarMenuSource).toContain('<Stack.Toolbar.Menu icon="square.grid.2x2" title="Visualização">');
    expect(toolbarMenuSource).toMatch(/<Stack\.Toolbar\.MenuAction[\s\S]*?icon="folder"[\s\S]*?isOn=\{!currentFolderId && !selectedCategory && view === 'all-items'\}[\s\S]*?onPress=\{withSelectionHaptic\(\(\) => onSelectHomeView\('all-items'\)\)\}[\s\S]*?>\s*Todos/);
    expect(toolbarMenuSource).toMatch(/isOn=\{!currentFolderId && selectedCategory === category\.id\}[\s\S]*?onPress=\{withSelectionHaptic\(\(\) => onSelectCategory\(category\.id\)\)\}/);
    expect(toolbarMenuSource).toMatch(/isOn=\{currentFolderId === folder\.id\}[\s\S]*?onPress=\{withSelectionHaptic\(\(\) => onOpenFolder\(folder\.id\)\)\}/);
    expect(toolbarMenuSource).toMatch(/isOn=\{viewMode === 'single-line'\}[\s\S]*?onPress=\{withSelectionHaptic\(\(\) => onSelectViewMode\('single-line'\)\)\}[\s\S]*?>\s*Linha única/);
    expect(toolbarMenuSource).not.toMatch(/folder\.fill/);
    expect(tabsLayoutSource).not.toMatch(/square\.grid\.2x2"\s+separateBackground/);
    expect(homeSource).toMatch(/fixedLargeTitleAccessory=\{Platform\.OS === 'ios' \? null : <HomeFolderFilterButton \/>\}/);
    expect(homeSource).toMatch(/const homeTitle = getHomeTitleForFavorites\(getHomeFolderHomeTitle\(selection, folders\), favoritesOnly\)/);
    expect(folderTypesSource).toMatch(/selection\.view === 'folders' \? 'Pastas' : 'Todos'/);
    expect(homeSource).toMatch(/compactTitle=\{homeTitle\}/);
    expect(homeSource).toMatch(/ellipsizeMode="tail"\s+numberOfLines=\{1\}[\s\S]*?>\s*\{homeTitle\}\s*<\/Text>/);
    expect(progressiveSource).toMatch(/fixedLargeTitleAccessory\?: ReactNode/);
  });

  test('plays one selection haptic only from native menu action callbacks', () => {
    const menuOpening = toolbarMenuSource.match(/<Stack\.Toolbar\.Menu[\s\S]*?>/)?.[0] ?? '';

    expect(menuOpening).not.toMatch(/onPress|onOpenChange|triggerSelectionHaptic/);
    expect(toolbarMenuSource).toMatch(/function withSelectionHaptic\(action: \(\) => void\): \(\) => void \{\s*return \(\) => \{\s*triggerSelectionHaptic\(\);\s*action\(\);/);
    expect((toolbarMenuSource.match(/onPress=\{withSelectionHaptic\(/g) ?? []).length).toBe(10);
    expect(toolbarMenuSource).not.toMatch(/onPress=\{\(\) => \{\s*triggerSelectionHaptic/);
  });

  test('exposes manual lock only for the active authorized protected folder and revokes the session', () => {
    const authentication = readSource('../src/features/home-folders/folderFaceIdAuthentication.ts');
    expect(tabsLayoutSource).toMatch(/currentFolder\?\.isProtected === true && isFolderAuthorized\(currentFolder\.id\)/);
    expect(toolbarMenuSource).toMatch(/currentFolderId && canLockCurrentFolder \? \([\s\S]*?icon="lock\.fill"[\s\S]*?>\s*Bloquear pasta/);
    expect(toolbarMenuSource).toMatch(/onPress=\{withSelectionHaptic\(\(\) => onLockFolder\(currentFolderId\)\)\}/);
    expect(tabsLayoutSource).toMatch(/const handleLockFolderPress = useCallback\(\(folderId: string\) => \{[\s\S]*?if \(!lockFolder\(folderId\)\) return;[\s\S]*?setFavoritesOnly\(false\);[\s\S]*?if \(routeFolderId === folderId\) router\.dismissTo\('\/'\)/);
    expect(authentication).toMatch(/!options\.isProtected\s*\|\|\s*options\.appState !== 'active'\s*\|\|\s*!options\.unlockedFolderIds\.has\(options\.folderId\)/);
    expect(authentication).toMatch(/nextUnlockedFolderIds\.delete\(options\.folderId\)[\s\S]*?options\.invalidatePending\(\)[\s\S]*?options\.replaceUnlockedFolderIds\(nextUnlockedFolderIds\)[\s\S]*?options\.returnToAllItems\(\)/);
    expect(folderProviderSource).toMatch(/folderSelectionGenerationRef\.current \+= 1;[\s\S]*?lockEpochRef\.current \+= 1;[\s\S]*?authorizationRequestsRef\.current\.delete\(folderId\)/);
    expect(folderFilterNativeSource).toMatch(/selectedFolder\?\.isProtected && selectedFolderId && isFolderAuthorized\(selectedFolderId\)/);
    expect(folderFilterNativeSource).toMatch(/canLockSelectedFolder && selectedFolderId[\s\S]*?title: 'Bloquear pasta'[\s\S]*?lockFolder\(selectedFolder\.id\)/);
    expect(folderFilterSource).toMatch(/selectedFolder\?\.isProtected && isFolderAuthorized\(selectedFolder\.id\)[\s\S]*?Bloquear pasta[\s\S]*?lockCurrentFolder/);
    expect(gallerySource).toMatch(/folderAndFavoriteFilteredItems[\s\S]*?protectedFolderIds[\s\S]*?accessibleUnlockedFolderIds[\s\S]*?createHomeSearchIndex\(folderAndFavoriteFilteredItems\)/);
  });

  test('keeps the toolbar menu independent of Home content states and visible after folder detail return', () => {
    expect(tabsLayoutSource).toMatch(/hidden: !shouldShowHomeToolbarItems/);
    expect(tabsLayoutSource).not.toMatch(/hidden:.*\bview\b/);
    expect(homeSource).toMatch(/hidden=\{\(view === 'folders' && !favoritesOnly\) \|\| \(!favoritesOnly && isSelectedProtectedFolderLocked\)\}/);
    expect(homeSource).toMatch(/hidden=\{view !== 'folders' \|\| favoritesOnly\}/);
    expect(toolbarMenuSource).toMatch(/hidden=\{hidden\}/);
    expect(readSource('../src/features/home-content/homeToolbarVisibility.ts')).toMatch(/pathname === '\/' \|\| SAVED_CONTENT_ROUTE\.test\(pathname\)/);
    for (const pathname of ['/', '/folders/folder-123']) {
      expect(shouldKeepHomeToolbarItemsMounted(pathname)).toBe(true);
    }
  });

  test('keeps items without folders available in Todos and migrates legacy Sem pasta preferences', () => {
    expect(homeSource).toMatch(/folderFilter=\{folderFilter\}/);
    expect(homeSource).toMatch(/<HomeFolderOverview[\s\S]*?hidden=\{view !== 'folders' \|\| favoritesOnly\}/);
    expect(homeSource).toMatch(/hidden=\{\(view === 'folders' && !favoritesOnly\) \|\| \(!favoritesOnly && isSelectedProtectedFolderLocked\)\}/);
    expect(homeSource).toMatch(/getHomeFolderItemFilterForSelection\(selection\)/);
    expect(gallerySource).toMatch(/style=\{\{ display: hidden \? 'none' : 'flex', flex: 1 \}\}/);
    expect(overviewSource).toMatch(/Nenhuma pasta criada\. Crie uma em Configurações\./);
    expect(overviewSource).toMatch(/\{item\.itemCount\} \{item\.itemCount === 1 \? 'item' : 'itens'\}/);
    expect(overviewSource).not.toMatch(/buildHomeGalleryEntries|day-separator/);
    expect(gallerySource).toMatch(/'Nenhum item nesta pasta'/);
    expect(gallerySource).toMatch(/'Nenhum item sem pasta'/);
    expect(gallerySource).toMatch(/'Nenhum item salvo'/);
    expect(gallerySource).toMatch(/'Nenhum favorito ainda'/);
    expect(folderTypesSource).toMatch(/HomeFolderHomeView = 'all-items' \| 'unfiled' \| 'folders'/);
    expect(folderTypesSource).toMatch(/kind: 'all-items'/);
    expect(selectionStorageSource).toMatch(/HOME_FOLDER_SELECTION_STORAGE_KEY = '@saveapp\/home-folder-selection-v4'/);
    expect(selectionStorageSource).toMatch(/HOME_FOLDER_VIEW_STORAGE_KEY = '@saveapp\/home-folder-view-v3'/);
    expect(selectionStorageSource).toMatch(/PREVIOUS_HOME_FOLDER_VIEW_STORAGE_KEY = '@saveapp\/home-folder-view-v2'/);
    expect(selectionStorageSource).toMatch(/value === 'all-folders'\) return getViewSelection\('folders'\)/);
    expect(selectionStorageSource).toMatch(/selectedFolder = selection\.kind === 'folder'[\s\S]*?if \(!selectedFolder\?\.isProtected\) return selection/);
    expect(selectionStorageSource).toMatch(/persistHomeFolderSelection\(storage, fallback\)/);
    expect(selectionStorageSource).toMatch(/isHomeFolderHomeView\(storedView\) && storedView !== 'unfiled' \? storedView : 'all-items'/);
    expect(folderProviderSource).toMatch(/useState<HomeFolderSelection>\([\s\S]*?kind: 'view',[\s\S]*?view: 'all-items'/);
    expect(folderProviderSource).toMatch(/restoreHomeFolderSelection\(AsyncStorage, nextFolders\)/);
    expect(folderProviderSource).toMatch(/persistHomeFolderSelection\(AsyncStorage, nextSelection\)/);
    expect(folderProviderSource).toMatch(/updateSelection\(\{ kind: 'folder', folderId \}\)/);
    expect(readSource('../src/features/home-content/homeViewMode.ts')).toMatch(/HOME_VIEW_MODE_STORAGE_KEY = '@saveapp\/home-view-mode'/);
    expect(homeSource).toMatch(/const hasNewItem = \[\.\.\.catalogIds\]\.some\(\(itemKey\) => !previousIds\.has\(itemKey\)\)/);
    expect(homeSource).toMatch(/if \(!previousIds \|\| view !== 'folders'\) return;[\s\S]*?if \(!hasNewItem\) return;[\s\S]*?selectView\('all-items'\)[\s\S]*?setRevealNewestSignal/);
    expect(folderProviderSource).not.toMatch(/setItemFolder\([^)]*view|folderIdByItemKey.*all-items/);
  });

  test('filters directly from the toolbar while the Pastas overview keeps its dedicated route', () => {
    expect(overviewSource).toMatch(/router\.push\(getHomeFolderRoute\(item\.id\)\)/);
    expect(overviewSource).toMatch(/authorizeFolderAndContinue\([\s\S]*?router\.push\(getHomeFolderRoute\(item\.id\)\)/);
    expect(overviewSource).not.toMatch(/selectFolder|selectView/);
    expect(toolbarMenuSource).toMatch(/onPress=\{withSelectionHaptic\(\(\) => onOpenFolder\(folder\.id\)\)\}/);
    expect(tabsLayoutSource).toMatch(/getHomeFolderRoute\(folderId\)/);
    expect(tabsLayoutSource).toMatch(/const handleFolderPress = useCallback\(\(folderId: string\) => \{[\s\S]*?await selectFolderAfterAuthorization\(folderId, \(\) => \{[\s\S]*?if \(routeFolderId\) router\.replace\(getHomeFolderRoute\(folderId\)\);/);
    expect(tabsLayoutSource).not.toMatch(/else router\.push\(route\)/);
    expect(homeSource).toMatch(/getHomeFolderItemFilterForSelection\(selection\)/);
    expect(tabsLayoutSource).toMatch(/selectFolderAfterAuthorization\(folderId, \(\) => \{/);
    for (const fallbackSource of [
      readSource('../src/features/home-folders/HomeFolderFilterButton.native.tsx'),
      readSource('../src/features/home-folders/HomeFolderFilterButton.tsx'),
    ]) {
      expect(fallbackSource).toMatch(/selectFolderAfterAuthorization\(|selectAuthorizedFolder\(/);
      expect(fallbackSource).not.toMatch(/router\.push\(getHomeFolderRoute/);
    }
    expect(folderScreenSource).toMatch(/useLocalSearchParams/);
    expect(folderScreenSource).toMatch(/folderFilter/);
    expect(folderScreenSource).toMatch(/kind: 'folder' as const, folderId: rawFolderId/);
    expect(folderScreenSource).toMatch(/router\.dismissTo\('\/'\)/);
    expect(folderScreenSource).toMatch(/presentation: 'card'/);
    expect(folderScreenSource).toMatch(/const folderTitle = folder\?\.name/);
    expect(folderScreenSource).toMatch(/<PhotoMasonryGallery/);
    expect(rootSource).toMatch(/name="folders\/\[id\]"/);
    expect(rootSource).toMatch(/<HomeViewModeProvider>[\s\S]*?<NavigationRoot \/>[\s\S]*?<\/HomeViewModeProvider>/);
    expect(settingsSource).not.toMatch(/queueFolderOpenAfterReturn|updatePresentation\(false\)/);
    expect(settingsFallbackSource).not.toMatch(/router\.dismissTo\(/);
    expect(settingsSource).toMatch(/<NavigationLink key=\{folder\.id\} value=\{getFolderSettingsRouteValue\(folder\.id\)\}>/);
    expect(settingsFallbackSource).toMatch(/onPress=\{\(\) => openFolderSettings\(folder\)\}/);
    expect(settingsProviderSource).toMatch(/consumePendingFolderOpen/);
  });

  test('keeps effective Root Stack and folder screen on the default native card push', () => {
    expect(rootSource).toMatch(/<Stack\.Screen\s+name="folders\/\[id\]"\s+options=\{\{[\s\S]*?animation: 'default'[\s\S]*?presentation: 'card'/);
    expect(folderScreenSource).toMatch(/animation: 'default'/);
    expect(folderScreenSource).toMatch(/gestureEnabled: true/);
    expect(folderScreenSource).toMatch(/presentation: 'card'/);
    expect(folderScreenSource).not.toMatch(/fullScreenGestureShadowEnabled/);
  });

  test('restores a selected folder and resets gallery scroll on filter change', () => {
    expect(selectionStorageSource).toMatch(/candidate\.kind === 'category' && isHomeCategory\(candidate\.category\)/);
    expect(selectionStorageSource).toMatch(/candidate\.kind === 'folder'[\s\S]*?isExistingFolder\(candidate\.folderId, folders\)/);
    expect(selectionStorageSource).toMatch(/persistHomeFolderSelection\(storage, selection\)/);
    expect(folderProviderSource).toMatch(/currentSelection\.kind === 'folder'[\s\S]*?updateSelection\(\{ kind: 'view', view: 'all-items' \}\)/);
    expect(gallerySource).toMatch(/currentFolderFilterKey = favoritesOnly\s*\? 'favorites'[\s\S]*?folderFilter\.kind === 'folder'[\s\S]*?folder:\$\{folderFilter\.folderId\}/);
    expect(gallerySource).toMatch(/folderFilter\.kind === 'category'[\s\S]*?category:\$\{folderFilter\.category\}/);
    expect(gallerySource).toMatch(/if \(previousFolderFilterKeyRef\.current === currentFolderFilterKey\) return;[\s\S]*?scrollToOffset\(\{ offset: 0, animated: false \}\)/);
    expect(gallerySource).toMatch(/if \(favoritesOnly\)[\s\S]*?filterHomeFavoriteItems\([\s\S]*?protectedFolderIds,[\s\S]*?accessibleUnlockedFolderIds/);
    expect(gallerySource).toMatch(/filterHomeFolderItems\([\s\S]*?protectedFolderIds,[\s\S]*?accessibleUnlockedFolderIds/);
    expect(gallerySource).toMatch(/buildHomeGalleryEntriesWhenReady\(filteredItems/);
    expect(gallerySource).toMatch(/shouldShowHomeCategoryEmptyState\([\s\S]*?catalogsLoadedSuccessfully: homeCatalogsLoadedSuccessfully[\s\S]*?categoryItemCount: categoryCatalogItemCount/);
    expect(gallerySource).toContain('getHomeCategoryEmptyMessage(folderFilter.category)');
  });

  test('keeps outline folder symbols for Todos, Pastas, and individual folders without a Sem pasta action', () => {
    expect(toolbarMenuSource).toMatch(/<Stack\.Toolbar\.MenuAction[\s\S]*?icon="folder"[\s\S]*?isOn=\{!currentFolderId && !selectedCategory && view === 'all-items'\}[\s\S]*?>\s*Todos/);
    expect(toolbarMenuSource).toMatch(/icon="folder"[\s\S]*?isOn=\{!currentFolderId && !selectedCategory && view === 'folders'\}[\s\S]*?>\s*Pastas/);
    expect(toolbarMenuSource).toMatch(/inline title="CATEGORIAS"[\s\S]*?icon=\{category\.icon\}[\s\S]*?isOn=\{!currentFolderId && selectedCategory === category\.id\}/);
    expect(toolbarMenuSource).toMatch(/inline title="MINHAS PASTAS"[\s\S]*?folder\.name/);
    expect(folderFilterNativeSource).toMatch(/id: 'section-title:categories',[\s\S]*?titleColor: theme\.colors\.textSecondary/);
    expect(folderFilterNativeSource).toMatch(/id: 'section-title:folders',[\s\S]*?titleColor: theme\.colors\.textSecondary/);
    expect(toolbarMenuSource).toMatch(/icon="folder"[\s\S]*?isOn=\{currentFolderId === folder\.id\}[\s\S]*?>\s*\{folder\.name\}/);
    expect(toolbarMenuSource).not.toContain('Sem pasta');
    expect(toolbarMenuSource).not.toMatch(/checkmark/);
    expect(toolbarMenuSource).not.toMatch(/folder\.fill/);
  });

  test('keeps the same gallery capabilities and five modes inside folder detail', () => {
    expect(folderScreenSource).toMatch(/PhotoMasonryGallery[\s\S]*?folderFilter=\{folderFilter\}/);
    expect(gallerySource).toMatch(/filterHomeFolderItems\([\s\S]*?catalogItems,[\s\S]*?folderFilter,[\s\S]*?folderIdByItemKey,[\s\S]*?protectedFolderIds,[\s\S]*?accessibleUnlockedFolderIds/);
    expect(gallerySource).toMatch(/<Link\.Preview style=\{previewSize\}>/);
    expect(gallerySource).toMatch(/<Link\.AppleZoom>\{mediaImage\}<\/Link\.AppleZoom>/);
    for (const action of ['Apagar imagem', 'Apagar vídeo', 'Apagar link', 'Apagar texto', 'Apagar arquivo']) {
      expect(gallerySource).toContain(action);
    }
    expect(toolbarMenuSource).toMatch(/onSelectViewMode\('large'\)/);
    expect(toolbarMenuSource).toMatch(/onSelectViewMode\('small'\)/);
    expect(toolbarMenuSource).toMatch(/onSelectViewMode\('list'\)/);
    expect(toolbarMenuSource).toMatch(/onSelectViewMode\('compact-list'\)/);
    expect(toolbarMenuSource).toMatch(/onSelectViewMode\('single-line'\)/);
    expect(gallerySource).toMatch(/key=\{viewLayout\.key\}/);
  });

  test('keeps folder metadata beside its label using responsive truncation in all gallery renderers', () => {
    expect(gallerySource).toMatch(/linkPresentation\.secondaryText[\s\S]*?maxWidth: folderName \? '56%'[\s\S]*?<HomeFolderIndicator maxWidth="40%"/);
    expect(gallerySource).toMatch(/textPresentation\?\.secondaryText \?\? 'Nota salva'/);
    expect(gallerySource).toMatch(/maxWidth: folderName \? '56%'[\s\S]*?<HomeFolderIndicator maxWidth="40%"/);
    expect(gallerySource).toMatch(/item\.domain[\s\S]*?maxWidth: folderName \? '56%'[\s\S]*?<HomeFolderIndicator maxWidth="40%"/);
    expect(gallerySource).toMatch(/photoDateLabel[\s\S]*?<HomeFolderIndicator maxWidth="40%"/);
    expect(gallerySource).toMatch(/\{secondaryText\}[\s\S]*?<HomeFolderIndicator maxWidth="40%"/);
    expect(gallerySource).not.toMatch(/marginLeft:\s*'auto'|marginLeft:\s*theme\.spacing\.auto/);
    expect(folderIndicatorIosSource).toMatch(/maxWidth = 132[\s\S]*?truncationMode\('tail'\)[\s\S]*?maxWidth: 112/);
    expect(folderIndicatorFallbackSource).toMatch(/maxWidth = 132[\s\S]*?numberOfLines=\{1\}/);
  });

  test('uses the semantic accent for folder identity and organization controls', () => {
    expect(folderIndicatorIosSource).toMatch(/Image color=\{folderAccentColor\}[^>]*systemName="folder"/);
    expect(folderIndicatorIosSource).toMatch(/foregroundStyle\(folderAccentColor\)/);
    expect(folderIndicatorFallbackSource).toMatch(/Ionicons color=\{folderAccentColor\} name="folder-outline"/);
    expect(folderIndicatorFallbackSource).toMatch(/color: folderAccentColor/);
    expect(overviewSource).toMatch(/Ionicons color=\{getHomeFolderAccentColor\(item\.color, accentColor, resolvedMode\)\} name="folder-outline"/);
    expect(folderAssignmentSource).toMatch(/Ionicons color=\{getHomeFolderAccentColor\(folder\.color, accentColor, resolvedMode\)\} name="folder-outline"/);
    expect(folderAssignmentSource).toMatch(/folder\.id === currentFolderId \? <Ionicons color=\{getHomeFolderAccentColor/);
    expect(folderAssignmentSource).toMatch(/Ionicons color=\{theme\.colors\.primary\} name="folder-open-outline"/);
    expect(folderAssignmentSource).toMatch(/color=\{theme\.colors\.textSecondary\} name="lock-closed-outline"/);
    expect(folderFilterSource).toMatch(/getHomeFolderAccentColor\(folder\.color, accentColor, resolvedMode\)/);
    expect(folderFilterSource).toMatch(/color=\{selectedFolderColor\} name="folder-outline"/);
    expect(folderFilterNativeSource).toMatch(/imageColor: getHomeFolderAccentColor\(folder\.color, accentColor, resolvedMode\)/);
    expect(folderFilterNativeSource).toMatch(/color=\{selectedCategory \? theme\.colors\.primary : selectedFolderColor\} name="folder-outline"/);
    expect(tabsLayoutSource).toMatch(/const folderToolbarTint = currentFolder[\s\S]*?getHomeFolderAccentColor\(currentFolder\.color, accentColor, resolvedMode\)/);
    expect(tabsLayoutSource).toMatch(/tintColor: folderToolbarTint/);
    expect(contextMenuFallbackSource).toMatch(/action\.destructive \? theme\.colors\.danger : theme\.colors\.primary/);
    expect(settingsSource).toMatch(/Image color=\{getHomeFolderAccentColor\(folder\.color, accentColor, resolvedMode\)\} size=\{18\} systemName="folder"/);
    expect(settingsFallbackSource).toMatch(/Ionicons color=\{getHomeFolderAccentColor\(folder\.color, accentColor, resolvedMode\)\} name="folder-outline"/);
    expect(tabsLayoutSource).toMatch(/tintColor=\{theme\.colors\.primary\}/);
    expect(tabsLayoutSource).not.toMatch(/tintColor="#315AE8"/);
    expect(toolbarMenuSource).toMatch(/tintColor=\{tintColor\}/);
    expect(toolbarMenuSource).not.toMatch(/tintColor=\{theme\.colors\.primary\}/);
    expect(settingsSource).toMatch(/Image color=\{theme\.colors\.textSecondary\} size=\{15\} systemName="lock"/);
  });

  test('preserves the settings BottomSheet and native folder creation form', () => {
    expect(settingsSource).toMatch(/<BottomSheet[\s\S]*?presentationDetents\(\['large'\]\)/);
    expect(settingsSource).toMatch(/<NavigationStack path=\{path\} onPathChange=\{setPath\}>/);
    expect(settingsSource).toMatch(/<Button[\s\S]*?label="Criar pasta"[\s\S]*?onPress=\{onCreate\}[\s\S]*?labelStyle\('iconOnly'\)[\s\S]*?systemImage="plus"/);
    expect(settingsSource).toMatch(/textFieldStyle\('plain'\)/);
    expect(settingsSource).toMatch(/await createFolder\(name\)/);
  });

  test('opens ID-based folder settings inside the SwiftUI stack with explicit save and a native Face ID toggle', () => {
    expect(settingsSource).toMatch(/FOLDER_SETTINGS_ROUTE_PREFIX = 'settings-folder:'/);
    expect(settingsSource).toMatch(/<NavigationLink key=\{folder\.id\} value=\{getFolderSettingsRouteValue\(folder\.id\)\}>/);
    expect(settingsSource).toMatch(/NavigationDestination key=\{routeValue\} value=\{routeValue\}/);
    expect(settingsSource).toMatch(/navigationTitle\(folder\.name\)/);
    expect(settingsSource).toMatch(/<Section title="Nome">[\s\S]*?<TextField[\s\S]*?textFieldStyle\('plain'\)/);
    expect(settingsSource).toMatch(/<Section title="Cor da pasta">[\s\S]*?Padrão[\s\S]*?Acompanha a cor do aplicativo[\s\S]*?getAccentColorRows\(\)/);
    expect(settingsSource).toMatch(/onSetColor=\{updateFolderSettingsColor\}/);
    expect(settingsFallbackSource).toMatch(/COR DA PASTA[\s\S]*?Padrão[\s\S]*?Acompanha a cor do aplicativo[\s\S]*?getAccentColorRows\(\)/);
    expect(folderProviderSource).toMatch(/setHomeFolderColor\(folderId, color\)[\s\S]*?foldersRef\.current = nextFolders[\s\S]*?setFolders\(nextFolders\)/);
    expect(settingsSource).toMatch(/rename: \(name\) => onRename\(folder\.id, name\)/);
    expect(settingsSource).toMatch(/label="Salvar"[\s\S]*?saveName\(\)/);
    expect(settingsSource).toMatch(/<Toggle[\s\S]*?isOn=\{folder\.isProtected\}[\s\S]*?label="Proteger com Face ID"[\s\S]*?onIsOnChange=\{\(nextValue\) => void toggleProtection\(nextValue\)\}/);
    expect(settingsSource).toMatch(/pendingOperationRef\.current = true[\s\S]*?onToggleProtection\(folder, nextIsProtected\)/);
    expect(settingsSource).toMatch(/const toggleProtection = async \(nextIsProtected: boolean\) => \{[\s\S]*?if \(pendingOperationRef\.current\) return;[\s\S]*?pendingOperationRef\.current = true;[\s\S]*?await onToggleProtection\(folder, nextIsProtected\)[\s\S]*?finally \{[\s\S]*?pendingOperationRef\.current = false/);
    expect(settingsSource).toMatch(/const toggleProtection = async[\s\S]*?finally \{\s*pendingOperationRef\.current = false;\s*setPendingOperation\(null\);\s*\}/);
    expect(settingsSource).toMatch(/label="Salvar"[\s\S]*?saveName\(\)[\s\S]*?disabled\(isBusy\)/);
    expect(settingsSource).toMatch(/disabled\(isBusy\)/);
    expect(settingsSource).toMatch(/Exigir autenticação para acessar os conteúdos desta pasta/);
    expect(settingsSource).toMatch(/label="Excluir pasta"[\s\S]*?role="destructive"/);
    expect(settingsSource).toMatch(/setPath\(\(current\) => current\.at\(-1\) === getFolderSettingsRouteValue\(folder\.id\)[\s\S]*?current\.slice\(0, -1\)/);
    expect(settingsSource).toMatch(/setPath\(\(current\) => current\.slice\(0, -1\)\)/);
    expect(settingsSource).not.toMatch(/queueFolderOpenAfterReturn|onIsPresentedChange\(false\)/);
    expect(settingsFallbackSource).toMatch(/setCurrentPage\('folders'\)/);
  });

  test('Save closes folder settings after a no-op or successful rename, and stays open on rename failure', async () => {
    const rename = jest.fn(async (name) => ({ name: name.trim() }));
    await expect(saveFolderSettingsName({ currentName: 'Privada', nextName: '  Privada  ', rename }))
      .resolves.toEqual({ name: 'Privada', changed: false });
    expect(rename).not.toHaveBeenCalled();

    await expect(saveFolderSettingsName({ currentName: 'Privada', nextName: 'Documentos', rename }))
      .resolves.toEqual({ name: 'Documentos', changed: true });
    expect(rename).toHaveBeenCalledWith('Documentos');

    const failedRename = jest.fn(async () => { throw new Error('write failed'); });
    await expect(saveFolderSettingsName({ currentName: 'Privada', nextName: 'Nova', rename: failedRename }))
      .rejects.toThrow('write failed');
    expect(settingsSource).toMatch(/const result = await saveFolderSettingsName\([\s\S]*?nameState\.set\(result\.name\)[\s\S]*?shouldClose = true/);
    expect(settingsSource).toMatch(/finally \{[\s\S]*?pendingOperationRef\.current = false;[\s\S]*?\}\s*if \(shouldClose\) onDone\(\)/);
    expect(settingsSource).toMatch(/onDone=\{\(\) => setPath\(\(current\) => current\.at\(-1\) === routeValue[\s\S]*?current\.slice\(0, -1\)/);
    expect(settingsSource).toContain('onToggleProtection={toggleFolderProtection}');
    expect(settingsSource).not.toMatch(/saveName\([\s\S]*?onToggleProtection\(/);
  });

  test('movement reports the specific failure and silently treats authentication cancellation as cancellation', () => {
    expect(gallerySource).toMatch(/catch \(error\)[\s\S]*?getHomeFolderAssignmentAlert\(error\)[\s\S]*?if \(failure\) Alert\.alert\(failure\.title, failure\.message\)/);
    expect(folderProviderSource).toMatch(/runExclusiveFolderAssignment\(folderAssignmentOperationLockRef[\s\S]*?authorizeAndPersistFolderAssignment\([\s\S]*?allowInactiveAfterAuthentication: true[\s\S]*?setHomeFolderItemAssignment\([\s\S]*?validateBeforeCommit/);
    expect(folderProviderSource).not.toMatch(/setItemFolder = useCallback\([\s\S]*?authorizeFolder\(protectedId\)/);
    expect(folderProviderSource).toMatch(/operationFaceIdSucceeded && appStateRef\.current === 'inactive'/);
  });

  test('removes hidden folder settings actions from the list but keeps item organization menus', () => {
    const folderListSource = settingsSource.match(/function FolderListPage[\s\S]*?function FolderSettingsPage/)?.[0] ?? '';
    expect(folderListSource).not.toMatch(/<ContextMenu|Renomear|Proteger com Face ID|Desproteger com Face ID/);
    expect(gallerySource).toMatch(/title=\{folderName \? 'Alterar pasta' : 'Adicionar à pasta'\}/);
    expect(gallerySource).toMatch(/title="Remover da pasta"/);
  });

  test('keeps folder association migration and compensation independent of physical saved files', () => {
    expect(migrationSource).toMatch(/AFTER DELETE ON photos/);
    expect(migrationSource).toMatch(/AFTER DELETE ON saved_content/);
    expect(migrationSource).toMatch(/AFTER DELETE ON saved_documents/);
    for (const source of [photoLibrarySource, contentLibrarySource, documentLibrarySource]) {
      expect(source).toMatch(/readHomeFolderAssociation/);
      expect(source).toMatch(/restoreHomeFolderAssociation/);
      expect(source).toMatch(/withExclusiveTransactionAsync/);
    }
  });
});
