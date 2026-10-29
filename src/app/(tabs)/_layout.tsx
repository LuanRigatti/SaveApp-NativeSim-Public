import { NativeTabs } from 'expo-router/native-tabs';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Platform, View } from 'react-native';

import { shouldKeepHomeToolbarItemsMounted } from '@/features/home-content/homeToolbarVisibility';
import { useHomeViewMode } from '@/features/home-content/HomeViewModeProvider';
import { useHomeFavorites } from '@/features/home-content/HomeFavoritesProvider';
import { HomeSearchProvider, useHomeSearch } from '@/features/home-content/HomeSearchProvider';
import { useHomeSettingsSheet } from '@/features/home-content/HomeSettingsSheetProvider';
import { createHomeFolderToolbarMenu } from '@/features/home-folders/homeFolderToolbarMenu';
import { getHomeCategoryDefinition, type HomeCategory } from '@/features/home-content/homeCategories';
import { getHomeFolderIdFromPathname, getHomeFolderRoute } from '@/features/home-folders/homeFolderNavigation';
import { getFolderAuthenticationFailureMessage } from '@/features/home-folders/folderFaceIdAuthentication';
import { getHomeFolderAccentColor } from '@/features/home-folders/homeFolderColor';
import { useLocalHomeFolders } from '@/features/home-folders/LocalHomeFolderProvider';
import { getNativeCapabilities } from '@/platform/nativeCapabilities';
import { useAppTheme } from '@/theme';
import { supportsNativeHomeSearch } from '@/features/home-content/homeSearch';
import { triggerLightImpactHaptic, triggerSelectionHaptic, triggerTabHaptic } from '@/utils/haptics';

export default function TabsLayout() {
  return (
    <HomeSearchProvider>
      <TabsLayoutContent />
    </HomeSearchProvider>
  );
}

function TabsLayoutContent() {
  const { accentColor, resolvedMode, theme } = useAppTheme();
  const pathname = usePathname();
  const shouldShowHomeToolbarItems = shouldKeepHomeToolbarItemsMounted(pathname);
  const router = useRouter();
  const { setViewMode, viewMode } = useHomeViewMode();
  const { favoritesOnly, isReady: favoritesReady, setFavoritesOnly } = useHomeFavorites();
  const { authorizeFolder, folders, isFolderAuthorized, selectCategory, selectFolder, selectView, selection, view } = useLocalHomeFolders();
  const { openSettingsSheet } = useHomeSettingsSheet();
  const { setSearchQuery } = useHomeSearch();
  const supportsSearchBar = supportsNativeHomeSearch(Platform.OS, Platform.Version);
  const routeFolderId = getHomeFolderIdFromPathname(pathname);
  const selectedHomeFolderId = selection.kind === 'folder' ? selection.folderId : null;
  const selectedCategory = selection.kind === 'category' ? selection.category : null;
  const currentFolderId = routeFolderId ?? selectedHomeFolderId;
  const currentFolder = folders.find((folder) => folder.id === currentFolderId);
  const folderToolbarTint = currentFolder
    ? getHomeFolderAccentColor(currentFolder.color, accentColor, resolvedMode)
    : theme.colors.primary;
  const currentLabel = currentFolder?.name ?? (
    selectedCategory
      ? getHomeCategoryDefinition(selectedCategory).label
      : view === 'folders' ? 'Pastas' : 'Todos'
  );
  const handleSettingsPress = useCallback(() => {
    triggerLightImpactHaptic();
    if (getNativeCapabilities().canUseNativeSwiftUI) {
      openSettingsSheet();
      return;
    }

    router.push('/settings-sheet-fallback');
  }, [openSettingsSheet, router]);
  const handleHomeViewPress = useCallback((nextView: 'all-items' | 'unfiled' | 'folders') => {
    setFavoritesOnly(false);
    selectView(nextView);
    if (routeFolderId) router.dismissTo('/');
  }, [routeFolderId, router, selectView, setFavoritesOnly]);
  const handleCategoryPress = useCallback((category: HomeCategory) => {
    setFavoritesOnly(false);
    selectCategory(category);
    if (routeFolderId) router.dismissTo('/');
  }, [routeFolderId, router, selectCategory, setFavoritesOnly]);
  const handleFolderPress = useCallback((folderId: string) => {
    void (async () => {
      const outcome = await authorizeFolder(folderId);
      if (outcome !== 'authenticated' || !isFolderAuthorized(folderId)) {
        if (outcome === 'unavailable' || outcome === 'failed') {
          Alert.alert('Pasta protegida', getFolderAuthenticationFailureMessage(outcome));
        }
        return;
      }
      setFavoritesOnly(false);
      if (routeFolderId) {
        router.replace(getHomeFolderRoute(folderId));
        return;
      }
      selectFolder(folderId);
    })();
  }, [authorizeFolder, isFolderAuthorized, routeFolderId, router, selectFolder, setFavoritesOnly]);
  const handleFavoritesPress = useCallback(() => {
    triggerSelectionHaptic();
    setFavoritesOnly(!favoritesOnly);
    if (pathname !== '/') router.dismissTo('/');
  }, [favoritesOnly, pathname, router, setFavoritesOnly]);

  return (
    <View collapsable={false} style={{ flex: 1 }}>
      {Platform.OS === 'ios' ? (
        <>
          {supportsSearchBar ? (
            <Stack.SearchBar
              allowToolbarIntegration
              autoCapitalize="none"
              hideWhenScrolling={false}
              obscureBackground={false}
              onCancelButtonPress={() => setSearchQuery('')}
              onChangeText={(event) => setSearchQuery(event.nativeEvent.text)}
              placeholder="Buscar"
              placement="integrated"
            />
          ) : null}
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button
              accessibilityLabel="Configurações"
              hidden={!shouldShowHomeToolbarItems}
              icon="gearshape"
              onPress={handleSettingsPress}
            />
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Spacer width={0} />
            <Stack.Toolbar.Button
              accessibilityHint="Mostra somente os conteúdos marcados como favoritos."
              accessibilityLabel={favoritesOnly ? 'Desativar Favoritos' : 'Mostrar Favoritos'}
              disabled={!favoritesReady}
              hidden={!shouldShowHomeToolbarItems}
              icon={favoritesOnly ? 'star.fill' : 'star'}
              onPress={handleFavoritesPress}
              separateBackground={false}
              selected={favoritesOnly}
              tintColor={theme.colors.primary}
            />
            {createHomeFolderToolbarMenu({
              currentFolderId,
              selectedCategory,
              currentLabel,
              folders,
              hidden: !shouldShowHomeToolbarItems,
              tintColor: folderToolbarTint,
              onOpenFolder: handleFolderPress,
              onSelectCategory: handleCategoryPress,
              onSelectHomeView: handleHomeViewPress,
              onSelectViewMode: setViewMode,
              view,
              viewMode,
            })}
          </Stack.Toolbar>
        </>
      ) : null}
      <NativeTabs
        hidden={Platform.OS === 'ios'}
        labelVisibilityMode="unlabeled"
        screenListeners={{ tabPress: () => triggerTabHaptic() }}
        tintColor={theme.colors.primary}
      >
        <NativeTabs.Trigger name="index" accessibilityLabel="Início">
          <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md={{ default: 'home', selected: 'home_filled' }} />
          <NativeTabs.Trigger.Label hidden>Início</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="collections" accessibilityLabel="Coleções">
          <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} md={{ default: 'grid_view', selected: 'grid_view' }} />
          <NativeTabs.Trigger.Label hidden>Coleções</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="search" accessibilityLabel="Buscar">
          <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
          <NativeTabs.Trigger.Label hidden>Buscar</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings" accessibilityLabel="Ajustes">
          <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md={{ default: 'settings', selected: 'settings' }} />
          <NativeTabs.Trigger.Label hidden>Ajustes</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </View>
  );
}
