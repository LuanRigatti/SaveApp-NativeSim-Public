import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getSaveAppStorageUsage } from './storageUsageService';
import type { StorageUsageSnapshot } from './storageUsage';

type StorageUsageState = {
  snapshot: StorageUsageSnapshot | null;
  hasError: boolean;
};

type StorageUsageResult = StorageUsageState & { isLoading: boolean };

export function useStorageUsage(isActive: boolean): StorageUsageResult {
  const requestId = useRef(0);
  const [state, setState] = useState<StorageUsageState>({
    snapshot: null,
    hasError: false,
  });

  const refresh = useCallback(async () => {
    const currentRequestId = ++requestId.current;

    try {
      const snapshot = await getSaveAppStorageUsage();
      if (requestId.current === currentRequestId) {
        setState({ snapshot, hasError: false });
      }
    } catch {
      if (requestId.current === currentRequestId) {
        setState({ snapshot: null, hasError: true });
      }
    }
  }, []);

  useEffect(() => {
    if (!isActive) return undefined;

    let isCurrent = true;
    const initialRequestId = ++requestId.current;
    void getSaveAppStorageUsage().then((snapshot) => {
      if (isCurrent && requestId.current === initialRequestId) {
        setState({ snapshot, hasError: false });
      }
    }).catch(() => {
      if (isCurrent && requestId.current === initialRequestId) {
        setState({ snapshot: null, hasError: true });
      }
    });
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void refresh();
    });

    return () => {
      isCurrent = false;
      requestId.current += 1;
      subscription.remove();
    };
  }, [isActive, refresh]);

  return {
    ...state,
    isLoading: isActive && state.snapshot === null && !state.hasError,
  };
}
