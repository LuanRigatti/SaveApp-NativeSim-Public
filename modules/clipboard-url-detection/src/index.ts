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
