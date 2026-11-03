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

export function matchesClipboardOfferURL(
  submittedText: string,
  offeredNormalizedURL: string,
): boolean {
  const submitted = prepareClipboardLinkCandidate(submittedText, new Set());
  return submitted.status === 'ready' && submitted.normalizedURL === offeredNormalizedURL;
}

export type ClipboardOfferVerificationSnapshot = {
  changeCount: number;
  hasURLItem: boolean;
};

export type ClipboardOfferVerificationResult =
  | { status: 'ready' | 'duplicate'; clipboardText: string; normalizedURL: string }
  | { status: 'invalid'; clipboardText: string }
  | { status: 'changed' | 'unavailable' };

/**
 * Reads a candidate only after a metadata snapshot has identified a likely link, then checks the
 * pasteboard revision again. This lets Home compare content identity before presenting an offer
 * without logging or persisting clipboard contents.
 */
export async function verifyClipboardOfferCandidate({
  expectedChangeCount,
  readSnapshot,
  readClipboardText,
  savedNormalizedURLs,
}: {
  expectedChangeCount: number;
  readSnapshot: () => Promise<ClipboardOfferVerificationSnapshot | null>;
  readClipboardText: (snapshot: ClipboardOfferVerificationSnapshot) => Promise<string | null>;
  savedNormalizedURLs: ReadonlySet<string>;
}): Promise<ClipboardOfferVerificationResult> {
  try {
    const beforeRead = await readSnapshot();
    if (!beforeRead) return { status: 'unavailable' };
    if (beforeRead.changeCount !== expectedChangeCount) return { status: 'changed' };

    const clipboardText = await readClipboardText(beforeRead);
    const afterRead = await readSnapshot();
    if (!afterRead) return { status: 'unavailable' };
    if (afterRead.changeCount !== expectedChangeCount) return { status: 'changed' };
    if (typeof clipboardText !== 'string' || !clipboardText.trim()) {
      return { status: 'unavailable' };
    }

    const candidate = prepareClipboardLinkCandidate(clipboardText, savedNormalizedURLs);
    if (candidate.status === 'duplicate') {
      return { status: 'duplicate', clipboardText, normalizedURL: candidate.normalizedURL };
    }
    if (candidate.status === 'ready') {
      return { status: 'ready', clipboardText, normalizedURL: candidate.normalizedURL };
    }
    if (candidate.status === 'invalid') return { status: 'invalid', clipboardText };
    return { status: 'unavailable' };
  } catch {
    // A denied or unavailable pasteboard read must not consume the event or create an offer.
    return { status: 'unavailable' };
  }
}
