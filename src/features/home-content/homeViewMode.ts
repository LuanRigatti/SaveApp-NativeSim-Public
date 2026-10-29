import type { HomeGalleryEntry } from './homeContentTypes';

export const HOME_VIEW_MODE_STORAGE_KEY = '@saveapp/home-view-mode';

export type HomeViewMode = 'list' | 'compact-list' | 'single-line' | 'small' | 'large';

export const DEFAULT_HOME_VIEW_MODE: HomeViewMode = 'list';

export type HomeViewModeStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export function isHomeViewMode(value: string | null | undefined): value is HomeViewMode {
  return (
    value === 'list' ||
    value === 'compact-list' ||
    value === 'single-line' ||
    value === 'small' ||
    value === 'large'
  );
}

export function getHomeViewLayout(mode: HomeViewMode) {
  switch (mode) {
    case 'list':
      return { key: 'home-gallery-list', masonry: false, numColumns: 1 } as const;
    case 'compact-list':
      return { key: 'home-gallery-compact-list', masonry: false, numColumns: 1 } as const;
    case 'single-line':
      return { key: 'home-gallery-single-line', masonry: false, numColumns: 1 } as const;
    case 'small':
      return { key: 'home-gallery-small', masonry: false, numColumns: 2 } as const;
    case 'large':
    default:
      return { key: 'home-gallery-large', masonry: false, numColumns: 2 } as const;
  }
}

export type HomeGridCardMode = 'large' | 'small';

export type HomeGridCardMetrics = {
  columns: 2;
  width: number;
  height: number;
  previewHeight: number;
  contentHeight: number;
};

const COMPACT_GRID_CARD_SCALE = 0.9;
const COMPACT_GRID_CARD_PREVIEW_BASE_SIZE = 58;
const COMPACT_GRID_CARD_HEIGHT_BASE_SIZE = 108;
const LARGE_GRID_CARD_SCALE = 0.9;
const LARGE_GRID_CARD_VERTICAL_COMPACT_RATIO = 0.84;
const LARGE_GRID_CARD_PREVIEW_WIDTH_RATIO = 0.78;
const LARGE_GRID_CARD_CONTENT_TEXT_HEIGHT = 78;
const LARGE_GRID_CARD_CONTENT_VERTICAL_SPACE = 16;

export function getHomeGridCardMetrics(
  mode: HomeGridCardMode,
  viewportWidth: number,
  horizontalPadding: number,
  horizontalMargin: number,
  fontScale = 1,
): HomeGridCardMetrics {
  const columns = 2;
  const safeViewportWidth = Number.isFinite(viewportWidth) ? Math.max(1, viewportWidth) : 1;
  const safeHorizontalPadding = Number.isFinite(horizontalPadding) ? Math.max(0, horizontalPadding) : 0;
  const safeHorizontalMargin = Number.isFinite(horizontalMargin) ? Math.max(0, horizontalMargin) : 0;
  const safeFontScale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const width = Math.max(
    1,
    (safeViewportWidth - safeHorizontalPadding * 2 - safeHorizontalMargin * 2 * columns) / columns,
  );
  const isCompact = mode === 'small';
  const largeBasePreviewHeight = Math.max(1, Math.round(width * LARGE_GRID_CARD_PREVIEW_WIDTH_RATIO));
  const largeBaseContentHeight = Math.max(
    Math.round(width * 0.77),
    Math.ceil(98 * safeFontScale),
  );
  const largeCompactedHeight = Math.ceil(
    (largeBasePreviewHeight + largeBaseContentHeight) * LARGE_GRID_CARD_VERTICAL_COMPACT_RATIO,
  );
  const largeScaledHeight = Math.ceil(largeCompactedHeight * LARGE_GRID_CARD_SCALE);
  const largePreviewHeight = Math.max(1, Math.round(largeBasePreviewHeight * LARGE_GRID_CARD_SCALE));
  const largeMinimumContentHeight = Math.ceil(
    LARGE_GRID_CARD_CONTENT_TEXT_HEIGHT * safeFontScale + LARGE_GRID_CARD_CONTENT_VERTICAL_SPACE,
  );
  const largeContentHeight = Math.max(
    largeMinimumContentHeight,
    largeScaledHeight - largePreviewHeight,
  );
  const previewHeight = isCompact
    ? Math.max(
        1,
        Math.min(
          Math.round(COMPACT_GRID_CARD_PREVIEW_BASE_SIZE * COMPACT_GRID_CARD_SCALE),
          Math.round(width / 3),
        ),
      )
    : largePreviewHeight;
  const height = isCompact
    ? Math.max(
        Math.ceil(COMPACT_GRID_CARD_HEIGHT_BASE_SIZE * COMPACT_GRID_CARD_SCALE),
        Math.ceil((92 * safeFontScale + 16) * COMPACT_GRID_CARD_SCALE),
      )
    : previewHeight + largeContentHeight;
  const contentHeight = isCompact ? Math.max(1, height - 16) : largeContentHeight;

  return {
    columns,
    width: isCompact ? width : width * LARGE_GRID_CARD_SCALE,
    height,
    previewHeight,
    contentHeight,
  };
}

export function getHomeListMetrics(mode: HomeViewMode, fontScale = 1) {
  if (mode === 'single-line') {
    const accessibleFontScale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;

    return {
      rowHeight: Math.max(52, Math.ceil(24 * accessibleFontScale + 16)),
      thumbnailSize: 34,
    } as const;
  }

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
