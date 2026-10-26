import { ACCENT_COLOR_OPTIONS, type AccentColorName } from './colors';
import type { AppearanceMode } from './types';

export const APPEARANCE_PREFERENCES_STORAGE_KEY = '@saveapp/appearance-preferences-v1';

export type AppearancePreferences = {
  mode: AppearanceMode;
  accentColor: AccentColorName;
};

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
  mode: 'system',
  accentColor: 'black',
};

const appearanceModes = new Set<AppearanceMode>(['system', 'light', 'dark']);
const accentColors = new Set<AccentColorName>(ACCENT_COLOR_OPTIONS.map(({ id }) => id));

export function parseAppearancePreferences(value: string | null): AppearancePreferences {
  if (!value) return DEFAULT_APPEARANCE_PREFERENCES;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_APPEARANCE_PREFERENCES;

    const candidate = parsed as Record<string, unknown>;
    return {
      mode: appearanceModes.has(candidate.mode as AppearanceMode)
        ? (candidate.mode as AppearanceMode)
        : DEFAULT_APPEARANCE_PREFERENCES.mode,
      accentColor: accentColors.has(candidate.accentColor as AccentColorName)
        ? (candidate.accentColor as AccentColorName)
        : DEFAULT_APPEARANCE_PREFERENCES.accentColor,
    };
  } catch {
    return DEFAULT_APPEARANCE_PREFERENCES;
  }
}

export function serializeAppearancePreferences(preferences: AppearancePreferences): string {
  return JSON.stringify(preferences);
}
