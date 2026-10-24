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
  deleteSavedHomeContent,
  getSavedText,
  listSavedHomeContent,
  saveSavedLink,
  saveSavedText,
} from './savedContentLibrary';
import { prependSavedHomeContent } from './homeContentState';
import { requestConfirmedSavedContentDeletion } from './contentDeletionPipeline';
import type { SavedHomeContent } from './homeContentTypes';

type SavedContentContextValue = {
  contents: SavedHomeContent[];
  isReady: boolean;
  saveLink: (url: string, signal?: AbortSignal) => Promise<void>;
  saveText: (text: string, signal?: AbortSignal) => Promise<void>;
  getText: (id: number) => Promise<Extract<SavedHomeContent, { contentType: 'text' }> | null>;
  requestDeleteContent: (
    id: number,
    contentType: SavedHomeContent['contentType'],
    prepareForRemovalAnimation?: () => void,
  ) => void;
};

const SavedContentContext = createContext<SavedContentContextValue | null>(null);

export function LocalSavedContentProvider({ children }: { children: ReactNode }) {
  const [contents, setContents] = useState<SavedHomeContent[]>([]);
  const [isReady, setIsReady] = useState(false);
  const initializationRef = useRef<Promise<void> | null>(null);

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
    },
    [initialize],
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

            const noun = contentType === 'link' ? 'link' : 'texto';
            Alert.alert(
              `Apagar ${noun}?`,
              contentType === 'link'
                ? 'O link e sua prévia serão removidos somente do SaveApp.'
                : 'O texto será removido somente do SaveApp.',
              [
                { text: 'Cancelar', style: 'cancel', onPress: () => finish(false) },
                {
                  text: `Apagar ${noun}`,
                  style: 'destructive',
                  onPress: () => finish(true),
                },
              ],
              { cancelable: true, onDismiss: () => finish(false) },
            );
          }),
        deleteContent: () => deleteSavedHomeContent(id, contentType),
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
    () => ({ contents, isReady, saveLink, saveText, getText, requestDeleteContent }),
    [contents, getText, isReady, requestDeleteContent, saveLink, saveText],
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
