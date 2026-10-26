import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as RouterThemeProvider,
  usePathname,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { AppSafeAreaProvider } from '@/providers';
import { LocalPhotoLibraryProvider } from '@/features/photos/LocalPhotoLibraryProvider';
import { LocalSavedContentProvider } from '@/features/home-content/LocalSavedContentProvider';
import { LocalDocumentLibraryProvider } from '@/features/documents/LocalDocumentLibraryProvider';
import { LocalChecklistLibraryProvider } from '@/features/home-content/LocalChecklistLibraryProvider';
import { HomeSettingsSheetProvider, useHomeSettingsSheet } from '@/features/home-content/HomeSettingsSheetProvider';
import { purgeExpiredRecentlyDeletedItems } from '@/features/home-trash/trashLibrary';
import { HomeViewModeProvider } from '@/features/home-content/HomeViewModeProvider';
import { SaveLinkDynamicIslandProvider } from '@/features/dynamic-island/SaveLinkDynamicIslandProvider';
import { LocalHomeFolderProvider, useLocalHomeFolders } from '@/features/home-folders/LocalHomeFolderProvider';
import { shouldCoverAppSwitcherPreview } from '@/features/home-folders/appSwitcherPrivacy';
import { ThemeProvider, useAppTheme } from '@/theme';

function NavigationRoot() {
  const { resolvedMode, theme } = useAppTheme();
  const { protectedTrashContentVisible } = useHomeSettingsSheet();
  const pathname = usePathname();
  const { folderIdByItemKey, folders, isAppActive, isReady, selection } = useLocalHomeFolders();
  const shouldCoverPreview = shouldCoverAppSwitcherPreview({
    pathname,
    selection,
    folders,
    folderIdByItemKey,
    isFolderCatalogReady: isReady,
    hasAuthorizedProtectedTrashContent: protectedTrashContentVisible,
  });
  const supportsAppleZoom = Platform.OS === 'ios' && Number(Platform.Version) >= 18;
  const navigationTheme = useMemo(() => {
    const base = resolvedMode === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.primary,
        background: theme.colors.background,
        card: theme.colors.surface,
        text: theme.colors.textPrimary,
        border: theme.colors.separator,
        notification: theme.colors.info,
      },
    };
  }, [resolvedMode, theme]);

  useEffect(() => {
    let isRunning = false;
    const purgeExpired = async () => {
      if (isRunning) return;
      isRunning = true;
      try {
        await purgeExpiredRecentlyDeletedItems();
      } catch {
        // Keep expired entries in the trash and retry on the next active lifecycle event.
      } finally {
        isRunning = false;
      }
    };

    void purgeExpired();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void purgeExpired();
    });
    return () => subscription.remove();
  }, []);

  return (
    <RouterThemeProvider value={navigationTheme}>
      <View style={{ flex: 1 }}>
        <StatusBar style={resolvedMode === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            animation: 'default',
            contentStyle: { backgroundColor: theme.colors.background },
            gestureEnabled: true,
            headerShadowVisible: false,
            headerShown: true,
            headerTitle: '',
            headerTransparent: true,
          }}
        >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="links/compose"
          options={{
            animation: 'default',
            contentStyle: { backgroundColor: theme.colors.background },
            gestureEnabled: true,
            headerShown: false,
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="folders/[id]"
          options={{
            animation: 'default',
            contentStyle: { backgroundColor: theme.colors.background },
            gestureEnabled: true,
            headerLargeTitle: false,
            headerShown: true,
            headerShadowVisible: false,
            headerTintColor: theme.colors.textPrimary,
            headerTitle: '',
            headerTransparent: true,
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="settings-sheet-fallback"
          options={{
            contentStyle: { backgroundColor: theme.colors.background },
            gestureEnabled: true,
            headerShown: false,
            presentation: 'formSheet',
            sheetAllowedDetents: [1],
            sheetGrabberVisible: true,
            sheetInitialDetentIndex: 0,
          }}
        />
        <Stack.Screen name="details/[id]" options={{ headerLargeTitle: false }}>
          <Stack.Screen.BackButton displayMode="minimal" />
        </Stack.Screen>
        <Stack.Screen
          name="texts/compose"
          options={{
            animation: 'default',
            contentStyle: { backgroundColor: theme.colors.background },
            gestureEnabled: true,
            headerBackTitle: '',
            headerShadowVisible: false,
            headerShown: true,
            headerStyle: { backgroundColor: theme.colors.background },
            headerTintColor: theme.colors.textPrimary,
            headerTitle: '',
            headerTransparent: false,
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="texts/[id]"
          options={{
            headerLargeTitle: false,
            headerShown: true,
            headerShadowVisible: false,
            headerTintColor: theme.colors.textPrimary,
            headerTitle: '',
            headerTransparent: true,
          }}
        />
        <Stack.Screen
          name="documents/[id]"
          options={{
            headerShown: true,
            headerShadowVisible: false,
            headerTintColor: theme.colors.textPrimary,
            headerTitle: '',
            headerTransparent: true,
          }}
        />
        <Stack.Screen
          name="checklists/compose"
          options={{
            animation: 'default',
            contentStyle: { backgroundColor: theme.colors.background },
            gestureEnabled: true,
            headerBackTitle: '',
            headerShadowVisible: false,
            headerShown: true,
            headerStyle: { backgroundColor: theme.colors.background },
            headerTintColor: theme.colors.textPrimary,
            headerTitle: 'Nova lista',
            headerTransparent: false,
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="checklists/[id]"
          options={{
            animation: 'default',
            contentStyle: { backgroundColor: theme.colors.background },
            gestureEnabled: true,
            headerBackTitle: '',
            headerShadowVisible: false,
            headerShown: true,
            headerTintColor: theme.colors.textPrimary,
            headerTitle: '',
            headerTransparent: true,
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="photos/[id]"
          options={{
            gestureEnabled: true,
            ...(supportsAppleZoom ? { presentation: 'fullScreenModal' as const } : {}),
            ...(Platform.OS === 'ios' && Number(Platform.Version) < 18
              ? {
                  animation: 'slide_from_bottom' as const,
                  gestureDirection: 'vertical' as const,
                }
              : {}),
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="videos/[id]"
          options={{
            gestureEnabled: true,
            ...(Platform.OS === 'ios' && Number(Platform.Version) >= 18
              ? {}
              : {
                  gestureDirection: 'vertical' as const,
                  fullScreenGestureEnabled: true,
                  animation: 'slide_from_bottom' as const,
                  animationMatchesGesture: true,
                }),
            headerBackVisible: Platform.OS !== 'ios',
            headerShadowVisible: false,
            headerShown: true,
            headerStyle: { backgroundColor: '#000000' },
            headerTintColor: '#FFFFFF',
            headerTitle: '',
            headerTransparent: false,
          }}
        />
        </Stack>
        {!isAppActive && shouldCoverPreview ? (
          <View
            accessibilityViewIsModal
            importantForAccessibility="yes"
            pointerEvents="auto"
            style={{
              ...StyleSheet.absoluteFill,
              backgroundColor: theme.colors.background,
              elevation: 1000,
              zIndex: 1000,
            }}
          />
        ) : null}
      </View>
    </RouterThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <AppSafeAreaProvider>
          <ThemeProvider>
            <LocalPhotoLibraryProvider>
              <LocalSavedContentProvider>
                <LocalDocumentLibraryProvider>
                  <LocalChecklistLibraryProvider>
                    <LocalHomeFolderProvider>
                      <SaveLinkDynamicIslandProvider>
                        <HomeSettingsSheetProvider>
                          <HomeViewModeProvider>
                            <NavigationRoot />
                          </HomeViewModeProvider>
                        </HomeSettingsSheetProvider>
                      </SaveLinkDynamicIslandProvider>
                    </LocalHomeFolderProvider>
                  </LocalChecklistLibraryProvider>
                </LocalDocumentLibraryProvider>
              </LocalSavedContentProvider>
            </LocalPhotoLibraryProvider>
          </ThemeProvider>
        </AppSafeAreaProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
