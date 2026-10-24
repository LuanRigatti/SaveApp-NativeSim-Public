import { DarkTheme, DefaultTheme, Stack, ThemeProvider as RouterThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { AppSafeAreaProvider } from '@/providers';
import { LocalPhotoLibraryProvider } from '@/features/photos/LocalPhotoLibraryProvider';
import { LocalSavedContentProvider } from '@/features/home-content/LocalSavedContentProvider';
import { ThemeProvider, useAppTheme } from '@/theme';

function NavigationRoot() {
  const { resolvedMode, theme } = useAppTheme();
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

  return (
    <RouterThemeProvider value={navigationTheme}>
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
        <Stack.Screen name="details/[id]" options={{ headerLargeTitle: false }}>
          <Stack.Screen.BackButton displayMode="minimal" />
        </Stack.Screen>
        <Stack.Screen
          name="texts/[id]"
          options={{
            headerLargeTitle: false,
            headerShown: true,
            headerStyle: { backgroundColor: theme.colors.background },
            headerTintColor: theme.colors.textPrimary,
            headerTitle: 'Texto',
            headerTransparent: false,
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
                <NavigationRoot />
              </LocalSavedContentProvider>
            </LocalPhotoLibraryProvider>
          </ThemeProvider>
        </AppSafeAreaProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
