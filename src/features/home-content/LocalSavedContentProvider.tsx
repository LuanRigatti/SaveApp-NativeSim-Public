import { Alert } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  getSavedText,
  listSavedHomeContent,
  saveSavedLink,
  saveSavedText,
} from './savedContentLibrary';
import { prependSavedHomeContent } from './homeContentState';
import { requestConfirmedSavedContentDeletion } from './contentDeletionPipeline';
import { consumePendingTextReveal } from './textComposerNavigation';
import type { SavedHomeContent } from './homeContentTypes';
import { moveSavedItemToRecentlyDeleted } from '@/features/home-trash/trashLibrary';

type SavedContentContextValue = {
  contents: SavedHomeContent[];
  isReady: boolean;
  refresh: () => Promise<void>;
  saveLink: (url: string, signal?: AbortSignal) => Promise<void>;
  saveText: (text: string, signal?: AbortSignal) => Promise<void>;
  consumePendingTextReveal: () => number | null;
  getText: (id: number) => Promise<Extract<SavedHomeContent, { contentType: 'text' }> | null>;
  requestDeleteContent: (
    id: number,
    contentType: SavedHomeContent['contentType'],
    prepareForRemovalAnimation?: () => void,
    authorizeBeforeDelete?: () => Promise<boolean>,
  ) => void;
};

const SavedContentContext = createContext<SavedContentContextValue | null>(null);

export function LocalSavedContentProvider({ children }: { children: ReactNode }) {
  const [contents, setContents] = useState<SavedHomeContent[]>([]);
  const [isReady, setIsReady] = useState(false);
  const initializationRef = useRef<Promise<void> | null>(null);
  const pendingTextRevealIdRef = useRef<number | null>(null);

  const initialize = useCallback((): Promise<void> => {
    if (!initializationRef.current) {
      initializationRef.current = listSavedHomeContent()
        .then(setContents)
        .catch((error: unknown) => {
          initializationRef.current = null;
          throw error;
        })
        .finally(() => setIsReady(true));
    }
    return initializationRef.current;
  }, []);

  const refresh = useCallback(async () => {
    setContents(await listSavedHomeContent());
    setIsReady(true);
  }, []);

  useEffect(() => {
    void initialize().catch(() => undefined);
  }, [initialize]);

  const saveLink = useCallback(
    async (url: string, signal?: AbortSignal) => {
      await initialize();
      const saved = await saveSavedLink(url, signal);
      setContents((current) => prependSavedHomeContent(current, saved));
    },
    [initialize],
  );

  const saveText = useCallback(
    async (text: string, signal?: AbortSignal) => {
      await initialize();
      const saved = await saveSavedText(text, signal);
      setContents((current) => prependSavedHomeContent(current, saved));
      pendingTextRevealIdRef.current = saved.id;
    },
    [initialize],
  );

  const consumeTextReveal = useCallback(
    () => consumePendingTextReveal(pendingTextRevealIdRef),
    [],
  );

  const getText = useCallback(
    async (id: number) => {
      try {
        await initialize();
        return await getSavedText(id);
      } catch {
        return null;
      }
    },
    [initialize],
  );

  const requestDeleteContent = useCallback(
    (
      id: number,
      contentType: SavedHomeContent['contentType'],
      prepareForRemovalAnimation?: () => void,
      authorizeBeforeDelete?: () => Promise<boolean>,
    ) => {
      void requestConfirmedSavedContentDeletion(id, contentType, {
        confirm: () =>
          new Promise<boolean>((resolve) => {
            let didResolve = false;
            const finish = (confirmed: boolean) => {
              if (didResolve) return;
              didResolve = true;
              resolve(confirmed);
            };

            Alert.alert(
              'Mover para Apagados recentemente?',
              contentType === 'link'
                ? 'O link e sua prévia ficarão disponíveis para restauração por 30 dias.'
                : 'O texto ficará disponível para restauração por 30 dias.',
              [
                { text: 'Cancelar', style: 'cancel', onPress: () => finish(false) },
                {
                  text: 'Mover para apagados',
                  style: 'destructive',
                  onPress: () => finish(true),
                },
              ],
              { cancelable: true, onDismiss: () => finish(false) },
            );
          }),
        authorizeBeforeDelete,
        deleteContent: () => moveSavedItemToRecentlyDeleted(contentType, id),
        onDeleted: () => {
          prepareForRemovalAnimation?.();
          setContents((current) =>
            current.filter((item) => item.id !== id || item.contentType !== contentType),
          );
        },
        onMissing: async () => setContents(await listSavedHomeContent()),
        onError: async () => {
          try {
            setContents(await listSavedHomeContent());
          } catch {
            // Keep the last rendered content if the refresh also fails.
          }
          Alert.alert('Não foi possível apagar', 'O SaveApp não conseguiu concluir a exclusão. Tente novamente.');
        },
      });
    },
    [],
  );

  const value = useMemo(
    () => ({
      contents,
      isReady,
      refresh,
      saveLink,
      saveText,
      consumePendingTextReveal: consumeTextReveal,
      getText,
      requestDeleteContent,
    }),
    [contents, consumeTextReveal, getText, isReady, refresh, requestDeleteContent, saveLink, saveText],
  );

  return <SavedContentContext.Provider value={value}>{children}</SavedContentContext.Provider>;
}

export function useLocalSavedContent(): SavedContentContextValue {
  const context = useContext(SavedContentContext);
  if (!context) {
    throw new Error('useLocalSavedContent must be used within LocalSavedContentProvider');
  }
  return context;
}
