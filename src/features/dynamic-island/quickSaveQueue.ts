import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { importQueuedQuickSaveLink } from '@/features/home-content/savedContentLibrary';
import { recordSaveAppDiagnosticEvent } from '../../../modules/clipboard-url-detection/src';
import {
  importPendingQuickSaveQueueEntries,
  type PendingQuickSaveQueueEntry,
  type QuickSaveQueueImportResult,
} from './quickSaveQueueImportPipeline';

const APP_GROUP_IDENTIFIER = 'group.com.luanrigatti.saveapp';
const QUEUE_DIRECTORY_NAME = 'QuickSaveQueue';
const QUEUE_FILE_PATTERN = /^[a-f0-9]{64}\.json$/i;
const MAX_QUEUE_FILE_BYTES = 16 * 1_024;

const EMPTY_RESULT: QuickSaveQueueImportResult = {
  imported: 0,
  duplicates: 0,
  acknowledged: 0,
  failed: 0,
};

let importPromise: Promise<QuickSaveQueueImportResult> | null = null;

function recordImportEvent(
  event: 'commit_confirmed' | 'duplicate_confirmed' | 'acknowledged' | 'failed',
): void {
  switch (event) {
    case 'commit_confirmed':
      recordSaveAppDiagnosticEvent('quick_save.import.sqlite_commit_confirmed');
      break;
    case 'duplicate_confirmed':
      recordSaveAppDiagnosticEvent('quick_save.import.duplicate_confirmed');
      break;
    case 'acknowledged':
      recordSaveAppDiagnosticEvent('quick_save.import.queue_acknowledged');
      break;
    case 'failed':
      recordSaveAppDiagnosticEvent('quick_save.import.failed');
      break;
  }
}

async function readPendingEntries(directory: Directory): Promise<{
  entries: PendingQuickSaveQueueEntry[];
  filesByName: Map<string, File>;
}> {
  const entries: PendingQuickSaveQueueEntry[] = [];
  const filesByName = new Map<string, File>();

  for (const item of directory.list()) {
    if (!(item instanceof File) || !QUEUE_FILE_PATTERN.test(item.name)) continue;
    filesByName.set(item.name, item);

    if (!item.size || item.size <= 0 || item.size > MAX_QUEUE_FILE_BYTES) {
      entries.push({ fileName: item.name, raw: null });
      continue;
    }

    try {
      const raw: unknown = JSON.parse(await item.text());
      const normalizedURL =
        typeof raw === 'object' && raw !== null && !Array.isArray(raw) &&
          'normalizedURL' in raw && typeof raw.normalizedURL === 'string'
          ? raw.normalizedURL
          : null;
      if (!normalizedURL) {
        entries.push({ fileName: item.name, raw: null });
        continue;
      }

      const expectedName = `${await digestStringAsync(CryptoDigestAlgorithm.SHA256, normalizedURL)}.json`;
      entries.push({
        fileName: item.name,
        raw: expectedName.toLowerCase() === item.name.toLowerCase() ? raw : null,
      });
    } catch {
      entries.push({ fileName: item.name, raw: null });
    }
  }

  return { entries, filesByName };
}

async function importPendingQueue(): Promise<QuickSaveQueueImportResult> {
  if (Platform.OS !== 'ios') return EMPTY_RESULT;
  recordSaveAppDiagnosticEvent('quick_save.import.started');

  const appGroupContainer = Paths.appleSharedContainers[APP_GROUP_IDENTIFIER];
  if (!appGroupContainer) {
    recordSaveAppDiagnosticEvent('quick_save.import.container_unavailable');
    return { ...EMPTY_RESULT, failed: 1 };
  }

  const queueDirectory = new Directory(appGroupContainer, QUEUE_DIRECTORY_NAME);
  if (!queueDirectory.exists) return EMPTY_RESULT;

  try {
    const { entries, filesByName } = await readPendingEntries(queueDirectory);
    if (entries.length === 0) return EMPTY_RESULT;
    return await importPendingQuickSaveQueueEntries(entries, {
      persist: importQueuedQuickSaveLink,
      async acknowledge(entry) {
        const file = filesByName.get(entry.fileName);
        if (!file) throw new Error('Queued file disappeared before acknowledgment.');
        file.delete();
        if (file.exists) throw new Error('Queued file removal was not confirmed.');
      },
      record: recordImportEvent,
    });
  } catch {
    recordSaveAppDiagnosticEvent('quick_save.import.failed');
    return { ...EMPTY_RESULT, failed: 1 };
  }
}

/** Runs after schema initialization and on refresh; overlapping triggers share one import pass. */
export function importPendingQuickSaveLinks(): Promise<QuickSaveQueueImportResult> {
  if (importPromise) return importPromise;
  const current = importPendingQueue().finally(() => {
    if (importPromise === current) importPromise = null;
  });
  importPromise = current;
  return current;
}
