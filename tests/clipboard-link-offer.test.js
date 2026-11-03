const { readFileSync } = require('node:fs');

const {
  matchesClipboardOfferURL,
  prepareClipboardLinkCandidate,
  shouldOfferClipboardLink,
  verifyClipboardOfferCandidate,
  wasClipboardChangeHandledByQuickSave,
} = require('../src/features/home-content/clipboardLinkOffer');
const { createClipboardLinkOfferState } = require('../src/features/home-content/clipboardLinkOfferState');

describe('clipboard link offers', () => {
  test('offers a detected URL only once for an unchanged clipboard change count', () => {
    expect(shouldOfferClipboardLink(true, false, 12, null)).toBe(true);
    expect(shouldOfferClipboardLink(false, true, 13, 12)).toBe(true);
    expect(shouldOfferClipboardLink(true, true, 12, 12)).toBe(false);
    // The same URL copied again is a new event when the pasteboard change count changes.
    expect(shouldOfferClipboardLink(true, false, 14, 12)).toBe(true);
    expect(shouldOfferClipboardLink(false, false, 14, 12)).toBe(false);
    expect(shouldOfferClipboardLink(true, false, -1, null)).toBe(false);
  });

  test('suppresses only the same quick-saved pasteboard event and ignores stale markers after reboot', () => {
    expect(wasClipboardChangeHandledByQuickSave(21, 21, 800, 799.5)).toBe(true);
    expect(wasClipboardChangeHandledByQuickSave(22, 21, 800, 799.5)).toBe(false);
    expect(wasClipboardChangeHandledByQuickSave(21, 21, 2, 799.5)).toBe(false);
    expect(wasClipboardChangeHandledByQuickSave(21, 21, undefined, 799.5)).toBe(false);
    expect(wasClipboardChangeHandledByQuickSave(-1, -1, 800, 799)).toBe(false);
  });

  test('normalizes HTTP and HTTPS candidates and detects duplicates before opening the composer', () => {
    expect(prepareClipboardLinkCandidate(' Example.com/article ', new Set())).toEqual({
      status: 'ready',
      normalizedURL: 'https://example.com/article',
    });
    expect(prepareClipboardLinkCandidate('http://example.com', new Set())).toEqual({
      status: 'ready',
      normalizedURL: 'http://example.com/',
    });
    expect(prepareClipboardLinkCandidate('https://example.com/', new Set(['https://example.com/']))).toEqual({
      status: 'duplicate',
      normalizedURL: 'https://example.com/',
    });
    expect(prepareClipboardLinkCandidate('mailto:test@example.com', new Set())).toEqual({ status: 'invalid' });
    expect(prepareClipboardLinkCandidate('javascript:alert(1)', new Set())).toEqual({ status: 'invalid' });
    expect(prepareClipboardLinkCandidate('   ', new Set())).toEqual({ status: 'empty' });
  });

  test('consumes a clipboard offer only when the confirmed saved URL matches its normalized content', () => {
    expect(matchesClipboardOfferURL(' Instagram.com/p/abc ', 'https://instagram.com/p/abc')).toBe(true);
    expect(matchesClipboardOfferURL('https://example.com/other', 'https://instagram.com/p/abc')).toBe(false);
    expect(matchesClipboardOfferURL('not a URL', 'https://instagram.com/p/abc')).toBe(false);
  });

  test.each([
    { source: 'dynamic-island', savedChangeCount: 25, resumedChangeCount: 37 },
    { source: 'home', savedChangeCount: 38, resumedChangeCount: 46 },
  ])('integration: $source save suppresses the same URL at a new changeCount while a different URL remains offerable', async ({
    savedChangeCount,
    resumedChangeCount,
  }) => {
    const state = createClipboardLinkOfferState();
    const urlA = 'https://instagram.com/p/saved-a/';
    const urlB = 'https://example.com/new-b';
    state.markURLHandled(urlA);
    expect(state.markHandled(savedChangeCount)).toBe(true);

    const decisionForReissuedA = state.getOfferDecision(true, true, resumedChangeCount);
    expect(decisionForReissuedA).toEqual({ eligible: true, reason: 'eligible' });
    const aSnapshots = [
      { changeCount: resumedChangeCount, hasURLItem: true },
      { changeCount: resumedChangeCount, hasURLItem: true },
    ];
    const aReadClipboard = jest.fn(async () => ' https://Instagram.com/p/saved-a/ ');
    const aResult = await verifyClipboardOfferCandidate({
      expectedChangeCount: resumedChangeCount,
      readSnapshot: async () => aSnapshots.shift() ?? null,
      readClipboardText: aReadClipboard,
      savedNormalizedURLs: state.getHandledURLs(),
    });

    expect(aResult).toEqual({
      status: 'duplicate',
      clipboardText: ' https://Instagram.com/p/saved-a/ ',
      normalizedURL: urlA,
    });
    expect(aReadClipboard).toHaveBeenCalledTimes(1);
    expect(state.markHandled(resumedChangeCount)).toBe(true);
    expect(state.getOfferDecision(true, true, resumedChangeCount)).toEqual({
      eligible: false,
      reason: 'already-handled',
    });

    const newURLChangeCount = resumedChangeCount + 1;
    expect(state.getOfferDecision(true, true, newURLChangeCount)).toEqual({ eligible: true, reason: 'eligible' });
    const bSnapshots = [
      { changeCount: newURLChangeCount, hasURLItem: false },
      { changeCount: newURLChangeCount, hasURLItem: false },
    ];
    const bResult = await verifyClipboardOfferCandidate({
      expectedChangeCount: newURLChangeCount,
      readSnapshot: async () => bSnapshots.shift() ?? null,
      readClipboardText: async () => urlB,
      savedNormalizedURLs: state.getHandledURLs(),
    });
    expect(bResult).toEqual({ status: 'ready', clipboardText: urlB, normalizedURL: urlB });
    expect(state.reserveOffer(newURLChangeCount)).toBe(true);
    expect(state.getOfferDecision(true, true, newURLChangeCount)).toEqual({
      eligible: false,
      reason: 'offer-already-reserved',
    });
  });

  test('catalog history prevents a duplicate after detector remount and process-state reset', async () => {
    const persistedCatalogURLs = new Set(['https://instagram.com/p/saved-a/']);
    const remountedState = createClipboardLinkOfferState();
    expect(remountedState.getOfferDecision(true, true, 37).eligible).toBe(true);

    const snapshots = [
      { changeCount: 37, hasURLItem: true },
      { changeCount: 37, hasURLItem: true },
    ];
    const result = await verifyClipboardOfferCandidate({
      expectedChangeCount: 37,
      readSnapshot: async () => snapshots.shift() ?? null,
      readClipboardText: async () => 'https://instagram.com/p/saved-a/',
      savedNormalizedURLs: persistedCatalogURLs,
    });

    expect(result.status).toBe('duplicate');
    if (result.status === 'duplicate') {
      remountedState.markURLHandled(result.normalizedURL);
      remountedState.markHandled(37);
    }
    expect(remountedState.getOfferDecision(true, true, 37)).toEqual({
      eligible: false,
      reason: 'already-handled',
    });
  });

  test('identity preflight fails closed on clipboard denial or a concurrent clipboard change', async () => {
    const state = createClipboardLinkOfferState();
    const knownURLs = new Set(['https://instagram.com/p/saved-a']);
    expect(state.reserveOffer(50)).toBe(true);

    const unavailable = await verifyClipboardOfferCandidate({
      expectedChangeCount: 50,
      readSnapshot: async () => ({ changeCount: 50, hasURLItem: false }),
      readClipboardText: async () => { throw new Error('Pasteboard access unavailable'); },
      savedNormalizedURLs: knownURLs,
    });
    expect(unavailable).toEqual({ status: 'unavailable' });
    state.deferOfferUntilResume(50);
    expect(state.getLastHandledChangeCount()).toBe(null);

    const changed = await verifyClipboardOfferCandidate({
      expectedChangeCount: 51,
      readSnapshot: jest.fn()
        .mockResolvedValueOnce({ changeCount: 51, hasURLItem: true })
        .mockResolvedValueOnce({ changeCount: 52, hasURLItem: true }),
      readClipboardText: async () => 'https://example.com/new-b',
      savedNormalizedURLs: knownURLs,
    });
    expect(changed).toEqual({ status: 'changed' });
    expect(state.getOfferDecision(true, true, 52)).toEqual({ eligible: true, reason: 'eligible' });
  });

  test('uses pattern detection first and reads content before an offer only when saved URLs require identity deduplication', () => {
    const hookSource = readFileSync('src/features/home-content/useClipboardLinkOffer.ts', 'utf8');
    const detectorSource = readFileSync('modules/clipboard-url-detection/ios/SaveAppClipboardURLDetectionModule.swift', 'utf8');
    const detectionStart = hookSource.indexOf('const checkClipboard = useCallback');
    const alertStart = hookSource.indexOf('Alert.alert(', detectionStart);
    const saveActionStart = hookSource.indexOf("text: 'Salvar'", alertStart);
    const readStart = hookSource.indexOf('Clipboard.getUrlAsync()', saveActionStart);
    const preflightGuardStart = hookSource.indexOf('if (knownSavedNormalizedURLs.size > 0)', detectionStart);
    const preflightVerifyStart = hookSource.indexOf('verifyClipboardOfferCandidate(', preflightGuardStart);

    expect(hookSource.slice(detectionStart, preflightGuardStart)).not.toMatch(/Clipboard\.get(?:Url|String)Async/);
    expect(preflightGuardStart).toBeGreaterThan(detectionStart);
    expect(preflightVerifyStart).toBeGreaterThan(preflightGuardStart);
    expect(preflightVerifyStart).toBeLessThan(alertStart);
    expect(saveActionStart).toBeGreaterThan(alertStart);
    expect(readStart).toBeGreaterThan(saveActionStart);
    expect(hookSource).toContain('knownSavedNormalizedURLsRef.current');
    expect(hookSource).toContain('clipboardLinkOfferState.getHandledURLs()');
    expect(hookSource).toContain("reason: 'saved-url-identity-check'");
    expect(hookSource).toContain("reason: 'verification-unavailable'");
    expect(hookSource).toContain('Clipboard.getStringAsync()');
    expect(hookSource).toContain('snapshot.hasURLItem');
    expect(hookSource).toContain("text: 'Agora não', style: 'cancel', onPress: dismissOffer");
    expect(hookSource).not.toContain('onDismiss:');
    expect(hookSource).toContain('candidateWasDispatched');
    expect(hookSource).toContain('Clipboard.addClipboardListener');
    expect(hookSource).toContain('contentTypes.includes(ContentType.URL)');
    expect(hookSource).toContain('contentTypes.includes(ContentType.PLAIN_TEXT)');
    expect(hookSource).toContain("'@saveapp/clipboard-link-offer-change-count-v1'");
    expect(hookSource).toContain('Salvar link copiado?');
    expect(hookSource).toContain('Deseja salvar este link no SaveApp?');
    expect(hookSource).toContain('Agora não');
    expect(detectorSource).toContain('detectedPatterns(for: [probableWebURL])');
    expect(detectorSource).toContain('pasteboard.changeCount');
    expect(detectorSource).toContain('pasteboard.hasURLs');
    expect(detectorSource).not.toMatch(/(?:UIPasteboard\.general|pasteboard)\.(?:string|url|urls|items|itemProviders|detectedValues)\b/);
    expect(hookSource).toContain("console.warn('[SaveApp] clipboard_offer.marker_persistence_failed')");
    expect(hookSource).not.toMatch(/console\.(?:log|warn|error)\([^\n]*(?:clipboardText|snapshot\.url|normalizedURL|candidate)/i);
    expect(hookSource).toContain('clipboardLinkOfferState.hasExplicitFlow()');
    expect(hookSource).toContain('clipboardLinkOfferState.reserveOffer(offeredChangeCount)');
    expect(hookSource).toContain('clipboardLinkOfferState.dismissOfferUntilClipboardChanges(offeredChangeCount)');
    expect(hookSource).toContain('clipboardLinkOfferState.deferOfferUntilResume(offeredChangeCount)');
    expect(hookSource).toContain("state === 'background'");
    expect(hookSource).toContain('clipboardLinkOfferState.deferReservedOffersUntilResume()');
    expect(hookSource).toContain('clipboardLinkOfferState.resumeDeferredOffers()');
    expect(hookSource).toContain('markClipboardLinkChangeCountHandled(offeredChangeCount)');
    expect(hookSource).toMatch(/verification\.status === 'duplicate'[\s\S]*?markClipboardLinkURLHandled\(normalizedURL[\s\S]*?markClipboardLinkChangeCountHandled\(offeredChangeCount\)/);
    expect(hookSource).toContain('const hydrationRevision = clipboardLinkOfferState.getRevision()');
    expect(hookSource).toContain('clipboardLinkOfferState.restorePersisted(');
  });

  test('limits automatic offers to an eligible Home and passes the normalized candidate into the existing composer', () => {
    const homeSource = readFileSync('src/app/(tabs)/index.tsx', 'utf8');
    expect(homeSource).toMatch(/const canOfferClipboardLink = homeFeedReady[\s\S]*?composerKind == null[\s\S]*?!isClipboardResultAlertActive[\s\S]*?!isSettingsSheetPresented[\s\S]*?!isSelectedProtectedFolderLocked[\s\S]*?status !== 'requesting'/);
    expect(homeSource).toContain('setComposerInitialLink(candidate.normalizedURL)');
    expect(homeSource).toContain('initialLink={composerInitialLink}');
    expect(homeSource).toContain("Alert.alert('Link já salvo'");
    expect(homeSource).toContain("Alert.alert('Link inválido'");
    expect(homeSource).toContain('onPress: () => setIsClipboardResultAlertActive(false)');
    expect(homeSource).toMatch(/handleClipboardLinkCandidate = useCallback\(\s*\(\s*clipboardText: string,\s*changeCount: number,\s*detectorInstanceID: string/);
    expect(homeSource).toContain('markClipboardLinkChangeCountHandled(changeCount)');
    expect(homeSource).toContain('onLinkSaveSuccess={clipboardOfferContext');
    expect(homeSource).toContain('deferClipboardLinkOfferUntilResume(clipboardOfferContext.changeCount)');
    expect(homeSource).toContain('knownSavedNormalizedURLs = useMemo(');
    expect(homeSource).toContain('knownSavedNormalizedURLs,');
    expect(homeSource).toContain('markClipboardLinkURLHandled(context.normalizedURL)');

    const dynamicIslandComposerRoute = readFileSync('src/app/links/compose.tsx', 'utf8');
    expect(dynamicIslandComposerRoute).toContain('markClipboardLinkURLHandled(clipboardOfferContext.normalizedURL, \'dynamic-island\')');

    const submissionSource = readFileSync('src/features/home-content/nativeLinkPromptSubmission.ts', 'utf8');
    expect(submissionSource).not.toContain('onSuccess');
    const composerSource = readFileSync('src/components/homeContent/HomeContentComposer.tsx', 'utf8');
    expect(composerSource).toContain('onLinkSaveSuccess={onLinkSaveSuccess}');
    expect(composerSource).toContain('traceClipboardOfferEvent(\'composer-confirmed\', traceContext)');
    const controllerSource = readFileSync('src/components/homeContent/HomeContentComposerController.ts', 'utf8');
    const consumptionIndex = controllerSource.indexOf('onLinkSaveSuccessRef.current?.(link)');
    const closeIndex = controllerSource.indexOf("closeWithReason('saved')", consumptionIndex);
    expect(consumptionIndex).toBeGreaterThan(-1);
    expect(closeIndex).toBeGreaterThan(consumptionIndex);
    expect(controllerSource).toContain('trace(\'persistence-succeeded\', { result: \'saved\' })');
  });

  test('keeps Metro diagnostics metadata-only and includes the current development bundle marker', () => {
    const stateSource = readFileSync('src/features/home-content/clipboardLinkOfferState.ts', 'utf8');
    expect(stateSource).toContain('saveapp-clipboard-offer-2026-11-02-v2');
    expect(stateSource).toContain("console.info('[SaveApp][clipboard-offer]'");
    expect(stateSource).toContain('getClipboardOfferCorrelationID');
    const payloadBody = stateSource.match(/const payload = \{([\s\S]*?)\n  \};/)?.[1] ?? '';
    expect(payloadBody).not.toMatch(/clipboardText|normalizedURL|url|token|error/i);
    expect(payloadBody).toContain('marker: CLIPBOARD_DIAGNOSTICS_BUNDLE_MARKER');
  });

  test('mounts a single Home detector and identifies its instance and AppState/focus transitions', () => {
    const allAppSource = readFileSync('src/app/(tabs)/index.tsx', 'utf8');
    const hookSource = readFileSync('src/features/home-content/useClipboardLinkOffer.ts', 'utf8');
    expect((allAppSource.match(/useClipboardLinkOffer\(/g) ?? [])).toHaveLength(1);
    expect(hookSource).toContain('detectorInstanceIDRef.current = `detector-${++detectorInstanceSequence}`');
    expect(hookSource).toContain("trace('app-state-changed'");
    expect(hookSource).toContain("trace('detector-focused')");
    expect(hookSource).toContain("trace('detector-blurred')");
    expect(hookSource).toContain("trace('offer-decision', snapshot.changeCount, { reason: decision.reason })");
  });
});
