const { readFileSync } = require('node:fs');

const {
  prepareClipboardLinkCandidate,
  shouldOfferClipboardLink,
  wasClipboardChangeHandledByQuickSave,
} = require('../src/features/home-content/clipboardLinkOffer');

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

  test('uses only pasteboard type and pattern metadata before consent and reads values only after Save', () => {
    const hookSource = readFileSync('src/features/home-content/useClipboardLinkOffer.ts', 'utf8');
    const detectorSource = readFileSync('modules/clipboard-url-detection/ios/SaveAppClipboardURLDetectionModule.swift', 'utf8');
    const detectionStart = hookSource.indexOf('const checkClipboard = useCallback');
    const alertStart = hookSource.indexOf('Alert.alert(', detectionStart);
    const saveActionStart = hookSource.indexOf("text: 'Salvar'", alertStart);
    const readStart = hookSource.indexOf('Clipboard.getUrlAsync()', saveActionStart);

    expect(hookSource.slice(detectionStart, alertStart)).not.toMatch(/Clipboard\.get(?:Url|String)Async/);
    expect(saveActionStart).toBeGreaterThan(alertStart);
    expect(readStart).toBeGreaterThan(saveActionStart);
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
  });
});
