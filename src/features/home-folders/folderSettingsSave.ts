export async function saveFolderSettingsName<T extends { name: string }>(options: {
  currentName: string;
  nextName: string;
  rename: (name: string) => Promise<T>;
}): Promise<{ name: string; changed: boolean }> {
  const normalizedDisplayName = options.nextName.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (normalizedDisplayName === options.currentName) {
    return { name: options.currentName, changed: false };
  }

  const updated = await options.rename(options.nextName);
  return { name: updated.name, changed: true };
}
