import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
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

import { useLocalDocumentLibrary } from '@/features/documents/LocalDocumentLibraryProvider';
import type { SavedHomeItem } from '@/features/home-content/homeContentTypes';
import { getSavedHomeItemKey } from '@/features/home-content/homeContentTypes';
import { useLocalSavedContent } from '@/features/home-content/LocalSavedContentProvider';
import { useLocalChecklists } from '@/features/home-content/LocalChecklistLibraryProvider';
import { useLocalPhotoLibrary } from '@/features/photos/LocalPhotoLibraryProvider';
import type { AccentColorName } from '@/theme/colors';
import type { HomeCategory } from '@/features/home-content/homeCategories';

import {
  createHomeFolder,
  deleteHomeFolder,
  getHomeFolderItemAssignment,
  listHomeFolderAssignments,
  listHomeFolders,
  renameHomeFolder,
  setHomeFolderColor,
  setHomeFolderProtection,
  setHomeFolderItemAssignment,
  type HomeFolderAssignment,
} from './homeFolderLibrary';
import { persistHomeFolderSelection, restoreHomeFolderSelection } from './homeFolderSelectionStorage';
import {
  getHomeFolderItemKey,
  getHomeFolderViewForSelection,
  type HomeFolder,
  type HomeFolderHomeView,
  type HomeFolderItemType,
  type HomeFolderSelection,
} from './homeFolderTypes';
import {
  authenticateWithFaceId,
  type FolderAuthenticationOutcome,
} from './folderFaceIdAuthentication';

type HomeFolderLibraryContextValue = {
  folders: HomeFolder[];
  folderIdByItemKey: ReadonlyMap<string, string>;
  selection: HomeFolderSelection;
  view: HomeFolderHomeView;
  isReady: boolean;
  isAppActive: boolean;
  lockEpoch: number;
  unlockedFolderIds: ReadonlySet<string>;
  isFolderAuthorized: (folderId: string) => boolean;
  authorizeFolder: (folderId: string) => Promise<FolderAuthenticationOutcome>;
  setFolderProtection: (
    folderId: string,
    isProtected: boolean,
  ) => Promise<FolderAuthenticationOutcome>;
  selectView: (view: HomeFolderHomeView) => void;
  selectCategory: (category: HomeCategory) => void;
  selectFolder: (folderId: string) => void;
  createFolder: (name: string) => Promise<HomeFolder>;
  renameFolder: (folderId: string, name: string) => Promise<HomeFolder>;
  setFolderColor: (folderId: string, color: AccentColorName | null) => Promise<boolean>;
  deleteFolder: (folderId: string) => Promise<boolean>;
  setItemFolder: (
    itemType: HomeFolderItemType,
    itemId: number,
    folderId: string | null,
  ) => Promise<void>;
  refresh: () => Promise<void>;
};

const HomeFolderLibraryContext = createContext<HomeFolderLibraryContextValue | null>(null);

function assignmentRowsToMap(assignments: readonly HomeFolderAssignment[]): Map<string, string> {
  return new Map(
    assignments.map((assignment) => [
      getHomeFolderItemKey(assignment.itemType, assignment.itemId),
      assignment.folderId,
    ]),
  );
}

function getCatalogKey(item: SavedHomeItem): string {
  return getSavedHomeItemKey(item);
}

export function LocalHomeFolderProvider({ children }: PropsWithChildren) {
  const { media, isReady: mediaReady } = useLocalPhotoLibrary();
  const { contents, isReady: contentsReady } = useLocalSavedContent();
  const { documents, isReady: documentsReady } = useLocalDocumentLibrary();
  const { checklists, isReady: checklistsReady } = useLocalChecklists();
  const [folders, setFolders] = useState<HomeFolder[]>([]);
  const foldersRef = useRef(folders);
  useEffect(() => {
    foldersRef.current = folders;
  }, [folders]);
  const [folderIdByItemKey, setFolderIdByItemKey] = useState<Map<string, string>>(() => new Map());
  const [selection, setSelectionState] = useState<HomeFolderSelection>({
    kind: 'view',
    view: 'all-items',
  });
  const selectionRef = useRef(selection);
  const view = getHomeFolderViewForSelection(selection);
  const [isReady, setIsReady] = useState(false);
  const [unlockedFolderIds, setUnlockedFolderIds] = useState<ReadonlySet<string>>(() => new Set());
  const unlockedFolderIdsRef = useRef<ReadonlySet<string>>(new Set());
  const [isAppActive, setIsAppActive] = useState(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
  );
  const appStateRef = useRef<string>(AppState.currentState ?? 'active');
  const [lockEpoch, setLockEpoch] = useState(0);
  const lockEpochRef = useRef(0);
  const authorizationRequestsRef = useRef(new Map<string, Promise<FolderAuthenticationOutcome>>());
  const initializedRef = useRef(false);
  const lastCatalogSignatureRef = useRef<string | null>(null);
  const selectionWriteQueueRef = useRef(Promise.resolve());

  const allItems = useMemo<SavedHomeItem[]>(
    () => [...media, ...contents, ...documents, ...checklists],
    [checklists, contents, documents, media],
  );
  const catalogSignature = useMemo(
    () => allItems.map(getCatalogKey).sort().join('|'),
    [allItems],
  );
  const catalogReady = mediaReady && contentsReady && documentsReady && checklistsReady;

  const persistSelection = useCallback((nextSelection: HomeFolderSelection) => {
    selectionWriteQueueRef.current = selectionWriteQueueRef.current
      .catch(() => undefined)
      .then(() => persistHomeFolderSelection(AsyncStorage, nextSelection));
  }, []);

  const updateSelection = useCallback((nextSelection: HomeFolderSelection) => {
    selectionRef.current = nextSelection;
    setSelectionState(nextSelection);
    persistSelection(nextSelection);
  }, [persistSelection]);

  const replaceUnlockedFolderIds = useCallback((next: ReadonlySet<string>) => {
    unlockedFolderIdsRef.current = next;
    setUnlockedFolderIds(next);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      setIsAppActive(nextState === 'active');
      if (nextState !== 'background') return;

      lockEpochRef.current += 1;
      setLockEpoch(lockEpochRef.current);
      replaceUnlockedFolderIds(new Set());

      const currentSelection = selectionRef.current;
      if (
        currentSelection.kind === 'folder' &&
        foldersRef.current.some(
          (folder) => folder.id === currentSelection.folderId && folder.isProtected,
        )
      ) {
        updateSelection({ kind: 'view', view: 'all-items' });
      }
    });

    return () => subscription.remove();
  }, [replaceUnlockedFolderIds, updateSelection]);

  const isFolderAuthorized = useCallback((folderId: string) => {
    if (!isReady) return false;
    const folder = foldersRef.current.find((item) => item.id === folderId);
    if (!folder) return false;
    if (!folder.isProtected) return true;
    return appStateRef.current === 'active' && unlockedFolderIdsRef.current.has(folderId);
  }, [isReady]);

  const requestFaceId = useCallback(async (folderId: string, promptMessage: string) => {
    if (appStateRef.current !== 'active') return 'cancelled' as const;
    const requestEpoch = lockEpochRef.current;
    let removeBackgroundSubscription: () => void = () => undefined;
    const backgroundCancellation = new Promise<FolderAuthenticationOutcome>((resolve) => {
      const subscription = AppState.addEventListener('change', (nextState) => {
        if (nextState !== 'background') return;
        resolve('cancelled');
      });
      removeBackgroundSubscription = () => subscription.remove();
    });
    const outcome = await Promise.race([
      authenticateWithFaceId(promptMessage),
      backgroundCancellation,
    ]);
    removeBackgroundSubscription();
    if (outcome !== 'authenticated') return outcome;
    if (lockEpochRef.current !== requestEpoch || appStateRef.current !== 'active') {
      return 'cancelled' as const;
    }
    if (!foldersRef.current.some((folder) => folder.id === folderId)) {
      return 'failed' as const;
    }
    return 'authenticated' as const;
  }, []);

  const authorizeFolder = useCallback((folderId: string): Promise<FolderAuthenticationOutcome> => {
    const folder = foldersRef.current.find((item) => item.id === folderId);
    if (!isReady || !folder) return Promise.resolve('failed');
    if (!folder.isProtected) return Promise.resolve('authenticated');
    if (isFolderAuthorized(folderId)) return Promise.resolve('authenticated');

    const existingRequest = authorizationRequestsRef.current.get(folderId);
    if (existingRequest) return existingRequest;

    const requestEpoch = lockEpochRef.current;
    const request = requestFaceId(folderId, `Autentique para acessar ${folder.name}.`)
      .then((outcome) => {
        const currentFolder = foldersRef.current.find((item) => item.id === folderId);
        if (outcome === 'authenticated' && currentFolder?.isProtected) {
          if (requestEpoch !== lockEpochRef.current || appStateRef.current !== 'active') {
            return 'cancelled' as const;
          }
          replaceUnlockedFolderIds(new Set([...unlockedFolderIdsRef.current, folderId]));
        }
        return outcome;
      })
      .finally(() => {
        if (authorizationRequestsRef.current.get(folderId) === request) {
          authorizationRequestsRef.current.delete(folderId);
        }
      });
    authorizationRequestsRef.current.set(folderId, request);
    return request;
  }, [isFolderAuthorized, isReady, replaceUnlockedFolderIds, requestFaceId]);

  const changeFolderProtection = useCallback(
    async (folderId: string, nextIsProtected: boolean): Promise<FolderAuthenticationOutcome> => {
      const currentFolder = foldersRef.current.find((item) => item.id === folderId);
      if (!isReady || !currentFolder) return 'failed';
      if (currentFolder.isProtected === nextIsProtected) return 'authenticated';
      const operationEpoch = lockEpochRef.current;

      const outcome = await requestFaceId(
        folderId,
        nextIsProtected
          ? `Autentique para proteger ${currentFolder.name} com Face ID.`
          : `Autentique para desproteger ${currentFolder.name}.`,
      );
      if (outcome !== 'authenticated') return outcome;
      const latestFolder = foldersRef.current.find((item) => item.id === folderId);
      if (
        operationEpoch !== lockEpochRef.current ||
        appStateRef.current !== 'active' ||
        !latestFolder ||
        latestFolder.isProtected !== currentFolder.isProtected
      ) {
        return 'cancelled';
      }

      const changed = await setHomeFolderProtection(folderId, nextIsProtected, currentFolder.isProtected);
      if (!changed) return 'failed';
      const nextFolders = foldersRef.current.map((folder) => (
        folder.id === folderId
          ? { ...folder, isProtected: nextIsProtected, updatedAt: Date.now() }
          : folder
      ));
      foldersRef.current = nextFolders;
      setFolders(nextFolders);
      if (nextIsProtected && operationEpoch === lockEpochRef.current && appStateRef.current === 'active') {
        replaceUnlockedFolderIds(new Set([...unlockedFolderIdsRef.current, folderId]));
      } else {
        const nextUnlocked = new Set(unlockedFolderIdsRef.current);
        nextUnlocked.delete(folderId);
        replaceUnlockedFolderIds(nextUnlocked);
      }
      return 'authenticated';
    }, [isReady, replaceUnlockedFolderIds, requestFaceId],
  );

  const replaceAssignments = useCallback((assignments: readonly HomeFolderAssignment[]) => {
    setFolderIdByItemKey(assignmentRowsToMap(assignments));
  }, []);

  const refresh = useCallback(async () => {
    const [nextFolders, assignments] = await Promise.all([
      listHomeFolders(),
      listHomeFolderAssignments(),
    ]);
    setFolders(nextFolders);
    replaceAssignments(assignments);
    const nextUnlocked = new Set(
      [...unlockedFolderIdsRef.current].filter((folderId) =>
        nextFolders.some((folder) => folder.id === folderId && folder.isProtected),
      ),
    );
    replaceUnlockedFolderIds(nextUnlocked);
    const currentSelection = selectionRef.current;
    if (
      currentSelection.kind === 'folder' &&
      !nextFolders.some((folder) => folder.id === currentSelection.folderId)
    ) {
      updateSelection({ kind: 'view', view: 'all-items' });
    }
  }, [replaceAssignments, replaceUnlockedFolderIds, updateSelection]);

  useEffect(() => {
    if (!catalogReady || lastCatalogSignatureRef.current === catalogSignature) return;
    lastCatalogSignatureRef.current = catalogSignature;
    const isInitialLoad = !initializedRef.current;

    let cancelled = false;
    let loaded = false;
    void Promise.all([listHomeFolders(), listHomeFolderAssignments()])
      .then(async ([nextFolders, assignments]) => {
        if (cancelled) return;
        setFolders(nextFolders);
        replaceAssignments(assignments);

        if (isInitialLoad) {
          const restoredSelection = await restoreHomeFolderSelection(AsyncStorage, nextFolders);
          if (!cancelled) {
            initializedRef.current = true;
            selectionRef.current = restoredSelection;
            setSelectionState(restoredSelection);
          }
        }
        loaded = !cancelled;
      })
      .catch(() => {
        // Keep the folder catalog unready so protected assignments fail closed.
      })
      .finally(() => {
        if (cancelled || !loaded) return;
        initializedRef.current = true;
        setIsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [catalogReady, catalogSignature, persistSelection, replaceAssignments]);

  const selectView = useCallback((nextView: HomeFolderHomeView) => {
    updateSelection({ kind: 'view', view: nextView });
  }, [updateSelection]);

  const selectCategory = useCallback((category: HomeCategory) => {
    updateSelection({ kind: 'category', category });
  }, [updateSelection]);

  const selectFolder = useCallback((folderId: string) => {
    const folder = foldersRef.current.find((item) => item.id === folderId);
    if (!folder || (folder.isProtected && !isFolderAuthorized(folderId))) return;
    updateSelection({ kind: 'folder', folderId });
  }, [isFolderAuthorized, updateSelection]);

  const addFolder = useCallback(async (name: string) => {
    const created = await createHomeFolder(name);
    setFolders((current) =>
      [...current, created].sort((first, second) => first.name.localeCompare(second.name, 'pt-BR')),
    );
    return created;
  }, []);

  const updateFolder = useCallback(async (folderId: string, name: string) => {
    const updated = await renameHomeFolder(folderId, name);
    setFolders((current) =>
      current
        .map((folder) => (folder.id === folderId ? updated : folder))
        .sort((first, second) => first.name.localeCompare(second.name, 'pt-BR')),
    );
    return updated;
  }, []);

  const updateFolderColor = useCallback(async (folderId: string, color: AccentColorName | null) => {
    const changed = await setHomeFolderColor(folderId, color);
    if (!changed) return false;
    const nextFolders = foldersRef.current.map((folder) => (
      folder.id === folderId ? { ...folder, color, updatedAt: Date.now() } : folder
    ));
    foldersRef.current = nextFolders;
    setFolders(nextFolders);
    return true;
  }, []);

  const removeFolder = useCallback(
    async (folderId: string) => {
      const folder = foldersRef.current.find((item) => item.id === folderId);
      if (!folder) return false;
      const operationEpoch = lockEpochRef.current;
      if (folder.isProtected) {
        const outcome = await authorizeFolder(folderId);
        if (outcome !== 'authenticated') return false;
      }
      const latestFolder = foldersRef.current.find((item) => item.id === folderId);
      if (!latestFolder) return false;
      if (
        latestFolder.isProtected &&
        (operationEpoch !== lockEpochRef.current ||
          appStateRef.current !== 'active' ||
          !isFolderAuthorized(folderId))
      ) {
        return false;
      }
      const deleted = await deleteHomeFolder(folderId, latestFolder.isProtected);
      if (!deleted) return false;
      const nextFolders = foldersRef.current.filter((folder) => folder.id !== folderId);
      foldersRef.current = nextFolders;
      setFolders(nextFolders);
      const nextUnlocked = new Set(unlockedFolderIdsRef.current);
      nextUnlocked.delete(folderId);
      replaceUnlockedFolderIds(nextUnlocked);
      setFolderIdByItemKey((current) => {
        const next = new Map(current);
        for (const [itemKey, assignedFolderId] of next) {
          if (assignedFolderId === folderId) next.delete(itemKey);
        }
        return next;
      });
      if (selectionRef.current.kind === 'folder' && selectionRef.current.folderId === folderId) {
        selectView('all-items');
      }
      return true;
    },
    [authorizeFolder, isFolderAuthorized, replaceUnlockedFolderIds, selectView],
  );

  const setItemFolder = useCallback(
    async (itemType: HomeFolderItemType, itemId: number, folderId: string | null) => {
      const itemKey = getHomeFolderItemKey(itemType, itemId);
      const operationEpoch = lockEpochRef.current;
      const previousFolderId = await getHomeFolderItemAssignment(itemType, itemId);
      const candidateFolderIds = new Set([previousFolderId, folderId].filter(
        (candidate): candidate is string => candidate != null,
      ));
      for (const protectedId of candidateFolderIds) {
        const folder = foldersRef.current.find((item) => item.id === protectedId);
        if (folder?.isProtected) {
          const outcome = await authorizeFolder(protectedId);
          if (outcome !== 'authenticated') {
            throw new Error('HOME_FOLDER_AUTHORIZATION_REQUIRED');
          }
        }
      }

      const protectedIds = [...candidateFolderIds].filter((protectedId) =>
        foldersRef.current.some((folder) => folder.id === protectedId && folder.isProtected),
      );
      if (protectedIds.length > 0 && (
        operationEpoch !== lockEpochRef.current ||
        appStateRef.current !== 'active' ||
        protectedIds.some((protectedId) => !isFolderAuthorized(protectedId))
      )) {
        throw new Error('HOME_FOLDER_AUTHORIZATION_REQUIRED');
      }

      const persistedPreviousFolderId = await setHomeFolderItemAssignment(
        itemType,
        itemId,
        folderId,
        previousFolderId,
      );
      if (persistedPreviousFolderId === folderId) return;

      setFolderIdByItemKey((current) => {
        const next = new Map(current);
        if (folderId == null) next.delete(itemKey);
        else next.set(itemKey, folderId);
        return next;
      });
      setFolders((current) =>
        current.map((folder) => {
          if (folder.id === persistedPreviousFolderId) {
            return { ...folder, itemCount: Math.max(0, folder.itemCount - 1) };
          }
          if (folder.id === folderId) return { ...folder, itemCount: folder.itemCount + 1 };
          return folder;
        }),
      );
    },
    [authorizeFolder, isFolderAuthorized],
  );

  const value = useMemo(
    () => ({
      folders,
      folderIdByItemKey,
      selection,
      view,
      isReady,
      isAppActive,
      lockEpoch,
      unlockedFolderIds,
      isFolderAuthorized,
      authorizeFolder,
      setFolderProtection: changeFolderProtection,
      selectView,
      selectCategory,
      selectFolder,
      createFolder: addFolder,
      renameFolder: updateFolder,
      setFolderColor: updateFolderColor,
      deleteFolder: removeFolder,
      setItemFolder,
      refresh,
    }),
    [
      addFolder,
      authorizeFolder,
      changeFolderProtection,
      removeFolder,
      selection,
      view,
      folderIdByItemKey,
      folders,
      isReady,
      isAppActive,
      lockEpoch,
      unlockedFolderIds,
      isFolderAuthorized,
      refresh,
      updateFolder,
      updateFolderColor,
      selectView,
      selectCategory,
      selectFolder,
      setItemFolder,
    ],
  );

  return <HomeFolderLibraryContext.Provider value={value}>{children}</HomeFolderLibraryContext.Provider>;
}

export function useLocalHomeFolders(): HomeFolderLibraryContextValue {
  const context = useContext(HomeFolderLibraryContext);
  if (!context) throw new Error('useLocalHomeFolders must be used within LocalHomeFolderProvider');
  return context;
}
