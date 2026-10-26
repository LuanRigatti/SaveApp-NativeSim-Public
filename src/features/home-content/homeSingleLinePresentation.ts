import { getPhotoDisplayTitle } from '../photos/photoTitle';

import type { SavedHomeItem } from './homeContentTypes';
import { getSavedTextPresentation } from './savedTextPresentation';

/** Returns the one-line title without exposing secondary metadata or a saved link URL. */
export function getHomeSingleLineTitle(item: SavedHomeItem): string {
  if ('mediaType' in item) {
    return item.mediaType === 'photo' ? getPhotoDisplayTitle(item) : 'Vídeo';
  }

  if (item.contentType === 'document') {
    return item.originalName || 'Documento';
  }

  if (item.contentType === 'link') {
    return item.title.trim() || item.domain || 'Link';
  }

  if (item.contentType === 'checklist') return item.title.trim() || 'Lista';

  return getSavedTextPresentation(item.text).title;
}
