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

export function wasClipboardChangeHandledByQuickSave(
  changeCount: number,
  handledChangeCount: number | undefined,
  systemUptime: number | undefined,
  handledSystemUptime: number | undefined,
): boolean {
  return (
    Number.isSafeInteger(changeCount) &&
    changeCount >= 0 &&
    handledChangeCount === changeCount &&
    typeof systemUptime === 'number' &&
    Number.isFinite(systemUptime) &&
    systemUptime >= 0 &&
    typeof handledSystemUptime === 'number' &&
    Number.isFinite(handledSystemUptime) &&
    handledSystemUptime >= 0 &&
    systemUptime >= handledSystemUptime
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
