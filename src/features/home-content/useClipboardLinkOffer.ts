import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { ContentType } from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState, Platform } from 'react-native';

import { getClipboardURLDetectionSnapshot } from '../../../modules/clipboard-url-detection/src';
import { wasClipboardChangeHandledByQuickSave } from './clipboardLinkOffer';
import { clipboardLinkOfferState } from './clipboardLinkOfferState';

const LAST_HANDLED_CHANGE_COUNT_KEY = '@saveapp/clipboard-link-offer-change-count-v1';
let persistenceQueue: Promise<void> = Promise.resolve();

function persistHandledClipboardChangeCount(changeCount: number): void {
  persistenceQueue = persistenceQueue
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(LAST_HANDLED_CHANGE_COUNT_KEY, String(changeCount)))
    .catch(() => {
      console.warn('[SaveApp] clipboard_offer.marker_persistence_failed');
    });
}

export function markClipboardLinkChangeCountHandled(changeCount: number | null | undefined): void {
  if (!clipboardLinkOfferState.markHandled(changeCount)) return;
  const value = clipboardLinkOfferState.getLastHandledChangeCount();
  if (value == null) return;

  persistHandledClipboardChangeCount(value);
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
  onSaveCandidate: (clipboardText: string) => void;
};

export function useClipboardLinkOffer({
  enabled,
  canPresent,
  onSaveCandidate,
}: ClipboardLinkOfferOptions): void {
  const enabledRef = useRef(enabled);
  const canPresentRef = useRef(canPresent);
  const onSaveCandidateRef = useRef(onSaveCandidate);
  const isFocusedRef = useRef(false);
  const isStorageReadyRef = useRef(false);
  const isCheckingRef = useRef(false);
  const isAlertVisibleRef = useRef(false);
  const isReadingClipboardRef = useRef(false);
  const checkClipboardRef = useRef<() => void>(() => undefined);

  const checkClipboard = useCallback(async () => {
    if (
      Platform.OS !== 'ios' ||
      !enabledRef.current ||
      !canPresentRef.current ||
      !isFocusedRef.current ||
      !isStorageReadyRef.current ||
      clipboardLinkOfferState.hasExplicitFlow() ||
      isCheckingRef.current ||
      isAlertVisibleRef.current ||
      isReadingClipboardRef.current
    ) {
      return;
    }

    const appState = AppState.currentState;
    if (appState != null && appState !== 'active') return;

    isCheckingRef.current = true;
    try {
      const snapshot = await getClipboardURLDetectionSnapshot();
      if (
        !snapshot ||
        !enabledRef.current ||
        !canPresentRef.current ||
        !isFocusedRef.current ||
        clipboardLinkOfferState.hasExplicitFlow() ||
        isReadingClipboardRef.current
      ) {
        return;
      }

      if (wasClipboardChangeHandledByQuickSave(
        snapshot.changeCount,
        snapshot.quickSaveHandledChangeCount,
        snapshot.systemUptime,
        snapshot.quickSaveHandledSystemUptime,
      )) {
        markClipboardLinkChangeCountHandled(snapshot.changeCount);
        return;
      }

      if (!clipboardLinkOfferState.shouldOffer(
        snapshot.hasURLItem,
        snapshot.hasProbableWebURL,
        snapshot.changeCount,
      )) {
        return;
      }

      const offeredChangeCount = snapshot.changeCount;
      markClipboardLinkChangeCountHandled(offeredChangeCount);
      isAlertVisibleRef.current = true;

      const dismissOffer = () => {
        isAlertVisibleRef.current = false;
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
              isAlertVisibleRef.current = false;
              isReadingClipboardRef.current = true;
              void (async () => {
                let candidateWasDispatched = false;
                try {
                  const currentSnapshot = await getClipboardURLDetectionSnapshot();
                  if (!currentSnapshot || currentSnapshot.changeCount !== offeredChangeCount) return;

                  const clipboardText = snapshot.hasURLItem
                    ? await Clipboard.getUrlAsync()
                    : await Clipboard.getStringAsync();
                  const latestSnapshot = await getClipboardURLDetectionSnapshot();
                  if (!latestSnapshot || latestSnapshot.changeCount !== offeredChangeCount) return;
                  if (clipboardText?.trim()) {
                    onSaveCandidateRef.current(clipboardText);
                    candidateWasDispatched = true;
                  }
                } catch {
                  // iOS may deny paste access; do not retry or expose clipboard contents.
                } finally {
                  isReadingClipboardRef.current = false;
                  // A dispatched candidate may have opened another native alert or the composer.
                  // Recheck only when no follow-up UI was requested.
                  if (!candidateWasDispatched) checkClipboardRef.current();
                }
              })();
            },
          },
        ],
      );
    } catch {
      // Clipboard type and pattern detection are best-effort and never read values here.
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    enabledRef.current = enabled;
    canPresentRef.current = canPresent;
    onSaveCandidateRef.current = onSaveCandidate;
  }, [canPresent, enabled, onSaveCandidate]);

  useEffect(() => {
    checkClipboardRef.current = () => {
      void checkClipboard();
    };
  }, [checkClipboard]);

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
      })
      .finally(() => {
        if (!mounted) return;
        isStorageReadyRef.current = true;
        checkClipboardRef.current();
      });
    return () => {
      mounted = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      checkClipboardRef.current();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') checkClipboardRef.current();
      });
      const clipboardSubscription = Platform.OS === 'ios'
        ? Clipboard.addClipboardListener(({ contentTypes }) => {
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
        subscription.remove();
        clipboardSubscription?.remove();
      };
    }, []),
  );

  useEffect(() => {
    if (canPresent) checkClipboardRef.current();
  }, [canPresent]);
}
