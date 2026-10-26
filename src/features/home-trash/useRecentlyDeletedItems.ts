import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import { useLocalDocumentLibrary } from '@/features/documents/LocalDocumentLibraryProvider';
import { useLocalSavedContent } from '@/features/home-content/LocalSavedContentProvider';
import { useLocalChecklists } from '@/features/home-content/LocalChecklistLibraryProvider';
import { useHomeSettingsSheet } from '@/features/home-content/HomeSettingsSheetProvider';
import { useLocalHomeFolders } from '@/features/home-folders/LocalHomeFolderProvider';
import {
  authenticateWithFaceId,
  getFolderAuthenticationFailureMessage,
} from '@/features/home-folders/folderFaceIdAuthentication';
import { useLocalPhotoLibrary } from '@/features/photos/LocalPhotoLibraryProvider';

import {
  listRecentlyDeletedItems,
  permanentlyDeleteRecentlyDeletedItem,
  restoreRecentlyDeletedItem,
  RecentlyDeletedRestoreConflictError,
  type RecentlyDeletedItem,
  type RecentlyDeletedItemType,
} from './trashLibrary';

type AuthorizationOutcome = 'authorized' | 'cancelled' | 'unavailable' | 'failed';

function redactProtectedItems(items: RecentlyDeletedItem[]): RecentlyDeletedItem[] {
  let changed = false;
  const redacted = items.map((item) => {
    if (!item.folderIsProtected || (item.title === null && item.requiresAuthorization)) return item;
    changed = true;
    return { ...item, title: null, requiresAuthorization: true };
  });
  return changed ? redacted : items;
}

export function useRecentlyDeletedItems(isActive: boolean) {
  const { folders, authorizeFolder, isFolderAuthorized, isAppActive, lockEpoch, refresh: refreshFolders } = useLocalHomeFolders();
  const { refresh: refreshMedia } = useLocalPhotoLibrary();
  const { refresh: refreshContent } = useLocalSavedContent();
  const { refresh: refreshDocuments } = useLocalDocumentLibrary();
  const { refresh: refreshChecklists } = useLocalChecklists();
  const { setProtectedTrashContentVisible } = useHomeSettingsSheet();
  const [items, setItems] = useState<RecentlyDeletedItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [revealedFolderIds, setRevealedFolderIds] = useState<ReadonlySet<string>>(() => new Set());
  const revealedFolderIdsRef = useRef<ReadonlySet<string>>(new Set());
  const operationEpochRef = useRef(lockEpoch);
  const isAppActiveRef = useRef(isAppActive);
  const isPageActiveRef = useRef(isActive);
  const foldersRef = useRef(folders);

  useEffect(() => {
    operationEpochRef.current = lockEpoch;
    isAppActiveRef.current = isAppActive;
    isPageActiveRef.current = isActive;
    foldersRef.current = folders;
  }, [folders, isActive, isAppActive, lockEpoch]);

  const setRevealedFolders = useCallback((folderIds: ReadonlySet<string>) => {
    if (
      folderIds.size === revealedFolderIdsRef.current.size &&
      [...folderIds].every((folderId) => revealedFolderIdsRef.current.has(folderId))
    ) return;
    revealedFolderIdsRef.current = folderIds;
    setRevealedFolderIds(folderIds);
  }, []);

  const authorizedFolderIds = useMemo(() => {
    if (!isAppActive || AppState.currentState !== 'active') return [];
    return [...revealedFolderIds].filter((folderId) => {
      const folder = folders.find((candidate) => candidate.id === folderId);
      return folder?.isProtected === true ? isFolderAuthorized(folderId) : true;
    });
  }, [folders, isAppActive, isFolderAuthorized, revealedFolderIds]);

  const visibleItems = useMemo(() => {
    if (!isActive || !isAppActive || AppState.currentState !== 'active') {
      return redactProtectedItems(items);
    }
    const authorized = new Set(authorizedFolderIds);
    return items.map((item) => (
      item.folderIsProtected && !authorized.has(item.folderId ?? '')
        ? { ...item, title: null, requiresAuthorization: true }
        : item
    ));
  }, [authorizedFolderIds, isActive, isAppActive, items]);

  const refresh = useCallback(async (extraAuthorizedFolderId?: string): Promise<RecentlyDeletedItem[] | null> => {
    if (!isActive) return null;
    const requestEpoch = operationEpochRef.current;
    setIsLoading(true);
    setLoadFailed(false);
    setOperationError(null);
    try {
      const allowed = new Set(authorizedFolderIds);
      if (extraAuthorizedFolderId) allowed.add(extraAuthorizedFolderId);
      const nextItems = await listRecentlyDeletedItems([...allowed]);
      if (
        !isPageActiveRef.current ||
        !isAppActiveRef.current ||
        AppState.currentState !== 'active' ||
        operationEpochRef.current !== requestEpoch
      ) return null;
      setItems(nextItems);
      setProtectedTrashContentVisible(nextItems.some(
        (item) => item.folderIsProtected && !item.requiresAuthorization,
      ));
      return nextItems;
    } catch {
      setItems(redactProtectedItems);
      setProtectedTrashContentVisible(false);
      setLoadFailed(true);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [authorizedFolderIds, isActive, setProtectedTrashContentVisible]);

  useEffect(() => {
    if (!isActive) {
      setRevealedFolders(new Set());
      setProtectedTrashContentVisible(false);
      return;
    }
    void Promise.resolve().then(() => refresh());
  }, [isActive, refresh, setProtectedTrashContentVisible, setRevealedFolders]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setRevealedFolders(new Set());
        setItems(redactProtectedItems);
        setProtectedTrashContentVisible(false);
      } else {
        setRevealedFolders(new Set());
        setItems(redactProtectedItems);
        // Keep the root privacy cover active until the app becomes active and rows are redacted.
        if (items.some((item) => item.folderIsProtected && !item.requiresAuthorization)) {
          setProtectedTrashContentVisible(true);
        }
      }
    });
    return () => subscription.remove();
  }, [items, setProtectedTrashContentVisible, setRevealedFolders]);

  const authorizeItem = useCallback(async (item: RecentlyDeletedItem): Promise<AuthorizationOutcome> => {
    if (!item.folderIsProtected) return 'authorized';
    if (!isAppActiveRef.current || AppState.currentState !== 'active') return 'cancelled';

    const epoch = operationEpochRef.current;
    const folder = item.folderId
      ? foldersRef.current.find((candidate) => candidate.id === item.folderId)
      : undefined;
    const outcome = folder?.isProtected
      ? await authorizeFolder(folder.id)
      : await authenticateWithFaceId('Autentique para acessar conteúdo protegido.');
    if (outcome !== 'authenticated') return outcome;
    const currentFolder = item.folderId
      ? foldersRef.current.find((candidate) => candidate.id === item.folderId)
      : undefined;
    if (
      !isAppActiveRef.current ||
      AppState.currentState !== 'active' ||
      operationEpochRef.current !== epoch ||
      (currentFolder?.isProtected === true && !isFolderAuthorized(currentFolder.id))
    ) return 'cancelled';
    return 'authorized';
  }, [authorizeFolder, isFolderAuthorized]);

  const reveal = useCallback(async (item: RecentlyDeletedItem) => {
    if (!item.requiresAuthorization) return;
    const outcome = await authorizeItem(item);
    if (outcome !== 'authorized') {
      if (outcome === 'unavailable' || outcome === 'failed') {
        Alert.alert('Face ID indisponível', getFolderAuthenticationFailureMessage(outcome));
      }
      return;
    }
    if (!item.folderId) return;
    const next = new Set(revealedFolderIdsRef.current);
    next.add(item.folderId);
    setRevealedFolders(next);
    await refresh(item.folderId);
  }, [authorizeItem, refresh, setRevealedFolders]);

  const restore = useCallback(async (item: RecentlyDeletedItem) => {
    const epoch = operationEpochRef.current;
    const outcome = await authorizeItem(item);
    if (outcome !== 'authorized') {
      if (outcome === 'unavailable' || outcome === 'failed') {
        Alert.alert('Face ID indisponível', getFolderAuthenticationFailureMessage(outcome));
      }
      return false;
    }
    if (operationEpochRef.current !== epoch || !isAppActiveRef.current || AppState.currentState !== 'active') return false;
    try {
      const restored = await restoreRecentlyDeletedItem(item.itemType, item.itemId);
      if (!restored) {
        await refresh();
        return false;
      }
      await Promise.allSettled([
        refreshMedia(),
        refreshContent(),
        refreshDocuments(),
        refreshChecklists(),
        refreshFolders(),
      ]);
      await refresh();
      return true;
    } catch (error) {
      // The item remains in the trash when SQLite rejects a conflicting restore.
      if (error instanceof RecentlyDeletedRestoreConflictError) {
        Alert.alert(
          'Link já salvo',
          'Já existe um link ativo com esse endereço. O link apagado continua em Apagados recentemente.',
        );
        return false;
      }
      Alert.alert('Não foi possível restaurar', 'O conteúdo continua em Apagados recentemente. Tente novamente.');
      return false;
    }
  }, [authorizeItem, refresh, refreshChecklists, refreshContent, refreshDocuments, refreshFolders, refreshMedia]);

  const permanentlyDelete = useCallback(async (item: RecentlyDeletedItem) => {
    setOperationError(null);
    const epoch = operationEpochRef.current;
    const outcome = await authorizeItem(item);
    if (outcome !== 'authorized') {
      if (outcome === 'unavailable' || outcome === 'failed') {
        Alert.alert('Face ID indisponível', getFolderAuthenticationFailureMessage(outcome));
      }
      return false;
    }
    if (operationEpochRef.current !== epoch || !isAppActiveRef.current || AppState.currentState !== 'active') return false;
    try {
      const deleted = await permanentlyDeleteRecentlyDeletedItem(item.itemType, item.itemId);
      if (!deleted) {
        const remainingItems = await refresh();
        if (
          remainingItems === null ||
          remainingItems.some((candidate) => candidate.itemType === item.itemType && candidate.itemId === item.itemId)
        ) {
          setOperationError('Não foi possível apagar definitivamente. O conteúdo continua disponível na lixeira.');
        }
        return false;
      }
      await refresh();
      return true;
    } catch {
      setOperationError('Não foi possível apagar definitivamente. O conteúdo continua disponível na lixeira.');
      return false;
    }
  }, [authorizeItem, refresh]);

  return { items: visibleItems, isLoading, loadFailed, operationError, refresh, reveal, restore, permanentlyDelete };
}

export function getRecentlyDeletedItemLabel(itemType: RecentlyDeletedItemType): string {
  switch (itemType) {
    case 'photo': return 'Foto';
    case 'video': return 'Vídeo';
    case 'link': return 'Link';
    case 'text': return 'Texto';
    case 'document': return 'Documento';
    case 'checklist': return 'Checklist';
  }
}
