const LINK_PREVIEW_MAX_WIDTH = 360;
const LINK_PREVIEW_SIDE_INSET = 48;
const LINK_PREVIEW_METADATA_HEIGHT = 112;
const LINK_PREVIEW_METADATA_WITH_DESCRIPTION_HEIGHT = 180;

export type LinkPreviewSize = { width: number; height: number };

export function getLinkPreviewSize(
  screenWidth: number,
  hasImage: boolean,
  hasDescription: boolean,
): LinkPreviewSize {
  const width = Math.max(1, Math.min(LINK_PREVIEW_MAX_WIDTH, screenWidth - LINK_PREVIEW_SIDE_INSET));
  const imageHeight = hasImage ? Math.round((width * 9) / 16) : 0;
  const metadataHeight = hasDescription
    ? LINK_PREVIEW_METADATA_WITH_DESCRIPTION_HEIGHT
    : LINK_PREVIEW_METADATA_HEIGHT;

  return { width, height: imageHeight + metadataHeight };
}
