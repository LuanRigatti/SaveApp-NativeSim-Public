import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import {
  createContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { darkTheme } from './darkTheme';
import { lightTheme } from './lightTheme';
import { clearLegacyThemePreference, resolveSystemThemeMode } from './systemAppearance';
import type { ThemeContextValue } from './types';

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

  useEffect(() => {
    void clearLegacyThemePreference(AsyncStorage);
  }, []);

  useEffect(() => {
    let isMounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (isMounted) {
        setReduceMotionEnabled(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  const resolvedMode = resolveSystemThemeMode(systemScheme);
  const theme = resolvedMode === 'dark' ? darkTheme : lightTheme;

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedMode,
      reduceMotionEnabled,
    }),
    [reduceMotionEnabled, resolvedMode, theme],
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}
