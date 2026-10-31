export function isSaveLinkActivityAvailable(): boolean {
  return false;
}

export async function reconcileSaveLinkActivity(_enabled: boolean): Promise<void> {
  // Live Activities are an iOS-only capability.
}

export async function updateSaveLinkActivityRecentLinksVisibility(_visible: boolean): Promise<void> {
  // Lock Screen Live Activity content is an iOS-only capability.
}

export async function isAuthorizedSaveLinkActivityURL(
  _token: string | string[] | undefined,
): Promise<boolean> {
  return false;
}
