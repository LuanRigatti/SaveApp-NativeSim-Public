import { DuplicateSavedLinkError } from './contentSavePipeline';
import { InvalidWebLinkError } from './linkValidation';

export type LinkSaveSubmissionResult = 'saved' | 'failed' | 'cancelled' | 'busy';

export type LinkSaveSubmissionCallbacks = {
  isCurrent: () => boolean;
  onSettled: () => void;
  setErrorMessage: (message: string | null) => void;
  setSaving: (isSaving: boolean) => void;
  onSuccess: () => void;
};

export function getLinkSaveErrorMessage(error: unknown): string {
  if (error instanceof InvalidWebLinkError) {
    return 'Digite um endereço HTTP ou HTTPS válido.';
  }
  if (error instanceof DuplicateSavedLinkError) {
    return 'Este link já está salvo.';
  }
  return 'Não foi possível salvar o link. Tente novamente.';
}

export function createLinkSaveSubmissionRunner() {
  let isRunning = false;

  return async function submitLinkSave(
    save: () => Promise<unknown>,
    signal: AbortSignal,
    callbacks: LinkSaveSubmissionCallbacks,
  ): Promise<LinkSaveSubmissionResult> {
    if (isRunning) return 'busy';
    if (signal.aborted || !callbacks.isCurrent()) return 'cancelled';

    isRunning = true;
    callbacks.setErrorMessage(null);
    callbacks.setSaving(true);

    try {
      try {
        await save();
      } catch (error) {
        if (signal.aborted || !callbacks.isCurrent()) return 'cancelled';
        callbacks.setErrorMessage(getLinkSaveErrorMessage(error));
        return 'failed';
      }

      if (signal.aborted || !callbacks.isCurrent()) return 'cancelled';
      callbacks.onSuccess();
      return 'saved';
    } finally {
      isRunning = false;
      if (callbacks.isCurrent()) callbacks.setSaving(false);
      callbacks.onSettled();
    }
  };
}
