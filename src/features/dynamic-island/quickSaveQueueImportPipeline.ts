import { fallbackLinkTitle, normalizeWebLink } from '@/features/home-content/linkValidation';

export type PersistedQuickSaveLink = {
  createdAt: number;
  domain: string;
  normalizedUrl: string;
  title: string;
  url: string;
};

export type PendingQuickSaveQueueEntry = {
  fileName: string;
  raw: unknown;
};

export type QuickSaveQueuePersistenceResult = 'inserted' | 'alreadySaved';

export type QuickSaveQueueImportAdapter = {
  persist: (link: PersistedQuickSaveLink) => Promise<QuickSaveQueuePersistenceResult>;
  acknowledge: (entry: PendingQuickSaveQueueEntry) => Promise<void>;
  record: (event: 'commit_confirmed' | 'duplicate_confirmed' | 'acknowledged' | 'failed') => void;
};

export type QuickSaveQueueImportResult = {
  imported: number;
  duplicates: number;
  acknowledged: number;
  failed: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_URL_LENGTH = 8_192;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validatePendingQuickSaveRecord(raw: unknown): PersistedQuickSaveLink | null {
  if (!isRecord(raw) ||
      raw.formatVersion !== 1 ||
      typeof raw.operationID !== 'string' || !UUID_PATTERN.test(raw.operationID) ||
      typeof raw.url !== 'string' || raw.url.length === 0 || raw.url.length > MAX_URL_LENGTH ||
      typeof raw.normalizedURL !== 'string' || raw.normalizedURL.length === 0 || raw.normalizedURL.length > MAX_URL_LENGTH ||
      typeof raw.createdAt !== 'number' || !Number.isSafeInteger(raw.createdAt) || raw.createdAt <= 0 ||
      typeof raw.title !== 'string' || raw.title.length > 120 ||
      typeof raw.domain !== 'string' || raw.domain.length > 253 ||
      raw.url !== raw.normalizedURL) {
    return null;
  }

  try {
    const normalized = normalizeWebLink(raw.url);
    const storedNormalized = normalizeWebLink(raw.normalizedURL);
    if (normalized.url !== storedNormalized.url) return null;
    return {
      createdAt: raw.createdAt,
      domain: normalized.domain,
      normalizedUrl: normalized.url,
      title: fallbackLinkTitle(normalized.url),
      url: normalized.url,
    };
  } catch {
    return null;
  }
}

export async function importPendingQuickSaveQueueEntries(
  entries: PendingQuickSaveQueueEntry[],
  adapter: QuickSaveQueueImportAdapter,
): Promise<QuickSaveQueueImportResult> {
  const result: QuickSaveQueueImportResult = {
    imported: 0,
    duplicates: 0,
    acknowledged: 0,
    failed: 0,
  };

  for (const entry of entries) {
    const link = validatePendingQuickSaveRecord(entry.raw);
    if (!link) {
      result.failed += 1;
      adapter.record('failed');
      continue;
    }

    try {
      const persistence = await adapter.persist(link);
      if (persistence === 'inserted') {
        result.imported += 1;
        adapter.record('commit_confirmed');
      } else {
        result.duplicates += 1;
        adapter.record('duplicate_confirmed');
      }

      await adapter.acknowledge(entry);
      result.acknowledged += 1;
      adapter.record('acknowledged');
    } catch {
      // A queue entry remains authoritative until SQLite commit/duplicate and removal both succeed.
      result.failed += 1;
      adapter.record('failed');
    }
  }

  return result;
}
