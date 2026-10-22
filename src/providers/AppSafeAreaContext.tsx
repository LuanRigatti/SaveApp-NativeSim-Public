import { createContext, useContext, type PropsWithChildren } from 'react';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

const AppSafeAreaContext = createContext<EdgeInsets | null>(null);

export function AppSafeAreaProvider({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();

  return <AppSafeAreaContext.Provider value={insets}>{children}</AppSafeAreaContext.Provider>;
}

export function useAppSafeAreaInsets(): EdgeInsets {
  const appInsets = useContext(AppSafeAreaContext);
  const fallbackInsets = useSafeAreaInsets();

  return appInsets ?? fallbackInsets;
}
