/* global describe, expect, test, __dirname */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const readSource = (path) => readFileSync(join(__dirname, path), 'utf8');
const appConfig = readSource('../app.config.js');
const quickSavePlugin = readSource('../plugins/withSaveLinkQuickSave.js');
const quickSavePodHelper = readSource('../modules/dynamic-island-quick-save/ios/expo_widgets_quick_save.rb');
const quickSaveButton = readSource('../modules/dynamic-island-quick-save/ios/SaveAppQuickSaveLiveActivityButton.swift');
const quickSaveIntent = readSource('../modules/dynamic-island-quick-save/ios/SaveAppQuickSaveIntent.swift');
const quickSaveAppIntentsPackage = readSource('../modules/dynamic-island-quick-save/ios/SaveAppQuickSaveAppIntentsPackage.swift');
const quickSaveSQLite = readSource('../modules/dynamic-island-quick-save/ios/SaveAppQuickSaveSQLite.swift');
const quickSaveXcodeprojTest = readSource('../tests/quick-save-xcodeproj-contract.rb');
const activityLayout = readSource('../src/features/dynamic-island/saveLinkLiveActivityWidget.ios.tsx');
const activityManager = readSource('../src/features/dynamic-island/saveLinkActivityManager.ios.ts');
const clipboardNative = readSource('../modules/clipboard-url-detection/ios/SaveAppClipboardURLDetectionModule.swift');
const clipboardModule = readSource('../modules/clipboard-url-detection/src/index.ts');
const clipboardOffer = readSource('../src/features/home-content/useClipboardLinkOffer.ts');
const savedContentProvider = readSource('../src/features/home-content/LocalSavedContentProvider.tsx');
const expoWidgetsRenderer = readFileSync(
  join(__dirname, '../node_modules/expo-widgets/ios/Widgets/ViewRenderer.swift'),
  'utf8',
);
const expoWidgetsActivity = readFileSync(
  join(__dirname, '../node_modules/expo-widgets/ios/Widgets/WidgetLiveActivity.swift'),
  'utf8',
);
const mirrorSecurity = readSource('../scripts/SaveAppMirrorSecurity.psm1');
const mirrorSnapshot = readSource('../scripts/Test-SaveAppMirrorSnapshot.ps1');
const appIntentsVerifier = readSource('../scripts/verify-saveapp-quick-save-app-intents.js');

describe('SaveApp Dynamic Island native quick-save contract', () => {
  test('registers a version-pinned config plugin that survives generated iOS project recreation', () => {
    expect(appConfig).toContain("'./plugins/withSaveLinkQuickSave'");
    expect(quickSavePlugin).toContain("withDangerousMod(config, [");
    expect(quickSavePlugin).toContain("'ios'");
    expect(quickSavePlugin).toContain('expo_widgets_post_install(installer)');
    expect(quickSavePlugin).toContain('saveapp_configure_expo_widgets_quick_save');
    expect(quickSavePlugin).toContain('refusing an incomplete or ambiguous native integration');
    expect(quickSavePlugin).not.toMatch(/path\.(?:join|resolve)\([^)]*node_modules|writeFileSync\([^,\n]*node_modules/);
    expect(quickSavePodHelper).toContain("SAVEAPP_EXPO_WIDGETS_VERSION = '58.0.23'");
    expect(quickSavePodHelper).toContain('Widgets/Buttons.swift');
    expect(quickSavePodHelper).toContain('renderer replacement is incomplete');
    expect(quickSavePodHelper).toContain('SaveAppQuickSaveIntent.swift');
    expect(quickSavePodHelper).toContain('SaveAppQuickSaveSQLite.swift');
    expect(quickSavePodHelper).toContain('SaveAppQuickSaveLiveActivityButton.swift');
    expect(quickSavePodHelper).toContain('project.native_targets.select');
    expect(quickSavePodHelper).toContain('PBXSourcesBuildPhase');
    expect(quickSavePodHelper).toContain('file_ref.real_path');
    expect(quickSavePodHelper).toContain('SAVEAPP_EXPO_WIDGETS_ALLOWED_PRODUCT_TYPES');
    expect(quickSavePodHelper).toContain('com.apple.product-type.library.static');
    expect(quickSavePodHelper).toContain('com.apple.product-type.framework');
    expect(quickSavePodHelper).toContain('non_native_targets.empty?');
    expect(quickSavePodHelper).toContain('phase.add_file_reference(file_ref, true)');
    expect(quickSavePodHelper).toContain('phase.remove_build_file(build_file)');
    expect(quickSavePodHelper).toContain('File.realpath');
    expect(quickSavePodHelper).toContain('saveapp_quick_save_verify_build_file_membership');
    expect(quickSavePodHelper).toContain('build_phase.respond_to?(:files)');
    expect(quickSaveXcodeprojTest).toContain("require 'xcodeproj'");
    expect(quickSaveXcodeprojTest).toContain('PBXAggregateTarget');
    expect(quickSaveXcodeprojTest).toContain('--verify-generated');
    expect(quickSaveXcodeprojTest).toContain('test_rejects_orphan_quick_save_build_file_references');
  });

  test('replaces exactly the installed SDK renderer types and keeps the normal button route', () => {
    const topLevelTypes = (source) => [...source.matchAll(
      /^(?:public\s+|private\s+|internal\s+|final\s+|open\s+)*(?:class|struct|enum|protocol)\s+(\w+)/gm,
    )].map((match) => match[1]).sort();
    const originalRendererTypes = topLevelTypes(readFileSync(
      join(__dirname, '../node_modules/expo-widgets/ios/Widgets/Buttons.swift'),
      'utf8',
    ));

    expect(topLevelTypes(quickSaveButton)).toEqual(originalRendererTypes);
    expect(originalRendererTypes).toEqual(['ButtonProps', 'LiveActivityButtonView', 'WidgetButtonView']);
    expect(quickSaveButton).toContain('intent: LiveActivityUserInteraction(');
    expect(quickSaveButton.match(/struct\s+LiveActivityButtonView\b/g)).toHaveLength(1);
  });

  test('registers ExpoWidgets module intents with the SaveApp app target and verifies generated target membership', () => {
    expect(quickSaveIntent).toContain('public struct ExpoWidgetsQuickSaveAppIntentsPackage: AppIntentsPackage');
    expect(quickSaveAppIntentsPackage).toContain('struct SaveAppQuickSaveAppIntentsPackage: AppIntentsPackage');
    expect(quickSaveAppIntentsPackage).toContain('ExpoWidgetsQuickSaveAppIntentsPackage.self');
    expect(quickSaveIntent).toMatch(/@available\(iOS 17\.0, \*\)\s*public struct ExpoWidgetsQuickSaveAppIntentsPackage: AppIntentsPackage/);
    expect(quickSaveAppIntentsPackage).toMatch(/internal import ExpoWidgets/);
    expect(quickSaveAppIntentsPackage).toMatch(/@available\(iOS 17\.0, \*\)\s*struct SaveAppQuickSaveAppIntentsPackage: AppIntentsPackage/);
    expect(appConfig).toContain("deploymentTarget: '16.4'");
    expect(quickSavePlugin).toContain('withXcodeProject');
    expect(quickSavePlugin).toContain('com.apple.product-type.application');
    expect(quickSavePlugin).toContain('addSourceFile(');
    expect(quickSavePlugin).toContain('verifySaveAppQuickSaveAppIntentsPackage');
    expect(appIntentsVerifier).toContain('xcode.project(projectFile)');
    expect(appIntentsVerifier).toContain('verifySaveAppQuickSaveAppIntentsPackage(');
  });

  test('Swift Preflight tests Xcodeproj, AppIntents target membership, and Swift syntax before the native compile', () => {
    const preflightWorkflow = readSource('../.github/workflows/swift-preflight.yml');
    const fixtureTest = preflightWorkflow.indexOf('ruby tests/quick-save-xcodeproj-contract.rb');
    const appTargetCheck = preflightWorkflow.indexOf('verify-saveapp-quick-save-app-intents.js');
    const podInstall = preflightWorkflow.indexOf('npx pod-install ios');
    const generatedCheck = preflightWorkflow.indexOf('--verify-generated ios/Pods/Pods.xcodeproj .');

    expect(fixtureTest).toBeGreaterThanOrEqual(0);
    expect(appTargetCheck).toBeGreaterThan(0);
    expect(podInstall).toBeGreaterThan(fixtureTest);
    expect(appTargetCheck).toBeGreaterThan(preflightWorkflow.indexOf('npx expo prebuild --platform ios --no-install'));
    expect(appTargetCheck).toBeLessThan(podInstall);
    expect(generatedCheck).toBeGreaterThan(podInstall);
    expect(preflightWorkflow).toContain('ruby -c modules/dynamic-island-quick-save/ios/expo_widgets_quick_save.rb');
    expect(preflightWorkflow).toContain('swiftc -frontend -parse');
    expect(preflightWorkflow).not.toContain('continue-on-error');
  });

  test('runs independent validation jobs and blocks native generation until every gate passes', () => {
    const preflightWorkflow = readSource('../.github/workflows/swift-preflight.yml');
    const getJobBlock = (jobName) => {
      const marker = `  ${jobName}:\n`;
      const start = preflightWorkflow.indexOf(marker);
      if (start < 0) return '';
      const rest = preflightWorkflow.slice(start + marker.length);
      const nextJob = rest.search(/\n  [a-z][a-z0-9-]*:\n/);
      return nextJob < 0 ? rest : rest.slice(0, nextJob);
    };

    const validationJobs = [
      'javascript-validation',
      'ruby-xcodeproj-validation',
      'swift-syntax-validation',
    ];
    const validationBlocks = validationJobs.map(getJobBlock);
    const nativeBuildBlock = getJobBlock('native-integration-build');

    expect(validationBlocks.every(Boolean)).toBe(true);
    expect(nativeBuildBlock).not.toBe('');
    for (const block of validationBlocks) {
      expect(block).not.toMatch(/^\s+needs:/m);
      expect(block).not.toMatch(/expo prebuild|pod-install ios|xcodebuild[\s\S]*?build/i);
    }

    expect(nativeBuildBlock).toMatch(/needs:\s*\n\s*- javascript-validation\s*\n\s*- ruby-xcodeproj-validation\s*\n\s*- swift-syntax-validation/);
    expect(nativeBuildBlock).toContain('npx expo prebuild --platform ios --no-install');
    expect(nativeBuildBlock).toContain('npx pod-install ios');
    expect(nativeBuildBlock).toContain('xcodebuild');
    expect(nativeBuildBlock).toContain('CODE_SIGNING_ALLOWED=NO');
    expect(preflightWorkflow).not.toContain('continue-on-error');

    expect(getJobBlock('javascript-validation')).toContain('exit "$failed"');
    expect(getJobBlock('ruby-xcodeproj-validation')).toContain('exit "$failed"');
    expect(getJobBlock('swift-syntax-validation')).toContain('exit "$failed"');
  });

  test('routes only the explicit quick-save button to LiveActivityIntent and retains Expo button paths', () => {
    expect(activityLayout).toContain('<Button');
    expect(activityLayout).toContain('target="saveapp.quickSave"');
    expect(activityLayout).toContain('expandedTrailing:');
    expect(activityLayout).toContain('quickSaveStatus');
    expect(activityLayout).toContain('frame({ width: 44, height: 44 })');
    expect(activityLayout).toContain('Toque para salvar');
    expect(activityLayout).not.toMatch(/https?:|normalizedUrl|clipboard/i);

    expect(quickSaveButton).toContain('struct WidgetButtonView: ExpoSwiftUI.View');
    expect(quickSaveButton).toContain('WidgetUserInteraction(');
    expect(quickSaveButton).toContain('struct LiveActivityButtonView: ExpoSwiftUI.View');
    expect(quickSaveButton).toContain('props.target == saveAppQuickSaveTarget');
    expect(quickSaveButton).toContain('SaveLinkQuickSaveIntent(activityID: props.source)');
    expect(quickSaveButton).toContain('LiveActivityUserInteraction(');
    expect(expoWidgetsRenderer).toContain('case .liveActivity:');
    expect(expoWidgetsRenderer).toContain('buttonProps.source = name');
    expect(expoWidgetsActivity).toContain('WidgetsDynamicView(name: context.activityID');
    expect(expoWidgetsRenderer).toContain('updateChildren(buttonProps)');
    expect(quickSaveButton).toContain('props.target == saveAppQuickSaveTarget');
    expect(quickSaveButton).toContain('else {\n      SwiftUI.Button(');
    expect(quickSaveButton).toContain('LiveActivityUserInteraction(');
    expect(quickSaveIntent).toContain('struct SaveLinkQuickSaveIntent: LiveActivityIntent');
    expect(quickSaveIntent).toContain('static var openAppWhenRun = false');
    expect(quickSaveIntent).toContain('Activity<LiveActivityAttributes>.activities');
    expect(quickSaveIntent).toContain('activity.update(ActivityContent(state: state, staleDate: nil))');
    expect(quickSaveIntent).not.toMatch(/console\.|print\(|clipboard\.value.*(props|ContentState)/i);
    expect(activityManager).toContain("start({ iconUri, quickSaveStatus: 'ready' }, url)");
    expect(activityManager).toContain("Linking.createURL('/links/compose'");
  });

  test('renders icon-only quick-save states in the same fixed accessible button', () => {
    const quickSaveBranch = quickSaveButton.match(
      /if props\.target == saveAppQuickSaveTarget \{([\s\S]*?)\n    \} else \{/,
    )?.[1] ?? '';

    expect(activityLayout).toContain("ready: 'Salvar link'");
    expect(activityLayout).toContain("processing: 'Salvando link'");
    expect(activityLayout).toContain("saved: 'Link salvo'");
    expect(activityLayout).toContain("alreadySaved: 'Link já salvo'");
    expect(activityLayout).toContain("invalid: 'Nenhum link válido'");
    expect(activityLayout).toContain("failed: 'Erro ao salvar link'");
    expect(activityLayout).toContain("ready: 'arrow.down.to.line'");
    expect(activityLayout).toContain("processing: 'hourglass'");
    expect(activityLayout).toContain("saved: 'checkmark'");
    expect(activityLayout).toContain("alreadySaved: 'checkmark'");
    expect(activityLayout).toContain("invalid: 'exclamationmark'");
    expect(activityLayout).toContain("failed: 'arrow.clockwise'");

    expect(quickSaveBranch).toContain('SaveLinkQuickSaveIntent(activityID: props.source)');
    expect(quickSaveBranch).toContain('RoundedRectangle(cornerRadius: 10, style: .circular)');
    expect(quickSaveBranch).toContain('.frame(width: 44, height: 44)');
    expect(quickSaveBranch).toContain('.font(.system(size: 20, weight: .semibold))');
    expect(quickSaveBranch).toContain('.foregroundStyle(.white)');
    expect(quickSaveButton).toContain('Color(white: 0.22)');
    expect(quickSaveButton).toContain('Color(red: 0.17, green: 0.45, blue: 0.29)');
    expect(quickSaveBranch).toContain('.buttonStyle(.plain)');
    expect(quickSaveBranch).toContain('.accessibilityLabel(props.label ?? "Salvar link")');
    expect(quickSaveBranch).toContain('.disabled(quickSaveIsProcessing)');
    expect(quickSaveBranch).toContain('.contentTransition(.symbolEffect(.replace))');
    expect(quickSaveBranch).toContain('.symbolEffect(.bounce, value: quickSaveIsSuccess)');
    expect(quickSaveBranch).toContain('.animation(.easeInOut(duration: 0.2), value: quickSaveSymbol)');
    expect(quickSaveBranch).toContain('.padding(.top, 8)');
    expect(quickSaveBranch).not.toMatch(/\b(?:Text|Label)\(/);
    expect(quickSaveIntent).toContain('try? await Task.sleep(nanoseconds: 1_250_000_000)');
  });

  test('reads clipboard only after the explicit intent and reports success only after SQLite commit', () => {
    const intentReadIndex = quickSaveIntent.indexOf('readClipboardAfterExplicitAction()');
    const sqliteInsertIndex = quickSaveIntent.indexOf('insertOrFindExisting(normalized)');
    const savedStatusIndex = quickSaveIntent.indexOf('status: .saved');
    expect(intentReadIndex).toBeGreaterThanOrEqual(0);
    expect(sqliteInsertIndex).toBeGreaterThan(intentReadIndex);
    expect(savedStatusIndex).toBeGreaterThan(sqliteInsertIndex);
    expect(quickSaveIntent).toContain('UIPasteboard.general');
    expect(quickSaveIntent).toContain('pasteboard.hasURLs || pasteboard.hasStrings');
    expect(quickSaveIntent).toContain('pasteboard.changeCount == changeCount');
    expect(quickSaveIntent).toContain('SaveLinkQuickSaveSQLite.normalize(clipboard.value)');
    expect(quickSaveIntent).toContain('ClipboardQuickSaveMarker.markHandled(changeCount: clipboard.changeCount)');
    expect(quickSaveIntent).not.toMatch(/console\.|print\(|\bLogger\b/);

    expect(quickSaveSQLite).toContain('FileManager.default.urls(for: .documentDirectory');
    expect(quickSaveSQLite).toContain('appendingPathComponent("SQLite"');
    expect(quickSaveSQLite).toContain('saveapp-photos.db');
    expect(quickSaveSQLite).toContain('SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX');
    expect(quickSaveSQLite).not.toContain('SQLITE_OPEN_CREATE');
    expect(quickSaveSQLite).toMatch(/scheme == "http" \|\| scheme == "https"/);
    expect(quickSaveSQLite).toContain('components.user == nil');
    expect(quickSaveSQLite).toContain('components.password == nil');
    expect(quickSaveSQLite).toContain('rangeOfCharacter(from: .controlCharacters) == nil');
    expect(quickSaveSQLite).toContain('requiredMigrations: Set<Int64> = [1, 9]');
    expect(quickSaveSQLite.indexOf('BEGIN IMMEDIATE;')).toBeLessThan(
      quickSaveSQLite.indexOf('try verifyCompatibleSchema(database)'),
    );
    expect(quickSaveSQLite).toContain('BEGIN IMMEDIATE;');
    expect(quickSaveSQLite).toContain('sqlite3_exec(database, "ROLLBACK;"');
    expect(quickSaveSQLite).toContain('saved_content_link_url_unique_idx');
    expect(quickSaveSQLite).toContain("wherecontent_type='link'anddeleted_atisnull");
    expect(quickSaveSQLite).toContain('COMMIT;');
    expect(quickSaveSQLite).toContain('return .inserted');
    expect(quickSaveSQLite).toContain('return .alreadySaved');
    expect(quickSaveSQLite).not.toMatch(/URLSession|URLRequest|withTask\(|fetch\(/);
    expect(quickSaveSQLite).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/);

    expect(quickSaveIntent.indexOf('insertOrFindExisting(normalized)')).toBeLessThan(
      quickSaveIntent.indexOf('status: .saved'),
    );
    expect(quickSaveIntent).toContain('status: .alreadySaved');
    expect(quickSaveIntent).toContain('status: .invalid');
    expect(quickSaveIntent).toContain('status: .failed');
    expect(quickSaveIntent).toContain('status: .processing');
    expect(quickSaveIntent).toContain('requestGenerationByActivity');
    expect(quickSaveIntent).toContain('activeActivityIDs.insert(activityID).inserted');
    expect(quickSaveIntent).toContain('generation: generation');
    expect(quickSaveIntent).toContain('$0.id == activityID');
    expect(quickSaveIntent).toContain('$0.content.state.name == "SaveAppSaveLink"');
  });

  test('uses persistent App Group metadata only to suppress the same automatic clipboard offer', () => {
    expect(quickSaveIntent).toContain('UserDefaults(suiteName: appGroupIdentifier)');
    expect(quickSaveIntent).toContain('systemUptime');
    expect(quickSaveIntent).not.toMatch(/"url"\s*:|"clipboard"\s*:/i);
    expect(clipboardNative).toContain('quickSaveHandledChangeCount');
    expect(clipboardNative).toContain('quickSaveHandledSystemUptime');
    expect(clipboardNative).toContain('systemUptime >= handledSystemUptime');
    expect(clipboardNative).not.toMatch(/pasteboard\.(?:string|url|urls|items|itemProviders|detectedValues)\b/);
    expect(clipboardModule).toContain('quickSaveHandledChangeCount');
    expect(clipboardOffer).toContain('wasClipboardChangeHandledByQuickSave(');
    expect(savedContentProvider).toContain("state === 'active'");
    expect(savedContentProvider).toContain('void refresh().catch');
  });

  test('mirrors the config plugin and exact local native sources without broadening module paths', () => {
    const requiredPaths = [
      'plugins/withSaveLinkQuickSave.js',
      'modules/dynamic-island-quick-save/ios/expo_widgets_quick_save.rb',
      'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveIntent.swift',
      'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveAppIntentsPackage.swift',
      'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveLiveActivityButton.swift',
      'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveSQLite.swift',
    ];
    for (const file of requiredPaths) {
      expect(mirrorSecurity).toContain(`'${file}'`);
      expect(mirrorSnapshot).toContain(`'${file}'`);
    }
    expect(mirrorSecurity).toContain("'tests/quick-save-xcodeproj-contract.rb'");
    expect(mirrorSecurity).toContain("'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveAppIntentsPackage.swift'");
    expect(mirrorSecurity).toContain("'scripts/verify-saveapp-quick-save-app-intents.js'");
    expect(mirrorSnapshot).toContain('tests/dynamic-island-quick-save-contract.test.js');
    expect(mirrorSnapshot).toContain('tests/quick-save-xcodeproj-contract.rb');
    expect(mirrorSnapshot).toContain('scripts/verify-saveapp-quick-save-app-intents.js');
    expect(mirrorSecurity).not.toContain("$allowedDirectories = @('modules'");
    expect(mirrorSecurity).not.toContain("$allowedDirectories = @('scripts'");
  });
});
