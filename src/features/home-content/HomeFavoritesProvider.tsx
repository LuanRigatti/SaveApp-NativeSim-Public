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

import { listSavedFavoriteKeys, setSavedFavorite } from './favoritesLibrary';
import { getHomeFolderItemKey } from '@/features/home-folders/homeFolderTypes';
import type { SavedFavoriteItemReference } from './favoritesTypes';

type HomeFavoritesContextValue = {
  favoriteKeys: ReadonlySet<string>;
  favoritesOnly: boolean;
  isReady: boolean;
  setFavorite: (reference: SavedFavoriteItemReference, isFavorite: boolean) => Promise<void>;
  setFavoritesOnly: (enabled: boolean) => void;
};

const HomeFavoritesContext = createContext<HomeFavoritesContextValue | null>(null);

export function HomeFavoritesProvider({ children }: PropsWithChildren) {
  const [favoriteKeys, setFavoriteKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [favoritesOnly, setFavoritesOnlyState] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const favoriteKeysRef = useRef<ReadonlySet<string>>(new Set());
  const initializationRef = useRef<Promise<void> | null>(null);
  const writeQueueRef = useRef(Promise.resolve());

  const initialize = useCallback(() => {
    if (!initializationRef.current) {
      initializationRef.current = listSavedFavoriteKeys()
        .then((keys) => {
          const next = new Set(keys);
          favoriteKeysRef.current = next;
          setFavoriteKeys(next);
        })
        .catch((error: unknown) => {
          initializationRef.current = null;
          throw error;
        })
        .finally(() => setIsReady(true));
    }
    return initializationRef.current;
  }, []);

  useEffect(() => {
    void initialize().catch(() => undefined);
  }, [initialize]);

  const setFavorite = useCallback((reference: SavedFavoriteItemReference, isFavorite: boolean) => {
    const operation = writeQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        await initialize();
        await setSavedFavorite(reference, isFavorite);
        const key = getHomeFolderItemKey(reference.itemType, reference.itemId);
        const next = new Set(favoriteKeysRef.current);
        if (isFavorite) next.add(key);
        else next.delete(key);
        favoriteKeysRef.current = next;
        setFavoriteKeys(next);
      });
    writeQueueRef.current = operation;
    return operation;
  }, [initialize]);

  const setFavoritesOnly = useCallback((enabled: boolean) => {
    setFavoritesOnlyState(enabled);
  }, []);

  const value = useMemo(
    () => ({ favoriteKeys, favoritesOnly, isReady, setFavorite, setFavoritesOnly }),
    [favoriteKeys, favoritesOnly, isReady, setFavorite, setFavoritesOnly],
  );

  return <HomeFavoritesContext.Provider value={value}>{children}</HomeFavoritesContext.Provider>;
}

export function useHomeFavorites(): HomeFavoritesContextValue {
  const context = useContext(HomeFavoritesContext);
  if (!context) throw new Error('useHomeFavorites must be used inside HomeFavoritesProvider');
  return context;
}
