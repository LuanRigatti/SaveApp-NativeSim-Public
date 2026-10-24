export type PhotoImportAsset = {
  uri: string;
  width: number;
  height: number;
  fileName?: string | null;
  assetId?: string | null;
  mimeType?: string | null;
  type?: string | null;
  /** Best-effort native classification; undefined falls back to the explicit picker filename. */
  isScreenshot?: boolean;
};

export type VideoImportAsset = PhotoImportAsset & {
  duration?: number | null;
  fileSize?: number;
};

export type PhotoDimensions = {
  width: number;
  height: number;
};

export type PhotoMetadata = PhotoDimensions & {
  id: number;
  relativePath: string;
  createdAt: number;
  mimeType: string | null;
  customTitle: string | null;
  isScreenshot: boolean;
  mediaType: 'photo';
  durationMs: null;
  thumbnailRelativePath: null;
};

export type SavedPhoto = PhotoMetadata & {
  uri: string;
};

export type VideoMetadata = PhotoDimensions & {
  id: number;
  relativePath: string;
  createdAt: number;
  mimeType: string;
  mediaType: 'video';
  durationMs: number | null;
  thumbnailRelativePath: string;
};

export type SavedVideo = VideoMetadata & {
  uri: string;
  thumbnailUri: string;
};

export type SavedMedia = SavedPhoto | SavedVideo;
