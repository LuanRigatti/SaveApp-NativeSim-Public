export const HOME_FOLDER_ROUTE = '/folders/[id]' as const;

export function getHomeFolderRoute(folderId: string) {
  return { pathname: HOME_FOLDER_ROUTE, params: { id: folderId } } as const;
}

export function getHomeFolderIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/folders\/([^/]+)\/?$/);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
