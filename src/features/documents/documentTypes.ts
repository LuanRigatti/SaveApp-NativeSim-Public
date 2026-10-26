export type DocumentImportAsset = {
  uri: string;
  name: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  textExcerpt?: string | null;
};

export type SavedDocument = {
  id: number;
  contentType: 'document';
  createdAt: number;
  originalName: string;
  mimeType: string | null;
  extension: string | null;
  sizeBytes: number;
  relativePath: string;
  thumbnailRelativePath: string | null;
  thumbnailUri: string | null;
  textExcerpt: string | null;
  uri: string;
};

export type DocumentMetadataInput = Omit<
  SavedDocument,
  'id' | 'contentType' | 'thumbnailRelativePath' | 'thumbnailUri' | 'uri'
>;
