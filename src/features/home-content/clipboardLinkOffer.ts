import { InvalidWebLinkError, normalizeWebLink } from './linkValidation';

export function shouldOfferClipboardLink(
  hasURLItem: boolean,
  hasProbableWebURL: boolean,
  changeCount: number,
  lastHandledChangeCount: number | null,
): boolean {
  return (
    Number.isSafeInteger(changeCount) &&
    changeCount >= 0 &&
    (hasURLItem || hasProbableWebURL) &&
    changeCount !== lastHandledChangeCount
  );
}

export type ClipboardLinkCandidateResult =
  | { status: 'empty' }
  | { status: 'invalid' }
  | { status: 'duplicate'; normalizedURL: string }
  | { status: 'ready'; normalizedURL: string };

export function prepareClipboardLinkCandidate(
  clipboardText: string,
  savedNormalizedURLs: ReadonlySet<string>,
): ClipboardLinkCandidateResult {
  if (!clipboardText.trim()) return { status: 'empty' };

  try {
    const normalizedURL = normalizeWebLink(clipboardText).url;
    return savedNormalizedURLs.has(normalizedURL)
      ? { status: 'duplicate', normalizedURL }
      : { status: 'ready', normalizedURL };
  } catch (error) {
    if (error instanceof InvalidWebLinkError) return { status: 'invalid' };
    return { status: 'invalid' };
  }
}
