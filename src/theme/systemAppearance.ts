import type { ColorSchemeName } from 'react-native';

import type { ResolvedThemeMode } from './types';

export const LEGACY_THEME_MODE_STORAGE_KEY = '@saveapp/theme-mode';

type PreferenceStorage = {
  removeItem: (key: string) => Promise<void>;
};

export function resolveSystemThemeMode(systemScheme: ColorSchemeName | null): ResolvedThemeMode {
  return systemScheme === 'dark' ? 'dark' : 'light';
}

export async function clearLegacyThemePreference(storage: PreferenceStorage): Promise<void> {
  try {
    await storage.removeItem(LEGACY_THEME_MODE_STORAGE_KEY);
  } catch {
    // A leftover preference is ignored; clearing it is best-effort only.
  }
}
