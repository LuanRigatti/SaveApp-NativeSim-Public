import type { HomeGalleryEntry } from './homeContentTypes';

export const HOME_VIEW_MODE_STORAGE_KEY = '@saveapp/home-view-mode';

export type HomeViewMode = 'list' | 'compact-list' | 'small' | 'large';

export const DEFAULT_HOME_VIEW_MODE: HomeViewMode = 'large';

export type HomeViewModeStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export function isHomeViewMode(value: string | null | undefined): value is HomeViewMode {
  return value === 'list' || value === 'compact-list' || value === 'small' || value === 'large';
}

export function getHomeViewLayout(mode: HomeViewMode) {
  switch (mode) {
    case 'list':
      return { key: 'home-gallery-list', masonry: false, numColumns: 1 } as const;
    case 'compact-list':
      return { key: 'home-gallery-compact-list', masonry: false, numColumns: 1 } as const;
    case 'small':
      return { key: 'home-gallery-small', masonry: true, numColumns: 3 } as const;
    case 'large':
    default:
      return { key: 'home-gallery-large', masonry: true, numColumns: 2 } as const;
  }
}

export function getHomeListMetrics(mode: HomeViewMode, fontScale = 1) {
  if (mode === 'compact-list') {
    const accessibleFontScale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;

    return {
      rowHeight: Math.max(76, Math.ceil(72 * accessibleFontScale)),
      thumbnailSize: 52,
    } as const;
  }

  if (mode === 'list') {
    const accessibleFontScale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;

    return {
      rowHeight: Math.max(96, Math.ceil(38 * accessibleFontScale + 12)),
      thumbnailSize: 72,
    } as const;
  }

  return { rowHeight: 96, thumbnailSize: 72 } as const;
}

export function getHomeGalleryEntrySpan(
  entry: HomeGalleryEntry,
  numColumns: number,
): number | undefined {
  return entry.kind === 'day-separator' ? numColumns : undefined;
}

export async function restoreHomeViewMode(storage: HomeViewModeStorage): Promise<HomeViewMode> {
  try {
    const storedMode = await storage.getItem(HOME_VIEW_MODE_STORAGE_KEY);
    return isHomeViewMode(storedMode) ? storedMode : DEFAULT_HOME_VIEW_MODE;
  } catch {
    return DEFAULT_HOME_VIEW_MODE;
  }
}

export async function persistHomeViewMode(
  mode: HomeViewMode,
  storage: HomeViewModeStorage,
): Promise<void> {
  try {
    await storage.setItem(HOME_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // The selected mode remains usable for this session if storage is unavailable.
  }
}
