import { Directory, File, Paths } from 'expo-file-system';

export type QuickSaveLockScreenRecentLink = {
  id: string;
  domain: string;
  createdAt: number;
  savedContentId?: number;
  faviconFileName?: string;
  faviconUri?: string;
};

export type QuickSaveLockScreenHistorySnapshot = {
  revision: number;
  links: QuickSaveLockScreenRecentLink[];
};

export const QUICK_SAVE_LOCK_SCREEN_HISTORY_VERSION = 2;
export const QUICK_SAVE_LOCK_SCREEN_HISTORY_LIMIT = 3;
export const QUICK_SAVE_LOCK_SCREEN_HISTORY_FILE = 'QuickSaveLockScreenRecentLinks.json';
const MAX_HISTORY_BYTES = 4 * 1_024;

const APP_GROUP_IDENTIFIER = 'group.com.luanrigatti.saveapp';
const HISTORY_DIRECTORY = 'QuickSaveQueue';
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/i;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/i;
const FAVICON_FILE_PATTERN = /^favicon-([a-f0-9]{64})\.png$/i;
const MAX_FAVICON_BYTES = 64 * 1_024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export function isValidQuickSaveFaviconFileName(value: unknown, id?: string): value is string {
  if (typeof value !== 'string') return false;
  const match = FAVICON_FILE_PATTERN.exec(value);
  return Boolean(match && (!id || match[1]?.toLowerCase() === id.toLowerCase()));
}

export function isValidQuickSaveFaviconPng(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 24 || bytes.byteLength > MAX_FAVICON_BYTES) return false;
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return false;
  const width = ((bytes[16]! << 24) | (bytes[17]! << 16) | (bytes[18]! << 8) | bytes[19]!) >>> 0;
  const height = ((bytes[20]! << 24) | (bytes[21]! << 16) | (bytes[22]! << 8) | bytes[23]!) >>> 0;
  return width === 96 && height === 96;
}

export function validateQuickSaveLockScreenHistorySnapshot(
  input: unknown,
  now = Date.now(),
): QuickSaveLockScreenHistorySnapshot | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const isLegacy = value.formatVersion === 1;
  if ((!isLegacy && value.formatVersion !== QUICK_SAVE_LOCK_SCREEN_HISTORY_VERSION) || !Array.isArray(value.links)) return null;
  const revision = isLegacy ? 0 : value.revision;
  if (!Number.isSafeInteger(revision) || (revision as number) < 0 || (!isLegacy && (revision as number) < 1)) return null;
  if (value.links.length > QUICK_SAVE_LOCK_SCREEN_HISTORY_LIMIT) return null;

  const seen = new Set<string>();
  const links: QuickSaveLockScreenRecentLink[] = [];
  for (const candidate of value.links) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const record = candidate as Record<string, unknown>;
    if (
      typeof record.id !== 'string' || !DIGEST_PATTERN.test(record.id) ||
      typeof record.domain !== 'string' || !DOMAIN_PATTERN.test(record.domain) ||
      !Number.isSafeInteger(record.createdAt) || (record.createdAt as number) <= 0 ||
      (record.createdAt as number) > now + 60_000 || seen.has(record.id.toLowerCase()) ||
      (record.savedContentId !== undefined &&
        (!Number.isSafeInteger(record.savedContentId) || (record.savedContentId as number) <= 0)) ||
      (record.faviconFileName !== undefined && !isValidQuickSaveFaviconFileName(record.faviconFileName, record.id))
    ) return null;
    seen.add(record.id.toLowerCase());
    links.push({
      id: record.id.toLowerCase(),
      domain: record.domain,
      createdAt: record.createdAt as number,
      ...(record.savedContentId !== undefined ? { savedContentId: record.savedContentId as number } : {}),
      ...(record.faviconFileName !== undefined ? { faviconFileName: record.faviconFileName as string } : {}),
    });
  }

  return {
    revision: revision as number,
    links: links.sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id)),
  };
}

export function validateQuickSaveLockScreenHistory(input: unknown, now = Date.now()): QuickSaveLockScreenRecentLink[] {
  return validateQuickSaveLockScreenHistorySnapshot(input, now)?.links ?? [];
}

/** Reads the versioned, domain-only summary written after a durable queue confirmation. */
export async function readQuickSaveLockScreenHistorySnapshot(): Promise<QuickSaveLockScreenHistorySnapshot | null> {
  try {
    const container = Paths.appleSharedContainers[APP_GROUP_IDENTIFIER];
    if (!container) return null;
    const directory = new Directory(container, HISTORY_DIRECTORY);
    const file = new File(directory, QUICK_SAVE_LOCK_SCREEN_HISTORY_FILE);
    if (!file.exists) return { revision: 0, links: [] };
    if (file.size <= 0 || file.size > MAX_HISTORY_BYTES) return null;
    const snapshot = validateQuickSaveLockScreenHistorySnapshot(JSON.parse(await file.text()));
    if (!snapshot) return null;
    const faviconDirectory = new Directory(directory, 'Favicons');
    const links = await Promise.all(snapshot.links.map(async (link) => {
      if (!link.faviconFileName || !isValidQuickSaveFaviconFileName(link.faviconFileName, link.id)) return link;
      try {
        const favicon = new File(faviconDirectory, link.faviconFileName);
        if (!favicon.exists || !favicon.size || favicon.size > MAX_FAVICON_BYTES) return link;
        const bytes = await favicon.bytes();
        if (!isValidQuickSaveFaviconPng(bytes) || !favicon.uri.startsWith('file://')) return link;
        return { ...link, faviconUri: favicon.uri };
      } catch {
        return link;
      }
    }));
    return { ...snapshot, links };
  } catch {
    return null;
  }
}

export async function readQuickSaveLockScreenHistory(): Promise<QuickSaveLockScreenRecentLink[]> {
  return (await readQuickSaveLockScreenHistorySnapshot())?.links ?? [];
}
