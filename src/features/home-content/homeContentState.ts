import type { SavedHomeContent } from './homeContentTypes';

export function prependSavedHomeContent(
  current: SavedHomeContent[],
  saved: SavedHomeContent,
): SavedHomeContent[] {
  return [
    saved,
    ...current.filter((item) => item.contentType !== saved.contentType || item.id !== saved.id),
  ];
}
