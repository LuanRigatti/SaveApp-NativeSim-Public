const {
  createClipboardLinkOfferState,
  getClipboardOfferCorrelationID,
} = require('../src/features/home-content/clipboardLinkOfferState');
const { createLinkSaveSubmissionRunner } = require('../src/features/home-content/linkSaveSubmission');

describe('clipboard offer event state', () => {
  test('uses one opaque correlation ID per observed pasteboard change count', () => {
    const firstEventID = getClipboardOfferCorrelationID(39);
    expect(firstEventID).toMatch(/^clip-\d+$/);
    expect(getClipboardOfferCorrelationID(39)).toBe(firstEventID);
    expect(getClipboardOfferCorrelationID(40)).not.toBe(firstEventID);
    expect(getClipboardOfferCorrelationID(-1)).toBe(null);
  });

  test('a synchronous consumption cannot be overwritten by a stale AsyncStorage hydration', () => {
    const state = createClipboardLinkOfferState();
    const hydrationRevision = state.getRevision();

    expect(state.markHandled(41)).toBe(true);
    expect(state.restorePersisted(40, hydrationRevision)).toBe(false);
    expect(state.getLastHandledChangeCount()).toBe(41);
  });

  test('restores the persisted event count when no newer event was consumed', () => {
    const state = createClipboardLinkOfferState();
    const hydrationRevision = state.getRevision();

    expect(state.restorePersisted(41, hydrationRevision)).toBe(true);
    expect(state.getLastHandledChangeCount()).toBe(41);
    expect(state.restorePersisted(40, hydrationRevision)).toBe(false);
  });

  test('holds automatic offers while the explicit Dynamic Island flow is active', () => {
    const state = createClipboardLinkOfferState();
    const releaseFirst = state.beginExplicitFlow();
    const releaseSecond = state.beginExplicitFlow();

    expect(state.hasExplicitFlow()).toBe(true);
    releaseFirst();
    releaseFirst();
    expect(state.hasExplicitFlow()).toBe(true);
    releaseSecond();
    expect(state.hasExplicitFlow()).toBe(false);
  });

  test.each(['save', 'cancel'])(
    'does not offer the consumed clipboard event again after the composer %s flow returns Home',
    (composerAction) => {
      const state = createClipboardLinkOfferState();
      const release = state.beginExplicitFlow();
      const finishComposer = (action) => {
        if (action === 'save' || action === 'cancel') release();
      };

      // A Home AppState/focus check can arrive while the Dynamic Island route is opening.
      expect(state.shouldOffer(true, false, 72)).toBe(false);
      expect(state.markHandled(72)).toBe(true);
      finishComposer(composerAction);

      // Returning after either saving or canceling cannot resurface this same copy event.
      expect(state.shouldOffer(true, false, 72)).toBe(false);
      // Copying the same URL again is a new pasteboard event and remains eligible.
      expect(state.shouldOffer(true, false, 73)).toBe(true);
      expect(composerAction).toMatch(/save|cancel/);
    },
  );

  test('keeps the ordinary automatic offer available outside the Dynamic Island flow', () => {
    const state = createClipboardLinkOfferState();
    expect(state.shouldOffer(true, false, 5)).toBe(true);
  });

  test('reserves one event while its offer/composer is active and consumes it only after save confirmation', () => {
    const state = createClipboardLinkOfferState();
    expect(state.shouldOffer(true, false, 101)).toBe(true);
    expect(state.reserveOffer(101)).toBe(true);
    expect(state.reserveOffer(101)).toBe(false);
    expect(state.shouldOffer(true, false, 101)).toBe(false);
    expect(state.getLastHandledChangeCount()).toBe(null);

    // The persistence callback is the commit point for clipboard consumption.
    expect(state.markHandled(101)).toBe(true);
    expect(state.getLastHandledChangeCount()).toBe(101);
    expect(state.shouldOffer(true, false, 101)).toBe(false);
    expect(state.shouldOffer(true, false, 102)).toBe(true);
  });

  test('records normalized URL identity only after persistence succeeds; cancel and failure remain retryable', async () => {
    const url = 'https://instagram.com/p/saved-a';
    for (const outcome of ['saved', 'cancelled', 'failed']) {
      const state = createClipboardLinkOfferState();
      const submitLinkSave = createLinkSaveSubmissionRunner();
      const controller = new AbortController();
      const save = outcome === 'cancelled'
        ? async () => undefined
        : outcome === 'failed'
          ? async () => { throw new Error('storage failure'); }
          : async () => 'persisted';
      if (outcome === 'cancelled') controller.abort();

      const result = await submitLinkSave(save, controller.signal, {
        isCurrent: () => !controller.signal.aborted,
        onSettled: () => undefined,
        setErrorMessage: () => undefined,
        setSaving: () => undefined,
        onSuccess: () => state.markURLHandled(url),
      });

      if (outcome === 'saved') {
        expect(result).toBe('saved');
        expect(state.getHandledURLs().has(url)).toBe(true);
      } else {
        expect(result).toBe(outcome);
        expect(state.getHandledURLs().has(url)).toBe(false);
      }
    }
  });

  test('canceling an offer suppresses only that copy event and never persists consumption', () => {
    const state = createClipboardLinkOfferState();
    expect(state.reserveOffer(201)).toBe(true);
    state.dismissOfferUntilClipboardChanges(201);

    expect(state.getLastHandledChangeCount()).toBe(null);
    expect(state.shouldOffer(true, false, 201)).toBe(false);
    expect(state.shouldOffer(true, false, 202)).toBe(true);
  });

  test('a failed or interrupted read can be retried after app return without losing the event', () => {
    const state = createClipboardLinkOfferState();
    expect(state.reserveOffer(301)).toBe(true);
    state.deferOfferUntilResume(301);

    expect(state.shouldOffer(true, false, 301)).toBe(false);
    expect(state.getLastHandledChangeCount()).toBe(null);
    state.resumeDeferredOffers();
    expect(state.shouldOffer(true, false, 301)).toBe(true);
    expect(state.reserveOffer(301)).toBe(true);
  });

  test('a new clipboard event remains eligible while an older candidate is being saved', () => {
    const state = createClipboardLinkOfferState();
    expect(state.reserveOffer(401)).toBe(true);
    expect(state.shouldOffer(true, false, 402)).toBe(true);
    expect(state.reserveOffer(402)).toBe(true);

    state.markHandled(401);
    expect(state.shouldOffer(true, false, 402)).toBe(false);
    expect(state.getLastHandledChangeCount()).toBe(401);
  });

  test('background invalidates all pending reservations until the next active transition', () => {
    const state = createClipboardLinkOfferState();
    expect(state.reserveOffer(501)).toBe(true);
    expect(state.reserveOffer(502)).toBe(true);
    state.deferReservedOffersUntilResume();

    expect(state.shouldOffer(true, false, 501)).toBe(false);
    expect(state.shouldOffer(true, false, 502)).toBe(false);
    state.resumeDeferredOffers();
    expect(state.shouldOffer(true, false, 501)).toBe(true);
    expect(state.shouldOffer(true, false, 502)).toBe(true);
  });

  test('suppresses the clipboard event used to open Home from the expanded Dynamic Island', () => {
    const state = createClipboardLinkOfferState();
    state.suppressCurrentClipboardOffer(83);

    expect(state.shouldOffer(true, false, 83)).toBe(false);
    expect(state.shouldOffer(true, false, 83)).toBe(false);
    expect(state.shouldOffer(true, false, 84)).toBe(true);
  });

  test('keeps the expanded Home clipboard offer suppressed until a new change when metadata is unavailable', () => {
    const state = createClipboardLinkOfferState();
    state.suppressCurrentClipboardOfferUntilChange();

    expect(state.shouldOffer(true, false, 91)).toBe(false);
    expect(state.shouldOffer(true, false, 91)).toBe(false);
    expect(state.shouldOffer(true, false, 92)).toBe(true);
  });

  test('integration: Add link commits and handles the clipboard event before closing Home composer', async () => {
    const state = createClipboardLinkOfferState();
    const submitLinkSave = createLinkSaveSubmissionRunner();
    const changeCount = 121;
    const events = [];
    const controller = new AbortController();

    expect(state.reserveOffer(changeCount)).toBe(true);
    expect(state.getOfferDecision(true, false, changeCount)).toEqual({
      eligible: false,
      reason: 'offer-already-reserved',
    });

    await expect(submitLinkSave(
      async () => events.push('sqlite-persisted'),
      controller.signal,
      {
        isCurrent: () => true,
        onSettled: () => events.push('settled'),
        setErrorMessage: () => undefined,
        setSaving: () => undefined,
        onSuccess: () => {
          state.markHandled(changeCount);
          events.push('clipboard-handled');
          // HomeContentComposer.onClose runs directly after the success callback.
          state.deferOfferUntilResume(changeCount);
          events.push('composer-closed');
        },
      },
    )).resolves.toBe('saved');

    expect(events.slice(0, 3)).toEqual(['sqlite-persisted', 'clipboard-handled', 'composer-closed']);
    // iOS may deliver inactive -> active and repeated focus checks while dismissing UIAlertController.
    state.resumeDeferredOffers();
    expect(state.getOfferDecision(true, false, changeCount)).toEqual({
      eligible: false,
      reason: 'already-handled',
    });
    expect(state.getOfferDecision(true, false, changeCount)).toEqual({
      eligible: false,
      reason: 'already-handled',
    });
    expect(state.getOfferDecision(true, false, changeCount + 1)).toEqual({
      eligible: true,
      reason: 'eligible',
    });
  });

  test.each(['cancelled', 'failed'])(
    '%s composer result does not consume the clipboard event and remains retryable after resume',
    async (outcome) => {
      const state = createClipboardLinkOfferState();
      const submitLinkSave = createLinkSaveSubmissionRunner();
      const changeCount = 131;
      const controller = new AbortController();
      expect(state.reserveOffer(changeCount)).toBe(true);

      const onSuccess = jest.fn();
      const save = outcome === 'cancelled'
        ? async () => undefined
        : async () => { throw new Error('storage failure'); };
      if (outcome === 'cancelled') controller.abort();
      const result = await submitLinkSave(save, controller.signal, {
        isCurrent: () => !controller.signal.aborted,
        onSettled: () => undefined,
        setErrorMessage: () => undefined,
        setSaving: () => undefined,
        onSuccess: () => {
          onSuccess();
          state.markHandled(changeCount);
        },
      });

      expect(result).toBe(outcome === 'cancelled' ? 'cancelled' : 'failed');
      expect(onSuccess).not.toHaveBeenCalled();
      expect(state.getLastHandledChangeCount()).toBe(null);
      state.deferOfferUntilResume(changeCount);
      state.resumeDeferredOffers();
      expect(state.getOfferDecision(true, false, changeCount).eligible).toBe(true);
    },
  );
});
