/** Removes one committed media item while preserving order and layout metadata for the rest. */
export function removeSavedMediaById<T extends { id: number }>(media: T[], deletedId: number): T[] {
  return media.filter((item) => item.id !== deletedId);
}

/** @deprecated Kept for the existing photo deletion contract and tests. */
export const removeSavedPhotoById = removeSavedMediaById;
