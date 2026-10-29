import { File, Paths } from 'expo-file-system';
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
  getSavedDocument,
  importSelectedDocuments,
  listSavedDocuments,
  openSavedDocument,
  reserveSavedDocumentThumbnail,
  isSavedDocumentThumbnailReservationCurrent,
  clearSavedDocumentThumbnailReservation,
  removeSavedDocumentThumbnailFile,
} from './documentLibrary';
import { requestConfirmedDocumentDeletion } from './documentDeletionPipeline';
import { canGenerateNativeDocumentThumbnail, isPdfDocument } from './documentPresentation';
import { DocumentThumbnailQueue } from './documentThumbnailQueue';
import { generateNativeDocumentThumbnail, isDocumentThumbnailingAvailable } from '../../../modules/document-thumbnailing/src';
import type { SavedDocument } from './documentTypes';
import { moveSavedItemToRecentlyDeleted } from '@/features/home-trash/trashLibrary';

type DocumentLibraryContextValue = {
  documents: SavedDocument[];
  isReady: boolean;
  hasCatalogLoadSucceeded: boolean;
  refresh: () => Promise<void>;
  importDocumentsFromPicker: () => Promise<void>;
  openDocument: (document: SavedDocument) => Promise<void>;
  getDocument: (id: number) => Promise<SavedDocument | null>;
  requestDeleteDocument: (
    id: number,
    prepareForRemovalAnimation?: () => void,
    authorizeBeforeDelete?: () => Promise<boolean>,
  ) => void;
};

const DocumentLibraryContext = createContext<DocumentLibraryContextValue | null>(null);

export function LocalDocumentLibraryProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [hasCatalogLoadSucceeded, setHasCatalogLoadSucceeded] = useState(false);
  const initializationRef = useRef<Promise<void> | null>(null);
  const isImportingRef = useRef(false);
  const thumbnailQueueRef = useRef<DocumentThumbnailQueue | null>(null);

  if (thumbnailQueueRef.current == null) {
    thumbnailQueueRef.current = new DocumentThumbnailQueue({
      thumbnailPathFor: (document) => `document-thumbnails/document-${document.id}.jpg`,
      reserve: reserveSavedDocumentThumbnail,
      async generate(document) {
        const result = await generateNativeDocumentThumbnail(document.id, document.relativePath);
        return result.status === 'generated'
          ? { status: 'generated', relativePath: result.relativePath }
          : { status: result.status };
      },
      isCurrent: isSavedDocumentThumbnailReservationCurrent,
      clearReservation: clearSavedDocumentThumbnailReservation,
      removeGeneratedFile: removeSavedDocumentThumbnailFile,
      onReady(documentId, thumbnailRelativePath) {
        const thumbnailUri = new File(Paths.document, ...thumbnailRelativePath.split('/')).uri;
        setDocuments((current) =>
          current.map((document) =>
            document.id === documentId
              ? { ...document, thumbnailRelativePath, thumbnailUri }
              : document,
          ),
        );
      },
    });
  }

  const initialize = useCallback((): Promise<void> => {
    if (!initializationRef.current) {
      initializationRef.current = listSavedDocuments()
        .then((nextDocuments) => {
          setDocuments(nextDocuments);
          setHasCatalogLoadSucceeded(true);
        })
        .catch((error: unknown) => {
          setHasCatalogLoadSucceeded(false);
          initializationRef.current = null;
          throw error;
        })
        .finally(() => setIsReady(true));
    }
    return initializationRef.current;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const nextDocuments = await listSavedDocuments();
      setDocuments(nextDocuments);
      setHasCatalogLoadSucceeded(true);
      setIsReady(true);
    } catch (error) {
      setHasCatalogLoadSucceeded(false);
      throw error;
    }
  }, []);

  useEffect(() => {
    void initialize().catch(() => undefined);
  }, [initialize]);

  useEffect(() => {
    if (!isReady || !isDocumentThumbnailingAvailable()) return;
    const candidates = documents
      .filter(canGenerateNativeDocumentThumbnail)
      .sort((left, right) => {
        return Number(isPdfDocument(right)) - Number(isPdfDocument(left));
      });
    if (candidates.length === 0) return;

    const timer = setTimeout(() => thumbnailQueueRef.current?.enqueue(candidates), 500);
    return () => clearTimeout(timer);
  }, [documents, isReady]);

  const importDocumentsFromPicker = useCallback(async () => {
    if (isImportingRef.current) return;
    isImportingRef.current = true;

    try {
      await initialize();
      const pickerResult = await File.pickFileAsync({ multipleFiles: true, mimeTypes: '*/*' });
      if (pickerResult.canceled || pickerResult.result.length === 0) return;

      const assets = pickerResult.result.map((file) => ({
        uri: file.uri,
        name: file.name || 'Arquivo',
        mimeType: file.type || null,
        sizeBytes: file.size,
      }));
      const result = await importSelectedDocuments(assets);
      setDocuments(await listSavedDocuments());

      if (result.failedCount > 0) {
        Alert.alert(
          result.documents.length > 0 ? 'Importação parcial' : 'Não foi possível importar os arquivos',
          result.documents.length > 0
            ? `${result.documents.length} arquivo(s) foram salvos. ${result.failedCount} não puderam ser adicionados. Verifique o formato e o espaço disponível.`
            : 'Os arquivos selecionados não puderam ser adicionados. Verifique o formato e o espaço disponível.',
        );
      }
    } catch {
      Alert.alert(
        'Não foi possível adicionar arquivos',
        'O SaveApp não conseguiu ler ou salvar os arquivos selecionados. Tente novamente.',
      );
    } finally {
      isImportingRef.current = false;
    }
  }, [initialize]);

  const getDocument = useCallback(
    async (id: number) => {
      try {
        await initialize();
        return await getSavedDocument(id);
      } catch {
        return null;
      }
    },
    [initialize],
  );

  const openDocument = useCallback((document: SavedDocument) => openSavedDocument(document), []);

  const requestDeleteDocument = useCallback(
    (id: number, prepareForRemovalAnimation?: () => void, authorizeBeforeDelete?: () => Promise<boolean>) => {
      void requestConfirmedDocumentDeletion(id, {
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
              'O arquivo ficará disponível para restauração por 30 dias. O original escolhido no seletor permanecerá no local de origem.',
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
        async deleteDocument() {
          await thumbnailQueueRef.current?.blockAndWait(id);
          try {
            return await moveSavedItemToRecentlyDeleted('document', id);
          } finally {
            thumbnailQueueRef.current?.unblock(id);
          }
        },
        onDeleted: () => {
          prepareForRemovalAnimation?.();
          setDocuments((current) => current.filter((document) => document.id !== id));
        },
        onMissing: async () => setDocuments(await listSavedDocuments()),
        onError: async () => {
          try {
            setDocuments(await listSavedDocuments());
          } catch {
            // Keep the last visible list if the recovery read also fails.
          }
          Alert.alert('Não foi possível apagar', 'O SaveApp não conseguiu concluir a exclusão. Tente novamente.');
        },
      });
    },
    [],
  );

  const value = useMemo(
    () => ({ documents, isReady, hasCatalogLoadSucceeded, refresh, importDocumentsFromPicker, openDocument, getDocument, requestDeleteDocument }),
    [documents, getDocument, hasCatalogLoadSucceeded, importDocumentsFromPicker, isReady, openDocument, refresh, requestDeleteDocument],
  );

  return <DocumentLibraryContext.Provider value={value}>{children}</DocumentLibraryContext.Provider>;
}

export function useLocalDocumentLibrary(): DocumentLibraryContextValue {
  const context = useContext(DocumentLibraryContext);
  if (!context) {
    throw new Error('useLocalDocumentLibrary must be used within LocalDocumentLibraryProvider');
  }
  return context;
}
