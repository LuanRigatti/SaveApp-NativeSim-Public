import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { ContentType } from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState, Platform } from 'react-native';

import {
  getClipboardURLDetectionSnapshot,
  recordSaveAppDiagnosticEvent,
} from '../../../modules/clipboard-url-detection/src';
import {
  verifyClipboardOfferCandidate,
  wasClipboardChangeHandledByQuickSave,
} from './clipboardLinkOffer';
import {
  clipboardLinkOfferState,
  getClipboardOfferCorrelationID,
  traceClipboardOfferEvent,
  type ClipboardOfferTraceSource,
} from '@/features/home-content/clipboardLinkOfferState';

const LAST_HANDLED_CHANGE_COUNT_KEY = '@saveapp/clipboard-link-offer-change-count-v1';
const EMPTY_SAVED_NORMALIZED_URLS: ReadonlySet<string> = new Set();
let persistenceQueue: Promise<void> = Promise.resolve();
let detectorInstanceSequence = 0;

function persistHandledClipboardChangeCount(changeCount: number): void {
  persistenceQueue = persistenceQueue
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(LAST_HANDLED_CHANGE_COUNT_KEY, String(changeCount)))
    .catch(() => {
      recordSaveAppDiagnosticEvent('clipboard.offer.marker_persistence_failed');
      console.warn('[SaveApp] clipboard_offer.marker_persistence_failed');
    });
}

export function markClipboardLinkChangeCountHandled(changeCount: number | null | undefined): void {
  if (!clipboardLinkOfferState.markHandled(changeCount)) return;
  const value = clipboardLinkOfferState.getLastHandledChangeCount();
  if (value == null) return;

  traceClipboardOfferEvent('clipboard-event-handled', {
    source: 'home-clipboard-offer',
    changeCount: value,
    correlationID: getClipboardOfferCorrelationID(value),
  });
  persistHandledClipboardChangeCount(value);
}

export function markClipboardLinkURLHandled(
  normalizedURL: string,
  source: ClipboardOfferTraceSource = 'home-clipboard-offer',
): void {
  if (!clipboardLinkOfferState.markURLHandled(normalizedURL)) return;
  traceClipboardOfferEvent('clipboard-url-handled', {
    source,
    result: 'saved',
  });
}

export function deferClipboardLinkOfferUntilResume(changeCount: number): void {
  clipboardLinkOfferState.deferOfferUntilResume(changeCount);
  traceClipboardOfferEvent('clipboard-event-deferred', {
    source: 'home-clipboard-offer',
    changeCount,
    correlationID: getClipboardOfferCorrelationID(changeCount),
    reason: clipboardLinkOfferState.isHandled(changeCount) ? 'already-handled' : 'deferred-until-resume',
  });
}

export function beginDynamicIslandClipboardFlow(): () => void {
  return clipboardLinkOfferState.beginExplicitFlow();
}

export function suppressClipboardLinkOfferUntilClipboardChanges(): void {
  clipboardLinkOfferState.suppressCurrentClipboardOfferUntilChange();
}

export function suppressClipboardLinkOfferForChangeCount(changeCount: number): void {
  clipboardLinkOfferState.suppressCurrentClipboardOffer(changeCount);
  persistHandledClipboardChangeCount(changeCount);
}

type ClipboardLinkOfferOptions = {
  enabled: boolean;
  canPresent: boolean;
  knownSavedNormalizedURLs?: ReadonlySet<string>;
  onSaveCandidate: (clipboardText: string, changeCount: number, detectorInstanceID: string) => void;
};

export function useClipboardLinkOffer({
  enabled,
  canPresent,
  knownSavedNormalizedURLs = EMPTY_SAVED_NORMALIZED_URLS,
  onSaveCandidate,
}: ClipboardLinkOfferOptions): void {
  const enabledRef = useRef(enabled);
  const canPresentRef = useRef(canPresent);
  const onSaveCandidateRef = useRef(onSaveCandidate);
  const knownSavedNormalizedURLsRef = useRef(knownSavedNormalizedURLs);
  const isFocusedRef = useRef(false);
  const isStorageReadyRef = useRef(false);
  const isCheckingRef = useRef(false);
  const isAlertVisibleRef = useRef(false);
  const isReadingClipboardRef = useRef(false);
  const activeOfferChangeCountRef = useRef<number | null>(null);
  const preflightedClipboardRef = useRef<{ changeCount: number; text: string } | null>(null);
  const readAttemptIDRef = useRef(0);
  const checkClipboardRef = useRef<() => void>(() => undefined);
  const detectorInstanceIDRef = useRef<string | null>(null);
  if (detectorInstanceIDRef.current == null) {
    detectorInstanceIDRef.current = `detector-${++detectorInstanceSequence}`;
  }

  const trace = useCallback((
    event: Parameters<typeof traceClipboardOfferEvent>[0],
    changeCount?: number | null,
    fields: Parameters<typeof traceClipboardOfferEvent>[1] = {},
  ) => {
    traceClipboardOfferEvent(event, {
      source: 'home-detector',
      detectorInstanceID: detectorInstanceIDRef.current ?? undefined,
      correlationID: getClipboardOfferCorrelationID(changeCount),
      changeCount,
      focused: isFocusedRef.current,
      canPresent: canPresentRef.current,
      appState: AppState.currentState,
      ...fields,
    });
  }, []);

  const deferActiveOfferUntilResume = useCallback(() => {
    const changeCount = activeOfferChangeCountRef.current;
    const hasActiveOffer = isAlertVisibleRef.current || isReadingClipboardRef.current;
    if (changeCount != null && hasActiveOffer) {
      readAttemptIDRef.current += 1;
      clipboardLinkOfferState.deferOfferUntilResume(changeCount);
      trace('clipboard-event-deferred', changeCount, { reason: 'deferred-until-resume' });
    }
    activeOfferChangeCountRef.current = null;
    isAlertVisibleRef.current = false;
    isReadingClipboardRef.current = false;
    preflightedClipboardRef.current = null;
    clipboardLinkOfferState.deferReservedOffersUntilResume();
  }, [trace]);

  const checkClipboard = useCallback(async () => {
    const earlyReason = Platform.OS !== 'ios'
      ? 'home-not-eligible'
      : !enabledRef.current || !canPresentRef.current
        ? 'home-not-eligible'
        : !isFocusedRef.current
          ? 'not-focused'
          : !isStorageReadyRef.current
            ? 'storage-not-ready'
            : clipboardLinkOfferState.hasExplicitFlow()
              ? 'explicit-flow'
              : isCheckingRef.current
                ? 'check-in-flight'
                : isAlertVisibleRef.current
                  ? 'dialog-active'
                  : isReadingClipboardRef.current
                    ? 'clipboard-read-active'
                    : null;
    if (earlyReason) {
      trace('check-skipped', activeOfferChangeCountRef.current, { reason: earlyReason });
      return;
    }

    const appState = AppState.currentState;
    if (appState != null && appState !== 'active') {
      trace('check-skipped', activeOfferChangeCountRef.current, { reason: 'app-not-active' });
      return;
    }

    trace('check-started', activeOfferChangeCountRef.current);
    recordSaveAppDiagnosticEvent('clipboard.offer.check_started');
    isCheckingRef.current = true;
    let shouldRecheckAfterClipboardChange = false;
    try {
      const snapshot = await getClipboardURLDetectionSnapshot();
      if (
        !snapshot ||
        !enabledRef.current ||
        !canPresentRef.current ||
        !isFocusedRef.current ||
        clipboardLinkOfferState.hasExplicitFlow() ||
        isReadingClipboardRef.current ||
        (AppState.currentState != null && AppState.currentState !== 'active')
      ) {
        if (!snapshot) recordSaveAppDiagnosticEvent('clipboard.offer.snapshot_unavailable');
        trace('check-skipped', snapshot?.changeCount ?? activeOfferChangeCountRef.current, {
          reason: !snapshot ? 'snapshot-unavailable' : 'home-not-eligible',
          hasURLItem: snapshot?.hasURLItem,
          hasProbableWebURL: snapshot?.hasProbableWebURL,
        });
        return;
      }

      trace('snapshot-observed', snapshot.changeCount, {
        hasURLItem: snapshot.hasURLItem,
        hasProbableWebURL: snapshot.hasProbableWebURL,
      });

      if (wasClipboardChangeHandledByQuickSave(
        snapshot.changeCount,
        snapshot.quickSaveHandledChangeCount,
        snapshot.systemUptime,
        snapshot.quickSaveHandledSystemUptime,
      )) {
        recordSaveAppDiagnosticEvent('clipboard.offer.quick_save_marker_matched');
        trace('offer-decision', snapshot.changeCount, { reason: 'already-handled' });
        markClipboardLinkChangeCountHandled(snapshot.changeCount);
        return;
      }

      const decision = clipboardLinkOfferState.getOfferDecision(
        snapshot.hasURLItem,
        snapshot.hasProbableWebURL,
        snapshot.changeCount,
      );
      trace('offer-decision', snapshot.changeCount, { reason: decision.reason });
      if (!decision.eligible) {
        recordSaveAppDiagnosticEvent('clipboard.offer.no_candidate');
        return;
      }

      const offeredChangeCount = snapshot.changeCount;
      if (!clipboardLinkOfferState.reserveOffer(offeredChangeCount)) {
        trace('offer-reserved', offeredChangeCount, { reason: 'offer-already-reserved' });
        return;
      }
      trace('offer-reserved', offeredChangeCount, { reason: 'eligible' });
      activeOfferChangeCountRef.current = offeredChangeCount;

      const knownSavedNormalizedURLs = new Set([
        ...knownSavedNormalizedURLsRef.current,
        ...clipboardLinkOfferState.getHandledURLs(),
      ]);
      let preflightedClipboardText: string | null = null;

      if (knownSavedNormalizedURLs.size > 0) {
        isReadingClipboardRef.current = true;
        const preflightAttemptID = ++readAttemptIDRef.current;
        trace('clipboard-read-started', offeredChangeCount, { reason: 'saved-url-identity-check' });
        const verification = await verifyClipboardOfferCandidate({
          expectedChangeCount: offeredChangeCount,
          readSnapshot: getClipboardURLDetectionSnapshot,
          readClipboardText: async (currentSnapshot) => {
            recordSaveAppDiagnosticEvent(currentSnapshot.hasURLItem
              ? 'clipboard.offer.read_url'
              : 'clipboard.offer.read_text');
            return currentSnapshot.hasURLItem
              ? Clipboard.getUrlAsync()
              : Clipboard.getStringAsync();
          },
          savedNormalizedURLs: knownSavedNormalizedURLs,
        });

        if (
          preflightAttemptID !== readAttemptIDRef.current ||
          activeOfferChangeCountRef.current !== offeredChangeCount ||
          !enabledRef.current ||
          !canPresentRef.current ||
          !isFocusedRef.current ||
          !isStorageReadyRef.current ||
          clipboardLinkOfferState.hasExplicitFlow() ||
          (AppState.currentState != null && AppState.currentState !== 'active')
        ) {
          if (activeOfferChangeCountRef.current === offeredChangeCount) {
            isReadingClipboardRef.current = false;
            activeOfferChangeCountRef.current = null;
            clipboardLinkOfferState.deferOfferUntilResume(offeredChangeCount);
            trace('clipboard-event-deferred', offeredChangeCount, { reason: 'deferred-until-resume' });
          }
          preflightedClipboardRef.current = null;
          return;
        }

        isReadingClipboardRef.current = false;
        const latestKnownURLs = new Set([
          ...knownSavedNormalizedURLsRef.current,
          ...clipboardLinkOfferState.getHandledURLs(),
        ]);
        if (
          verification.status === 'duplicate' ||
          (verification.status === 'ready' && latestKnownURLs.has(verification.normalizedURL))
        ) {
          const normalizedURL = verification.normalizedURL;
          markClipboardLinkURLHandled(normalizedURL, 'home-detector');
          activeOfferChangeCountRef.current = null;
          markClipboardLinkChangeCountHandled(offeredChangeCount);
          recordSaveAppDiagnosticEvent('clipboard.offer.candidate_duplicate');
          trace('offer-decision', offeredChangeCount, {
            reason: 'already-saved-url',
            result: 'duplicate',
          });
          return;
        }

        if (verification.status === 'unavailable') {
          activeOfferChangeCountRef.current = null;
          clipboardLinkOfferState.deferOfferUntilResume(offeredChangeCount);
          trace('offer-decision', offeredChangeCount, {
            reason: 'verification-unavailable',
            result: 'unavailable',
          });
          return;
        }

        if (verification.status === 'changed') {
          activeOfferChangeCountRef.current = null;
          clipboardLinkOfferState.deferOfferUntilResume(offeredChangeCount);
          trace('clipboard-read-result', offeredChangeCount, { result: 'changed' });
          shouldRecheckAfterClipboardChange = true;
          return;
        }

        if ('clipboardText' in verification) {
          preflightedClipboardText = verification.clipboardText;
          trace('clipboard-read-result', offeredChangeCount, {
            result: verification.status === 'ready' ? 'valid' : 'invalid',
          });
        }
      }

      if (
        !enabledRef.current ||
        !canPresentRef.current ||
        !isFocusedRef.current ||
        !isStorageReadyRef.current ||
        clipboardLinkOfferState.hasExplicitFlow() ||
        (AppState.currentState != null && AppState.currentState !== 'active')
      ) {
        activeOfferChangeCountRef.current = null;
        clipboardLinkOfferState.deferOfferUntilResume(offeredChangeCount);
        return;
      }

      preflightedClipboardRef.current = preflightedClipboardText == null
        ? null
        : { changeCount: offeredChangeCount, text: preflightedClipboardText };
      isAlertVisibleRef.current = true;
      recordSaveAppDiagnosticEvent('clipboard.offer.presented');
      trace('offer-presented', offeredChangeCount, { reason: 'eligible' });

      const dismissOffer = () => {
        if (
          activeOfferChangeCountRef.current !== offeredChangeCount ||
          !isAlertVisibleRef.current
        ) return;
        isAlertVisibleRef.current = false;
        activeOfferChangeCountRef.current = null;
        preflightedClipboardRef.current = null;
        clipboardLinkOfferState.dismissOfferUntilClipboardChanges(offeredChangeCount);
        recordSaveAppDiagnosticEvent('clipboard.offer.dismissed');
        trace('offer-cancelled', offeredChangeCount, { result: 'cancelled' });
        checkClipboardRef.current();
      };

      Alert.alert(
        'Salvar link copiado?',
        'Deseja salvar este link no SaveApp?',
        [
          { text: 'Agora não', style: 'cancel', onPress: dismissOffer },
          {
            text: 'Salvar',
            onPress: () => {
              if (
                activeOfferChangeCountRef.current !== offeredChangeCount ||
                !isAlertVisibleRef.current
              ) return;
              isAlertVisibleRef.current = false;
              isReadingClipboardRef.current = true;
              const preflightedClipboard = preflightedClipboardRef.current?.changeCount === offeredChangeCount
                ? preflightedClipboardRef.current.text
                : null;
              preflightedClipboardRef.current = null;
              const readAttemptID = ++readAttemptIDRef.current;
              recordSaveAppDiagnosticEvent('clipboard.offer.save_selected');
              trace('offer-save-selected', offeredChangeCount);
              void (async () => {
                let candidateWasDispatched = false;
                try {
                  recordSaveAppDiagnosticEvent('clipboard.offer.read_started');
                  trace('clipboard-read-started', offeredChangeCount);
                  const currentSnapshot = await getClipboardURLDetectionSnapshot();
                  if (!currentSnapshot || currentSnapshot.changeCount !== offeredChangeCount) {
                    recordSaveAppDiagnosticEvent('clipboard.offer.change_count_changed');
                    trace('clipboard-read-result', currentSnapshot?.changeCount ?? offeredChangeCount, {
                      previousChangeCount: offeredChangeCount,
                      result: 'changed',
                    });
                    return;
                  }

                  const clipboardText = preflightedClipboard ?? await (currentSnapshot.hasURLItem
                    ? Clipboard.getUrlAsync()
                    : Clipboard.getStringAsync());
                  if (preflightedClipboard == null) {
                    recordSaveAppDiagnosticEvent(currentSnapshot.hasURLItem
                      ? 'clipboard.offer.read_url'
                      : 'clipboard.offer.read_text');
                  }
                  trace('clipboard-read-result', offeredChangeCount, {
                    result: clipboardText?.trim() ? 'valid' : 'empty',
                  });
                  const latestSnapshot = await getClipboardURLDetectionSnapshot();
                  if (!latestSnapshot || latestSnapshot.changeCount !== offeredChangeCount) {
                    recordSaveAppDiagnosticEvent('clipboard.offer.change_count_changed');
                    trace('clipboard-read-result', latestSnapshot?.changeCount ?? offeredChangeCount, {
                      previousChangeCount: offeredChangeCount,
                      result: 'changed',
                    });
                    return;
                  }
                  if (
                    readAttemptID !== readAttemptIDRef.current ||
                    !enabledRef.current ||
                    !canPresentRef.current ||
                    !isFocusedRef.current ||
                    clipboardLinkOfferState.hasExplicitFlow() ||
                    (AppState.currentState != null && AppState.currentState !== 'active')
                  ) {
                    return;
                  }
                  if (clipboardText?.trim()) {
                    onSaveCandidateRef.current(
                      clipboardText,
                      offeredChangeCount,
                      detectorInstanceIDRef.current ?? 'detector-unknown',
                    );
                    candidateWasDispatched = true;
                    activeOfferChangeCountRef.current = null;
                    recordSaveAppDiagnosticEvent('clipboard.offer.candidate_dispatched');
                    trace('candidate-dispatched', offeredChangeCount, { result: 'valid' });
                  } else {
                    recordSaveAppDiagnosticEvent('clipboard.offer.read_empty');
                    trace('clipboard-read-result', offeredChangeCount, { result: 'empty' });
                  }
                } catch {
                  // iOS may deny paste access; do not retry or expose clipboard contents.
                  recordSaveAppDiagnosticEvent('clipboard.offer.read_failed');
                  trace('clipboard-read-result', offeredChangeCount, { result: 'unavailable' });
                } finally {
                  if (readAttemptID !== readAttemptIDRef.current) return;
                  isReadingClipboardRef.current = false;
                  // A dispatched candidate may have opened another native alert or the composer.
                  // Recheck only when no follow-up UI was requested.
                  if (!candidateWasDispatched) {
                    activeOfferChangeCountRef.current = null;
                    clipboardLinkOfferState.deferOfferUntilResume(offeredChangeCount);
                    trace('clipboard-event-deferred', offeredChangeCount, { reason: 'deferred-until-resume' });
                    checkClipboardRef.current();
                  }
                }
              })();
            },
          },
        ],
      );
    } catch {
      // Clipboard type and pattern detection are best-effort and never read values here.
      recordSaveAppDiagnosticEvent('clipboard.offer.snapshot_unavailable');
    } finally {
      isCheckingRef.current = false;
      if (shouldRecheckAfterClipboardChange) checkClipboardRef.current();
    }
  }, [trace]);

  useEffect(() => {
    enabledRef.current = enabled;
    canPresentRef.current = canPresent;
    onSaveCandidateRef.current = onSaveCandidate;
    knownSavedNormalizedURLsRef.current = knownSavedNormalizedURLs;
  }, [canPresent, enabled, knownSavedNormalizedURLs, onSaveCandidate]);

  useEffect(() => {
    checkClipboardRef.current = () => {
      void checkClipboard();
    };
  }, [checkClipboard]);

  useEffect(() => {
    trace('detector-mounted');
    return () => trace('detector-unmounted');
  }, [trace]);

  useEffect(() => {
    let mounted = true;
    const hydrationRevision = clipboardLinkOfferState.getRevision();
    void AsyncStorage.getItem(LAST_HANDLED_CHANGE_COUNT_KEY)
      .then((storedValue) => {
        if (!mounted) return;
        const parsed = storedValue == null ? NaN : Number(storedValue);
        clipboardLinkOfferState.restorePersisted(
          Number.isSafeInteger(parsed) ? parsed : null,
          hydrationRevision,
        );
      })
      .catch(() => {
        // A failed preference read only removes persisted suppression for this launch.
        recordSaveAppDiagnosticEvent('clipboard.offer.marker_persistence_failed');
      })
      .finally(() => {
        if (!mounted) return;
        isStorageReadyRef.current = true;
        trace('check-skipped', clipboardLinkOfferState.getLastHandledChangeCount(), {
          reason: 'home-not-eligible',
        });
        checkClipboardRef.current();
      });
    return () => {
      mounted = false;
    };
  }, [trace]);

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      trace('detector-focused');
      checkClipboardRef.current();
      let previousAppState = AppState.currentState;
      const subscription = AppState.addEventListener('change', (state) => {
        trace('app-state-changed', activeOfferChangeCountRef.current, {
          previousAppState,
          appState: state,
        });
        if (state === 'background') {
          deferActiveOfferUntilResume();
        } else if (state === 'active') {
          if (previousAppState !== 'active') clipboardLinkOfferState.resumeDeferredOffers();
          checkClipboardRef.current();
        }
        previousAppState = state;
      });
      const clipboardSubscription = Platform.OS === 'ios'
        ? Clipboard.addClipboardListener(({ contentTypes }) => {
            const clipboardEventType = contentTypes.includes(ContentType.URL)
              ? 'url'
              : contentTypes.includes(ContentType.PLAIN_TEXT)
                ? 'plain-text'
                : 'other';
            trace('clipboard-listener-fired', activeOfferChangeCountRef.current, {
              clipboardEventType,
            });
            if (
              contentTypes.includes(ContentType.URL) ||
              contentTypes.includes(ContentType.PLAIN_TEXT)
            ) {
              checkClipboardRef.current();
            }
          })
        : null;
      return () => {
        isFocusedRef.current = false;
        trace('detector-blurred');
        deferActiveOfferUntilResume();
        subscription.remove();
        clipboardSubscription?.remove();
      };
    }, [deferActiveOfferUntilResume, trace]),
  );

  useEffect(() => {
    trace('check-skipped', activeOfferChangeCountRef.current, {
      canPresent,
      reason: canPresent ? 'eligible' : 'home-not-eligible',
    });
    if (canPresent) checkClipboardRef.current();
  }, [canPresent, trace]);
}
