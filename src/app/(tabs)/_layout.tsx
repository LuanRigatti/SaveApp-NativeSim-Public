import { NativeTabs } from 'expo-router/native-tabs';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Platform, View } from 'react-native';

import { shouldKeepHomeToolbarItemsMounted } from '@/features/home-content/homeToolbarVisibility';
import { useHomeViewMode } from '@/features/home-content/HomeViewModeProvider';
import { useHomeSettingsSheet } from '@/features/home-content/HomeSettingsSheetProvider';
import { createHomeFolderToolbarMenu } from '@/features/home-folders/homeFolderToolbarMenu';
import { getHomeFolderIdFromPathname, getHomeFolderRoute } from '@/features/home-folders/homeFolderNavigation';
import { getFolderAuthenticationFailureMessage } from '@/features/home-folders/folderFaceIdAuthentication';
import { getHomeFolderAccentColor } from '@/features/home-folders/homeFolderColor';
import { useLocalHomeFolders } from '@/features/home-folders/LocalHomeFolderProvider';
import { getNativeCapabilities } from '@/platform/nativeCapabilities';
import { useAppTheme } from '@/theme';
import { triggerLightImpactHaptic, triggerTabHaptic } from '@/utils/haptics';

export default function TabsLayout() {
  return <TabsLayoutContent />;
}

function TabsLayoutContent() {
  const { accentColor, resolvedMode, theme } = useAppTheme();
  const pathname = usePathname();
  const shouldShowHomeToolbarItems = shouldKeepHomeToolbarItemsMounted(pathname);
  const router = useRouter();
  const { setViewMode, viewMode } = useHomeViewMode();
  const { authorizeFolder, folders, isFolderAuthorized, selectFolder, selectView, selection, view } = useLocalHomeFolders();
  const { openSettingsSheet } = useHomeSettingsSheet();
  const routeFolderId = getHomeFolderIdFromPathname(pathname);
  const selectedHomeFolderId = selection.kind === 'folder' ? selection.folderId : null;
  const currentFolderId = routeFolderId ?? selectedHomeFolderId;
  const currentFolder = folders.find((folder) => folder.id === currentFolderId);
  const folderToolbarTint = currentFolder
    ? getHomeFolderAccentColor(currentFolder.color, accentColor, resolvedMode)
    : theme.colors.primary;
  const currentLabel = currentFolder?.name ?? (
    view === 'folders' ? 'Pastas' : 'Todos'
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
    selectView(nextView);
    if (routeFolderId) router.dismissTo('/');
  }, [routeFolderId, router, selectView]);
  const handleFolderPress = useCallback((folderId: string) => {
    void (async () => {
      const outcome = await authorizeFolder(folderId);
      if (outcome !== 'authenticated' || !isFolderAuthorized(folderId)) {
        if (outcome === 'unavailable' || outcome === 'failed') {
          Alert.alert('Pasta protegida', getFolderAuthenticationFailureMessage(outcome));
        }
        return;
      }
      if (routeFolderId) {
        router.replace(getHomeFolderRoute(folderId));
        return;
      }
      selectFolder(folderId);
    })();
  }, [authorizeFolder, isFolderAuthorized, routeFolderId, router, selectFolder]);

  return (
    <View collapsable={false} style={{ flex: 1 }}>
      {Platform.OS === 'ios' ? (
        <>
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
            {createHomeFolderToolbarMenu({
              currentFolderId,
              currentLabel,
              folders,
              hidden: !shouldShowHomeToolbarItems,
              tintColor: folderToolbarTint,
              onOpenFolder: handleFolderPress,
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
