import { fallbackLinkTitle, normalizeWebLink } from './linkValidation';
import type { LinkPreviewMetadata } from './linkPreview';
import type { SavedLink, SavedText } from './homeContentTypes';

export class DuplicateSavedLinkError extends Error {
  constructor() {
    super('This link is already saved.');
    this.name = 'DuplicateSavedLinkError';
  }
}

export class EmptySavedTextError extends Error {
  constructor() {
    super('Text cannot be empty.');
    this.name = 'EmptySavedTextError';
  }
}

export type CachedLinkPreview = {
  relativePath: string;
  uri: string;
  mimeType: string;
};

export type LinkSaveAdapter = {
  hasLink: (normalizedUrl: string) => Promise<boolean>;
  getPreview: (url: string, signal?: AbortSignal) => Promise<LinkPreviewMetadata>;
  cachePreview: (url: string, signal?: AbortSignal) => Promise<CachedLinkPreview>;
  deletePreview: (relativePath: string) => Promise<void>;
  insertLink: (input: {
    url: string;
    normalizedUrl: string;
    createdAt: number;
    title: string;
    description: string | null;
    domain: string;
    imageUrl: string | null;
    faviconUrl: string | null;
    preview: CachedLinkPreview | null;
  }) => Promise<SavedLink>;
  deleteInsertedLink: (id: number) => Promise<void>;
  now?: () => number;
};

function makeAbortError(): Error {
  const error = new Error('The operation was cancelled.');
  error.name = 'AbortError';
  return error;
}

function fallbackPreview(url: string): LinkPreviewMetadata {
  const link = normalizeWebLink(url);
  return {
    title: fallbackLinkTitle(link.url),
    description: null,
    domain: link.domain,
    imageUrl: null,
    faviconUrl: null,
  };
}

async function removeCachedPreview(
  preview: CachedLinkPreview | null,
  adapter: LinkSaveAdapter,
): Promise<void> {
  if (preview) {
    await adapter.deletePreview(preview.relativePath);
  }
}

export async function saveLinkWithPreview(
  input: string,
  adapter: LinkSaveAdapter,
  signal?: AbortSignal,
): Promise<SavedLink> {
  const normalized = normalizeWebLink(input);
  if (await adapter.hasLink(normalized.url)) {
    throw new DuplicateSavedLinkError();
  }
  if (signal?.aborted) {
    throw makeAbortError();
  }

  let metadata = fallbackPreview(normalized.url);
  try {
    metadata = await adapter.getPreview(normalized.url, signal);
  } catch {
    if (signal?.aborted) throw makeAbortError();
  }

  if (signal?.aborted) {
    throw makeAbortError();
  }

  let preview: CachedLinkPreview | null = null;
  let preservePreviewOnError = false;
  for (const imageUrl of [metadata.imageUrl, metadata.faviconUrl]) {
    if (!imageUrl || preview) continue;
    try {
      preview = await adapter.cachePreview(imageUrl, signal);
    } catch {
      if (signal?.aborted) throw makeAbortError();
    }
  }

  if (signal?.aborted) {
    await removeCachedPreview(preview, adapter);
    throw makeAbortError();
  }

  try {
    const saved = await adapter.insertLink({
      url: normalized.url,
      normalizedUrl: normalized.url,
      createdAt: (adapter.now ?? Date.now)(),
      title: metadata.title || fallbackLinkTitle(normalized.url),
      description: metadata.description,
      domain: metadata.domain || normalized.domain,
      imageUrl: metadata.imageUrl,
      faviconUrl: metadata.faviconUrl,
      preview,
    });

    if (signal?.aborted) {
      try {
        await adapter.deleteInsertedLink(saved.id);
      } catch (rollbackError) {
        preservePreviewOnError = true;
        const error = new Error('The save was cancelled, but its inserted record could not be rolled back.') as Error & {
          errors?: unknown[];
        };
        error.errors = [rollbackError];
        throw error;
      }
      await removeCachedPreview(preview, adapter);
      preview = null;
      throw makeAbortError();
    }

    return saved;
  } catch (error) {
    if (preview && !preservePreviewOnError) {
      try {
        await removeCachedPreview(preview, adapter);
      } catch (cleanupError) {
        const combined = new Error('The link could not be saved and its preview cache could not be removed.') as Error & {
          errors?: unknown[];
        };
        combined.errors = [error, cleanupError];
        throw combined;
      }
    }
    throw error;
  }
}

export type TextSaveAdapter = {
  insertText: (text: string, createdAt: number) => Promise<SavedText>;
  deleteInsertedText: (id: number) => Promise<void>;
  now?: () => number;
};

export async function saveTextContent(
  text: string,
  adapter: TextSaveAdapter,
  signal?: AbortSignal,
): Promise<SavedText> {
  if (!text.trim()) {
    throw new EmptySavedTextError();
  }
  if (signal?.aborted) throw makeAbortError();

  const saved = await adapter.insertText(text, (adapter.now ?? Date.now)());
  if (signal?.aborted) {
    await adapter.deleteInsertedText(saved.id);
    throw makeAbortError();
  }
  return saved;
}
