import type { SavedPhoto } from './photoTypes';
import { normalizeCustomPhotoTitle } from './photoTitle';

export type PhotoRenamePersistenceAdapter = {
  getPhoto: (id: number) => Promise<SavedPhoto | null>;
  updateTitle: (id: number, title: string | null) => Promise<boolean>;
};

export type PhotoRenameResult =
  | { status: 'renamed' | 'unchanged'; photo: SavedPhoto }
  | { status: 'missing' | 'in-progress' }
  | { status: 'failed'; error: unknown };

const renameRequestsInProgress = new Set<number>();

export function createPhotoRenamePromptButtons(onSave: (value: string) => void) {
  return [
    { text: 'Cancelar', style: 'cancel' as const },
    { text: 'Salvar', onPress: (value?: string) => onSave(value ?? '') },
  ];
}

/** Writes a normalized title once per photo and reports success only after SQLite confirms the update. */
export async function renamePhotoWithPersistence(
  id: number,
  value: string,
  adapter: PhotoRenamePersistenceAdapter,
): Promise<PhotoRenameResult> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { status: 'missing' };
  }
  if (renameRequestsInProgress.has(id)) {
    return { status: 'in-progress' };
  }

  renameRequestsInProgress.add(id);
  try {
    const current = await adapter.getPhoto(id);
    if (!current) {
      return { status: 'missing' };
    }

    const customTitle = normalizeCustomPhotoTitle(value);
    if (current.customTitle === customTitle) {
      return { status: 'unchanged', photo: current };
    }

    const didUpdate = await adapter.updateTitle(id, customTitle);
    return didUpdate
      ? { status: 'renamed', photo: { ...current, customTitle } }
      : { status: 'missing' };
  } catch (error) {
    return { status: 'failed', error };
  } finally {
    renameRequestsInProgress.delete(id);
  }
}
