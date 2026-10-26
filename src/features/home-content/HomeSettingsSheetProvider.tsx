import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ComponentType,
} from 'react';
import { View } from 'react-native';

import { getNativeCapabilities } from '@/platform/nativeCapabilities';

type NativeSettingsBottomSheetProps = {
  initialPage: 'root' | 'folders' | 'tags';
  isPresented: boolean;
  onDismiss: () => void;
  onIsPresentedChange: (isPresented: boolean) => void;
  onSavedTagsChanged: () => void;
};

type HomeSettingsSheetContextValue = {
  openSettingsSheet: (initialPage?: 'root' | 'folders' | 'tags') => void;
  isSettingsSheetPresented: boolean;
  savedTagsChangeSignal: number;
  notifySavedTagsChanged: () => void;
  pendingFolderOpenSignal: number;
  queueFolderOpenAfterReturn: (folderId: string) => void;
  consumePendingFolderOpen: () => string | null;
  hasPendingFolderOpen: boolean;
  protectedTrashContentVisible: boolean;
  setProtectedTrashContentVisible: (visible: boolean) => void;
};

const HomeSettingsSheetContext = createContext<HomeSettingsSheetContextValue | null>(null);

export function HomeSettingsSheetProvider({ children }: PropsWithChildren) {
  const [isPresented, setIsPresented] = useState(false);
  const [initialPage, setInitialPage] = useState<'root' | 'folders' | 'tags'>('root');
  const [savedTagsChangeSignal, setSavedTagsChangeSignal] = useState(0);
  const [pendingFolderOpenSignal, setPendingFolderOpenSignal] = useState(0);
  const [hasPendingFolderOpen, setHasPendingFolderOpen] = useState(false);
  const [protectedTrashContentVisible, setProtectedTrashContentVisible] = useState(false);
  const pendingFolderOpenRef = useRef<string | null>(null);
  const openSettingsSheet = useCallback((page: 'root' | 'folders' | 'tags' = 'root') => {
    setInitialPage(page);
    setIsPresented(true);
  }, []);
  const notifySavedTagsChanged = useCallback(() => {
    setSavedTagsChangeSignal((current) => current + 1);
  }, []);
  const queueFolderOpenAfterReturn = useCallback((folderId: string) => {
    pendingFolderOpenRef.current = folderId;
    setHasPendingFolderOpen(true);
  }, []);
  const consumePendingFolderOpen = useCallback(() => {
    const folderId = pendingFolderOpenRef.current;
    pendingFolderOpenRef.current = null;
    setHasPendingFolderOpen(false);
    return folderId;
  }, []);
  const NativeSettingsBottomSheet = getNativeCapabilities().canUseNativeSwiftUI
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('../../components/native/HomeSettingsBottomSheet.ios')
        .default as ComponentType<NativeSettingsBottomSheetProps>)
    : null;
  const contextValue = useMemo(
    () => ({
      openSettingsSheet,
      isSettingsSheetPresented: isPresented,
      savedTagsChangeSignal,
      notifySavedTagsChanged,
      pendingFolderOpenSignal,
      queueFolderOpenAfterReturn,
      consumePendingFolderOpen,
      hasPendingFolderOpen,
      protectedTrashContentVisible,
      setProtectedTrashContentVisible,
    }),
    [consumePendingFolderOpen, hasPendingFolderOpen, isPresented, notifySavedTagsChanged, openSettingsSheet, pendingFolderOpenSignal, protectedTrashContentVisible, queueFolderOpenAfterReturn, savedTagsChangeSignal],
  );
  const closeSettingsSheet = useCallback(() => {
    setIsPresented(false);
    setProtectedTrashContentVisible(false);
    if (pendingFolderOpenRef.current) setPendingFolderOpenSignal((current) => current + 1);
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <HomeSettingsSheetContext.Provider value={contextValue}>
        {children}
        {NativeSettingsBottomSheet ? (
          <NativeSettingsBottomSheet
            initialPage={initialPage}
            isPresented={isPresented}
            onDismiss={closeSettingsSheet}
            onIsPresentedChange={setIsPresented}
            onSavedTagsChanged={notifySavedTagsChanged}
          />
        ) : null}
      </HomeSettingsSheetContext.Provider>
    </View>
  );
}

export function useHomeSettingsSheet() {
  const context = useContext(HomeSettingsSheetContext);

  if (!context) {
    throw new Error('useHomeSettingsSheet must be used inside HomeSettingsSheetProvider.');
  }

  return context;
}
