import type { SavedTagAssignment } from './tagTypes';

export const HOME_FOLDER_TAG_DOT_LIMIT = 2;

export function getVisibleSavedTagDots(
  isSpecificFolderView: boolean,
  assignments: readonly SavedTagAssignment[],
): SavedTagAssignment[] {
  return isSpecificFolderView ? assignments.slice(0, HOME_FOLDER_TAG_DOT_LIMIT) : [];
}
