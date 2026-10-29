/* global describe, expect, test, __dirname */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const readSource = (path) => readFileSync(join(__dirname, path), 'utf8');
const tabsLayoutSource = readSource('../src/app/(tabs)/_layout.tsx');
const homeSource = readSource('../src/app/(tabs)/index.tsx');
const rootLayoutSource = readSource('../src/app/_layout.tsx');
const homeToolbarMenuSource = readSource('../src/features/home-folders/homeFolderToolbarMenu.tsx');
const hapticsSource = readSource('../src/utils/haptics.ts');
const sheetProviderSource = readSource(
  '../src/features/home-content/HomeSettingsSheetProvider.tsx',
);
const swiftUISheetSource = readSource('../src/components/native/HomeSettingsBottomSheet.ios.tsx');
const fallbackSource = readSource('../src/app/settings-sheet-fallback.tsx');
const storageUsageSource = readSource('../src/features/storage/storageUsage.ts');
const storageUsageServiceSource = readSource('../src/features/storage/storageUsageService.ts');
const storageUsageHookSource = readSource('../src/features/storage/useStorageUsage.ts');

describe('native Home shell controls', () => {
  test('hides the NativeTabs bar without removing its four existing routes', () => {
    const nativeTabs = tabsLayoutSource.match(/<NativeTabs\s+hidden=\{Platform\.OS === 'ios'\}[\s\S]*?<\/NativeTabs>/)?.[0] ?? '';
    const triggers = [...nativeTabs.matchAll(/<NativeTabs\.Trigger name="([^"]+)"/g)].map(
      ([, name]) => name,
    );

    expect(triggers).toEqual(['index', 'collections', 'search', 'settings']);
    expect(tabsLayoutSource).toMatch(/hidden=\{Platform\.OS === 'ios'\}/);
    expect(nativeTabs).not.toMatch(/NativeTabs\.Trigger name="(?:index|collections|search|settings)" hidden/);
  });

  test('keeps the settings gear and uses the native folder and layout menu in the toolbar', () => {
    expect(tabsLayoutSource).toMatch(
      /<Stack\.Toolbar placement="left">[\s\S]*?<Stack\.Toolbar\.Button[\s\S]*?accessibilityLabel="Configurações"[\s\S]*?icon="gearshape"[\s\S]*?onPress=\{handleSettingsPress\}/,
    );
    expect(tabsLayoutSource).toMatch(/hidden=\{!shouldShowHomeToolbarItems\}/);
    expect(tabsLayoutSource).toMatch(/<Stack\.Toolbar placement="right">[\s\S]*?\{createHomeFolderToolbarMenu\([\s\S]*?hidden: !shouldShowHomeToolbarItems/);
    expect(tabsLayoutSource).not.toMatch(/<HomeFolderToolbarMenu\b/);
    expect(homeToolbarMenuSource).toContain('accessibilityLabel={`Selecionar pasta. Atual: ${currentLabel}.`}');
    expect(homeToolbarMenuSource).toMatch(/<Stack\.Toolbar\.Menu[\s\S]*?icon="folder"[\s\S]*?tintColor=\{tintColor\}/);
    expect(homeToolbarMenuSource).not.toMatch(/<Stack\.Toolbar\.View|<Host|@expo\/ui\/swift-ui|frame\(/);
    expect(homeToolbarMenuSource).toMatch(/<Stack\.Toolbar\.Menu icon="square\.grid\.2x2" title="Visualização">[\s\S]*?Maiores[\s\S]*?Menores[\s\S]*?Lista compacta[\s\S]*?Linha única/);
    expect(tabsLayoutSource).not.toMatch(/<Stack\.Toolbar\.Menu[\s\S]*?Adicionar imagens/);
  });

  test('fires a non-blocking light haptic before opening Settings', () => {
    const settingsHandler = tabsLayoutSource.match(
      /const handleSettingsPress = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[openSettingsSheet, router\]\);/,
    )?.[0] ?? '';

    expect(settingsHandler).toMatch(/triggerLightImpactHaptic\(\);[\s\S]*?openSettingsSheet\(\)/);
    expect(settingsHandler).toMatch(/router\.push\('\/settings-sheet-fallback'\)/);
    expect(settingsHandler).not.toMatch(/await triggerLightImpactHaptic/);
    expect(hapticsSource).toMatch(/Haptics\.impactAsync\(Haptics\.ImpactFeedbackStyle\.Light\)\.catch\(\(\) => undefined\)/);
  });

  test('keeps folder menu haptics on selections because native menu has no open callback', () => {
    const menuOpening = homeToolbarMenuSource.match(/<Stack\.Toolbar\.Menu[\s\S]*?>/)?.[0] ?? '';

    expect(menuOpening).not.toMatch(/onPress|onOpenChange|triggerSelectionHaptic/);
    expect(homeToolbarMenuSource).toMatch(/function withSelectionHaptic\(action: \(\) => void\): \(\) => void \{[\s\S]*?triggerSelectionHaptic\(\);[\s\S]*?action\(\);/);
    expect(homeToolbarMenuSource.match(/onPress=\{withSelectionHaptic\(/g) ?? []).toHaveLength(9);
  });

  test('uses a mounted SwiftUI Host and the native settings sheet with folder navigation', () => {
    expect(sheetProviderSource).toMatch(/HomeSettingsBottomSheet\.ios/);
    expect(sheetProviderSource).toMatch(/getNativeCapabilities\(\)\.canUseNativeSwiftUI/);
    expect(sheetProviderSource).toMatch(/openSettingsSheet/);
    expect(sheetProviderSource).toMatch(/onIsPresentedChange=\{setIsPresented\}/);
    expect(rootLayoutSource).toMatch(/<HomeSettingsSheetProvider>[\s\S]*?<NavigationRoot \/>[\s\S]*?<\/HomeSettingsSheetProvider>/);

    expect(swiftUISheetSource).toMatch(/<Host[\s\S]*?pointerEvents="none"/);
    expect(swiftUISheetSource).toMatch(
      /style=\{\{ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 \}\}/,
    );
    expect(swiftUISheetSource).toMatch(/<BottomSheet[\s\S]*?isPresented=\{isPresented\}/);
    expect(swiftUISheetSource).toMatch(/onIsPresentedChange=\{updatePresentation\}/);
    expect(swiftUISheetSource).toMatch(/setPath\(initialPage === 'folders' \? \['folders'\] : initialPage === 'tags' \? \['tags'\] : \[\]\)/);
    expect(swiftUISheetSource).toMatch(/onDismiss=\{dismiss\}/);
    expect(swiftUISheetSource).toMatch(/presentationDetents\(\['large'\]\)/);
    expect(swiftUISheetSource).toMatch(/presentationDragIndicator\('visible'\)/);
    expect(swiftUISheetSource).toMatch(/<Group[\s\S]*?>[\s\S]*?<NavigationStack[\s\S]*?<NavigationDestination value="folders">[\s\S]*?<\/NavigationStack>[\s\S]*?<\/Group>/);
    expect(swiftUISheetSource).not.toMatch(/<View|<RNHostView|<Pressable|<Modal|gorhom|Reanimated/);
  });

  test('keeps appearance controls in the same native SwiftUI navigation and applies changes immediately', () => {
    expect(swiftUISheetSource).toMatch(/<NavigationLink value="appearance">[\s\S]*?Aparência/);
    expect(swiftUISheetSource).toMatch(/<NavigationDestination value="appearance">[\s\S]*?<AppearanceSettingsPage\s*\/>/);
    expect(swiftUISheetSource).toContain('selection={appearanceMode}');
    expect(swiftUISheetSource).toContain('onSelectionChange={(mode) => {');
    expect(swiftUISheetSource).toMatch(/tag\('system'\)[\s\S]*?tag\('light'\)[\s\S]*?tag\('dark'\)/);
    expect(swiftUISheetSource).toContain('getAccentColorSwatch(id, resolvedMode)');
    expect(swiftUISheetSource).toContain('setAccentColor(id)');
    expect(swiftUISheetSource).toContain('Restaurar cor padrão');
    expect(swiftUISheetSource).toContain('colorScheme={resolvedMode}');
    expect(swiftUISheetSource).toContain('seedColor={theme.colors.primary}');
    expect(swiftUISheetSource).toMatch(/Image color=\{theme\.colors\.primary\} size=\{18\} systemName="folder"/);
  });

  test('retains a native form sheet fallback with folder management', () => {
    expect(tabsLayoutSource).toMatch(/router\.push\('\/settings-sheet-fallback'\)/);
    expect(rootLayoutSource).toMatch(/name="settings-sheet-fallback"[\s\S]*?presentation: 'formSheet'[\s\S]*?sheetAllowedDetents: \[1\][\s\S]*?sheetGrabberVisible: true/);
    expect(fallbackSource).toMatch(/SettingsSheetFallbackContent key=\{initialPage\} initialPage=\{initialPage\}/);
    expect(fallbackSource).toContain('Criar pasta');
    expect(fallbackSource).toContain('Excluir pasta');
    expect(fallbackSource).toContain('Aparência');
    expect(fallbackSource).toContain('COR DO APLICATIVO');
    expect(fallbackSource).toContain('Os conteúdos continuarão salvos');
  });

  test('adds local storage usage to the existing native settings navigation and fallback', () => {
    expect(swiftUISheetSource).toMatch(/<NavigationLink value="storage">[\s\S]*?Armazenamento[\s\S]*?<\/NavigationLink>/);
    expect(swiftUISheetSource).toMatch(/<NavigationDestination value="storage">[\s\S]*?<StorageUsagePage isActive=\{isPresented && path\.at\(-1\) === 'storage'\}/);
    expect(swiftUISheetSource).toMatch(/Total do SaveApp[\s\S]*?Fotos[\s\S]*?Vídeos[\s\S]*?Documentos[\s\S]*?Outros dados/);
    expect(swiftUISheetSource).toContain('banco SQLite, miniaturas e prévias');
    expect(swiftUISheetSource).toContain('Arquivos em Apagados recentemente continuam contando até a exclusão definitiva');
    expect(fallbackSource).toMatch(/onPress=\{\(\) => setCurrentPage\('storage'\)\}[\s\S]*?Armazenamento/);
    expect(fallbackSource).toContain("useStorageUsage(currentPage === 'storage')");
  });

  test('adds Recently Deleted to native settings and the React Native fallback', () => {
    expect(swiftUISheetSource).toMatch(/<NavigationLink value="recently-deleted">[\s\S]*?Apagados recentemente[\s\S]*?<\/NavigationLink>/);
    expect(swiftUISheetSource).toMatch(/<NavigationDestination value="recently-deleted">[\s\S]*?<RecentlyDeletedPage isActive=\{isPresented && path\.at\(-1\) === 'recently-deleted'\}/);
    expect(fallbackSource).toMatch(/setCurrentPage\('recently-deleted'\)[\s\S]*?Apagados recentemente/);
    expect(fallbackSource).toContain('useRecentlyDeletedItems(currentPage === \'recently-deleted\')');
  });

  test('trash rows expose native actions by long press without a visible trigger or preview', () => {
    const nativePage = swiftUISheetSource.match(
      /function RecentlyDeletedPage\([\s\S]*?(?=\nfunction FolderListPage)/,
    )?.[0] ?? '';
    const fallbackPage = fallbackSource.match(
      /\) : currentPage === 'recently-deleted' \? \([\s\S]*?\n      \) : currentPage === 'folders' \? \(/,
    )?.[0] ?? '';
    const fallbackMenuHelper = fallbackSource.match(
      /function showRecentlyDeletedItemMenu\([\s\S]*?\n}\n/,
    )?.[0] ?? '';
    const fallbackItemRow = fallbackPage.match(
      /return \(\s*<Pressable\s+key=\{`\$\{item\.itemType\}:\$\{item\.itemId\}`\}[\s\S]*?\n\s*<\/Pressable>\n\s*\);/,
    )?.[0] ?? '';

    expect(nativePage).toMatch(/<Text modifiers=\{\[foregroundStyle\(theme\.colors\.textPrimary\), lineLimit\(2\)\]\}>\{title\}<\/Text>/);
    expect(nativePage).toMatch(/<ContextMenu key=\{`\$\{item\.itemType\}:\$\{item\.itemId\}`\}>[\s\S]*?<ContextMenu\.Items>[\s\S]*?<Button[\s\S]*?label="Restaurar"[\s\S]*?onPress=\{\(\) => void restore\(item\)\}[\s\S]*?systemImage="arrow\.uturn\.backward"[\s\S]*?<Button[\s\S]*?label="Apagar definitivamente"[\s\S]*?role="destructive"[\s\S]*?systemImage="trash"[\s\S]*?<\/ContextMenu\.Items>[\s\S]*?<ContextMenu\.Trigger>[\s\S]*?<HStack[\s\S]*?<Spacer \/>[\s\S]*?<\/HStack>[\s\S]*?<\/ContextMenu\.Trigger>[\s\S]*?<\/ContextMenu>/);
    expect(nativePage).not.toMatch(/ContextMenu\.Preview|Teste A\/B|menuUsesGlass|Ações do conteúdo apagado|systemImage="ellipsis"/);
    expect(nativePage).not.toMatch(/<Menu\b/);
    expect(nativePage).toContain("accessibilityHint('Toque e segure para restaurar ou apagar definitivamente.')");
    expect(nativePage).toContain("label=\"Restaurar tudo\"");
    expect(nativePage).toContain("label=\"Apagar tudo\"");
    expect(nativePage).toContain('void restoreAll()');
    expect(nativePage).toContain('setPendingDeleteAll(true)');
    expect(nativePage).toContain('permanentlyDeleteAll()');
    expect(nativePage).toContain('Os ${items.length} conteúdos serão removidos');
    expect(nativePage).toMatch(/<SwiftUIAlert[\s\S]*?title=\{pendingDeleteAll \? 'Apagar tudo\?' : 'Apagar item\?'\}[\s\S]*?<SwiftUIAlert\.Message>[\s\S]*?não poderão ser restaurados\.[\s\S]*?<SwiftUIAlert\.Actions>[\s\S]*?<Button[\s\S]*?label="Cancelar"[\s\S]*?role="cancel"[\s\S]*?<Button[\s\S]*?label=\{pendingDeleteAll \? 'Apagar tudo' : 'Apagar'\}[\s\S]*?if \(deleteAll\) void permanentlyDeleteAll\(\);[\s\S]*?else if \(item\) void permanentlyDelete\(item\)[\s\S]*?role="destructive"/);
    expect(nativePage).toMatch(/<Button[\s\S]*?label="Cancelar"[\s\S]*?setPendingDeletion\(null\);[\s\S]*?setPendingDeleteAll\(false\)[\s\S]*?role="cancel"/);
    expect(nativePage).not.toMatch(/ConfirmationDialog|Alert\.alert|router\.(back|replace|push)|setPath\(/);
    expect(nativePage).toContain('operationError');

    expect(fallbackPage).toContain('numberOfLines={2}');
    expect(fallbackItemRow).toContain('onLongPress={openActions}');
    expect(fallbackItemRow).toContain("name: 'longpress'");
    expect(fallbackItemRow).toContain('Abrir ações');
    expect(fallbackItemRow).not.toMatch(/\bonPress=/);
    expect(fallbackItemRow).not.toContain('ellipsis-horizontal');
    expect(fallbackItemRow).not.toMatch(/<Text[^>]*>\s*(?:Restaurar|Apagar definitivamente)\s*<\/Text>/);
    expect(fallbackPage).not.toMatch(/setCurrentPage\(|router\.(back|replace|push)/);
    expect(fallbackPage).toContain('accessibilityLabel="Restaurar tudo"');
    expect(fallbackPage).toContain('accessibilityLabel="Apagar tudo definitivamente"');
    expect(fallbackPage).toContain('recentlyDeleted.restoreAll()');
    expect(fallbackPage).toContain('recentlyDeleted.permanentlyDeleteAll()');
    expect(fallbackPage).toContain("'Apagar tudo'");
    expect(fallbackPage).toContain("{ text: 'Cancelar', style: 'cancel' }");
    expect(fallbackMenuHelper).toContain('ActionSheetIOS.showActionSheetWithOptions');
    expect(fallbackMenuHelper).not.toContain('Autenticar para ver');
    expect(fallbackMenuHelper).toContain("{ label: 'Restaurar'");
    expect(fallbackMenuHelper).toContain("{ label: 'Apagar definitivamente'");
    expect(fallbackMenuHelper).toContain("{ text: 'Cancelar', style: 'cancel' as const }");
    expect(fallbackSource).toMatch(/onPermanentlyDelete: \(selectedItem\) => Alert\.alert\([\s\S]*?text: 'Cancelar',[\s\S]*?text: 'Apagar definitivamente',[\s\S]*?recentlyDeleted\.permanentlyDelete\(selectedItem\)/);
    const trashHookSource = readSource('../src/features/home-trash/useRecentlyDeletedItems.ts');
    expect(trashHookSource).toContain("const runBulkOperation = useCallback(async (action: 'restore' | 'delete') =>");
    expect(trashHookSource).toContain('const restoreAll = useCallback(() => runBulkOperation(\'restore\')');
    expect(trashHookSource).toContain('const permanentlyDeleteAll = useCallback(() => runBulkOperation(\'delete\')');
    expect(trashHookSource).toContain('const protectedFolderIds = [...new Set(');
    expect(trashHookSource).toContain('if (isBulkOperationPending || isLoading || items.length === 0) return;');
    expect(trashHookSource).toContain("authenticateWithFaceId('Autentique para modificar conteúdos protegidos.')");
    expect(trashHookSource).toContain('await restoreRecentlyDeletedItem(item.itemType, item.itemId)');
    expect(trashHookSource).toContain('await permanentlyDeleteRecentlyDeletedItem(item.itemType, item.itemId)');
    expect(trashHookSource).toContain('Alguns conteúdos não puderam ser processados e continuam em Apagados recentemente.');
    const authorizeBatchIndex = trashHookSource.indexOf('for (const folderId of protectedFolderIds)');
    const mutateBatchIndex = trashHookSource.indexOf('for (const item of batchItems)', authorizeBatchIndex);
    expect(authorizeBatchIndex).toBeGreaterThan(-1);
    expect(mutateBatchIndex).toBeGreaterThan(authorizeBatchIndex);
  });

  test('permanent trash deletion reports failure without navigating away or hiding the item', () => {
    const trashHookSource = readSource('../src/features/home-trash/useRecentlyDeletedItems.ts');
    const deleteHandler = trashHookSource.match(/const permanentlyDelete = useCallback\([\s\S]*?\n  \}, \[authorizeItem, isBulkOperationPending, refresh\]\);/)?.[0] ?? '';

    expect(deleteHandler).toContain('permanentlyDeleteRecentlyDeletedItem(item.itemType, item.itemId)');
    expect(deleteHandler).toContain('remainingItems.some((candidate) => candidate.itemType === item.itemType && candidate.itemId === item.itemId)');
    expect(deleteHandler).toContain('setOperationError(');
    expect(deleteHandler).toMatch(/await refresh\(\);\s*return true;/);
    expect(deleteHandler).not.toMatch(/router\.(back|replace|push)|setPath\(/);
  });

  test('measures accessible file sizes asynchronously without reading names or file contents into UI', () => {
    expect(storageUsageServiceSource).toContain("from 'expo-file-system/legacy'");
    expect(storageUsageServiceSource).toContain('readDirectoryAsync');
    expect(storageUsageServiceSource).toContain('getInfoAsync');
    expect(storageUsageServiceSource).toContain('Paths.document.uri');
    expect(storageUsageServiceSource).toContain('Paths.cache.uri');
    expect(storageUsageSource).toMatch(/totals\[category\] \+= info\.size/);
    expect(storageUsageSource).toMatch(/photos === null \|\| videos === null \|\| documents === null \|\| other === null/);
    expect(storageUsageHookSource).toContain("AppState.addEventListener('change'");
    expect(storageUsageHookSource).toContain("nextState === 'active'");
    expect(storageUsageSource).not.toMatch(/console\.(log|info|warn|error)/);
  });

  test('moves the Home feed padding from the hidden tab bar to the native bottom action', () => {
    expect(homeSource).toMatch(/paddingBottom: insets\.bottom \+ theme\.sizes\.touchTargetMinimum \+ theme\.spacing\.md/);
    expect(homeSource).not.toMatch(/theme\.layout\.tabBarHeight/);
  });
});
