import { fallbackLinkTitle, normalizeWebLink } from './linkValidation';
import type { LinkPreviewMetadata } from './linkPreview';

export type QuickSaveLinkPreviewCandidate = {
  id: number;
  url: string;
  normalizedUrl: string;
  title: string;
  description: string | null;
  domain: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  previewImageRelativePath: string | null;
  previewImageMimeType: string | null;
};

export type CachedQuickSavePreview = {
  relativePath: string;
  mimeType: string;
};

export type QuickSavePreviewEnrichmentAdapter = {
  getPreview: (url: string) => Promise<LinkPreviewMetadata>;
  cachePreview: (url: string) => Promise<CachedQuickSavePreview>;
  updateIfUnchanged: (
    candidate: QuickSaveLinkPreviewCandidate,
    metadata: LinkPreviewMetadata,
    preview: CachedQuickSavePreview | null,
    complete: boolean,
  ) => Promise<boolean>;
  claimAttempt?: (
    candidate: QuickSaveLinkPreviewCandidate,
    policy: { maxAttempts: number; retryDelayMs: number; now: number },
  ) => Promise<boolean>;
  cacheLockScreenFavicon?: (candidate: QuickSaveLinkPreviewCandidate, faviconUrl: string) => Promise<boolean | void>;
  isPreviewReferenced: (relativePath: string) => Promise<boolean>;
  deletePreview: (relativePath: string) => Promise<void>;
  onUpdated: () => void;
};

export type QuickSavePreviewEnrichmentResult =
  | 'updated'
  | 'unchanged'
  | 'ineligible'
  | 'retry_limited'
  | 'retry_deferred'
  | 'failed';

type Options = {
  maxAttemptsPerUrl?: number;
  retryDelayMs?: number;
  maxConcurrent?: number;
  maxPending?: number;
  now?: () => number;
};

type Attempt = { count: number; lastAttemptAt: number };
type Job = {
  candidate: QuickSaveLinkPreviewCandidate;
  resolve: (result: QuickSavePreviewEnrichmentResult) => void;
};

function isValidCandidate(candidate: QuickSaveLinkPreviewCandidate): boolean {
  if (!Number.isSafeInteger(candidate.id) || candidate.id <= 0) return false;
  try {
    return normalizeWebLink(candidate.url).url === candidate.normalizedUrl &&
      normalizeWebLink(candidate.normalizedUrl).url === candidate.normalizedUrl;
  } catch {
    return false;
  }
}

function isFallbackTitle(candidate: QuickSaveLinkPreviewCandidate): boolean {
  return candidate.title.trim() === fallbackLinkTitle(candidate.normalizedUrl);
}

function isEligible(candidate: QuickSaveLinkPreviewCandidate): boolean {
  if (!isValidCandidate(candidate) || candidate.previewImageRelativePath) return false;
  // Quick Save rows keep the URL-derived title until metadata arrives. A row
  // with metadata but only a remote image may retry its bounded local cache.
  return isFallbackTitle(candidate) || Boolean(candidate.imageUrl || candidate.faviconUrl);
}

function hasUsefulMetadata(metadata: LinkPreviewMetadata, candidate: QuickSaveLinkPreviewCandidate): boolean {
  return metadata.title.trim() !== fallbackLinkTitle(candidate.normalizedUrl) ||
    Boolean(metadata.description?.trim()) ||
    Boolean(metadata.imageUrl) ||
    Boolean(metadata.faviconUrl);
}

export function createQuickSaveLinkPreviewEnricher(
  adapter: QuickSavePreviewEnrichmentAdapter,
  options: Options = {},
) {
  const maxAttemptsPerUrl = options.maxAttemptsPerUrl ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 30_000;
  const maxConcurrent = options.maxConcurrent ?? 2;
  const maxPending = options.maxPending ?? 16;
  const now = options.now ?? Date.now;
  const attempts = new Map<string, Attempt>();
  const inFlight = new Map<string, Promise<QuickSavePreviewEnrichmentResult>>();
  const pending: Job[] = [];
  let active = 0;

  async function run(candidate: QuickSaveLinkPreviewCandidate): Promise<QuickSavePreviewEnrichmentResult> {
    let preview: CachedQuickSavePreview | null = null;
    try {
      if (adapter.claimAttempt && !await adapter.claimAttempt(candidate, {
        maxAttempts: maxAttemptsPerUrl,
        retryDelayMs,
        now: now(),
      })) return 'retry_limited';

      const needsMetadata = isFallbackTitle(candidate);
      const fetched = needsMetadata ? await adapter.getPreview(candidate.normalizedUrl) : null;
      const metadata: LinkPreviewMetadata = {
        title: isFallbackTitle(candidate) && fetched?.title
          ? fetched.title
          : candidate.title,
        description: candidate.description ?? fetched?.description ?? null,
        domain: candidate.domain ?? fetched?.domain ?? normalizeWebLink(candidate.normalizedUrl).domain,
        imageUrl: candidate.imageUrl ?? fetched?.imageUrl ?? null,
        faviconUrl: candidate.faviconUrl ?? fetched?.faviconUrl ?? null,
      };

      if (!hasUsefulMetadata(metadata, candidate)) return 'unchanged';

      if (!candidate.previewImageRelativePath) {
        const imageUrls = [...new Set([
          candidate.imageUrl,
          fetched?.imageUrl,
          candidate.faviconUrl,
          fetched?.faviconUrl,
        ].filter((value): value is string => Boolean(value)))];
        for (const imageUrl of imageUrls) {
          try {
            preview = await adapter.cachePreview(imageUrl);
            break;
          } catch {
            // A metadata-only preview remains useful when its image is unavailable.
          }
        }
      }

      const complete = Boolean(preview) || (!metadata.imageUrl && !metadata.faviconUrl);
      const updated = await adapter.updateIfUnchanged(candidate, metadata, preview, complete);
      if (!updated) {
        if (preview) await adapter.deletePreview(preview.relativePath).catch(() => undefined);
        return 'unchanged';
      }
      adapter.onUpdated();
      if (metadata.faviconUrl && adapter.cacheLockScreenFavicon) {
        void adapter.cacheLockScreenFavicon(candidate, metadata.faviconUrl)
          .then((stored) => { if (stored !== false) adapter.onUpdated(); })
          .catch(() => undefined);
      }
      return 'updated';
    } catch {
      if (preview) {
        const isReferenced = await adapter.isPreviewReferenced(preview.relativePath).catch(() => true);
        if (!isReferenced) await adapter.deletePreview(preview.relativePath).catch(() => undefined);
      }
      return 'failed';
    }
  }

  function pump(): void {
    while (active < maxConcurrent && pending.length > 0) {
      const job = pending.shift()!;
      active += 1;
      void run(job.candidate)
        .then(job.resolve)
        .finally(() => {
          active -= 1;
          inFlight.delete(job.candidate.normalizedUrl);
          pump();
        });
    }
  }

  function enqueue(candidate: QuickSaveLinkPreviewCandidate): {
    accepted: boolean;
    promise: Promise<QuickSavePreviewEnrichmentResult>;
  } {
    if (!isEligible(candidate)) {
      return { accepted: false, promise: Promise.resolve('ineligible') };
    }
    const existing = inFlight.get(candidate.normalizedUrl);
    if (existing) return { accepted: false, promise: existing };
    if (pending.length >= maxPending) {
      return { accepted: false, promise: Promise.resolve('retry_deferred') };
    }

    const previous = attempts.get(candidate.normalizedUrl);
    if ((previous?.count ?? 0) >= maxAttemptsPerUrl) {
      return { accepted: false, promise: Promise.resolve('retry_limited') };
    }
    const startedAt = now();
    if (previous && startedAt - previous.lastAttemptAt < retryDelayMs) {
      return { accepted: false, promise: Promise.resolve('retry_deferred') };
    }
    attempts.set(candidate.normalizedUrl, {
      count: (previous?.count ?? 0) + 1,
      lastAttemptAt: startedAt,
    });

    let resolveJob!: (result: QuickSavePreviewEnrichmentResult) => void;
    const promise = new Promise<QuickSavePreviewEnrichmentResult>((resolve) => {
      resolveJob = resolve;
    });
    inFlight.set(candidate.normalizedUrl, promise);
    pending.push({ candidate, resolve: resolveJob });
    pump();
    return { accepted: true, promise };
  }

  return {
    schedule(candidate: QuickSaveLinkPreviewCandidate) {
      return enqueue(candidate).promise;
    },
    scheduleBatch(candidates: QuickSaveLinkPreviewCandidate[], maxNewJobs = 8) {
      const promises: Promise<QuickSavePreviewEnrichmentResult>[] = [];
      let scheduled = 0;
      for (const candidate of candidates) {
        const queued = enqueue(candidate);
        if (queued.accepted) {
          scheduled += 1;
          promises.push(queued.promise);
          if (scheduled >= maxNewJobs) break;
        }
      }
      return Promise.all(promises);
    },
  };
}
