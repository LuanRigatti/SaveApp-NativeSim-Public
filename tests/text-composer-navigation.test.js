/* global describe, expect, test */

const {
  TEXT_COMPOSER_ROUTE,
  consumePendingTextReveal,
  hasSavedTextGalleryEntry,
  hasTextComposerDraft,
  shouldFocusTextComposerAfterTransitionEnd,
  shouldPreventTextComposerRemoval,
} = require('../src/features/home-content/textComposerNavigation');

describe('text composer route and return behavior', () => {
  test('uses the dedicated composer route and recognizes non-empty drafts', () => {
    expect(TEXT_COMPOSER_ROUTE).toBe('/texts/compose');
    expect(hasTextComposerDraft('  nota  ')).toBe(true);
    expect(hasTextComposerDraft(' \n\t ')).toBe(false);
  });

  test('requests focus once after the opening transition and ignores closing or stale events', () => {
    const opened = { alreadyRequested: false, closing: false, isMounted: true };
    expect(shouldFocusTextComposerAfterTransitionEnd(opened)).toBe(true);
    expect(
      shouldFocusTextComposerAfterTransitionEnd({ ...opened, alreadyRequested: true }),
    ).toBe(false);
    expect(shouldFocusTextComposerAfterTransitionEnd({ ...opened, closing: true })).toBe(false);
    expect(shouldFocusTextComposerAfterTransitionEnd({ ...opened, isMounted: false })).toBe(false);
  });

  test('prevents removal only for an unsaved draft or an active save', () => {
    expect(shouldPreventTextComposerRemoval({ allowRouteRemoval: false, hasDraft: false, isSaving: false })).toBe(false);
    expect(shouldPreventTextComposerRemoval({ allowRouteRemoval: false, hasDraft: true, isSaving: false })).toBe(true);
    expect(shouldPreventTextComposerRemoval({ allowRouteRemoval: false, hasDraft: false, isSaving: true })).toBe(true);
    expect(shouldPreventTextComposerRemoval({ allowRouteRemoval: true, hasDraft: true, isSaving: true })).toBe(false);
  });

  test('consumes the newly saved text reveal signal once', () => {
    const pending = { current: 23 };
    expect(consumePendingTextReveal(pending)).toBe(23);
    expect(pending.current).toBeNull();
    expect(consumePendingTextReveal(pending)).toBeNull();
  });

  test('recognizes only the matching text item in a mixed gallery', () => {
    const entries = [
      { kind: 'content', content: { contentType: 'text', id: 23, text: 'saved' } },
      { kind: 'content', content: { contentType: 'link', id: 23, url: 'https://example.com' } },
      { kind: 'media', content: { mediaType: 'photo', id: 23, uri: 'file:///photo.jpg' } },
    ];

    expect(hasSavedTextGalleryEntry(entries, 23)).toBe(true);
    expect(hasSavedTextGalleryEntry(entries, 24)).toBe(false);
  });
});
