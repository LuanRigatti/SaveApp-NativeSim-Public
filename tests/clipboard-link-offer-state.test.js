const { createClipboardLinkOfferState } = require('../src/features/home-content/clipboardLinkOfferState');

describe('clipboard offer event state', () => {
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
});
