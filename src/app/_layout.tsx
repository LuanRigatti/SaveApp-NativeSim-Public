import { DarkTheme, DefaultTheme, Stack, ThemeProvider as RouterThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { AppSafeAreaProvider } from '@/providers';
import { ThemeProvider, useAppTheme } from '@/theme';

function NavigationRoot() {
  const { resolvedMode, theme } = useAppTheme();
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
            <NavigationRoot />
          </ThemeProvider>
        </AppSafeAreaProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
