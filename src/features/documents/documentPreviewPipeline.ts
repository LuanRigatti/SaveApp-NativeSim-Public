import type { SavedDocument } from './documentTypes';

export type DocumentPreviewStatus = 'opened' | 'unsupported' | 'missing' | 'failed';

export type DocumentPreviewAdapter = {
  fileExists: (relativePath: string) => boolean | Promise<boolean>;
  canPreview: (document: SavedDocument) => Promise<boolean>;
  preview: (document: SavedDocument) => Promise<void>;
};

/** Checks local availability and native viewer support before requesting a preview. */
export async function previewSavedDocument(
  document: SavedDocument,
  adapter: DocumentPreviewAdapter,
): Promise<DocumentPreviewStatus> {
  try {
    if (!(await adapter.fileExists(document.relativePath))) return 'missing';
    if (!(await adapter.canPreview(document))) return 'unsupported';
    await adapter.preview(document);
    return 'opened';
  } catch {
    return 'failed';
  }
}
