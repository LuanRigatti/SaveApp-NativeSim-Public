import { shouldOfferClipboardLink } from './clipboardLinkOffer';

export type ClipboardOfferTraceSource =
  | 'home-detector'
  | 'home-clipboard-offer'
  | 'home-manual'
  | 'dynamic-island';

export type ClipboardOfferDecisionReason =
  | 'invalid-change-count'
  | 'suppressed-until-change'
  | 'explicit-flow-active'
  | 'already-handled'
  | 'dismissed-until-change'
  | 'deferred-until-resume'
  | 'offer-already-reserved'
  | 'clipboard-has-no-web-link'
  | 'already-saved-url'
  | 'verification-unavailable'
  | 'eligible';

export type ClipboardOfferTraceEvent =
  | 'bundle-loaded'
  | 'check-started'
  | 'detector-mounted'
  | 'detector-unmounted'
  | 'detector-focused'
  | 'detector-blurred'
  | 'app-state-changed'
  | 'clipboard-listener-fired'
  | 'check-skipped'
  | 'snapshot-observed'
  | 'offer-decision'
  | 'offer-reserved'
  | 'offer-presented'
  | 'offer-cancelled'
  | 'offer-save-selected'
  | 'clipboard-read-started'
  | 'clipboard-read-result'
  | 'candidate-dispatched'
  | 'candidate-received'
  | 'candidate-rejected'
  | 'composer-presented'
  | 'composer-mounted'
  | 'composer-close-requested'
  | 'composer-cancelled'
  | 'composer-confirmed'
  | 'persistence-started'
  | 'persistence-succeeded'
  | 'persistence-failed'
  | 'save-error-presented'
  | 'save-retry-selected'
  | 'clipboard-event-handled'
  | 'clipboard-url-handled'
  | 'clipboard-event-deferred'
  | 'composer-closed'
  | 'submission-result'
  | 'home-focused'
  | 'navigation-returned'
  | 'composer-route-opened'
  | 'clipboard-consumption-callback-failed';

type ClipboardOfferTraceFields = {
  source?: ClipboardOfferTraceSource;
  detectorInstanceID?: string;
  correlationID?: string | null;
  changeCount?: number | null;
  previousChangeCount?: number | null;
  previousAppState?: string | null;
  appState?: string | null;
  focused?: boolean;
  canPresent?: boolean;
  hasURLItem?: boolean;
  hasProbableWebURL?: boolean;
  clipboardEventType?: 'url' | 'plain-text' | 'other';
  reason?: ClipboardOfferDecisionReason | 'not-focused' | 'home-not-eligible' | 'app-not-active' | 'storage-not-ready' | 'dialog-active' | 'clipboard-read-active' | 'check-in-flight' | 'explicit-flow' | 'snapshot-unavailable' | 'saved-url-identity-check';
  result?: 'saved' | 'failed' | 'cancelled' | 'busy' | 'empty' | 'valid' | 'invalid' | 'duplicate' | 'changed' | 'unavailable';
};

const CLIPBOARD_DIAGNOSTICS_BUNDLE_MARKER = 'saveapp-clipboard-offer-2026-11-02-v2';
let nextClipboardEventCorrelation = 0;
const clipboardEventCorrelations = new Map<number, string>();

function isDevelopmentBundle(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

export function getClipboardOfferCorrelationID(changeCount: number | null | undefined): string | null {
  if (!isValidChangeCount(changeCount)) return null;
  const existing = clipboardEventCorrelations.get(changeCount);
  if (existing) return existing;

  const correlationID = `clip-${++nextClipboardEventCorrelation}`;
  clipboardEventCorrelations.set(changeCount, correlationID);
  while (clipboardEventCorrelations.size > 32) {
    const oldestKey = clipboardEventCorrelations.keys().next().value;
    if (oldestKey == null) break;
    clipboardEventCorrelations.delete(oldestKey);
  }
  return correlationID;
}

export function traceClipboardOfferEvent(
  event: ClipboardOfferTraceEvent,
  fields: ClipboardOfferTraceFields = {},
): void {
  if (!isDevelopmentBundle()) return;
  const payload = {
    marker: CLIPBOARD_DIAGNOSTICS_BUNDLE_MARKER,
    event,
    ...fields,
  };
  // Keep this payload metadata-only. Never pass clipboard text, URLs, errors, or tokens here.
  console.info('[SaveApp][clipboard-offer]', JSON.stringify(payload));
}

if (isDevelopmentBundle()) {
  traceClipboardOfferEvent('bundle-loaded', { source: 'home-detector' });
}

function isValidChangeCount(changeCount: number | null | undefined): changeCount is number {
  return Number.isSafeInteger(changeCount) && (changeCount as number) >= 0;
}

export function createClipboardLinkOfferState() {
  let lastHandledChangeCount: number | null = null;
  let revision = 0;
  let hasLocalConsumption = false;
  let explicitFlowCount = 0;
  let suppressUntilClipboardChanges = false;
  let suppressedChangeCount: number | null = null;
  let dismissedChangeCount: number | null = null;
  const reservedChangeCounts = new Set<number>();
  const deferredChangeCounts = new Set<number>();
  const handledNormalizedURLs = new Set<string>();

  function noteLocalStateChange(): void {
    hasLocalConsumption = true;
    revision += 1;
  }

  function clearTransientStateForDifferentChange(changeCount: number): void {
    if (dismissedChangeCount != null && dismissedChangeCount !== changeCount) {
      dismissedChangeCount = null;
    }
    if (deferredChangeCounts.size > 0 && !deferredChangeCounts.has(changeCount)) {
      deferredChangeCounts.clear();
    }
  }

  function getOfferDecision(
    hasURLItem: boolean,
    hasProbableWebURL: boolean,
    changeCount: number,
  ): { eligible: boolean; reason: ClipboardOfferDecisionReason } {
    if (!isValidChangeCount(changeCount)) return { eligible: false, reason: 'invalid-change-count' };
    clearTransientStateForDifferentChange(changeCount);
    if (suppressUntilClipboardChanges) {
      if (suppressedChangeCount == null) {
        suppressedChangeCount = changeCount;
        return { eligible: false, reason: 'suppressed-until-change' };
      }
      if (changeCount === suppressedChangeCount) {
        return { eligible: false, reason: 'suppressed-until-change' };
      }
      suppressUntilClipboardChanges = false;
      suppressedChangeCount = null;
    }

    if (explicitFlowCount > 0) return { eligible: false, reason: 'explicit-flow-active' };
    if (lastHandledChangeCount === changeCount) return { eligible: false, reason: 'already-handled' };
    if (dismissedChangeCount === changeCount) {
      return { eligible: false, reason: 'dismissed-until-change' };
    }
    if (deferredChangeCounts.has(changeCount)) {
      return { eligible: false, reason: 'deferred-until-resume' };
    }
    if (reservedChangeCounts.has(changeCount)) {
      return { eligible: false, reason: 'offer-already-reserved' };
    }
    if (!shouldOfferClipboardLink(
      hasURLItem,
      hasProbableWebURL,
      changeCount,
      lastHandledChangeCount,
    )) return { eligible: false, reason: 'clipboard-has-no-web-link' };
    return { eligible: true, reason: 'eligible' };
  }

  return {
    beginExplicitFlow(): () => void {
      explicitFlowCount += 1;
      let released = false;

      return () => {
        if (released) return;
        released = true;
        explicitFlowCount = Math.max(0, explicitFlowCount - 1);
      };
    },

    getLastHandledChangeCount(): number | null {
      return lastHandledChangeCount;
    },

    isHandled(changeCount: number): boolean {
      return isValidChangeCount(changeCount) && lastHandledChangeCount === changeCount;
    },

    getRevision(): number {
      return revision;
    },

    hasExplicitFlow(): boolean {
      return explicitFlowCount > 0;
    },

    markURLHandled(normalizedURL: string): boolean {
      if (!/^https?:\/\//i.test(normalizedURL) || normalizedURL.length > 8_192) return false;
      handledNormalizedURLs.delete(normalizedURL);
      handledNormalizedURLs.add(normalizedURL);
      while (handledNormalizedURLs.size > 64) {
        const oldestURL = handledNormalizedURLs.values().next().value;
        if (oldestURL == null) break;
        handledNormalizedURLs.delete(oldestURL);
      }
      return true;
    },

    getHandledURLs(): ReadonlySet<string> {
      return new Set(handledNormalizedURLs);
    },

    suppressCurrentClipboardOfferUntilChange(): void {
      suppressUntilClipboardChanges = true;
      suppressedChangeCount = null;
    },

    suppressCurrentClipboardOffer(changeCount: number): void {
      if (!isValidChangeCount(changeCount)) return;
      lastHandledChangeCount = changeCount;
      reservedChangeCounts.delete(changeCount);
      deferredChangeCounts.delete(changeCount);
      if (dismissedChangeCount === changeCount) dismissedChangeCount = null;
      suppressUntilClipboardChanges = false;
      suppressedChangeCount = null;
      hasLocalConsumption = true;
      revision += 1;
    },

    markHandled(changeCount: number | null | undefined): boolean {
      if (!isValidChangeCount(changeCount)) return false;
      lastHandledChangeCount = changeCount;
      reservedChangeCounts.delete(changeCount);
      deferredChangeCounts.delete(changeCount);
      if (dismissedChangeCount === changeCount) dismissedChangeCount = null;
      noteLocalStateChange();
      return true;
    },

    reserveOffer(changeCount: number): boolean {
      if (!isValidChangeCount(changeCount)) return false;
      clearTransientStateForDifferentChange(changeCount);
      if (
        lastHandledChangeCount === changeCount ||
        dismissedChangeCount === changeCount ||
        deferredChangeCounts.has(changeCount) ||
        reservedChangeCounts.has(changeCount) ||
        explicitFlowCount > 0
      ) {
        return false;
      }
      reservedChangeCounts.add(changeCount);
      noteLocalStateChange();
      return true;
    },

    dismissOfferUntilClipboardChanges(changeCount: number): void {
      if (!isValidChangeCount(changeCount)) return;
      reservedChangeCounts.delete(changeCount);
      deferredChangeCounts.delete(changeCount);
      dismissedChangeCount = changeCount;
      noteLocalStateChange();
    },

    deferOfferUntilResume(changeCount: number): void {
      if (!isValidChangeCount(changeCount)) return;
      if (lastHandledChangeCount === changeCount) {
        reservedChangeCounts.delete(changeCount);
        deferredChangeCounts.delete(changeCount);
        return;
      }
      reservedChangeCounts.delete(changeCount);
      if (dismissedChangeCount === changeCount) dismissedChangeCount = null;
      deferredChangeCounts.add(changeCount);
      noteLocalStateChange();
    },

    deferReservedOffersUntilResume(): void {
      if (reservedChangeCounts.size === 0) return;
      for (const changeCount of reservedChangeCounts) deferredChangeCounts.add(changeCount);
      reservedChangeCounts.clear();
      noteLocalStateChange();
    },

    resumeDeferredOffers(): void {
      if (deferredChangeCounts.size === 0) return;
      deferredChangeCounts.clear();
      noteLocalStateChange();
    },

    getOfferDecision(
      hasURLItem: boolean,
      hasProbableWebURL: boolean,
      changeCount: number,
    ): { eligible: boolean; reason: ClipboardOfferDecisionReason } {
      return getOfferDecision(hasURLItem, hasProbableWebURL, changeCount);
    },

    shouldOffer(
      hasURLItem: boolean,
      hasProbableWebURL: boolean,
      changeCount: number,
    ): boolean {
      return getOfferDecision(hasURLItem, hasProbableWebURL, changeCount).eligible;
    },

    restorePersisted(changeCount: number | null, expectedRevision: number): boolean {
      if (hasLocalConsumption || revision !== expectedRevision) return false;
      lastHandledChangeCount = isValidChangeCount(changeCount) ? changeCount : null;
      revision += 1;
      return true;
    },
  };
}

export const clipboardLinkOfferState = createClipboardLinkOfferState();
