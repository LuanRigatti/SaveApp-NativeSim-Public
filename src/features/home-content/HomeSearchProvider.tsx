import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

type HomeSearchContextValue = {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
};

const HomeSearchContext = createContext<HomeSearchContextValue | null>(null);

export function HomeSearchProvider({ children }: PropsWithChildren) {
  const [searchQuery, setSearchQuery] = useState('');
  const value = useMemo(() => ({ searchQuery, setSearchQuery }), [searchQuery]);

  return <HomeSearchContext.Provider value={value}>{children}</HomeSearchContext.Provider>;
}

export function useHomeSearch() {
  const value = useContext(HomeSearchContext);
  if (!value) throw new Error('useHomeSearch must be used within HomeSearchProvider.');
  return value;
}
