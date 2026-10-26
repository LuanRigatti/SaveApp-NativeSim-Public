import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { darkTheme } from './darkTheme';
import { lightTheme } from './lightTheme';
import {
  APPEARANCE_PREFERENCES_STORAGE_KEY,
  DEFAULT_APPEARANCE_PREFERENCES,
  parseAppearancePreferences,
  serializeAppearancePreferences,
} from './appearancePreferences';
import { getAccentColorTokens, type AccentColorName } from './colors';
import { clearLegacyThemePreference, resolveAppearanceMode } from './systemAppearance';
import type { AppearanceMode, ThemeContextValue } from './types';

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [appearancePreferences, setAppearancePreferences] = useState(DEFAULT_APPEARANCE_PREFERENCES);
  const appearancePreferencesRef = useRef(appearancePreferences);
  const hasUpdatedAppearanceRef = useRef(false);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let isMounted = true;
    void Promise.all([
      AsyncStorage.getItem(APPEARANCE_PREFERENCES_STORAGE_KEY).catch(() => null),
      clearLegacyThemePreference(AsyncStorage),
    ]).then(([storedPreferences]) => {
      if (!isMounted || hasUpdatedAppearanceRef.current) return;
      const restoredPreferences = parseAppearancePreferences(storedPreferences);
      appearancePreferencesRef.current = restoredPreferences;
      setAppearancePreferences(restoredPreferences);
    });

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

  const setAppearancePreference = useCallback((updates: Partial<typeof DEFAULT_APPEARANCE_PREFERENCES>) => {
    hasUpdatedAppearanceRef.current = true;
    const nextPreferences = { ...appearancePreferencesRef.current, ...updates };
    appearancePreferencesRef.current = nextPreferences;
    setAppearancePreferences(nextPreferences);

    persistenceQueueRef.current = persistenceQueueRef.current
      .catch(() => undefined)
      .then(() => AsyncStorage.setItem(
        APPEARANCE_PREFERENCES_STORAGE_KEY,
        serializeAppearancePreferences(nextPreferences),
      ))
      .catch(() => undefined);
  }, []);

  const setAppearanceMode = useCallback((mode: AppearanceMode) => {
    setAppearancePreference({ mode });
  }, [setAppearancePreference]);

  const setAccentColor = useCallback((accentColor: AccentColorName) => {
    setAppearancePreference({ accentColor });
  }, [setAppearancePreference]);

  const resolvedMode = resolveAppearanceMode(appearancePreferences.mode, systemScheme);
  const baseTheme = resolvedMode === 'dark' ? darkTheme : lightTheme;
  const theme = useMemo(() => ({
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      ...getAccentColorTokens(appearancePreferences.accentColor, resolvedMode),
    },
  }), [appearancePreferences.accentColor, baseTheme, resolvedMode]);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      theme,
      appearanceMode: appearancePreferences.mode,
      accentColor: appearancePreferences.accentColor,
      setAppearanceMode,
      setAccentColor,
      resolvedMode,
      reduceMotionEnabled,
    }),
    [appearancePreferences, reduceMotionEnabled, resolvedMode, setAccentColor, setAppearanceMode, theme],
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}
