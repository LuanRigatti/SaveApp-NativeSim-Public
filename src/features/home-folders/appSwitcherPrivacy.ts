import type {
  HomeFolder,
  HomeFolderItemType,
  HomeFolderSelection,
} from './homeFolderTypes';

const ITEM_DETAIL_ROUTE_TYPES: Readonly<Record<string, HomeFolderItemType>> = {
  checklists: 'checklist',
  documents: 'document',
  links: 'link',
  photos: 'photo',
  texts: 'text',
  videos: 'video',
};

type AppSwitcherPrivacyInput = {
  pathname: string;
  selection: HomeFolderSelection;
  folders: readonly Pick<HomeFolder, 'id' | 'isProtected'>[];
  folderIdByItemKey: ReadonlyMap<string, string>;
  isFolderCatalogReady: boolean;
  hasAuthorizedProtectedTrashContent?: boolean;
};

function getRouteSegments(pathname: string): string[] {
  return pathname
    .split(/[?#]/u, 1)[0]
    .split('/')
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')))
    .filter((segment) => segment !== 'index')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
}

function needsFolderProtection(
  folderId: string,
  folders: AppSwitcherPrivacyInput['folders'],
): boolean {
  const folder = folders.find((item) => item.id === folderId);
  return folder ? folder.isProtected : true;
}

export function shouldCoverAppSwitcherPreview({
  pathname,
  selection,
  folders,
  folderIdByItemKey,
  isFolderCatalogReady,
  hasAuthorizedProtectedTrashContent,
}: AppSwitcherPrivacyInput): boolean {
  if (hasAuthorizedProtectedTrashContent) return true;
  const segments = getRouteSegments(pathname);

  if (segments.length === 0) {
    if (selection.kind !== 'folder') return false;
    return needsFolderProtection(selection.folderId, folders);
  }

  if (segments.length !== 2) return false;

  const [routeName, rawId] = segments;
  if (routeName === 'folders') {
    return needsFolderProtection(rawId, folders);
  }

  const itemType = ITEM_DETAIL_ROUTE_TYPES[routeName];
  if (!itemType) return false;

  const itemId = Number(rawId);
  if (!isFolderCatalogReady || !Number.isSafeInteger(itemId) || itemId <= 0) return true;

  const folderId = folderIdByItemKey.get(`${itemType}:${itemId}`);
  if (!folderId) return false;
  return needsFolderProtection(folderId, folders);
}
