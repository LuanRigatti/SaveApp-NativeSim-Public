import { Alert, AppState } from 'react-native';
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
  cleanupUnreferencedSavedNoteAssets,
  schedulePendingQuickSaveLinkPreviewEnrichment,
  saveSavedLink,
  saveSavedText,
  subscribeToQuickSaveLinkPreviewUpdates,
  updateSavedText,
} from './savedContentLibrary';
import { prependSavedHomeContent } from './homeContentState';
import { requestConfirmedSavedContentDeletion } from './contentDeletionPipeline';
import { consumePendingTextReveal } from './textComposerNavigation';
import { importPendingQuickSaveLinks } from '@/features/dynamic-island/quickSaveQueue';
import type { SavedHomeContent, SavedText } from './homeContentTypes';
import { moveSavedItemToRecentlyDeleted } from '@/features/home-trash/trashLibrary';
import { recordSaveAppDiagnosticEvent } from '../../../modules/clipboard-url-detection/src';

type HomeContentRefreshReason = 'home_focus' | 'app_foreground';

type SavedContentContextValue = {
  contents: SavedHomeContent[];
  isReady: boolean;
  hasCatalogLoadSucceeded: boolean;
  refresh: (reason?: HomeContentRefreshReason) => Promise<void>;
  saveLink: (url: string, signal?: AbortSignal) => Promise<void>;
  saveText: (text: string, signal?: AbortSignal) => Promise<void>;
  updateText: (id: number, text: string) => Promise<SavedText>;
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
  const [hasCatalogLoadSucceeded, setHasCatalogLoadSucceeded] = useState(false);
  const initializationRef = useRef<Promise<void> | null>(null);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const pendingTextRevealIdRef = useRef<number | null>(null);

  const initialize = useCallback((): Promise<void> => {
    if (!initializationRef.current) {
      recordSaveAppDiagnosticEvent('home.catalog.initialize_started');
      initializationRef.current = importPendingQuickSaveLinks()
        .then(async () => {
          try {
            await cleanupUnreferencedSavedNoteAssets();
          } catch {
            // Asset cleanup is best effort and never blocks reading the existing catalog.
          }
          return listSavedHomeContent();
        })
        .then((nextContents) => {
          setContents(nextContents);
          void schedulePendingQuickSaveLinkPreviewEnrichment().catch(() => undefined);
          setHasCatalogLoadSucceeded(true);
          recordSaveAppDiagnosticEvent('home.catalog.initialize_completed');
          recordSaveAppDiagnosticEvent(nextContents.some((item) => item.contentType === 'link')
            ? 'home.catalog.state_updated_links_present'
            : 'home.catalog.state_updated_links_absent');
        })
        .catch((error: unknown) => {
          setHasCatalogLoadSucceeded(false);
          initializationRef.current = null;
          recordSaveAppDiagnosticEvent('home.catalog.initialize_failed');
          throw error;
        })
        .finally(() => setIsReady(true));
    }
    return initializationRef.current;
  }, []);

  const refresh = useCallback((reason?: HomeContentRefreshReason): Promise<void> => {
    recordSaveAppDiagnosticEvent('home.catalog.refresh_requested');
    if (reason === 'home_focus') {
      recordSaveAppDiagnosticEvent('home.catalog.refresh_from_home_focus');
    } else if (reason === 'app_foreground') {
      recordSaveAppDiagnosticEvent('home.catalog.app_foreground');
    }
    if (refreshPromiseRef.current) {
      recordSaveAppDiagnosticEvent('home.catalog.refresh_coalesced');
      return refreshPromiseRef.current;
    }

    let initializedBeforeRefresh = false;
    const refreshPromise = initialize()
      .then(async () => {
        initializedBeforeRefresh = true;
        await importPendingQuickSaveLinks();
        try {
          await cleanupUnreferencedSavedNoteAssets();
        } catch {
          // Asset cleanup is best effort and never blocks Home refresh.
        }
        return listSavedHomeContent();
      })
      .then((nextContents) => {
        setContents(nextContents);
        void schedulePendingQuickSaveLinkPreviewEnrichment().catch(() => undefined);
        setHasCatalogLoadSucceeded(true);
        setIsReady(true);
        recordSaveAppDiagnosticEvent('home.catalog.refresh_completed');
        recordSaveAppDiagnosticEvent(nextContents.some((item) => item.contentType === 'link')
          ? 'home.catalog.state_updated_links_present'
          : 'home.catalog.state_updated_links_absent');
      })
      .catch(() => {
        setHasCatalogLoadSucceeded(false);
        // Keep the last successfully rendered catalog, but expose a fixed native diagnostic.
        if (initializedBeforeRefresh) recordSaveAppDiagnosticEvent('home.catalog.refresh_failed');
      })
      .finally(() => {
        if (refreshPromiseRef.current === refreshPromise) refreshPromiseRef.current = null;
      });
    refreshPromiseRef.current = refreshPromise;
    return refreshPromise;
  }, [initialize]);

  useEffect(() => subscribeToQuickSaveLinkPreviewUpdates(() => {
    void initialize()
      .then(() => listSavedHomeContent())
      .then((nextContents) => {
        setContents(nextContents);
        setHasCatalogLoadSucceeded(true);
      })
      .catch(() => undefined);
  }), [initialize]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh('app_foreground');
    });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    void initialize().catch(() => {
      // initialize() records a fixed safe diagnostic before rethrowing to callers.
    });
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

  const updateText = useCallback(
    async (id: number, text: string) => {
      await initialize();
      const updated = await updateSavedText(id, text);
      setContents((current) => current.map((item) =>
        item.contentType === 'text' && item.id === id ? updated : item,
      ));
      return updated;
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
            console.warn('[SaveApp] home.catalog.refresh_after_delete_failed');
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
      hasCatalogLoadSucceeded,
      refresh,
      saveLink,
      saveText,
      updateText,
      consumePendingTextReveal: consumeTextReveal,
      getText,
      requestDeleteContent,
    }),
    [contents, consumeTextReveal, getText, hasCatalogLoadSucceeded, isReady, refresh, requestDeleteContent, saveLink, saveText, updateText],
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
