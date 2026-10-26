import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { ContentType } from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState, Platform } from 'react-native';

import { getClipboardURLDetectionSnapshot } from '../../../modules/clipboard-url-detection/src';
import { shouldOfferClipboardLink } from './clipboardLinkOffer';

const LAST_HANDLED_CHANGE_COUNT_KEY = '@saveapp/clipboard-link-offer-change-count-v1';
let lastHandledChangeCountInMemory: number | null = null;

export function markClipboardLinkChangeCountHandled(changeCount: number | null | undefined): void {
  if (!Number.isSafeInteger(changeCount) || (changeCount as number) < 0) return;
  const value = changeCount as number;
  lastHandledChangeCountInMemory = value;
  void AsyncStorage.setItem(LAST_HANDLED_CHANGE_COUNT_KEY, String(value)).catch(() => undefined);
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
  const lastHandledChangeCountRef = useRef<number | null>(null);
  const checkClipboardRef = useRef<() => void>(() => undefined);

  const checkClipboard = useCallback(async () => {
    if (
      Platform.OS !== 'ios' ||
      !enabledRef.current ||
      !canPresentRef.current ||
      !isFocusedRef.current ||
      !isStorageReadyRef.current ||
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
        isReadingClipboardRef.current
      ) {
        return;
      }

      if (!shouldOfferClipboardLink(
        snapshot.hasURLItem,
        snapshot.hasProbableWebURL,
        snapshot.changeCount,
        snapshot.changeCount === lastHandledChangeCountInMemory
          ? snapshot.changeCount
          : lastHandledChangeCountRef.current,
      )) {
        return;
      }

      const offeredChangeCount = snapshot.changeCount;
      lastHandledChangeCountRef.current = offeredChangeCount;
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
    void AsyncStorage.getItem(LAST_HANDLED_CHANGE_COUNT_KEY)
      .then((storedValue) => {
        if (!mounted) return;
        const parsed = storedValue == null ? NaN : Number(storedValue);
        lastHandledChangeCountRef.current = Number.isSafeInteger(parsed) ? parsed : null;
        lastHandledChangeCountInMemory = lastHandledChangeCountRef.current;
      })
      .catch(() => {
        // A failed preference read only removes duplicate suppression for this launch.
        if (mounted) lastHandledChangeCountRef.current = null;
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
