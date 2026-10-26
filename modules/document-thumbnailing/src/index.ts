import { requireOptionalNativeModule } from 'expo-modules-core';

export type DocumentThumbnailNativeResult =
  | {
      status: 'generated';
      relativePath: string;
      width: number;
      height: number;
      sizeBytes: number;
    }
  | { status: 'unsupported' | 'missing' | 'invalidPath' | 'invalidInput' | 'failed' };

type SaveAppDocumentThumbnailingNativeModule = {
  generateThumbnailAsync: (documentId: number, relativePath: string) => Promise<unknown>;
};

let cachedNativeModule: SaveAppDocumentThumbnailingNativeModule | null | undefined;

function getNativeModule(): SaveAppDocumentThumbnailingNativeModule | null {
  if (cachedNativeModule !== undefined) return cachedNativeModule;
  try {
    cachedNativeModule = requireOptionalNativeModule<SaveAppDocumentThumbnailingNativeModule>(
      'SaveAppDocumentThumbnailing',
    );
  } catch {
    cachedNativeModule = null;
  }
  return cachedNativeModule;
}

export function isDocumentThumbnailingAvailable(): boolean {
  return getNativeModule() != null;
}

function expectedThumbnailPath(documentId: number): string {
  return `document-thumbnails/document-${documentId}.jpg`;
}

export async function generateNativeDocumentThumbnail(
  documentId: number,
  relativePath: string,
): Promise<DocumentThumbnailNativeResult> {
  if (!Number.isSafeInteger(documentId) || documentId <= 0) return { status: 'invalidInput' };
  if (!/^documents\/document-[0-9]+-[a-z0-9]+(?:\.[a-z0-9]{1,16})?$/i.test(relativePath)) {
    return { status: 'invalidPath' };
  }

  const nativeModule = getNativeModule();
  if (!nativeModule) return { status: 'failed' };

  try {
    const result = (await nativeModule.generateThumbnailAsync(documentId, relativePath)) as
      | Record<string, unknown>
      | null;
    if (!result || typeof result.status !== 'string') return { status: 'failed' };
    if (result.status !== 'generated') {
      if (['unsupported', 'missing', 'invalidPath', 'invalidInput', 'failed'].includes(result.status)) {
        return { status: result.status as Exclude<DocumentThumbnailNativeResult, { status: 'generated' }>['status'] };
      }
      return { status: 'failed' };
    }

    const expectedPath = expectedThumbnailPath(documentId);
    if (
      result.relativePath !== expectedPath ||
      !Number.isSafeInteger(result.width) ||
      !Number.isSafeInteger(result.height) ||
      !Number.isSafeInteger(result.sizeBytes) ||
      (result.width as number) < 1 ||
      (result.width as number) > 1_536 ||
      (result.height as number) < 1 ||
      (result.height as number) > 1_536 ||
      (result.sizeBytes as number) < 1 ||
      (result.sizeBytes as number) > 2 * 1024 * 1024
    ) {
      return { status: 'failed' };
    }

    return {
      status: 'generated',
      relativePath: expectedPath,
      width: result.width as number,
      height: result.height as number,
      sizeBytes: result.sizeBytes as number,
    };
  } catch {
    return { status: 'failed' };
  }
}
