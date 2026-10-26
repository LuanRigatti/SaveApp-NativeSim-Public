import type { DocumentImportAsset, DocumentMetadataInput, SavedDocument } from './documentTypes';

export type DocumentImportAdapter = {
  copyToPrivateStorage: (
    sourceUri: string,
    relativePath: string,
    expectedSizeBytes: number | null,
  ) => Promise<number>;
  insertMetadata: (document: DocumentMetadataInput) => Promise<SavedDocument>;
  removeFile: (relativePath: string) => Promise<void>;
  readTextExcerpt?: (asset: DocumentImportAsset) => Promise<string | null>;
  now?: () => number;
  createRelativePath?: (asset: DocumentImportAsset, timestamp: number) => string;
};

export type DocumentImportResult = {
  documents: SavedDocument[];
  failedCount: number;
};

export type DocumentPickerResult = {
  canceled: boolean;
  result: readonly DocumentImportAsset[] | null;
};

const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/zip': 'zip',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function getDocumentExtension(asset: Pick<DocumentImportAsset, 'name' | 'mimeType'>): string | null {
  const fileExtension = asset.name.match(/\.([a-z0-9]{1,16})$/i)?.[1]?.toLowerCase();
  if (fileExtension) return fileExtension;

  const mimeType = asset.mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  return (mimeType && MIME_EXTENSIONS[mimeType]) || null;
}

function createRelativePath(asset: DocumentImportAsset, timestamp: number): string {
  const suffix = Math.random().toString(36).slice(2, 10) || 'localfile';
  const extension = getDocumentExtension(asset);
  return `documents/document-${timestamp}-${suffix}${extension ? `.${extension}` : ''}`;
}

function normalizeMimeType(mimeType?: string | null): string | null {
  const normalized = mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  return normalized || null;
}

/** Copies each picked document before inserting its row; a failed item never blocks later items. */
export async function importDocumentAssets(
  assets: readonly DocumentImportAsset[],
  adapter: DocumentImportAdapter,
): Promise<DocumentImportResult> {
  const documents: SavedDocument[] = [];
  let failedCount = 0;

  for (const asset of assets) {
    let relativePath: string | null = null;
    let copied = false;

    try {
      if (!asset.uri || !asset.name || !Number.isFinite(asset.sizeBytes ?? 0) || (asset.sizeBytes ?? 0) < 0) {
        throw new Error('Invalid picked document');
      }

      const createdAt = (adapter.now ?? Date.now)();
      relativePath = (adapter.createRelativePath ?? createRelativePath)(asset, createdAt);
      const sizeBytes = await adapter.copyToPrivateStorage(
        asset.uri,
        relativePath,
        Number.isFinite(asset.sizeBytes) ? asset.sizeBytes! : null,
      );
      copied = true;
      if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
        throw new Error('The private document copy has no valid size');
      }

      let textExcerpt = asset.textExcerpt?.trim() || null;
      if (textExcerpt == null && adapter.readTextExcerpt) {
        try {
          textExcerpt = (await adapter.readTextExcerpt(asset))?.trim() || null;
        } catch {
          // A text preview is optional and must not prevent saving the document.
        }
      }

      documents.push(
        await adapter.insertMetadata({
          originalName: asset.name,
          mimeType: normalizeMimeType(asset.mimeType),
          extension: getDocumentExtension(asset),
          sizeBytes,
          relativePath,
          createdAt,
          textExcerpt: textExcerpt?.slice(0, 500) || null,
        }),
      );
    } catch {
      failedCount += 1;
      if (relativePath && copied) {
        try {
          await adapter.removeFile(relativePath);
        } catch {
          // Keep the batch moving when cleanup itself encounters a storage failure.
        }
      }
    }
  }

  return { documents, failedCount };
}

export async function importDocumentPickerResult(
  pickerResult: DocumentPickerResult,
  adapter: DocumentImportAdapter,
): Promise<DocumentImportResult> {
  if (pickerResult.canceled || !pickerResult.result?.length) {
    return { documents: [], failedCount: 0 };
  }

  return importDocumentAssets(pickerResult.result, adapter);
}
