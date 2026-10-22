import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, type ColorSchemeName, useColorScheme } from 'react-native';
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { darkTheme } from './darkTheme';
import { lightTheme } from './lightTheme';
import type { ResolvedThemeMode, ThemeContextValue, ThemeMode } from './types';

const THEME_STORAGE_KEY = '@saveapp/theme-mode';

export const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

function resolveThemeMode(mode: ThemeMode, systemScheme: ColorSchemeName | null): ResolvedThemeMode {
  if (mode !== 'system') {
    return mode;
  }

  return systemScheme === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [isReady, setIsReady] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function restoreMode() {
      try {
        const storedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);

        if (isMounted && isThemeMode(storedMode)) {
          setModeState(storedMode);
        }
      } catch {
        // The system preference remains the safe fallback when storage is unavailable.
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    }

    void restoreMode();

    return () => {
      isMounted = false;
    };
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

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode).catch(() => undefined);
  }, []);

  const resolvedMode = resolveThemeMode(mode, systemScheme);
  const theme = resolvedMode === 'dark' ? darkTheme : lightTheme;

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      theme,
      mode,
      resolvedMode,
      isReady,
      reduceMotionEnabled,
      setMode,
    }),
    [isReady, mode, reduceMotionEnabled, resolvedMode, setMode, theme],
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}
