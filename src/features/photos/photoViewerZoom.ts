export const PHOTO_VIEWER_MAX_ZOOM_SCALE = 4;

const PHOTO_VIEWER_ZOOMED_THRESHOLD = 1.02;

export function isPhotoViewerZoomed(zoomScale: number): boolean {
  return Number.isFinite(zoomScale) && zoomScale > PHOTO_VIEWER_ZOOMED_THRESHOLD;
}
