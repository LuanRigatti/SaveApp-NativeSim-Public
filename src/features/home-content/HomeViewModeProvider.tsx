import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  DEFAULT_HOME_VIEW_MODE,
  persistHomeViewMode,
  restoreHomeViewMode,
  type HomeViewMode,
} from './homeViewMode';

type HomeViewModeContextValue = {
  viewMode: HomeViewMode;
  setViewMode: (mode: HomeViewMode) => void;
};

const HomeViewModeContext = createContext<HomeViewModeContextValue | null>(null);

export function HomeViewModeProvider({ children }: PropsWithChildren) {
  const [viewMode, setViewModeState] = useState<HomeViewMode>(DEFAULT_HOME_VIEW_MODE);
  const userChangedMode = useRef(false);
  const persistenceQueue = useRef(Promise.resolve());

  useEffect(() => {
    let isMounted = true;

    void restoreHomeViewMode(AsyncStorage).then((storedMode) => {
      if (isMounted && !userChangedMode.current) {
        setViewModeState(storedMode);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const setViewMode = useCallback((nextMode: HomeViewMode) => {
    userChangedMode.current = true;
    setViewModeState(nextMode);
    persistenceQueue.current = persistenceQueue.current.then(() =>
      persistHomeViewMode(nextMode, AsyncStorage),
    );
  }, []);

  const value = useMemo(() => ({ viewMode, setViewMode }), [setViewMode, viewMode]);

  return <HomeViewModeContext.Provider value={value}>{children}</HomeViewModeContext.Provider>;
}

export function useHomeViewMode() {
  const context = useContext(HomeViewModeContext);

  if (!context) {
    throw new Error('useHomeViewMode must be used inside HomeViewModeProvider.');
  }

  return context;
}
