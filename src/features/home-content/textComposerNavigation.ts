import type { HomeGalleryEntry } from './homeContentTypes';

export const TEXT_COMPOSER_ROUTE = '/texts/compose' as const;

export function shouldFocusTextComposerAfterTransitionEnd(input: {
  alreadyRequested: boolean;
  closing: boolean;
  isMounted: boolean;
}): boolean {
  return input.isMounted && !input.closing && !input.alreadyRequested;
}

export function hasTextComposerDraft(value: string): boolean {
  return value.trim().length > 0;
}

export function shouldPreventTextComposerRemoval(input: {
  allowRouteRemoval: boolean;
  hasDraft: boolean;
  isSaving: boolean;
}): boolean {
  return !input.allowRouteRemoval && (input.isSaving || input.hasDraft);
}

export function consumePendingTextReveal(pending: { current: number | null }): number | null {
  const id = pending.current;
  pending.current = null;
  return id;
}

export function hasSavedTextGalleryEntry(entries: readonly HomeGalleryEntry[], id: number): boolean {
  return entries.some(
    (entry) =>
      entry.kind === 'content' &&
      !('mediaType' in entry.content) &&
      entry.content.contentType === 'text' &&
      entry.content.id === id,
  );
}
