import { shouldOfferClipboardLink } from './clipboardLinkOffer';

function isValidChangeCount(changeCount: number | null | undefined): changeCount is number {
  return Number.isSafeInteger(changeCount) && (changeCount as number) >= 0;
}

export function createClipboardLinkOfferState() {
  let lastHandledChangeCount: number | null = null;
  let revision = 0;
  let hasLocalConsumption = false;
  let explicitFlowCount = 0;

  return {
    beginExplicitFlow(): () => void {
      explicitFlowCount += 1;
      let released = false;

      return () => {
        if (released) return;
        released = true;
        explicitFlowCount = Math.max(0, explicitFlowCount - 1);
      };
    },

    getLastHandledChangeCount(): number | null {
      return lastHandledChangeCount;
    },

    getRevision(): number {
      return revision;
    },

    hasExplicitFlow(): boolean {
      return explicitFlowCount > 0;
    },

    markHandled(changeCount: number | null | undefined): boolean {
      if (!isValidChangeCount(changeCount)) return false;
      lastHandledChangeCount = changeCount;
      hasLocalConsumption = true;
      revision += 1;
      return true;
    },

    shouldOffer(
      hasURLItem: boolean,
      hasProbableWebURL: boolean,
      changeCount: number,
    ): boolean {
      return explicitFlowCount === 0 && shouldOfferClipboardLink(
        hasURLItem,
        hasProbableWebURL,
        changeCount,
        lastHandledChangeCount,
      );
    },

    restorePersisted(changeCount: number | null, expectedRevision: number): boolean {
      if (hasLocalConsumption || revision !== expectedRevision) return false;
      lastHandledChangeCount = isValidChangeCount(changeCount) ? changeCount : null;
      revision += 1;
      return true;
    },
  };
}

export const clipboardLinkOfferState = createClipboardLinkOfferState();
