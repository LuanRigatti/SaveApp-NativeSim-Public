export type PhotoPreviewSize = {
  width: number;
  height: number;
};

export function getPhotoPreviewSize(
  imageWidth: number,
  imageHeight: number,
  maxWidth: number,
  maxHeight: number,
): PhotoPreviewSize {
  if (
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(imageHeight) ||
    !Number.isFinite(maxWidth) ||
    !Number.isFinite(maxHeight) ||
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    maxWidth <= 0 ||
    maxHeight <= 0
  ) {
    return { width: 1, height: 1 };
  }

  const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight);
  return {
    width: Math.max(1, Math.round(imageWidth * scale)),
    height: Math.max(1, Math.round(imageHeight * scale)),
  };
}
