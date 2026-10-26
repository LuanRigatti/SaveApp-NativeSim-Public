import type { SavedMedia } from '@/features/photos/photoTypes';

import type { HomeGalleryEntry, SavedHomeItem } from './homeContentTypes';
import { getSavedHomeItemKey } from './homeContentTypes';

export function getLocalDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

export function formatLocalDayTitle(timestamp: number, now: Date = new Date()): string {
  const dayKey = getLocalDayKey(timestamp);
  if (dayKey === getLocalDayKey(now.getTime())) {
    return 'Hoje';
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey === getLocalDayKey(yesterday.getTime())) {
    return 'Ontem';
  }

  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(
    new Date(timestamp),
  );
}

function compareStableIds(first: SavedHomeItem, second: SavedHomeItem): number {
  if ('mediaType' in first && 'mediaType' in second && first.mediaType === second.mediaType) {
    return second.id - first.id;
  }

  if (!('mediaType' in first) && !('mediaType' in second) && first.contentType === second.contentType) {
    return second.id - first.id;
  }

  return getSavedHomeItemKey(second).localeCompare(getSavedHomeItemKey(first));
}

export function sortHomeItemsChronologically<T extends SavedHomeItem>(items: readonly T[]): T[] {
  return [...items].sort(
    (first, second) => second.createdAt - first.createdAt || compareStableIds(first, second),
  );
}

export function buildHomeGalleryEntries(
  items: readonly SavedHomeItem[],
  now: Date = new Date(),
): HomeGalleryEntry[] {
  const entries: HomeGalleryEntry[] = [];
  let previousDayKey: string | null = null;

  for (const content of sortHomeItemsChronologically(items)) {
    const dayKey = getLocalDayKey(content.createdAt);
    if (dayKey !== previousDayKey) {
      entries.push({
        kind: 'day-separator',
        id: `day:${dayKey}`,
        dayKey,
        title: formatLocalDayTitle(content.createdAt, now),
      });
      previousDayKey = dayKey;
    }

    entries.push({
      kind: 'content',
      id: `content:${getSavedHomeItemKey(content)}`,
      content,
    });
  }

  return entries;
}

export type HomeFeedStartupState = {
  photoLibraryReady: boolean;
  savedContentReady: boolean;
  documentLibraryReady: boolean;
  checklistLibraryReady: boolean;
  viewModeReady: boolean;
  homeFoldersReady: boolean;
};

export function areHomeFeedSourcesReady(startupState: HomeFeedStartupState): boolean {
  return (
    startupState.photoLibraryReady &&
    startupState.savedContentReady &&
    startupState.documentLibraryReady &&
    startupState.checklistLibraryReady &&
    startupState.viewModeReady &&
    startupState.homeFoldersReady
  );
}

export function buildHomeGalleryEntriesWhenReady(
  items: readonly SavedHomeItem[],
  now: Date,
  isReady: boolean,
): HomeGalleryEntry[] {
  if (!isReady) return [];

  return buildHomeGalleryEntries(items, now);
}

export function mergeSavedHomeItems(
  media: readonly SavedMedia[],
  contents: readonly Exclude<SavedHomeItem, SavedMedia>[],
): SavedHomeItem[] {
  return sortHomeItemsChronologically([...media, ...contents]);
}
