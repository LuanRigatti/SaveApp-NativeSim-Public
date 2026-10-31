import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';

import {
  isSaveLinkActivityAvailable,
  reconcileSaveLinkActivity,
  updateSaveLinkActivityRecentLinksVisibility,
} from './saveLinkActivityManager';
import {
  getQuickSaveLockScreenSettings,
  setQuickSaveLockScreenRecentLinksVisible,
} from '../../../modules/clipboard-url-detection/src';
import {
  subscribeToQuickSaveLinkPreviewUpdates,
  synchronizeQuickSaveLockScreenFavicons,
} from '@/features/home-content/savedContentLibrary';

const PREFERENCE_KEY = '@saveapp/dynamic-island-link-mode-enabled-v1';

type SaveLinkDynamicIslandContextValue = {
  isEnabled: boolean;
  isReady: boolean;
  isAvailable: boolean;
  isBusy: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  showRecentLinksOnLockScreen: boolean;
  isRecentLinksSettingReady: boolean;
  isRecentLinksSettingAvailable: boolean;
  isRecentLinksSettingBusy: boolean;
  setShowRecentLinksOnLockScreen: (visible: boolean) => Promise<void>;
};

const SaveLinkDynamicIslandContext = createContext<SaveLinkDynamicIslandContextValue | null>(null);

export function SaveLinkDynamicIslandProvider({ children }: PropsWithChildren) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [showRecentLinksOnLockScreen, setShowRecentLinksOnLockScreenState] = useState(false);
  const [isRecentLinksSettingReady, setIsRecentLinksSettingReady] = useState(false);
  const [isRecentLinksSettingAvailable, setIsRecentLinksSettingAvailable] = useState(false);
  const [isRecentLinksSettingBusy, setIsRecentLinksSettingBusy] = useState(false);
  const enabledRef = useRef(false);
  const availableRef = useRef(false);
  const readyRef = useRef(false);
  const busyRef = useRef(false);
  const recentLinksBusyRef = useRef(false);
  const loadingPreferenceRef = useRef(false);
  const operationRef = useRef<Promise<void>>(Promise.resolve());

  const enqueueReconcile = useCallback((enabled: boolean) => {
    const operation = operationRef.current.then(() => reconcileSaveLinkActivity(enabled));
    operationRef.current = operation.catch(() => undefined);
    return operation;
  }, []);

  const loadPreference = useCallback(async () => {
    if (loadingPreferenceRef.current) return;
    loadingPreferenceRef.current = true;
    try {
      let nativeModuleAvailable = false;
      if (Platform.OS === 'ios') {
        try {
          nativeModuleAvailable = isSaveLinkActivityAvailable();
        } catch {
          nativeModuleAvailable = false;
        }
      }
      availableRef.current = nativeModuleAvailable;
      setIsAvailable(nativeModuleAvailable);
      const lockScreenSettings = Platform.OS === 'ios' ? getQuickSaveLockScreenSettings() : null;
      setIsRecentLinksSettingAvailable(lockScreenSettings !== null);
      setShowRecentLinksOnLockScreenState(lockScreenSettings?.showRecentLinks ?? false);
      setIsRecentLinksSettingReady(true);

      let storedEnabled: boolean;
      try {
        storedEnabled = (await AsyncStorage.getItem(PREFERENCE_KEY)) === 'true';
      } catch {
        // Keep the control disabled and do not end a possibly active activity
        // while the persisted preference is unknown.
        readyRef.current = false;
        setIsReady(false);
        return;
      }
      enabledRef.current = storedEnabled;
      readyRef.current = true;
      setIsEnabled(storedEnabled);
      setIsReady(true);
      if (nativeModuleAvailable) {
        try {
          await enqueueReconcile(storedEnabled);
        } catch {
          // Foreground reconciliation is best-effort; the next active transition retries.
        }
        if (lockScreenSettings?.showRecentLinks) {
          void synchronizeQuickSaveLockScreenFavicons()
            .then((updated) => updated ? updateSaveLinkActivityRecentLinksVisibility(true) : undefined)
            .catch(() => undefined);
        }
      }
    } finally {
      loadingPreferenceRef.current = false;
    }
  }, [enqueueReconcile]);

  useEffect(() => {
    void loadPreference();
  }, [loadPreference]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (!readyRef.current) {
        void loadPreference();
        return;
      }
      if (availableRef.current) {
        void enqueueReconcile(enabledRef.current).catch(() => undefined);
        if (getQuickSaveLockScreenSettings()?.showRecentLinks) {
          void synchronizeQuickSaveLockScreenFavicons()
            .then((updated) => updated ? updateSaveLinkActivityRecentLinksVisibility(true) : undefined)
            .catch(() => undefined);
        }
      }
    });
    return () => subscription.remove();
  }, [enqueueReconcile, loadPreference]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const unsubscribe = subscribeToQuickSaveLinkPreviewUpdates(() => {
      if (getQuickSaveLockScreenSettings()?.showRecentLinks === true) {
        void updateSaveLinkActivityRecentLinksVisibility(true).catch(() => undefined);
      }
    });
    return () => { unsubscribe(); };
  }, []);

  const setEnabled = useCallback(async (nextEnabled: boolean) => {
    if (Platform.OS !== 'ios') throw new Error('Dynamic Island está disponível somente no iOS.');
    if (!availableRef.current) throw new Error('Dynamic Island não está disponível nesta versão do app.');
    if (!readyRef.current) throw new Error('As configurações ainda estão carregando.');
    if (busyRef.current) return;

    const previousEnabled = enabledRef.current;
    if (previousEnabled === nextEnabled) return;

    busyRef.current = true;
    setIsBusy(true);
    enabledRef.current = nextEnabled;
    setIsEnabled(nextEnabled);
    try {
      await AsyncStorage.setItem(PREFERENCE_KEY, String(nextEnabled));
      await enqueueReconcile(nextEnabled);
    } catch (error) {
      enabledRef.current = previousEnabled;
      setIsEnabled(previousEnabled);
      try {
        await AsyncStorage.setItem(PREFERENCE_KEY, String(previousEnabled));
      } catch {
        // Keep UI state aligned with the last known value if persistence also fails.
      }
      throw error;
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }, [enqueueReconcile]);

  const setShowRecentLinksOnLockScreen = useCallback(async (visible: boolean) => {
    if (Platform.OS !== 'ios' || !isRecentLinksSettingAvailable) {
      throw new Error('O histórico na tela bloqueada não está disponível nesta versão do app.');
    }
    if (!isRecentLinksSettingReady) throw new Error('As configurações ainda estão carregando.');
    if (recentLinksBusyRef.current || showRecentLinksOnLockScreen === visible) return;

    recentLinksBusyRef.current = true;
    setIsRecentLinksSettingBusy(true);
    try {
      if (!setQuickSaveLockScreenRecentLinksVisible(visible)) {
        throw new Error('Não foi possível salvar a preferência de privacidade.');
      }
      setShowRecentLinksOnLockScreenState(visible);
      await updateSaveLinkActivityRecentLinksVisibility(visible);
      if (visible) {
        void synchronizeQuickSaveLockScreenFavicons()
          .then((updated) => updated ? updateSaveLinkActivityRecentLinksVisibility(true) : undefined)
          .catch(() => undefined);
      }
    } catch (error) {
      // Turning visibility off remains fail-safe: keep the shared preference off even
      // if ActivityKit cannot refresh the currently displayed content immediately.
      if (visible) {
        setQuickSaveLockScreenRecentLinksVisible(false);
        setShowRecentLinksOnLockScreenState(false);
      }
      throw error;
    } finally {
      recentLinksBusyRef.current = false;
      setIsRecentLinksSettingBusy(false);
    }
  }, [isRecentLinksSettingAvailable, isRecentLinksSettingReady, showRecentLinksOnLockScreen]);

  const value = useMemo(
    () => ({
      isEnabled,
      isReady,
      isAvailable,
      isBusy,
      setEnabled,
      showRecentLinksOnLockScreen,
      isRecentLinksSettingReady,
      isRecentLinksSettingAvailable,
      isRecentLinksSettingBusy,
      setShowRecentLinksOnLockScreen,
    }),
    [isAvailable, isBusy, isEnabled, isReady, isRecentLinksSettingAvailable, isRecentLinksSettingBusy,
      isRecentLinksSettingReady, setEnabled, setShowRecentLinksOnLockScreen, showRecentLinksOnLockScreen],
  );

  return (
    <SaveLinkDynamicIslandContext.Provider value={value}>
      {children}
    </SaveLinkDynamicIslandContext.Provider>
  );
}

export function useSaveLinkDynamicIsland() {
  const context = useContext(SaveLinkDynamicIslandContext);
  if (!context) throw new Error('useSaveLinkDynamicIsland must be used within its provider.');
  return context;
}
