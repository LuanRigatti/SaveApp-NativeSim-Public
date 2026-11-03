import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type ClipboardURLDetectionSnapshot = {
  changeCount: number;
  hasURLItem: boolean;
  hasProbableWebURL: boolean;
  systemUptime?: number;
  quickSaveHandledChangeCount?: number;
  quickSaveHandledSystemUptime?: number;
};

export const SAVEAPP_DIAGNOSTIC_EVENTS = [
  'clipboard.snapshot.started',
  'clipboard.snapshot.completed',
  'clipboard.snapshot.failed',
  'clipboard.offer.check_started',
  'clipboard.offer.snapshot_unavailable',
  'clipboard.offer.quick_save_marker_matched',
  'clipboard.offer.no_candidate',
  'clipboard.offer.presented',
  'clipboard.offer.dismissed',
  'clipboard.offer.save_selected',
  'clipboard.offer.read_started',
  'clipboard.offer.read_url',
  'clipboard.offer.read_text',
  'clipboard.offer.change_count_changed',
  'clipboard.offer.read_empty',
  'clipboard.offer.read_failed',
  'clipboard.offer.candidate_dispatched',
  'clipboard.offer.candidate_received',
  'clipboard.offer.candidate_invalid',
  'clipboard.offer.candidate_duplicate',
  'clipboard.offer.marker_persistence_failed',
  'navigation.home.focused',
  'navigation.home.expanded_deep_link_received',
  'navigation.home.clipboard_suppressed',
  'navigation.home.clipboard_suppression_failed',
  'navigation.composer.route_opened',
  'navigation.composer.dynamic_island_source',
  'navigation.composer.other_source',
  'navigation.composer.token_present',
  'navigation.composer.token_missing',
  'navigation.composer.token_malformed',
  'navigation.composer.token_valid',
  'navigation.composer.token_invalid',
  'navigation.composer.clipboard_read_started',
  'navigation.composer.clipboard_read_url',
  'navigation.composer.clipboard_read_text',
  'navigation.composer.clipboard_changed',
  'navigation.composer.clipboard_empty',
  'navigation.composer.clipboard_read_failed',
  'navigation.composer.candidate_valid',
  'navigation.composer.candidate_invalid',
  'navigation.composer.candidate_duplicate',
  'navigation.composer.presented',
  'home.catalog.initialize_started',
  'home.catalog.initialize_completed',
  'home.catalog.initialize_failed',
  'home.catalog.refresh_requested',
  'home.catalog.refresh_from_home_focus',
  'home.catalog.refresh_coalesced',
  'home.catalog.refresh_completed',
  'home.catalog.refresh_failed',
  'home.catalog.app_foreground',
  'home.catalog.query_started',
  'home.catalog.query_completed_links_present',
  'home.catalog.query_completed_links_absent',
  'home.catalog.query_failed',
  'home.catalog.state_updated_links_present',
  'home.catalog.state_updated_links_absent',
  'home.gallery.awaiting_data',
  'home.gallery.content_hidden',
  'home.gallery.no_links_in_catalog',
  'home.gallery.links_visible',
  'home.gallery.links_filtered_out',
  'home.filter.all',
  'home.filter.folder',
  'home.filter.category',
  'home.filter.favorites',
  'quick_save.import.started',
  'quick_save.import.sqlite_commit_confirmed',
  'quick_save.import.duplicate_confirmed',
  'quick_save.import.queue_acknowledged',
  'quick_save.import.failed',
  'quick_save.import.container_unavailable',
] as const;

export type SaveAppDiagnosticEvent = (typeof SAVEAPP_DIAGNOSTIC_EVENTS)[number];

type ClipboardURLDetectionNativeModule = {
  getDetectionSnapshotAsync: () => Promise<unknown>;
  recordDiagnosticEvent?: (event: SaveAppDiagnosticEvent) => void;
  getQuickSaveDiagnosticReport?: () => string;
  clearQuickSaveDiagnosticReport?: () => boolean;
  getQuickSaveLockScreenSettings?: () => unknown;
  setQuickSaveLockScreenRecentLinksVisible?: (visible: boolean) => boolean;
  setQuickSaveActivityStatus?: (status: QuickSaveLockScreenSettings['quickSaveStatus']) => boolean;
  associateQuickSaveLockScreenContent?: (id: string, savedContentId: number) => boolean;
  storeQuickSaveLockScreenFavicon?: (id: string, base64: string) => boolean;
};

export type QuickSaveDiagnosticEvent = {
  name: string;
  elapsedMilliseconds: number;
  values: Record<string, string>;
};

export type QuickSaveDiagnosticOperation = {
  operationID: string;
  startedAt: number;
  environment: Record<string, string>;
  events: QuickSaveDiagnosticEvent[];
};

export type QuickSaveDiagnosticReport = {
  schemaVersion: 1;
  operations: QuickSaveDiagnosticOperation[];
};

const quickSaveDiagnosticEnvironmentKeys = new Set([
  'processRole', 'runtimeOS', 'target', 'buildConfiguration', 'appVersion', 'appBuild',
  'compiledSDK', 'xcodeVersion', 'xcodeBuild', 'applicationState', 'sceneStates', 'appGroupAvailable',
]);

const quickSaveDiagnosticEvents: Record<string, ReadonlySet<string>> = {
  'intent.started': new Set(['processRole', 'activityIDPresent']),
  'clipboard.snapshot': new Set(['changeCount', 'itemCount', 'hasURLs', 'hasStrings', 'applicationState', 'sceneStates']),
  'clipboard.urlRepresentation': new Set(['attempted', 'valueAvailable', 'schemeClass']),
  'clipboard.stringRepresentation': new Set(['attempted', 'valueAvailable']),
  'clipboard.readResult': new Set(['result', 'reason', 'selectedRepresentation', 'changeCountAfter', 'changeCountChanged']),
  'quickSave.validation': new Set(['result', 'schemeClass']),
  'quickSave.queue': new Set(['result', 'historyUpdated']),
  'activity.lookup': new Set(['requestedState', 'result', 'reason']),
  'activity.update': new Set(['state', 'phase', 'historyRevision', 'result']),
  'activity.readyRestore': new Set(['phase', 'reason']),
  'intent.returned': new Set(['result']),
};

const quickSaveDiagnosticEnums: Record<string, ReadonlySet<string>> = {
  processRole: new Set(['application', 'extension', 'other']),
  target: new Set(['simulator', 'device']),
  buildConfiguration: new Set(['debug', 'release']),
  applicationState: new Set(['active', 'inactive', 'background', 'unknown']),
  schemeClass: new Set(['http', 'https', 'other', 'none']),
  selectedRepresentation: new Set(['url', 'string', 'none']),
  result: new Set(['empty', 'unavailable', 'completed', 'invalid', 'queued', 'alreadyQueued', 'failed', 'found', 'notFound', 'submitted', 'started', 'skipped', 'returned', 'historyUnavailable', 'activityUnavailable', 'reconciliationUnavailable', 'reconciliationLimit', 'contentStateInvalid']),
  reason: new Set(['none', 'valueMissing', 'declaredTypeMissingValue', 'changeCountChanged', 'activityUnavailable', 'activityIDNotFound', 'activityAmbiguous', 'activityInactive', 'propsInvalid', 'historyUnavailable', 'contentStateInvalid', 'newerOperation', 'cancelled', 'queueError']),
  requestedState: new Set(['ready', 'processing', 'queued', 'alreadyQueued', 'invalid', 'failed']),
  state: new Set(['ready', 'processing', 'queued', 'alreadyQueued', 'invalid', 'failed']),
  phase: new Set(['started', 'submitted', 'failed', 'skipped', 'waitStarted', 'waitInterrupted']),
};

function isQuickSaveDiagnosticValueAllowed(key: string, value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 80) return false;
  if (['activityIDPresent', 'attempted', 'valueAvailable', 'hasURLs', 'hasStrings', 'changeCountChanged', 'historyUpdated', 'appGroupAvailable'].includes(key)) {
    return value === 'true' || value === 'false';
  }
  if (['changeCount', 'itemCount', 'changeCountAfter', 'historyRevision'].includes(key)) {
    return /^-?\d{1,16}$/.test(value);
  }
  if (key === 'sceneStates') {
    const allowed = new Set(['foregroundActive', 'foregroundInactive', 'background', 'unattached', 'unavailable']);
    const states = value.split(',');
    return states.length > 0 && states.every((state) => allowed.has(state));
  }
  if (quickSaveDiagnosticEnums[key]) return quickSaveDiagnosticEnums[key].has(value);
  if (['runtimeOS', 'appVersion', 'appBuild', 'xcodeVersion', 'xcodeBuild'].includes(key)) {
    return value === 'unavailable' || /^[0-9.]{1,32}$/.test(value);
  }
  if (key === 'compiledSDK') {
    return value === 'unavailable' || /^(iphoneos|iphonesimulator)[0-9.]{1,24}$/.test(value);
  }
  return false;
}

/** Accepts only the fixed, metadata-only report schema written by the native Quick Save intent. */
export function parseQuickSaveDiagnosticReport(raw: unknown): QuickSaveDiagnosticReport | null {
  if (typeof raw !== 'string' || raw.length > 96_000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const value = parsed as Record<string, unknown>;
  if (value.schemaVersion !== 1 || !Array.isArray(value.operations)) return null;

  const operations: QuickSaveDiagnosticOperation[] = [];
  for (const candidate of value.operations.slice(-6)) {
    if (!candidate || typeof candidate !== 'object') continue;
    const operation = candidate as Record<string, unknown>;
    if (typeof operation.operationID !== 'string' || !/^[A-F0-9]{8}$/.test(operation.operationID) ||
        typeof operation.startedAt !== 'number' || !Number.isFinite(operation.startedAt) ||
        !operation.environment || typeof operation.environment !== 'object' || !Array.isArray(operation.events)) continue;

    const environment: Record<string, string> = {};
    for (const [key, item] of Object.entries(operation.environment as Record<string, unknown>)) {
      if (quickSaveDiagnosticEnvironmentKeys.has(key) && isQuickSaveDiagnosticValueAllowed(key, item)) environment[key] = item;
    }

    const events: QuickSaveDiagnosticEvent[] = [];
    for (const eventCandidate of operation.events.slice(-48)) {
      if (!eventCandidate || typeof eventCandidate !== 'object') continue;
      const event = eventCandidate as Record<string, unknown>;
      if (typeof event.name !== 'string' || !quickSaveDiagnosticEvents[event.name] ||
          typeof event.elapsedMilliseconds !== 'number' || !Number.isSafeInteger(event.elapsedMilliseconds) || event.elapsedMilliseconds < 0 ||
          !event.values || typeof event.values !== 'object') continue;
      const values: Record<string, string> = {};
      for (const [key, item] of Object.entries(event.values as Record<string, unknown>)) {
        if (quickSaveDiagnosticEvents[event.name].has(key) && isQuickSaveDiagnosticValueAllowed(key, item)) values[key] = item;
      }
      events.push({ name: event.name, elapsedMilliseconds: event.elapsedMilliseconds, values });
    }
    operations.push({ operationID: operation.operationID, startedAt: operation.startedAt, environment, events });
  }
  return { schemaVersion: 1, operations };
}

export type QuickSaveLockScreenSettings = {
  showRecentLinks: boolean;
  quickSaveStatus: 'ready' | 'processing' | 'queued' | 'alreadyQueued' | 'invalid' | 'failed';
};

let cachedModule: ClipboardURLDetectionNativeModule | null | undefined;

function getNativeModule(): ClipboardURLDetectionNativeModule | null {
  if (Platform.OS !== 'ios') return null;
  if (cachedModule !== undefined) return cachedModule;
  try {
    cachedModule = requireOptionalNativeModule<ClipboardURLDetectionNativeModule>(
      'SaveAppClipboardURLDetection',
    );
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

/** Emits only fixed, privacy-reviewed event codes to the app's native OSLog subsystem. */
export function recordSaveAppDiagnosticEvent(event: SaveAppDiagnosticEvent): void {
  try {
    getNativeModule()?.recordDiagnosticEvent?.(event);
  } catch {
    // Diagnostics are best-effort and must not affect clipboard or navigation behavior.
  }
}

export function getQuickSaveDiagnosticReport(): QuickSaveDiagnosticReport | null {
  try {
    const raw = getNativeModule()?.getQuickSaveDiagnosticReport?.();
    return parseQuickSaveDiagnosticReport(raw);
  } catch {
    return null;
  }
}

export function clearQuickSaveDiagnosticReport(): boolean {
  try {
    return getNativeModule()?.clearQuickSaveDiagnosticReport?.() === true;
  } catch {
    return false;
  }
}

export function getQuickSaveLockScreenSettings(): QuickSaveLockScreenSettings | null {
  try {
    const result = getNativeModule()?.getQuickSaveLockScreenSettings?.();
    if (!result || typeof result !== 'object') return null;
    const value = result as Record<string, unknown>;
    const statuses = new Set<QuickSaveLockScreenSettings['quickSaveStatus']>([
      'ready', 'processing', 'queued', 'alreadyQueued', 'invalid', 'failed',
    ]);
    if (typeof value.showRecentLinks !== 'boolean' || typeof value.quickSaveStatus !== 'string' ||
        !statuses.has(value.quickSaveStatus as QuickSaveLockScreenSettings['quickSaveStatus'])) return null;
    return {
      showRecentLinks: value.showRecentLinks,
      quickSaveStatus: value.quickSaveStatus as QuickSaveLockScreenSettings['quickSaveStatus'],
    };
  } catch {
    return null;
  }
}

export function setQuickSaveLockScreenRecentLinksVisible(visible: boolean): boolean {
  try {
    return getNativeModule()?.setQuickSaveLockScreenRecentLinksVisible?.(visible) === true;
  } catch {
    return false;
  }
}

export function setQuickSaveActivityStatus(status: QuickSaveLockScreenSettings['quickSaveStatus']): boolean {
  try {
    return getNativeModule()?.setQuickSaveActivityStatus?.(status) === true;
  } catch {
    return false;
  }
}

/** Associates only the hashed Quick Save history entry with its committed SQLite row ID. */
export function associateQuickSaveLockScreenContent(id: string, savedContentId: number): boolean {
  try {
    return getNativeModule()?.associateQuickSaveLockScreenContent?.(id, savedContentId) === true;
  } catch {
    return false;
  }
}

/** Stores a validated, small image in the App Group only while lock-screen history is opted in. */
export function storeQuickSaveLockScreenFavicon(id: string, base64: string): boolean {
  try {
    return getNativeModule()?.storeQuickSaveLockScreenFavicon?.(id, base64) === true;
  } catch {
    return false;
  }
}

export async function getClipboardURLDetectionSnapshot(): Promise<ClipboardURLDetectionSnapshot | null> {
  const nativeModule = getNativeModule();
  if (!nativeModule) return null;

  try {
    const result = (await nativeModule.getDetectionSnapshotAsync()) as Record<string, unknown> | null;
    if (
      !result ||
      !Number.isSafeInteger(result.changeCount) ||
      typeof result.hasURLItem !== 'boolean' ||
      typeof result.hasProbableWebURL !== 'boolean'
    ) {
      return null;
    }
    return {
      changeCount: result.changeCount as number,
      hasURLItem: result.hasURLItem,
      hasProbableWebURL: result.hasProbableWebURL,
      ...(typeof result.systemUptime === 'number' ? { systemUptime: result.systemUptime } : {}),
      ...(Number.isSafeInteger(result.quickSaveHandledChangeCount)
        ? { quickSaveHandledChangeCount: result.quickSaveHandledChangeCount as number }
        : {}),
      ...(typeof result.quickSaveHandledSystemUptime === 'number'
        ? { quickSaveHandledSystemUptime: result.quickSaveHandledSystemUptime }
        : {}),
    };
  } catch {
    return null;
  }
}
