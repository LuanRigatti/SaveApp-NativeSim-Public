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
const quickSavePlugin = require('../plugins/withSaveLinkQuickSave');
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
const expoWidgetsModuleSource = readSource('../node_modules/expo-widgets/ios/WidgetsModule.swift');
const expoWidgetsFactorySource = readSource('../node_modules/expo-widgets/ios/LiveActivityFactory.swift');
const expoWidgetsTargetPluginSource = readSource('../node_modules/expo-widgets/plugin/src/ios/withIosWidgets.ts');
const expoWidgetsProjectPluginSource = readSource('../node_modules/expo-widgets/plugin/src/ios/xcode/withTargetXcodeProject.ts');
const expoWidgetsNativeTargetSource = readSource('../node_modules/expo-widgets/plugin/src/ios/xcode/addToPbxNativeTargetSection.ts');

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

  test('starts the activity with bundled appearance-aware icons and preserves authorization setup', () => {
    const activityStartIndex = managerSource.indexOf(
      "{ composeUrl, expandedHomeUrl, quickSaveStatus: 'ready' },\n        composeUrl,",
    );

    expect(activityStartIndex).toBeGreaterThanOrEqual(0);
    expect(managerSource).not.toContain('getSharedAppIconUri');
    expect(managerSource).not.toContain('widgetsDirectory');
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
    expect(managerSource).not.toContain('widgetsDirectory');
    expect(iconAssetsSource).toContain('live-activity-icon.png');
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
    expect(managerSource).toContain("{ composeUrl, expandedHomeUrl, quickSaveStatus: 'ready' },\n        composeUrl,");
    expect(layoutSource).toContain('compactLeading: (');
    expect(layoutSource).toContain('minimal: (');
    expect(banner).not.toContain('<Link');
    expect(compactLeading).not.toContain('<Link');
    expect(minimal).not.toContain('<Link');
    expect(expandedTrailing).toContain('target="saveapp.quickSave"');
    expect(layoutSource.match(/<Link destination=\{props\.composeUrl\} modifiers=\{\[tint\('#FFFFFF'\)\]\}>/g)).toBeNull();
    expect(managerSource).toContain("Linking.createURL('/links/compose'");
    expect(managerSource).toContain("Linking.createURL('/',");
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
  test('uses validated light and dark PNG appearance variants in the extension asset catalog', () => {
    for (const path of ['../assets/live-activity-icon.png', '../assets/live-activity-icon-dark.png']) {
      const png = readFileSync(join(__dirname, path));
      expect(hasPngSignature(png)).toBe(true);
      expect(isExpectedSaveLinkActivityPng(png)).toBe(true);
      expect(png.readUInt32BE(16)).toBe(SAVE_LINK_ACTIVITY_ICON_SIZE);
      expect(png.readUInt32BE(20)).toBe(SAVE_LINK_ACTIVITY_ICON_SIZE);
      expect(png.readUInt8(24)).toBe(8);
      expect(png.readUInt8(25)).toBe(6);
    }
    expect(areBytesEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 2]))).toBe(true);
    expect(areBytesEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 3]))).toBe(false);
    expect(isExpectedSaveLinkActivityPng(Uint8Array.from([137, 80, 78, 71]))).toBe(false);
    const manifest = quickSavePlugin.liveActivityAssetCatalogManifest();
    expect(manifest.images).toEqual([
      {
        filename: 'live-activity-icon.png',
        idiom: 'universal',
        appearances: [{ appearance: 'luminosity', value: 'light' }],
      },
      {
        filename: 'live-activity-icon-dark.png',
        idiom: 'universal',
        appearances: [{ appearance: 'luminosity', value: 'dark' }],
      },
    ]);
    expect(quickSavePluginSource).toContain('folder.assetcatalog');
    expect(quickSavePluginSource).toContain('ExpoWidgetsTarget');
    expect(quickSavePluginSource).toContain('isExpectedLiveActivityIcon');
    expect(quickSavePluginSource).toContain('copiedBytes.equals(sourceBytes)');
    expect(layoutSource.match(/assetName=\{SAVE_LINK_ACTIVITY_ASSET_NAME\}/g)).toHaveLength(4);
    expect(layoutSource).not.toContain('environment.colorScheme');
    expect(layoutSource).not.toContain('uiImage=');
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
