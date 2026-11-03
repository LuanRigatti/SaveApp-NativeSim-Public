import { useCallback, useState } from 'react';

import { getHomeFolderItemKey, type HomeFolderItemType } from './homeFolderTypes';
import { useLocalHomeFolders } from './LocalHomeFolderProvider';
import type { FolderAuthenticationOutcome } from './folderFaceIdAuthentication';

export type HomeFolderAuthorizationStatus =
  | 'checking'
  | 'requesting'
  | 'cancelled'
  | 'unavailable'
  | 'failed';

export type HomeFolderAuthorization = {
  folderId: string | null;
  isAuthorized: boolean;
  isProtected: boolean;
  isReady: boolean;
  isAppActive: boolean;
  status: HomeFolderAuthorizationStatus;
  requestAuthorization: () => Promise<FolderAuthenticationOutcome>;
};

export function useHomeFolderAuthorization(folderId: string | null): HomeFolderAuthorization {
  const {
    authorizeFolder,
    folders,
    isAppActive,
    isFolderAuthorized,
    isReady,
    lockEpoch,
  } = useLocalHomeFolders();
  const folder = folderId ? folders.find((item) => item.id === folderId) ?? null : null;
  const isProtected = folder?.isProtected ?? false;
  const isAuthorized = isReady && (
    folderId == null || (folder != null && (!folder.isProtected || isFolderAuthorized(folderId)))
  );
  const statusKey = `${folderId ?? 'home'}:${lockEpoch}`;
  const [statusRecord, setStatusRecord] = useState<{
    key: string;
    status: HomeFolderAuthorizationStatus;
  }>({ key: statusKey, status: 'cancelled' });
  const status = isReady && folderId && !folder
    ? 'failed'
    : !isReady
      ? 'checking'
      : !folderId || !isProtected || isAuthorized
        ? 'checking'
        : statusRecord.key !== statusKey
          ? 'cancelled'
          : statusRecord.status;

  const requestAuthorization = useCallback(async (): Promise<FolderAuthenticationOutcome> => {
    if (!folderId) return 'authenticated';
    if (!isAppActive) return 'cancelled';
    setStatusRecord({ key: statusKey, status: 'requesting' });
    const outcome = await authorizeFolder(folderId);
    if (outcome !== 'authenticated') setStatusRecord({ key: statusKey, status: outcome });
    return outcome;
  }, [authorizeFolder, folderId, isAppActive, statusKey]);

  return {
    folderId,
    isAuthorized,
    isProtected,
    isReady,
    isAppActive,
    status,
    requestAuthorization,
  };
}

export function useHomeFolderItemAuthorization(
  itemType: HomeFolderItemType,
  itemId: number | null,
): HomeFolderAuthorization {
  const { folderIdByItemKey, isReady } = useLocalHomeFolders();
  const folderId = isReady && itemId != null
    ? folderIdByItemKey.get(getHomeFolderItemKey(itemType, itemId)) ?? null
    : null;
  const authorization = useHomeFolderAuthorization(folderId);
  return {
    ...authorization,
    isAuthorized: isReady && (itemId == null || authorization.isAuthorized),
    isReady,
  };
}
