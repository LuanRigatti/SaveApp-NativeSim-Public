import type { SavedHomeItem } from './homeContentTypes';

export type HomeSearchIndex<T extends SavedHomeItem> = {
  sourceItems: readonly T[];
  searchableItems: { item: T; normalizedFields: string[] }[];
};

function searchableFields(item: SavedHomeItem): string[] {
  if ('mediaType' in item) {
    const mediaTitle = item.mediaType === 'video' ? 'vídeo video' : 'foto photo';
    const customTitle = item.mediaType === 'photo' ? item.customTitle : null;
    return [customTitle, item.mimeType, mediaTitle]
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  switch (item.contentType) {
    case 'link':
      return [item.title, item.domain, item.url, item.normalizedUrl, item.description ?? ''];
    case 'text':
      return [item.text];
    case 'document':
      return [item.originalName, item.mimeType ?? '', item.extension ?? '', item.textExcerpt ?? ''];
    case 'checklist':
      return [item.title, ...item.previewTasks.map((task) => task.text)];
  }
}

export function normalizeHomeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function createHomeSearchIndex<T extends SavedHomeItem>(
  items: readonly T[],
): HomeSearchIndex<T> {
  return {
    sourceItems: items,
    searchableItems: items.map((item) => ({
      item,
      normalizedFields: searchableFields(item).map(normalizeHomeSearchText),
    })),
  };
}

/**
 * Search the already-authorized Home catalog in memory. Every query word must
 * match one of the item's existing textual fields; no paths or binary data are
 * inspected and no database/network access is performed here.
 */
export function filterHomeItemsBySearch<T extends SavedHomeItem>(
  items: readonly T[],
  query: string,
): T[] {
  return filterHomeSearchIndex(createHomeSearchIndex(items), query);
}

export function filterHomeSearchIndex<T extends SavedHomeItem>(
  searchIndex: HomeSearchIndex<T>,
  query: string,
): T[] {
  const normalizedQuery = normalizeHomeSearchText(query);
  if (!normalizedQuery) return searchIndex.sourceItems as T[];

  const terms = normalizedQuery.split(' ');
  return searchIndex.searchableItems
    .filter(({ normalizedFields }) => (
      terms.every((term) => normalizedFields.some((field) => field.includes(term)))
    ))
    .map(({ item }) => item);
}

export function supportsNativeHomeSearch(os: string, version: string | number): boolean {
  if (os !== 'ios') return false;
  const majorVersion = Number.parseInt(String(version), 10);
  return Number.isFinite(majorVersion) && majorVersion >= 26;
}
