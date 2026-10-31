/* global describe, expect, test, __dirname */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const readSource = (path) => readFileSync(join(__dirname, path), 'utf8');
const appConfig = readSource('../app.config.js');
const rootSource = readSource('../src/app/_layout.tsx');
const settingsSource = readSource('../src/components/native/HomeSettingsBottomSheet.ios.tsx');
const providerSource = readSource('../src/features/dynamic-island/SaveLinkDynamicIslandProvider.tsx');
const managerSource = readSource('../src/features/dynamic-island/saveLinkActivityManager.ios.ts');
const quickSavePluginSource = readSource('../plugins/withSaveLinkQuickSave.js');
const iconAssetsSource = readSource('../src/features/dynamic-island/saveLinkActivityIconAssets.ts');
const nativeQuickSaveButtonSource = readSource('../modules/dynamic-island-quick-save/ios/SaveAppQuickSaveLiveActivityButton.swift');
const authorizationSource = readSource('../src/features/dynamic-island/activityLinkAuthorization.ts');
const layoutSource = readSource('../src/features/dynamic-island/saveLinkLiveActivityWidget.ios.tsx');
const {
  areBytesEqual,
  hasPngSignature,
  isExpectedSaveLinkActivityPng,
  SAVE_LINK_ACTIVITY_ICON_SIZE,
} = require('../src/features/dynamic-island/saveLinkActivityIconAssets');
const composerRouteSource = readSource('../src/app/links/compose.tsx');
const clipboardHookSource = readSource('../src/features/home-content/useClipboardLinkOffer.ts');
const swiftPreflightWorkflow = readSource('../.github/workflows/swift-preflight.yml');
const nativeSimWorkflow = readSource('../.github/workflows/native-sim.yml');
const nativeVerificationSource = readSource('../scripts/verify-saveapp-native.js');
const simulatorBuildSettingsVerifierSource = readSource('../scripts/verify-saveapp-simulator-build-settings.js');
const failureAlertSource = readSource('../src/features/dynamic-island/liveActivityFailureAlert.ts');
const lockScreenHistory = require('../src/features/dynamic-island/quickSaveLockScreenHistory');
const lockScreenHistorySource = readSource('../src/features/dynamic-island/quickSaveLockScreenHistory.ts');
const savedContentLibrarySource = readSource('../src/features/home-content/savedContentLibrary.ts');
const linkPreviewSource = readSource('../src/features/home-content/linkPreview.ts');
const quickSaveQueueSwift = readSource('../modules/dynamic-island-quick-save/ios/SaveAppQuickSaveQueue.swift');
const quickSaveIntentSwift = readSource('../modules/dynamic-island-quick-save/ios/SaveAppQuickSaveIntent.swift');
const clipboardSettingsSwift = readSource('../modules/clipboard-url-detection/ios/SaveAppClipboardURLDetectionModule.swift');
const clipboardSettingsTypeScript = readSource('../modules/clipboard-url-detection/src/index.ts');
const expoWidgetsModuleSource = readSource('../node_modules/expo-widgets/ios/WidgetsModule.swift');
const expoWidgetsFactorySource = readSource('../node_modules/expo-widgets/ios/LiveActivityFactory.swift');
const expoWidgetsTargetPluginSource = readSource('../node_modules/expo-widgets/plugin/src/ios/withIosWidgets.ts');
const expoWidgetsProjectPluginSource = readSource('../node_modules/expo-widgets/plugin/src/ios/xcode/withTargetXcodeProject.ts');
const expoWidgetsNativeTargetSource = readSource('../node_modules/expo-widgets/plugin/src/ios/xcode/addToPbxNativeTargetSection.ts');
const expoUiTextViewSource = readSource('../node_modules/@expo/ui/ios/TextView.swift');

describe('SaveApp Dynamic Island link-saving mode', () => {
  test('uses Expo Widgets with the private app group and no APNs or unrelated widgets', () => {
    expect(appConfig).toContain("'expo-widgets'");
    expect(appConfig).toContain("groupIdentifier: 'group.com.luanrigatti.saveapp'");
    expect(appConfig).toContain('enablePushNotifications: false');
    expect(appConfig).toContain('frequentUpdates: false');
    expect(appConfig).not.toMatch(/widgets:\s*\[/);
    expect(nativeVerificationSource).toContain("widgetsOptions.widgets?.length");
    expect(rootSource).toMatch(/<SaveLinkDynamicIslandProvider>[\s\S]*?<HomeSettingsSheetProvider>/);
    expect(rootSource).toMatch(/name="links\/compose"[\s\S]*?headerShown: false[\s\S]*?presentation: 'card'/);
  });

  test('Swift Preflight checks generated Live Activity configuration and Simulator packaging', () => {
    const prebuildIndex = swiftPreflightWorkflow.indexOf('npx expo prebuild --platform ios --no-install');
    const generatedCheckIndex = swiftPreflightWorkflow.indexOf(
      'Verify generated ExpoWidgets Live Activity target and App Group',
    );
    const compileIndex = swiftPreflightWorkflow.indexOf('Compile the Simulator app without signing');
    const packagedCheckIndex = swiftPreflightWorkflow.indexOf(
      'Verify Simulator build embeds ExpoWidgets target',
    );

    expect(prebuildIndex).toBeGreaterThanOrEqual(0);
    expect(generatedCheckIndex).toBeGreaterThan(prebuildIndex);
    expect(compileIndex).toBeGreaterThan(generatedCheckIndex);
    expect(packagedCheckIndex).toBeGreaterThan(compileIndex);
    expect(swiftPreflightWorkflow).toContain('NSSupportsLiveActivities');
    expect(swiftPreflightWorkflow).toContain('com.apple.security.application-groups');
    expect(swiftPreflightWorkflow).toContain('WidgetLiveActivity()');
    expect(swiftPreflightWorkflow).toContain('ExpoWidgetsTarget.appex');
    expect(swiftPreflightWorkflow).toContain('createLiveActivity uses the generated generic WidgetLiveActivity; widgets[] is not required.');
  });

  test('Expo Widgets registers its extension target in the generated app Xcode project', () => {
    expect(expoWidgetsTargetPluginSource).toContain("const targetName = 'ExpoWidgetsTarget'");
    expect(expoWidgetsProjectPluginSource).toContain('withXcodeProject(config');
    expect(expoWidgetsProjectPluginSource).toContain('addToPbxNativeTargetSection(xcodeProject');
    expect(expoWidgetsProjectPluginSource).toContain('addToPbxProjectSection(xcodeProject, target)');
    expect(expoWidgetsNativeTargetSource).toContain('xcodeProject.addToPbxNativeTargetSection(target)');
  });

  test('NativeSim verifies generated entitlements, explicitly signs both Simulator bundles, and checks the final signatures', () => {
    const buildStep = nativeSimWorkflow.match(
      /- name: Build ad hoc signed Simulator app[\s\S]*?(?=\n      - name:)/,
    )?.[0] ?? '';

    expect(buildStep).toContain('-sdk iphonesimulator');
    expect(buildStep).toContain('CODE_SIGNING_ALLOWED=YES');
    expect(buildStep).toContain('CODE_SIGNING_REQUIRED=YES');
    expect(buildStep).toContain('CODE_SIGN_IDENTITY=-');
    expect(buildStep).toContain('APP_XCODE_PROJECT="$PWD/ios/SaveApp.xcodeproj"');
    expect(buildStep).toContain('-project "$APP_XCODE_PROJECT"');
    expect(buildStep).toContain('-target SaveApp');
    expect(buildStep).toContain('-target ExpoWidgetsTarget');
    expect(buildStep).toContain('saveapp-simulator-app-build-settings.json');
    expect(buildStep).toContain('saveapp-simulator-widget-build-settings.json');
    expect(buildStep).toContain('node scripts/verify-saveapp-simulator-build-settings.js');
    expect(buildStep).toMatch(/xcodebuild \\\s+-project "\$APP_XCODE_PROJECT" \\\s+-target SaveApp[\s\S]*?> "\$APP_BUILD_SETTINGS_JSON"/);
    expect(buildStep).toMatch(/xcodebuild \\\s+-project "\$APP_XCODE_PROJECT" \\\s+-target ExpoWidgetsTarget[\s\S]*?> "\$WIDGET_BUILD_SETTINGS_JSON"/);
    expect(buildStep).toContain('-showBuildSettings');
    expect(buildStep).toContain('-json');
    expect(simulatorBuildSettingsVerifierSource).toContain('settings.CODE_SIGN_ENTITLEMENTS');
    expect(simulatorBuildSettingsVerifierSource).toContain("settings.CONFIGURATION !== 'Release'");
    expect(simulatorBuildSettingsVerifierSource).toContain('targetEntries.length !== 1');
    expect(buildStep).toContain('SaveApp/SaveApp.entitlements');
    expect(buildStep).toContain('ExpoWidgetsTarget/ExpoWidgetsTarget.entitlements');
    expect(nativeVerificationSource).toContain('native-sim-template-version: 20');
    expect(buildStep).toContain('assert_generated_app_group "$APP_ENTITLEMENTS" "SaveApp"');
    expect(buildStep).toContain('assert_generated_app_group "$WIDGET_ENTITLEMENTS" "ExpoWidgetsTarget"');
    const extensionSigning = buildStep.indexOf(
      'codesign --force --sign - --entitlements "$WIDGET_ENTITLEMENTS" "$APPEX"',
    );
    const appSigning = buildStep.indexOf(
      'codesign --force --sign - --entitlements "$APP_ENTITLEMENTS" "$APP"',
    );
    const extensionVerification = buildStep.indexOf(
      'verify_app_group_signature "$APPEX" "ExpoWidgetsTarget"',
    );
    const appVerification = buildStep.indexOf(
      'verify_app_group_signature "$APP" "SaveApp"',
    );
    expect(extensionSigning).toBeGreaterThanOrEqual(0);
    expect(appSigning).toBeGreaterThan(extensionSigning);
    expect(extensionVerification).toBeGreaterThan(appSigning);
    expect(appVerification).toBeGreaterThan(appSigning);
    expect(buildStep).not.toContain('codesign --deep');
    expect(buildStep).toContain("Signature=adhoc");
    expect(buildStep).toContain('codesign -d --entitlements :-');
    expect(buildStep).toContain('com.apple.security.application-groups');
    expect(buildStep).toContain('ExpoWidgetsTarget.appex');
    expect(buildStep).toContain('NSSupportsLiveActivities');
    expect(buildStep).toContain('ExpoWidgetsAppGroupIdentifier');
    expect(buildStep).toContain('verify_app_group_signature "$APP" "SaveApp"');
    expect(buildStep).toContain('verify_app_group_signature "$APPEX" "ExpoWidgetsTarget"');
    expect(buildStep).not.toContain('CODE_SIGNING_ALLOWED=NO');
    expect(swiftPreflightWorkflow).toContain('CODE_SIGNING_ALLOWED=NO');
  });

  test('places one native no-subtitle toggle above Personalização', () => {
    const settingsList = settingsSource.match(
      /<List modifiers=\{\[navigationTitle\('Configurações'\)[\s\S]*?<\/List>/,
    )?.[0] ?? '';
    const firstSection = settingsList.match(/<Section>[\s\S]*?<\/Section>/)?.[0] ?? '';
    expect(firstSection).toMatch(/<Text>Dynamic Island<\/Text>[\s\S]*?<Toggle[\s\S]*?isOn=\{isSaveLinkModeEnabled\}/);
    expect(firstSection).toContain('onIsOnChange=');
    expect(firstSection).not.toMatch(/subtitle|NavigationLink/);
    expect(settingsList.indexOf(firstSection)).toBeLessThan(settingsList.indexOf('<Section title="Personalização">'));
    expect(settingsSource).toContain('setSaveLinkModeEnabled(nextValue)');
    expect(settingsSource).toContain('.catch((error: unknown) =>');
    expect(settingsSource).toContain('createLiveActivityFailureAlert');
    expect(failureAlertSource).toContain('Detalhe informado pelo sistema');
    expect(settingsSource).toContain(
      'disabled(!isSaveLinkModeReady || !isSaveLinkModeAvailable || isSaveLinkModeBusy)',
    );
  });

  test('persists the preference, reconciles on foreground, and rolls back explicit failures', () => {
    expect(providerSource).toContain("'@saveapp/dynamic-island-link-mode-enabled-v1'");
    expect(providerSource).toContain('AsyncStorage.setItem(PREFERENCE_KEY, String(nextEnabled))');
    expect(providerSource).toContain("state !== 'active'");
    expect(providerSource).toContain('enqueueReconcile(enabledRef.current)');
    expect(providerSource).toContain('setIsEnabled(previousEnabled)');
    expect(providerSource).not.toMatch(/setInterval|setTimeout|addPushToStartTokenListener/);
  });

  test('starts the activity with the fixed shared icon and preserves authorization setup', () => {
    const activityStartIndex = managerSource.indexOf(
      "quickSaveStatus: 'ready',\n          showRecentQuickSaveLinks,",
    );

    expect(activityStartIndex).toBeGreaterThanOrEqual(0);
    expect(managerSource).toContain('const iconUri = await getSharedAppIconUri()');
    expect(managerSource).toContain('widgetsDirectory');
    expect(managerSource).toContain('iconUri: string');
    expect(expoWidgetsModuleSource).toContain(
      'FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)',
    );
    expect(expoWidgetsFactorySource).toContain('ActivityAuthorizationInfo().areActivitiesEnabled');
    expect(expoWidgetsFactorySource).toContain('Activity.request(');
    expect(expoWidgetsFactorySource).toContain('StartLiveActivityException(error.localizedDescription)');
  });

  test('keeps the saved preference and skips reconciliation when ExpoWidgets is unavailable', () => {
    expect(managerSource).toContain("createOptionalNativeModuleLoader(\n  'ExpoWidgets'");
    expect(managerSource).toContain('requireOptionalNativeModule');
    expect(managerSource).not.toMatch(/^import .*expo-widgets/m);
    expect(providerSource).toContain('isSaveLinkActivityAvailable()');
    expect(providerSource).toContain('if (nativeModuleAvailable) {');
    expect(providerSource).toContain('await enqueueReconcile(storedEnabled)');
    expect(providerSource).toContain('setIsEnabled(storedEnabled)');
    expect(providerSource).toContain('if (availableRef.current) {');
    expect(providerSource).toContain('if (!availableRef.current) throw new Error');
    expect(settingsSource).toContain('!isSaveLinkModeAvailable || isSaveLinkModeBusy');
    expect(settingsSource).toContain('Indisponível nesta versão. A preferência será mantida.');
  });

  test('keeps Live Activity payload free of saved URLs and reserves the sensor region', () => {
    const expandedLeading = layoutSource.match(
      /expandedLeading: \(([\s\S]*?)\n\s*\),\n\s*expandedCenter:/,
    )?.[1] ?? '';
    const expandedCenter = layoutSource.match(
      /expandedCenter: \(([\s\S]*?)\n\s*\),\n\s*\};/,
    )?.[1] ?? '';

    expect(layoutSource).toContain("'widget'");
    expect(layoutSource).toContain('compactLeading:');
    expect(layoutSource).toContain('minimal:');
    expect(layoutSource).toContain('expandedLeading:');
    expect(layoutSource).toContain('expandedTrailing:');
    expect(layoutSource).toContain('target="saveapp.quickSave"');
    expect(layoutSource).toContain('expandedCenter: (');
    expect(layoutSource).toContain("<Link destination={props.expandedHomeUrl} modifiers={[tint('#FFFFFF')]}>" );
    expect(layoutSource.match(/<Link destination=\{props\.expandedHomeUrl\} modifiers=\{\[tint\('#FFFFFF'\)\]\}>/g)).toHaveLength(2);
    expect(layoutSource).not.toContain('compactTrailing:');
    expect(layoutSource).not.toContain('expandedBottom:');
    expect(layoutSource).toContain("clipShape('roundedRectangle'");
    expect(expandedLeading).toContain('frame({ width: 48, height: 48 })');
    expect(expandedLeading).toContain("clipShape('circle')");
    expect(expandedLeading).not.toContain("clipShape('roundedRectangle'");
    expect(expandedLeading).not.toContain('padding({ top: 8 })');
    expect(layoutSource).toContain("multilineTextAlignment('center')");
    expect(layoutSource).toContain('Salvar link');
    expect(expandedCenter).not.toContain('Toque para salvar');
    expect(expandedCenter).not.toContain('Toque para abrir');
    expect(expandedCenter).toContain('{quickSaveCenterSubtitle ? (');
    expect(layoutSource).toContain("quickSaveStatus === 'queued'");
    expect(layoutSource).toContain("? 'Link salvo'");
    expect(layoutSource).toContain("? 'Adicionado à fila'");
    expect(layoutSource).toContain('Toque para abrir');
    expect(layoutSource).not.toContain('Ativo');
    expect(layoutSource).not.toContain('34C759');
    expect(layoutSource).not.toContain('circle.fill');
    expect(layoutSource).not.toMatch(/clipboard|https?:|normalizedUrl|props\.url/i);
    expect(managerSource).toContain("Linking.createURL('/links/compose'");
    expect(managerSource).toContain("Linking.createURL('/',");
    expect(managerSource).toContain("source: 'dynamic-island-expanded'");
    expect(managerSource).toContain('activityToken: token');
    expect(managerSource).toContain('randomUUID()');
    expect(managerSource).toContain('getSharedAppIconUri');
    expect(iconAssetsSource).toContain("'saveapp-live-activity-icon.png'");
    expect(managerSource).toContain('isAuthorizedSaveLinkActivityURL');
    expect(authorizationSource).toContain('ACTIVITY_LINK_AUTHORIZATION_KEY');
  });

  test('activity fallback routes compact and minimal taps to the tokenized composer while expanded content links to Home', () => {
    const homeSource = readSource('../src/app/(tabs)/index.tsx');
    const homeStateSource = readSource('../src/features/home-content/clipboardLinkOfferState.ts');
    const banner = layoutSource.match(/banner: \(([\s\S]*?)\n\s*\),\n\s*compactLeading:/)?.[1] ?? '';
    const compactLeading = layoutSource.match(/compactLeading: \(([\s\S]*?)\n\s*\),\n\s*minimal:/)?.[1] ?? '';
    const minimal = layoutSource.match(/minimal: \(([\s\S]*?)\n\s*\),\n\s*expandedLeading:/)?.[1] ?? '';
    const expandedTrailing = layoutSource.match(/expandedTrailing: \(([\s\S]*?)\n\s*\),\n\s*\};/)?.[1] ?? '';

    expect(homeSource).toContain("routeSource === 'dynamic-island-expanded'");
    expect(homeSource).toContain('beginDynamicIslandClipboardFlow()');
    expect(homeSource).toContain('getClipboardURLDetectionSnapshot()');
    expect(homeSource).toContain('suppressClipboardLinkOfferForChangeCount(snapshot.changeCount)');
    expect(homeSource).toContain('suppressClipboardLinkOfferUntilClipboardChanges()');
    expect(homeSource).toContain('!isDynamicIslandExpandedHomeFlow');
    expect(homeSource).toContain("router.replace('/')");
    expect(homeStateSource).toContain('suppressCurrentClipboardOffer(changeCount: number)');
    expect(homeStateSource).toContain('suppressCurrentClipboardOfferUntilChange()');
    expect(homeSource).toContain('refresh: refreshSavedContent');
    expect(homeSource).toContain("refreshSavedContent('home_focus')");
    expect(homeSource).not.toContain('void refreshSavedContent().catch');

    expect(managerSource).toContain('activity = getActivityFactory().start(');
    expect(managerSource).toContain('composeUrl');
    expect(managerSource).toContain('activityToken: token');
    expect(managerSource).toContain("quickSaveStatus: 'ready'");
    expect(managerSource).toContain('showRecentQuickSaveLinks,');
    expect(managerSource).toContain('recentQuickSaveLinks: recentProps.links');
    expect(managerSource).toContain('recentQuickSaveLinksRevision: recentProps.revision');
    expect(layoutSource).toContain('compactLeading: (');
    expect(layoutSource).toContain('minimal: (');
    expect(banner).toContain('<Link destination={props.expandedHomeUrl}>');
    expect(banner.match(/<Link/g)).toHaveLength(1);
    expect(banner).toContain('recentQuickSaveLinks.length > 0');
    expect(banner).not.toContain('Recentes');
    expect(compactLeading).not.toContain('<Link');
    expect(minimal).not.toContain('<Link');
    expect(expandedTrailing).toContain('target="saveapp.quickSave"');
    expect(layoutSource.match(/<Link destination=\{props\.composeUrl\} modifiers=\{\[tint\('#FFFFFF'\)\]\}>/g)).toBeNull();
    expect(managerSource).toContain("Linking.createURL('/links/compose'");
    expect(managerSource).toContain("Linking.createURL('/',");
  });

  test('builds a compact native lock-screen card with an optional domain-only history', () => {
    const banner = layoutSource.match(/banner: \(([\s\S]*?)\n\s*\),\n\s*compactLeading:/)?.[1] ?? '';
    const linkRows = banner.match(/recentQuickSaveLinks\.map\(\(link\) => \(([\s\S]*?)\n\s*\)\)\}/)?.[1] ?? '';

    expect(banner).toContain('<VStack alignment="leading" spacing={6}');
    expect(banner).toContain('padding({ horizontal: 14, vertical: 10 })');
    expect(banner).toContain('<Divider');
    expect(banner).toContain("foregroundStyle({ type: 'hierarchical', style: 'primary' })");
    expect(banner).not.toContain('Recentes');
    expect(banner).not.toContain('Links recentes');
    expect(banner).not.toContain('background(');
    expect(banner).not.toMatch(/frame\(\{\s*height:\s*(?:1[6-9]\d|[2-9]\d{2})/);
    expect(banner).toContain('systemName="globe"');
    expect(banner).toContain('uiImage={link.faviconUri}');
    expect(banner).toMatch(/link\.faviconUri\s*\?/);
    expect(banner).not.toContain('dateStyle="relative"');
    expect(banner).not.toContain('ageMinutes');
    expect(banner).toContain('date={new Date(link.createdAt)}');
    expect(banner).toContain('dateStyle="time"');
    expect(banner).toContain('monospacedDigit()');
    expect(banner).toContain("frame({ width: 24, height: 24, alignment: 'center' })");
    expect(banner).toContain("frame({ maxWidth: Infinity, alignment: 'leading' })");
    expect(banner).toContain("frame({ minWidth: 56, alignment: 'trailing' })");
    expect(banner).toContain('lineLimit(1)');
    expect(linkRows).toContain('link.domain');
    expect(linkRows).not.toContain('<Link');
    expect(linkRows).not.toContain('chevron');
    expect(layoutSource).toContain('showRecentQuickSaveLinks?: boolean');
    expect(layoutSource).toContain('(props.recentQuickSaveLinks ?? []).slice(0, 3)');
    expect(layoutSource).toContain('quickSaveCenterTitle');
  });

  test('validates the capped recent-link summary and orders it without exposing URLs', () => {
    const digest = (character) => character.repeat(64);
    const data = {
      formatVersion: 2,
      revision: 3,
      links: [
        { id: digest('a'), domain: 'older.example', createdAt: 1_000 },
        { id: digest('b'), domain: 'newest.example', createdAt: 3_000 },
        { id: digest('c'), domain: 'middle.example', createdAt: 2_000 },
      ],
    };

    expect(lockScreenHistory.validateQuickSaveLockScreenHistory({ formatVersion: 1, links: [] }, 4_000)).toEqual([]);
    expect(lockScreenHistory.validateQuickSaveLockScreenHistory({ formatVersion: 1, links: data.links.slice(0, 1) }, 4_000))
      .toHaveLength(1);
    expect(lockScreenHistory.validateQuickSaveLockScreenHistory({ formatVersion: 1, links: data.links.slice(0, 2) }, 4_000))
      .toHaveLength(2);
    expect(lockScreenHistory.validateQuickSaveLockScreenHistory(data, 4_000).map(({ domain }) => domain))
      .toEqual(['newest.example', 'middle.example', 'older.example']);
    expect(lockScreenHistory.validateQuickSaveLockScreenHistorySnapshot(data, 4_000)?.revision).toBe(3);
    expect(lockScreenHistory.validateQuickSaveLockScreenHistorySnapshot({ formatVersion: 1, links: data.links }, 4_000)?.revision).toBe(0);
    expect(lockScreenHistory.validateQuickSaveLockScreenHistory({
      formatVersion: 1,
      links: [...data.links, { id: digest('d'), domain: 'extra.example', createdAt: 500 }],
    }, 4_000)).toEqual([]);
    expect(lockScreenHistory.validateQuickSaveLockScreenHistory({
      formatVersion: 1,
      links: [data.links[0], { ...data.links[0], domain: 'duplicate.example' }],
    }, 4_000)).toEqual([]);
    expect(lockScreenHistory.validateQuickSaveLockScreenHistory({
      formatVersion: 1,
      links: [{ id: digest('e'), domain: 'private.example/path?token=secret', createdAt: 1_000 }],
    }, 4_000)).toEqual([]);
    expect(lockScreenHistory.validateQuickSaveLockScreenHistory({ formatVersion: 2, revision: 0, links: [] }, 4_000)).toEqual([]);
    expect(lockScreenHistory.validateQuickSaveLockScreenHistory({ formatVersion: 2, revision: 4, links: [] }, 4_000)).toEqual([]);
    expect(managerSource).not.toContain('getQuickSaveAgeMinutes');
    expect(managerSource).not.toContain('ageMinutes');
    expect(quickSaveQueueSwift).not.toContain('ageMinutes');
    expect(expoUiTextViewSource).toContain('case .time: return .time');
    expect(expoUiTextViewSource).toContain('Text(date, style: props.dateStyle?.toSwiftUI() ?? .date)');
  });

  test('validates shared favicon identity and the 96px PNG cache before passing file URIs to the widget', () => {
    const id = 'a'.repeat(64);
    const validPng = new Uint8Array(24);
    validPng.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    validPng.set([0, 0, 0, 96], 16);
    validPng.set([0, 0, 0, 96], 20);
    const badDimensions = new Uint8Array(validPng);
    badDimensions[19] = 48;
    const tooLarge = new Uint8Array(64 * 1_024 + 1);
    tooLarge.set(validPng);

    expect(lockScreenHistory.isValidQuickSaveFaviconFileName(`favicon-${id}.png`, id)).toBe(true);
    expect(lockScreenHistory.isValidQuickSaveFaviconFileName(`favicon-${'b'.repeat(64)}.png`, id)).toBe(false);
    expect(lockScreenHistory.isValidQuickSaveFaviconFileName('../favicon.png', id)).toBe(false);
    expect(lockScreenHistory.isValidQuickSaveFaviconPng(validPng)).toBe(true);
    expect(lockScreenHistory.isValidQuickSaveFaviconPng(badDimensions)).toBe(false);
    expect(lockScreenHistory.isValidQuickSaveFaviconPng(tooLarge)).toBe(false);

    const summary = lockScreenHistory.validateQuickSaveLockScreenHistory({
      formatVersion: 1,
      links: [{
        id,
        domain: 'github.com',
        createdAt: 1_000,
        savedContentId: 42,
        faviconFileName: `favicon-${id}.png`,
      }],
    }, 2_000);
    expect(summary).toEqual([expect.objectContaining({ savedContentId: 42, faviconFileName: `favicon-${id}.png` })]);
    expect(lockScreenHistory.validateQuickSaveLockScreenHistory({
      formatVersion: 1,
      links: [{ id, domain: 'github.com', createdAt: 1_000, faviconFileName: 'https://github.com/favicon.png' }],
    }, 2_000)).toEqual([]);
    expect(lockScreenHistorySource).toContain('favicon.bytes()');
    expect(lockScreenHistorySource).toContain('favicon.uri.startsWith(\'file://\')');
  });

  test('keeps favicon networking in the opted-in app process and refreshes the existing activity after caching', () => {
    expect(savedContentLibrarySource).toContain('downloadLinkFaviconImage(faviconUrl)');
    expect(savedContentLibrarySource).toContain('link.id === id && link.savedContentId === candidate.id');
    expect(savedContentLibrarySource).toContain('getQuickSaveLockScreenSettings()?.showRecentLinks !== true');
    expect(savedContentLibrarySource).toContain('storeQuickSaveLockScreenFavicon(id, base64)');
    expect(savedContentLibrarySource).toContain('subscribeToQuickSaveLinkPreviewUpdates');
    expect(savedContentLibrarySource).toContain('associateQuickSaveLockScreenContent(historyId, savedId)');
    expect(providerSource).toContain('synchronizeQuickSaveLockScreenFavicons()');
    expect(providerSource).toContain('updateSaveLinkActivityRecentLinksVisibility(true)');
    expect(managerSource).toContain('...(faviconUri ? { faviconUri } : {})');
    expect(managerSource).toContain('if (!visible || !snapshot) return { revision: snapshot?.revision ?? 0, links: [] }');
    expect(managerSource).toContain('visible && latestSettings?.showRecentLinks === true');
    expect(managerSource).not.toMatch(/recentQuickSaveLinks[\s\S]{0,180}normalizedUrl|recentQuickSaveLinks[\s\S]{0,180}\.url/);
    expect(quickSaveIntentSwift).toContain('SaveAppQuickSaveQueue.lockScreenHistoryForActivityUpdate()');
    expect(quickSaveQueueSwift).toContain('func activityProps()');
    expect(quickSaveIntentSwift).not.toMatch(/URLSession|URLRequest|fetch\(/);
    expect(layoutSource).toContain('uiImage={link.faviconUri}');
    expect(layoutSource).toContain('systemName="globe"');
    expect(clipboardSettingsSwift).toContain('flock(descriptor, LOCK_EX | LOCK_NB)');
    expect(clipboardSettingsSwift).toContain('fileLockTimeoutNanoseconds');
    expect(clipboardSettingsSwift).toContain('atomicWrite(pngData, to: imageURL, in: faviconDirectory)');
    expect(clipboardSettingsSwift).toContain('maximumSourceBytes = 256 * 1_024');
    expect(clipboardSettingsSwift).toContain('maximumFaviconBytes = 64 * 1_024');
    expect(clipboardSettingsSwift).toContain('UIGraphicsImageRenderer(size: CGSize(width: 96, height: 96)');
    expect(clipboardSettingsSwift).toContain('UserDefaults(suiteName: appGroupIdentifier)?.bool(forKey: visibleKey) == true');
    expect(quickSaveQueueSwift).toContain('pruneObsoleteFavicons');
    expect(quickSaveQueueSwift).toContain('lockScreenHistoryForActivityUpdate()');
    expect(quickSaveQueueSwift).toContain('flock(descriptor, LOCK_EX | LOCK_NB)');
    expect(quickSaveQueueSwift).toContain('fileLockTimeoutNanoseconds');
    expect(quickSaveQueueSwift).toContain('CGImageSourceCreateImageAtIndex(source, 0, nil) != nil');
    expect(linkPreviewSource).toContain('downloadLinkFaviconImage');
  });

  test('defaults lock-screen recent history to hidden and publishes only a confirmed queue summary', () => {
    const queueWriteIndex = quickSaveQueueSwift.indexOf('try writeAtomically(data, to: destination, in: directory)');
    const queueVerifyIndex = quickSaveQueueSwift.indexOf('guard let persisted = try readAndValidateRecord(at: destination), persisted == record');
    const historyWriteIndex = quickSaveQueueSwift.indexOf('updateLockScreenRecentLinksBestEffort(record, in: directory)', queueVerifyIndex);

    expect(quickSaveQueueSwift).toContain('lockScreenRecentLinksVersion = 2');
    expect(quickSaveQueueSwift).toContain('let revision: Int64');
    expect(quickSaveQueueSwift).toContain('addingReportingOverflow(1)');
    expect(quickSaveQueueSwift).toContain('maximumLockScreenRecentLinks = 3');
    expect(quickSaveQueueSwift).toContain('let id = String(queueFileName(for: record.normalizedURL).dropLast(".json".count))');
    expect(quickSaveQueueSwift).toContain('id: id');
    expect(quickSaveQueueSwift).toContain('flock(descriptor, LOCK_EX | LOCK_NB)');
    expect(queueVerifyIndex).toBeGreaterThan(queueWriteIndex);
    expect(historyWriteIndex).toBeGreaterThan(queueVerifyIndex);
    expect(quickSaveQueueSwift).not.toMatch(/URLSession|URLRequest|fetch\(|saveapp-photos\.db/);
    expect(quickSaveQueueSwift).toContain('.bool(forKey: lockScreenRecentLinksVisibleKey) ?? false');
    expect(quickSaveIntentSwift).toContain('props["recentQuickSaveLinks"] = showRecentLinks ? snapshot?.activityProps() ?? [] : []');
    expect(quickSaveIntentSwift).toContain('await activity.update(ActivityContent(state: state, staleDate: nil))');
    expect(quickSaveIntentSwift).not.toContain('recentQuickSaveLinksVisibleKey] ?? true');
    expect(layoutSource).toContain('showRecentQuickSaveLinks?: boolean');
  });

  test('renders each saved timestamp as native localized time instead of a stale elapsed-minute string', () => {
    const recentPropsStart = managerSource.indexOf('function makeRecentQuickSaveActivityProps(');
    const recentPropsEnd = managerSource.indexOf('\nasync function getSharedAppIconUri', recentPropsStart);
    const recentPropsSource = managerSource.slice(recentPropsStart, recentPropsEnd);

    expect(recentPropsSource).toContain('createdAt,');
    expect(recentPropsSource).not.toContain('Date.now()');
    expect(recentPropsSource).not.toContain('ageMinutes');
    expect(layoutSource).toContain('date={new Date(link.createdAt)}');
    expect(layoutSource).toContain('dateStyle="time"');
    expect(layoutSource).not.toContain('dateStyle="relative"');
    expect(layoutSource).not.toContain('ageMinutes');
    expect(expoUiTextViewSource).toContain('case .time: return .time');
    expect(expoUiTextViewSource).toContain('Text(date, style: props.dateStyle?.toSwiftUI() ?? .date)');
  });

  test('releases the shared file lock before ActivityKit awaits and bounds lock contention', () => {
    const historyReaderStart = quickSaveQueueSwift.indexOf('static func lockScreenHistoryForActivityUpdate()');
    const historyReaderEnd = quickSaveQueueSwift.indexOf('private static func updateLockScreenRecentLinksBestEffort', historyReaderStart);
    const historyReaderSource = quickSaveQueueSwift.slice(historyReaderStart, historyReaderEnd);
    const updateMethodStart = quickSaveIntentSwift.indexOf('private func updateActivity(');
    const updateMethodEnd = quickSaveIntentSwift.indexOf('@MainActor', updateMethodStart);
    const updateMethodSource = quickSaveIntentSwift.slice(updateMethodStart, updateMethodEnd);
    const clipboardWithHistoryStart = clipboardSettingsSwift.indexOf('private static func withHistory(');
    const clipboardWithHistoryEnd = clipboardSettingsSwift.indexOf('private static func acquireFileLock(', clipboardWithHistoryStart);
    const clipboardWithHistorySource = clipboardSettingsSwift.slice(clipboardWithHistoryStart, clipboardWithHistoryEnd);
    const privacyWriterStart = clipboardSettingsSwift.indexOf('static func setRecentHistoryVisible(');
    const privacyWriterEnd = clipboardSettingsSwift.indexOf('static func associateContent(', privacyWriterStart);
    const privacyWriterSource = clipboardSettingsSwift.slice(privacyWriterStart, privacyWriterEnd);

    expect(historyReaderSource).toContain('withExclusiveFileLock(in: directory)');
    expect(historyReaderSource).not.toContain('await');
    expect(historyReaderSource).not.toContain('activity.update');
    expect(clipboardWithHistorySource).toContain('flock(descriptor, LOCK_UN)');
    expect(clipboardWithHistorySource).not.toContain('await');
    expect(privacyWriterSource).toContain('flock(descriptor, LOCK_UN)');
    expect(privacyWriterSource).not.toContain('await');
    expect(updateMethodSource).toContain('SaveAppQuickSaveQueue.lockScreenHistoryForActivityUpdate()');
    expect(updateMethodSource).toContain('await activity.update(ActivityContent(state: state, staleDate: nil))');
    expect(updateMethodSource).toContain('reconciliation_limit');
    expect(quickSaveQueueSwift).toContain('LOCK_EX | LOCK_NB');
    expect(quickSaveQueueSwift).toContain('fileLockTimeoutNanoseconds');
    expect(clipboardSettingsSwift).toContain('LOCK_EX | LOCK_NB');
    expect(clipboardSettingsSwift).toContain('fileLockTimeoutNanoseconds');
    expect(quickSaveQueueSwift).not.toMatch(/while flock\(descriptor, LOCK_EX\)/);
    expect(clipboardSettingsSwift).not.toMatch(/while flock\(descriptor, LOCK_EX\)/);
  });

  test('requires explicit lock-screen privacy opt-in and updates the existing authorized activity', () => {
    const updateStart = managerSource.indexOf('export async function updateSaveLinkActivityRecentLinksVisibility');
    const updateEnd = managerSource.indexOf('export async function reconcileSaveLinkActivity', updateStart);
    const updateSource = managerSource.slice(updateStart, updateEnd);

    expect(providerSource).toContain('useState(false);');
    expect(providerSource).toContain('setQuickSaveLockScreenRecentLinksVisible(visible)');
    expect(settingsSource).toContain('Links recentes na tela bloqueada');
    expect(settingsSource).toContain('Desativado por padrão');
    expect(updateSource).toContain('factory.getInstances().find((candidate) => candidate.getId() === authorization.activityId)');
    expect(updateSource).toContain('await activity.update({');
    expect(updateSource).toContain("quickSaveStatus: confirmedSettings?.quickSaveStatus ?? 'ready'");
    expect(updateSource).toContain('visible && latestSettings?.showRecentLinks === true');
    expect(updateSource).toContain('const latestSettings = getQuickSaveLockScreenSettings()');
    expect(updateSource).toContain('const shouldShowRecentQuickSaveLinks = visible && latestSettings?.showRecentLinks === true');
    expect(updateSource).toContain('recentQuickSaveLinks: recentProps.links');
    expect(updateSource).toContain('serializeActivityUpdate(async () =>');
    expect(updateSource).toContain('attempt < 3');
    expect(updateSource).toContain('readQuickSaveLockScreenHistorySnapshot()');
    expect(updateSource).toContain('makeRecentQuickSaveActivityProps(shouldShowRecentQuickSaveLinks, snapshot)');
    expect(updateSource).toContain('activityToken: authorization.token');
    expect(updateSource).toContain("source: 'dynamic-island-expanded'");
    expect(updateSource).not.toContain('factory.start(');
    expect(managerSource.indexOf("setQuickSaveActivityStatus('ready')"))
      .toBeLessThan(managerSource.indexOf('activity = getActivityFactory().start('));
    expect(quickSaveIntentSwift).toContain('props["recentQuickSaveLinksRevision"]');
    expect(quickSaveIntentSwift).toContain('props["quickSaveStatus"] = status.rawValue');
    expect(quickSaveIntentSwift).toContain('maximumActivityContentStateBytes = 4 * 1_024');
    expect(quickSaveIntentSwift).toContain('encodedState.count <= Self.maximumActivityContentStateBytes');
    expect(quickSaveIntentSwift).toContain('.set(status.rawValue, forKey: SaveAppQuickSaveQueue.quickSaveActivityStatusKey)');
    expect(quickSaveIntentSwift).toContain('SaveAppQuickSaveQueue.lockScreenHistoryForActivityUpdate()');
    expect(clipboardSettingsSwift).toContain('static func setRecentHistoryVisible(_ visible: Bool) -> Bool');
    expect(clipboardSettingsSwift).toContain('defaults.set(visible, forKey: visibleKey)');
    expect(clipboardSettingsSwift).toContain('defaults.synchronize()');
    expect(clipboardSettingsSwift).toContain('Function("setQuickSaveActivityStatus")');
    expect(clipboardSettingsSwift).toContain('allowedStatuses.contains(status)');
    expect(clipboardSettingsTypeScript).toContain('export function setQuickSaveActivityStatus(');
  });

  test('reads clipboard only on the explicit activity deep link and opens the existing composer', () => {
    const flowGuardIndex = composerRouteSource.indexOf('beginDynamicIslandClipboardFlow()');
    const authorizationIndex = composerRouteSource.indexOf(
      'await isAuthorizedSaveLinkActivityURL(params.activityToken)',
    );
    const eventConsumptionIndex = composerRouteSource.indexOf(
      'markClipboardLinkChangeCountHandled(beforeRead?.changeCount)',
    );
    const clipboardReadIndex = composerRouteSource.indexOf('Clipboard.getUrlAsync()');

    expect(composerRouteSource).toContain("source === 'dynamic-island'");
    expect(flowGuardIndex).toBeGreaterThanOrEqual(0);
    expect(composerRouteSource.indexOf('useLayoutEffect')).toBeGreaterThanOrEqual(0);
    expect(flowGuardIndex).toBeLessThan(authorizationIndex);
    expect(authorizationIndex).toBeLessThan(eventConsumptionIndex);
    expect(eventConsumptionIndex).toBeLessThan(clipboardReadIndex);
    expect(composerRouteSource).toContain('Clipboard.getUrlAsync()');
    expect(composerRouteSource).toContain('Clipboard.getStringAsync()');
    expect(composerRouteSource).toContain('prepareClipboardLinkCandidate');
    expect(composerRouteSource).toContain('markClipboardLinkChangeCountHandled');
    expect(composerRouteSource).toContain('<HomeContentComposer');
    expect(composerRouteSource).toContain('router.replace(\'/\')');
    expect(clipboardHookSource).toContain('export function markClipboardLinkChangeCountHandled');
    expect(clipboardHookSource).toContain('clipboardLinkOfferState.hasExplicitFlow()');
    expect(clipboardHookSource).toContain('restorePersisted(');
    expect(clipboardHookSource).not.toContain('lastHandledChangeCountInMemory');
    expect(composerRouteSource).not.toContain('markClipboardLinkChangeCountHandled(afterRead?.changeCount)');
  });
});

describe('Dynamic Island SaveApp icon assets and expanded layout', () => {
  test('uses the verified white Live Activity PNG for every appearance and widget region', () => {
    const png = readFileSync(join(__dirname, '../assets/live-activity-icon.png'));
    expect(hasPngSignature(png)).toBe(true);
    expect(isExpectedSaveLinkActivityPng(png)).toBe(true);
    expect(png.readUInt32BE(16)).toBe(SAVE_LINK_ACTIVITY_ICON_SIZE);
    expect(png.readUInt32BE(20)).toBe(SAVE_LINK_ACTIVITY_ICON_SIZE);
    expect(png.readUInt8(24)).toBe(8);
    expect(png.readUInt8(25)).toBe(6);
    expect(areBytesEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 2]))).toBe(true);
    expect(areBytesEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 3]))).toBe(false);
    expect(isExpectedSaveLinkActivityPng(Uint8Array.from([137, 80, 78, 71]))).toBe(false);
    expect(iconAssetsSource).not.toContain('dark');
    expect(managerSource).toContain("Asset.loadAsync([require('../../../assets/live-activity-icon.png')])");
    expect(managerSource).toContain('new Directory(widgetsDirectory)');
    expect(managerSource).toContain('new File(sharedDirectory, SAVE_LINK_ACTIVITY_ICON_FILE)');
    expect(managerSource).toContain('source.copy(destination, { overwrite: true })');
    expect(managerSource).toContain('areBytesEqual(sourceBytes, copiedBytes)');
    expect(managerSource).toContain("destination.uri.startsWith('file://')");
    expect(managerSource).toContain('iconUri: string');
    expect(layoutSource.match(/uiImage=\{props\.iconUri\}/g)).toHaveLength(4);
    expect(layoutSource).not.toContain('assetName=');
    expect(layoutSource).not.toContain('environment.colorScheme');
    expect(quickSavePluginSource).not.toMatch(/SaveAppLiveActivityIcons|withSaveAppLiveActivityIconAssets|folder\.assetcatalog/);
    expect(quickSavePluginSource).toContain('withSaveAppQuickSaveAppIntentsPackage(config)');
  });

  test('uses equal 48 point circles in expanded regions and keeps the check ring inside its frame', () => {
    expect(layoutSource).toContain('frame({ width: 48, height: 48 })');
    expect(nativeQuickSaveButtonSource.match(/\.frame\(width: 48, height: 48\)/g)).toHaveLength(2);
    expect(nativeQuickSaveButtonSource).toContain('.strokeBorder(Color.white, lineWidth: 2)');
    expect(nativeQuickSaveButtonSource).toContain('.contentShape(Circle())');
    expect(nativeQuickSaveButtonSource).toContain('quickSaveIsProcessing');
    expect(nativeQuickSaveButtonSource).toContain('quickSaveIsFailure');
  });
});
