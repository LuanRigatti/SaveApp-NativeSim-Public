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
const quickSaveQueueSwift = readSource('../modules/dynamic-island-quick-save/ios/SaveAppQuickSaveQueue.swift');
const quickSaveXcodeprojTest = readSource('../tests/quick-save-xcodeproj-contract.rb');
const activityLayout = readSource('../src/features/dynamic-island/saveLinkLiveActivityWidget.ios.tsx');
const activityManager = readSource('../src/features/dynamic-island/saveLinkActivityManager.ios.ts');
const quickSaveQueueImport = readSource('../src/features/dynamic-island/quickSaveQueue.ts');
const quickSaveQueuePipeline = readSource('../src/features/dynamic-island/quickSaveQueueImportPipeline.ts');
const clipboardNative = readSource('../modules/clipboard-url-detection/ios/SaveAppClipboardURLDetectionModule.swift');
const clipboardModule = readSource('../modules/clipboard-url-detection/src/index.ts');
const clipboardOffer = readSource('../src/features/home-content/useClipboardLinkOffer.ts');
const savedContentProvider = readSource('../src/features/home-content/LocalSavedContentProvider.tsx');
const savedContentLibrary = readSource('../src/features/home-content/savedContentLibrary.ts');
const quickSavePreviewEnrichment = readSource('../src/features/home-content/quickSaveLinkPreviewEnrichment.ts');
const quickSavePreviewMigration = readSource('../src/features/home-content/quickSavePreviewEnrichmentSchemaMigration.ts');
const homeGallery = readSource('../src/components/photos/PhotoMasonryGallery.tsx');
const homeScreen = readSource('../src/app/(tabs)/index.tsx');
const composerRoute = readSource('../src/app/links/compose.tsx');
const expoSQLiteModule = readFileSync(join(__dirname, '../node_modules/expo-sqlite/ios/SQLiteModule.swift'), 'utf8');
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
    expect(quickSavePodHelper).toContain("SAVEAPP_EXPO_WIDGETS_VERSION = '58.0.26'");
    expect(quickSavePodHelper).toContain('Widgets/Buttons.swift');
    expect(quickSavePodHelper).toContain('renderer replacement is incomplete');
    expect(quickSavePodHelper).toContain('SaveAppQuickSaveIntent.swift');
    expect(quickSavePodHelper).toContain('SaveAppQuickSaveSQLite.swift');
    expect(quickSavePodHelper).toContain('SaveAppQuickSaveLiveActivityButton.swift');
    expect(quickSavePodHelper).toContain('SaveAppQuickSaveQueue.swift');
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
    expect(activityLayout).toContain('frame({ width: 48, height: 48 })');
    expect(activityLayout).not.toContain('Toque para salvar');
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
    expect(activityManager).toContain("quickSaveStatus: 'ready'");
    expect(activityManager).toContain('recentQuickSaveLinksRevision: recentProps.revision');
    expect(activityManager).toContain('recentQuickSaveLinks: recentProps.links');
    expect(activityManager).toContain("Linking.createURL('/links/compose'");
    expect(activityManager).toContain("Linking.createURL('/',");
    expect(activityManager).toContain("source: 'dynamic-island-expanded'");
    expect(activityLayout).toContain("<Link destination={props.expandedHomeUrl} modifiers={[tint('#FFFFFF')]}>" );
    expect(activityLayout.match(/<Link destination=\{props\.expandedHomeUrl\} modifiers=\{\[tint\('#FFFFFF'\)\]\}>/g)).toHaveLength(2);
    expect(activityLayout).toContain('monospacedDigit');
  });

  test('renders icon-only quick-save states in the same fixed accessible button', () => {
    const quickSaveBranch = quickSaveButton.match(
      /if props\.target == saveAppQuickSaveTarget \{([\s\S]*?)\n    \} else \{/,
    )?.[1] ?? '';
    const expandedLeadingFrame = activityLayout.match(
      /expandedLeading:[\s\S]*?frame\(\{ width: (\d+), height: (\d+) \}\)/,
    );
    const quickSaveButtonFrame = quickSaveBranch.match(
      /\n        \.frame\(width: (\d+), height: (\d+)\)/,
    );

    expect(activityLayout).toContain("ready: 'Salvar link'");
    expect(activityLayout).toContain("processing: 'Salvando link'");
    expect(activityLayout).toContain("queued: 'Adicionado à fila'");
    expect(activityLayout).toContain("alreadyQueued: 'Link já guardado'");
    expect(activityLayout).toContain("alreadySaved: 'Já salvo na biblioteca'");
    expect(activityLayout).toContain("invalid: 'Link inválido'");
    expect(activityLayout).toContain("failed: 'Não foi possível salvar'");
    expect(activityLayout).toContain("ready: 'checkmark'");
    expect(activityLayout).toContain("processing: 'circle.dotted'");
    expect(activityLayout).toContain("queued: 'checkmark'");
    expect(activityLayout).toContain("alreadySaved: 'checkmark'");
    expect(activityLayout).toContain("invalid: 'exclamationmark'");
    expect(activityLayout).toContain("failed: 'xmark'");
    expect(activityLayout).toContain(": 'Salvar link';");
    expect(activityLayout).toContain("? 'Adicionado à fila'");

    expect(quickSaveBranch).toContain('SaveLinkQuickSaveIntent(activityID: props.source)');
    expect(quickSaveBranch).toContain('Circle()');
    expect(quickSaveBranch).toContain('.frame(width: 48, height: 48)');
    expect(expandedLeadingFrame?.slice(1)).toEqual(quickSaveButtonFrame?.slice(1));
    expect(quickSaveBranch).toContain('.strokeBorder(Color.white, lineWidth: 2)');
    expect(quickSaveBranch).toContain('.font(.system(size: 18, weight: .semibold))');
    expect(quickSaveBranch).toContain('.foregroundStyle(.white)');
    expect(quickSaveButton).toContain('Color(red: 0.13, green: 0.45, blue: 0.27)');
    expect(quickSaveBranch).toContain('.buttonStyle(.plain)');
    expect(quickSaveBranch).toContain('.accessibilityLabel(props.label ?? "Salvar link")');
    expect(quickSaveBranch).toContain('.disabled(quickSaveIsProcessing)');
    expect(quickSaveBranch).toContain('.contentTransition(.symbolEffect(.replace))');
    expect(quickSaveBranch).toContain('.trim(from: 0.08, to: 0.92)');
    expect(quickSaveBranch).toContain('.stroke(Color.white, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))');
    expect(quickSaveBranch).toContain('.symbolEffect(.bounce, value: quickSaveIsSuccess)');
    expect(quickSaveBranch).toContain('.animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: diagnosticStatus)');
    expect(quickSaveButton).toContain('@Environment(\\.accessibilityReduceMotion) private var reduceMotion');
    expect(quickSaveBranch).not.toContain('.padding(.top, 8)');
    expect(quickSaveBranch).not.toMatch(/\b(?:Text|Label)\(/);
    expect(quickSaveIntent).toContain('terminalStatusDisplayNanoseconds: UInt64 = 5_000_000_000');
    expect(quickSaveIntent).toContain('guard submitted else {');
    expect(quickSaveIntent).toContain('try await Task.sleep(nanoseconds: Self.terminalStatusDisplayNanoseconds)');
    const displayWindowIndex = quickSaveIntent.indexOf('Task.sleep(nanoseconds: Self.terminalStatusDisplayNanoseconds)');
    const readyResetIndex = quickSaveIntent.indexOf('statuses: [.ready]', displayWindowIndex);
    expect(displayWindowIndex).toBeGreaterThanOrEqual(0);
    expect(readyResetIndex).toBeGreaterThan(displayWindowIndex);
  });

  test('diagnoses the intent process and separates ActivityKit lookup failures without private identifiers', () => {
    expect(quickSaveIntent).toContain('event=intent.execution_context role=');
    expect(quickSaveIntent).toContain('case "app": return "application"');
    expect(quickSaveIntent).toContain('case "appex": return "extension"');

    const lookupFailureEvents = quickSaveIntent
      .split('\n')
      .filter((line) => line.includes('event=activity.lookup.result=not_found'));
    expect(lookupFailureEvents).toHaveLength(5);
    expect(lookupFailureEvents.join('\n')).toContain('reason=no_activity_available');
    expect(lookupFailureEvents.join('\n')).toContain('reason=activity_id_not_found');
    expect(lookupFailureEvents.join('\n')).toContain('reason=activity_id_ambiguous');
    expect(lookupFailureEvents.join('\n')).toContain('reason=state_name_mismatch');
    expect(lookupFailureEvents.join('\n')).toContain('reason=activity_no_longer_active');
    expect(lookupFailureEvents.join('\n')).not.toMatch(/activityID|bundleIdentifier|bundleURL|\.path/);
    expect(lookupFailureEvents.join('\n')).not.toMatch(/(?:available|matching)_count=/);
    expect(quickSaveIntent).toContain('let matchingActivities = activities.filter { $0.id == activityID }');
    expect(quickSaveIntent).toContain('activity.content.state.name == "SaveAppSaveLink"');
    expect(quickSaveIntent).toContain('delivery_confirmation=unavailable');
  });

  test('reads clipboard after explicit action and confirms only durable App Group queue writes', () => {
    const intentReadIndex = quickSaveIntent.indexOf('readClipboardAfterExplicitAction(operationID: operationID)');
    const queueWriteIndex = quickSaveIntent.indexOf('SaveAppQuickSaveQueue.enqueue(normalized)');
    const queuedStatusIndex = quickSaveIntent.indexOf('statuses: [.processing, .queued]');
    expect(intentReadIndex).toBeGreaterThanOrEqual(0);
    expect(queueWriteIndex).toBeGreaterThan(intentReadIndex);
    expect(queuedStatusIndex).toBeGreaterThan(queueWriteIndex);
    expect(quickSaveIntent).toContain('case .enqueued(let lockScreenHistoryUpdated)');
    expect(quickSaveIntent).toContain('case .alreadyQueued(let lockScreenHistoryUpdated)');
    expect(quickSaveIntent).toContain('guard lockScreenHistoryUpdated else {');
    expect(quickSaveIntent).not.toContain('SaveLinkQuickSaveSQLite.insertOrFindExisting');
    expect(quickSaveIntent).toContain('UIPasteboard.general');
    expect(quickSaveIntent).toContain('let hasURL = pasteboard.hasURLs');
    expect(quickSaveIntent).toContain('let hasString = pasteboard.hasStrings');
    expect(quickSaveIntent).toContain('guard hasURL || hasString else {');
    expect(quickSaveIntent).toContain('pasteboard.changeCount == changeCount');
    expect(quickSaveIntent).toContain('SaveLinkQuickSaveSQLite.normalize(clipboard.value)');
    expect(quickSaveIntent).toContain('ClipboardQuickSaveMarker.markHandled(changeCount: clipboard.changeCount, operationID: operationID)');
    expect(quickSaveIntent).toContain('Logger(subsystem: "com.luanrigatti.saveapp", category: "quick-save.intent")');
    expect(quickSaveIntent).not.toMatch(/logger\.(?:info|notice|error)\([^\n]*(?:clipboard\.value|normalized\.url|link\.url)/i);
    expect(quickSaveIntent).toContain('event=activity.lookup.result=not_found');
    expect(quickSaveIntent).toContain('stage=queue');
    expect(quickSaveIntent).toContain('event=clipboard_marker.result=written');
    expect(quickSaveIntent).toContain('event=clipboard_marker.result=failed reason=synchronization_unconfirmed');

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
      quickSaveSQLite.indexOf('try verifyCompatibleSchema(database, operationID: operationID)'),
    );
    expect(quickSaveSQLite).toContain('BEGIN IMMEDIATE;');
    expect(quickSaveSQLite).toContain('sqlite3_exec(database, "ROLLBACK;"');
    expect(quickSaveSQLite).toContain('saved_content_link_url_unique_idx');
    expect(quickSaveSQLite).toContain("wherecontent_type='link'anddeleted_atisnull");
    expect(quickSaveSQLite).toContain('COMMIT;');
    expect(quickSaveSQLite).toContain('return .inserted');
    expect(quickSaveSQLite).toContain('return .alreadySaved');
    expect(quickSaveSQLite).toMatch(
      /private static func containsActiveLink\([\s\S]*?\) throws -> Bool \{\s*logger\.notice\([^\n]*\)\s*return try withStatement\(/,
    );
    expect(quickSaveSQLite).toContain('Logger(subsystem: "com.luanrigatti.saveapp", category: "quick-save.sqlite")');
    expect(quickSaveSQLite).toContain('event=database.commit.confirmed outcome=inserted');
    expect(quickSaveSQLite).toContain('event=database.insert.result=statement_completed');
    expect(quickSaveSQLite).toContain('action: "commit"');
    expect(quickSaveSQLite).toContain('event=database.rollback.result=confirmed');
    expect(quickSaveSQLite).toContain('diagnosticStage');
    expect(quickSaveSQLite).toContain('diagnosticSQLiteCode');
    expect(quickSaveSQLite).not.toMatch(/URLSession|URLRequest|withTask\(|fetch\(/);
    expect(quickSaveSQLite).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/);

    expect(quickSaveIntent).toContain('statuses: [.processing, .queued]');
    expect(quickSaveIntent).toContain('statuses: [.processing, .alreadyQueued]');
    expect(quickSaveIntent).toContain('statuses: [.invalid]');
    expect(quickSaveIntent).toContain('statuses: [.failed]');
    expect(quickSaveIntent).toContain('requestGenerationByActivity');
    expect(quickSaveIntent).toContain('pendingOperations[activityID] = operation');
    expect(quickSaveIntent).toContain('await previous?.value');
    expect(quickSaveIntent).toContain('requestGenerationByActivity[activityID] == generation');
    expect(quickSaveIntent).toContain('stage=queue');
    expect(quickSaveIntent).not.toContain('sqlite_code=');
    expect(quickSaveIntent).toContain('event=intent.perform.entered');
    expect(quickSaveIntent).not.toContain('event=intent.rejected reason=already_processing');
    expect(quickSaveIntent).toContain('generation: generation');
    expect(quickSaveIntent).toContain('$0.id == activityID');
    expect(quickSaveIntent).toContain('activity.content.state.name == "SaveAppSaveLink"');

    expect(quickSaveQueueSwift).toContain('FileManager.default.containerURL');
    expect(quickSaveQueueSwift).toContain('forSecurityApplicationGroupIdentifier: appGroupIdentifier');
    expect(quickSaveQueueSwift).toContain('operationID: UUID().uuidString');
    expect(quickSaveQueueSwift).not.toContain('UUID(uuidString: operationID)');
    expect(quickSaveQueueSwift).toContain('flock(descriptor, LOCK_EX | LOCK_NB)');
    expect(quickSaveQueueSwift).toContain('fileLockTimeoutNanoseconds');
    expect(quickSaveQueueSwift).toContain('Darwin.rename(sourcePath, destinationPath)');
    expect(quickSaveQueueSwift).toContain('fsync(descriptor)');
    expect(quickSaveQueueSwift).toContain('completeUntilFirstUserAuthentication');
    expect(quickSaveQueueSwift).toContain('readAndValidateRecord(at: destination)');
    expect(quickSaveQueueSwift).not.toContain('saveapp-photos.db');
    const staleTemporaryCleanup = quickSaveQueueSwift.match(
      /private static func cleanStaleTemporaryFiles\([\s\S]*?\n  \}/,
    )?.[0] ?? '';
    expect(staleTemporaryCleanup).toContain('options: []');
    expect(staleTemporaryCleanup).not.toContain('.skipsHiddenFiles');
    expect(quickSaveQueueImport).toContain("Paths.appleSharedContainers[APP_GROUP_IDENTIFIER]");
    expect(quickSaveQueueImport).toContain('importQueuedQuickSaveLink');
    expect(quickSaveQueuePipeline).toContain("await adapter.acknowledge(entry)");
    expect(quickSaveQueuePipeline).toContain("adapter.record('commit_confirmed')");
    expect(quickSaveQueuePipeline).toContain("adapter.record('duplicate_confirmed')");
    expect(quickSaveQueuePipeline).toContain("raw.url !== raw.normalizedURL");
    expect(quickSaveQueuePipeline).not.toMatch(/logger|console\.(?:log|warn|error)/);
    expect(savedContentLibrary).toContain('withExclusiveTransactionAsync');
    expect(savedContentLibrary).toContain('getSaveAppDatabase()');
    expect(savedContentLibrary).toContain("WHERE content_type = 'link' AND normalized_url = ? AND deleted_at IS NULL");
    expect(savedContentLibrary).toContain("'inserted' | 'alreadySaved'");
    expect(savedContentLibrary).toContain('fallbackLinkTitle(normalized.url)');
  });

  test('enriches Quick Save metadata after commit without delaying import or overwriting a changed row', () => {
    const importStart = savedContentLibrary.indexOf('export async function importQueuedQuickSaveLink');
    const transactionIndex = savedContentLibrary.indexOf(
      'await database.withExclusiveTransactionAsync(async (transaction) => {',
      importStart,
    );
    const scheduleIndex = savedContentLibrary.indexOf(
      'void quickSaveLinkPreviewEnricher.schedule(candidate);',
      transactionIndex,
    );
    expect(transactionIndex).toBeGreaterThan(importStart);
    expect(scheduleIndex).toBeGreaterThan(transactionIndex);
    expect(savedContentLibrary).toContain('AND url IS ? AND normalized_url IS ? AND title IS ? AND description IS ?');
    expect(savedContentLibrary).toContain('AND domain IS ? AND image_url IS ? AND favicon_url IS ?');
    expect(savedContentLibrary).toContain('preview_image_relative_path = COALESCE(preview_image_relative_path, ?)');
    expect(savedContentLibrary).toContain('preview_image_mime_type = COALESCE(preview_image_mime_type, ?)');
    expect(savedContentLibrary).toContain('deleted_at IS NULL');
    expect(savedContentLibrary).toContain('subscribeToQuickSaveLinkPreviewUpdates');
    expect(savedContentLibrary).toContain('cacheLockScreenFavicon: cacheQuickSaveLockScreenFavicon');
    expect(savedContentLibrary).toContain('downloadLinkFaviconImage(faviconUrl)');
    expect(savedContentLibrary).toContain('storeQuickSaveLockScreenFavicon(id, base64)');
    expect(savedContentLibrary).toContain('associateQuickSaveLockScreenContent(historyId, savedId)');
    expect(savedContentLibrary).toContain('synchronizeQuickSaveLockScreenFavicons');
    expect(savedContentLibrary).toContain('schedulePendingQuickSaveLinkPreviewEnrichment');
    expect(savedContentProvider).toContain('subscribeToQuickSaveLinkPreviewUpdates');
    expect(savedContentProvider).toContain('schedulePendingQuickSaveLinkPreviewEnrichment()');
    expect(quickSavePreviewEnrichment).toContain('maxAttemptsPerUrl ?? 2');
    expect(quickSavePreviewEnrichment).toContain('retryDelayMs ?? 30_000');
    expect(quickSavePreviewEnrichment).toContain('maxConcurrent ?? 2');
    expect(quickSavePreviewEnrichment).toContain('inFlight.get(candidate.normalizedUrl)');
    expect(quickSavePreviewEnrichment).toContain('adapter.claimAttempt');
    expect(quickSavePreviewMigration).toContain('QUICK_SAVE_PREVIEW_ENRICHMENT_SCHEMA_VERSION = 11');
    expect(quickSavePreviewMigration).toContain('REFERENCES saved_content(id) ON DELETE CASCADE');
    expect(quickSavePreviewEnrichment).toContain('adapter.getPreview(candidate.normalizedUrl)');
    expect(quickSavePreviewEnrichment).not.toMatch(/fetch\(|expoFetch|console\.(?:log|warn|error)/);
    expect(savedContentLibrary).toContain('getPreview: getLinkPreview');
    expect(savedContentLibrary).toContain('downloadLinkPreviewImage(url, signal)');
    expect(savedContentLibrary).toContain('downloadLinkFaviconImage(faviconUrl)');
    expect(savedContentLibrary).toContain('cachePreview: cacheLinkPreviewImage');
    expect(savedContentLibrary).toContain('saveLinkWithPreview(input, {');
  });

  test('stores validated App Group favicons and updates the existing Activity without network in the intent', () => {
    expect(clipboardModule).toContain('associateQuickSaveLockScreenContent');
    expect(clipboardModule).toContain('storeQuickSaveLockScreenFavicon');
    expect(clipboardNative).toContain('QuickSaveLockScreenRecentLinks.json');
    expect(clipboardNative).toContain('Favicons');
    expect(clipboardNative).toContain('flock(descriptor, LOCK_EX | LOCK_NB)');
    expect(clipboardNative).toContain('fileLockTimeoutNanoseconds');
    expect(clipboardNative).toContain('atomicWrite(pngData, to: imageURL, in: faviconDirectory)');
    expect(clipboardNative).toContain('CGImageSourceCreateThumbnailAtIndex');
    expect(clipboardNative).toContain('maximumSourceBytes = 256 * 1_024');
    expect(clipboardNative).toContain('maximumFaviconBytes = 64 * 1_024');
    expect(clipboardNative).toContain('UserDefaults(suiteName: appGroupIdentifier)?.bool(forKey: visibleKey) == true');
    expect(clipboardNative).toContain('favicon-\\(id).png');
    expect(activityManager).toContain('faviconUri');
    expect(activityLayout).toContain('uiImage={link.faviconUri}');
    expect(activityLayout).toContain('systemName="globe"');
    expect(quickSaveIntent).toContain('SaveAppQuickSaveQueue.lockScreenHistoryForActivityUpdate()');
    expect(quickSaveIntent).not.toMatch(/URLSession|URLRequest|fetch\(/);
    expect(quickSaveQueueSwift).toContain('validFaviconURLForActivity(fileName: fileName, id: link.id)');
    expect(quickSaveQueueSwift).toContain('pruneObsoleteFavicons');
    expect(quickSaveQueueSwift).toContain('lockScreenRecentLinksVersion = 2');
    expect(quickSaveQueueSwift).toContain('lockScreenHistoryForActivityUpdate()');
    expect(quickSaveQueueSwift).toContain('return .enqueued(lockScreenHistoryUpdated: historyUpdated)');
    expect(quickSaveQueueSwift).toContain('return .alreadyQueued(lockScreenHistoryUpdated: historyUpdated)');
    expect(quickSaveQueueSwift).toContain('private static func updateLockScreenRecentLinksBestEffort(');
    expect(quickSaveQueueSwift).toContain(') -> Bool {');
    expect(quickSaveQueueSwift).toContain('faviconUri');
    expect(quickSaveQueueSwift.indexOf('var links = readLockScreenRecentLinks(in: directory)?.links ?? []'))
      .toBeLessThan(quickSaveQueueSwift.indexOf('let entry = QuickSaveLockScreenRecentLink('));
    expect(quickSaveQueueSwift).toContain('isAbandonedTemporary');
    expect(clipboardNative).toContain('isAbandonedTemporary');
    expect(savedContentLibrary).toContain('LIMIT 256;');
    expect(activityManager).toContain('activity.update({');
    expect(activityManager).not.toContain('factory.start({');
  });

  test('serializes nearby intents and updates the existing Activity from the latest versioned App Group snapshot', () => {
    const queueConfirm = quickSaveIntent.indexOf('SaveAppQuickSaveQueue.enqueue(normalized)');
    const historyLockedUpdate = quickSaveIntent.indexOf('SaveAppQuickSaveQueue.lockScreenHistoryForActivityUpdate()');
    const activitySubmission = quickSaveIntent.indexOf('await activity.update(ActivityContent(state: state, staleDate: nil))');
    expect(queueConfirm).toBeGreaterThanOrEqual(0);
    expect(historyLockedUpdate).toBeGreaterThan(queueConfirm);
    expect(activitySubmission).toBeGreaterThan(historyLockedUpdate);
    expect(quickSaveQueueSwift).toContain('let revision: Int64');
    expect(quickSaveQueueSwift).toContain('addingReportingOverflow(1)');
    expect(quickSaveIntent).toContain('props["recentQuickSaveLinksRevision"]');
    expect(quickSaveIntent).toContain('activity.activityState == .active');
    expect(quickSaveIntent).toContain('maximumActivityContentStateBytes = 4 * 1_024');
    expect(quickSaveIntent).toContain('encodedState.count <= Self.maximumActivityContentStateBytes');
    expect(quickSaveIntent).toContain('enqueueReadyRestoreIfCurrent');
    expect(quickSaveIntent).toContain('requestGenerationByActivity[activityID] == generation');
    expect(activityManager).toContain('serializeActivityUpdate');
    expect(activityManager).toContain('attempt < 3');
    expect(clipboardNative).toContain('static func setRecentHistoryVisible(_ visible: Bool) -> Bool');
  });

  test('waits for the first ActivityKit submission after durable Quick Save without holding the file lock', () => {
    const queueWrite = quickSaveIntent.indexOf('SaveAppQuickSaveQueue.enqueue(normalized)');
    const processingUpdate = quickSaveIntent.indexOf('statuses: [.processing, .queued]');
    const historyRead = quickSaveIntent.indexOf('SaveAppQuickSaveQueue.lockScreenHistoryForActivityUpdate()');
    const activityAwait = quickSaveIntent.indexOf('await activity.update(ActivityContent(state: state, staleDate: nil))');
    const performSeriallyStart = quickSaveIntent.indexOf('private func performSerially(');
    const performSeriallyEnd = quickSaveIntent.indexOf('private func enqueueActivityStatusSequence(', performSeriallyStart);
    const performSerially = quickSaveIntent.slice(performSeriallyStart, performSeriallyEnd);
    const historyReaderStart = quickSaveQueueSwift.indexOf('static func lockScreenHistoryForActivityUpdate()');
    const historyReaderEnd = quickSaveQueueSwift.indexOf('private static func updateLockScreenRecentLinksBestEffort', historyReaderStart);
    const historyReader = quickSaveQueueSwift.slice(historyReaderStart, historyReaderEnd);
    const updateMethodStart = quickSaveIntent.indexOf('private func updateActivity(');
    const updateMethodEnd = quickSaveIntent.indexOf('@MainActor', updateMethodStart);
    const updateMethod = quickSaveIntent.slice(updateMethodStart, updateMethodEnd);

    expect(queueWrite).toBeGreaterThanOrEqual(0);
    expect(processingUpdate).toBeGreaterThan(queueWrite);
    expect(historyRead).toBeGreaterThan(processingUpdate);
    expect(activityAwait).toBeGreaterThan(historyRead);
    expect(performSerially).not.toContain('await updateActivity(');
    expect(performSerially).toContain('await enqueueActivityStatusSequence(');
    expect(performSerially).not.toMatch(/(?<!await )enqueueActivityStatusSequence\(/);
    expect(performSerially).toContain('guard lockScreenHistoryUpdated else {');
    expect(quickSaveIntent).toContain('pendingActivityUpdates[activityID] = update');
    expect(quickSaveIntent).toContain('await previous?.value');
    expect(quickSaveIntent).toContain('await update.value');
    expect(quickSaveIntent).toContain('requiresCurrentGeneration: true');
    expect(historyReader).toContain('withExclusiveFileLock(in: directory)');
    expect(historyReader).not.toContain('await');
    expect(historyReader).not.toContain('activity.update');
    expect(updateMethod).toContain('latestHistory.snapshot?.revision != history.snapshot?.revision');
    expect(updateMethod).toContain('privacyChanged');
    expect(updateMethod).toContain('for attempt in 0..<3');
    expect(updateMethod).toContain('reconciliation_limit');
    expect(quickSaveQueueSwift).toContain('LOCK_EX | LOCK_NB');
    expect(quickSaveQueueSwift).toContain('fileLockTimeoutNanoseconds');
    expect(clipboardNative).toContain('LOCK_EX | LOCK_NB');
    expect(clipboardNative).toContain('fileLockTimeoutNanoseconds');
  });

  test('cleans serialized Activity update tasks only through actor-isolated current-ticket cleanup', () => {
    const enqueueStart = quickSaveIntent.indexOf('private func enqueueActivityStatusSequence(');
    const cleanupStart = quickSaveIntent.indexOf('private func clearActivityStatusSequenceIfCurrent(', enqueueStart);
    const submitStart = quickSaveIntent.indexOf('private func submitActivityStatusSequence(', cleanupStart);
    const enqueue = quickSaveIntent.slice(enqueueStart, cleanupStart);
    const cleanup = quickSaveIntent.slice(cleanupStart, submitStart);
    const taskBody = enqueue.slice(enqueue.indexOf('let update = Task'), enqueue.indexOf('pendingActivityUpdates[activityID] = update'));

    expect(enqueue).toMatch(/private func enqueueActivityStatusSequence\([\s\S]*?\) async \{/);
    expect(enqueue).toContain('await previous?.value');
    expect(enqueue).toContain('await self.submitActivityStatusSequence(');
    expect(taskBody).toContain('await self.clearActivityStatusSequenceIfCurrent(activityID: activityID, ticket: ticket)');
    expect(taskBody).not.toMatch(/pendingActivityUpdate(?:Tickets|s)\[/);
    expect(cleanup).toMatch(/private func clearActivityStatusSequenceIfCurrent\(activityID: String, ticket: UUID\)/);
    expect(cleanup.indexOf('guard pendingActivityUpdateTickets[activityID] == ticket else { return }'))
      .toBeLessThan(cleanup.indexOf('pendingActivityUpdates.removeValue(forKey: activityID)'));
    expect(cleanup).toContain('pendingActivityUpdateTickets.removeValue(forKey: activityID)');
    expect(cleanup).not.toContain('nonisolated');
    expect(cleanup).not.toContain('unsafe');
  });

  test('awaits the intent-owned Activity update while keeping ready restoration separate and generation-guarded', () => {
    const performStart = quickSaveIntent.indexOf('func perform() async throws');
    const coordinatorStart = quickSaveIntent.indexOf('await SaveLinkQuickSaveCoordinator.shared.perform(', performStart);
    const performEnd = quickSaveIntent.indexOf('\n}\n\nprivate enum SaveLinkQuickSaveStatus', performStart);
    const perform = quickSaveIntent.slice(performStart, performEnd);
    const submitStart = quickSaveIntent.indexOf('private func submitActivityStatusSequence(');
    const updateActivityStart = quickSaveIntent.indexOf('private func updateActivity(', submitStart);
    const submit = quickSaveIntent.slice(submitStart, updateActivityStart);
    const failedSubmissionGuard = submit.indexOf('guard submitted else {');
    const readyDelay = submit.indexOf('try await Task.sleep(nanoseconds: Self.terminalStatusDisplayNanoseconds)');
    const activityUpdateStart = quickSaveIntent.indexOf('private func updateActivity(');
    const clipboardReaderStart = quickSaveIntent.indexOf('@MainActor\n  private func readClipboardAfterExplicitAction', activityUpdateStart);
    const activityUpdate = quickSaveIntent.slice(activityUpdateStart, clipboardReaderStart);
    const enqueueStart = quickSaveIntent.indexOf('private func enqueueActivityStatusSequence(');
    const cleanupStart = quickSaveIntent.indexOf('private func clearActivityStatusSequenceIfCurrent(', enqueueStart);
    const enqueue = quickSaveIntent.slice(enqueueStart, cleanupStart);
    const readyStart = quickSaveIntent.indexOf('private func enqueueReadyRestoreIfCurrent(');
    const readyEnd = quickSaveIntent.indexOf('private func updateActivity(', readyStart);
    const readyRestore = quickSaveIntent.slice(readyStart, readyEnd);

    expect(coordinatorStart).toBeGreaterThan(performStart);
    expect(perform.indexOf('await SaveLinkQuickSaveCoordinator.shared.perform('))
      .toBeLessThan(perform.lastIndexOf('return .result()'));
    expect(enqueue.indexOf('pendingActivityUpdateTickets[activityID] = ticket'))
      .toBeLessThan(enqueue.indexOf('await update.value'));
    expect(submit.indexOf('let submitted = await updateActivity(')).toBeLessThan(failedSubmissionGuard);
    expect(failedSubmissionGuard).toBeGreaterThanOrEqual(0);
    expect(readyDelay).toBeGreaterThan(failedSubmissionGuard);
    expect(submit.slice(failedSubmissionGuard, readyDelay)).toContain('return');
    expect(activityUpdate).toContain('await activity.update(ActivityContent(state: state, staleDate: nil))');
    expect(readyRestore).toContain('requestGenerationByActivity[activityID] == generation');
    expect(readyRestore).toContain('await enqueueActivityStatusSequence(');
    expect(readyRestore).toContain('statuses: [.ready]');
    expect(quickSaveIntent).toContain('delivery_confirmation=unavailable');
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
    expect(savedContentProvider).toContain('home.catalog.refresh_failed');
    expect(savedContentProvider).toContain('home.catalog.initialize_failed');
    expect(savedContentProvider).toContain('home.catalog.refresh_after_delete_failed');
    expect(savedContentProvider).not.toMatch(/console\.warn\([^\n]*(?:error|clipboard|url|path)/i);
    expect(savedContentProvider).toContain('refreshPromiseRef.current');
    expect(clipboardOffer).toContain('clipboard_offer.marker_persistence_failed');
    expect(clipboardOffer).not.toMatch(/console\.warn\([^\n]*(?:clipboardText|url|path)/i);
  });

  test('restores the tokenized composer as the island fallback while expanded regions link to Home', () => {
    const compactLeading = activityLayout.match(/compactLeading: \(([\s\S]*?)\n\s*\),\n\s*minimal:/)?.[1] ?? '';
    const minimal = activityLayout.match(/minimal: \(([\s\S]*?)\n\s*\),\n\s*expandedLeading:/)?.[1] ?? '';
    const expandedTrailing = activityLayout.match(/expandedTrailing: \(([\s\S]*?)\n\s*\),\n\s*\};/)?.[1] ?? '';

    expect(compactLeading).not.toContain('<Link');
    expect(minimal).not.toContain('<Link');
    expect(activityLayout).toContain('<Link destination={props.expandedHomeUrl}');
    expect(expandedTrailing).toContain('target="saveapp.quickSave"');
    expect(activityManager).toContain('start: (props: SaveLinkActivityProps, url?: string)');
    expect(activityManager).toContain("Linking.createURL('/',");
    expect(activityManager).toContain("Linking.createURL('/links/compose'");
    expect(activityManager).toContain("quickSaveStatus: 'ready'");
    expect(activityManager).toContain('showRecentQuickSaveLinks,');
    expect(expoWidgetsActivity).toContain('return island.widgetURL(url)');
    expect(expoWidgetsActivity).toContain('Only apply widgetURL when the activity has one');
  });

  test('uses only allowlisted OSLog event codes and keeps diagnostics free of sensitive payloads', () => {
    const declaredEventBlock = clipboardModule.match(/SAVEAPP_DIAGNOSTIC_EVENTS\s*=\s*\[([\s\S]*?)\] as const/)?.[1] ?? '';
    const nativeAllowedEventBlock = clipboardNative.match(/allowedEvents:\s*Set<String>\s*=\s*\[([\s\S]*?)\n\s*\]/)?.[1] ?? '';
    const declaredEvents = [...declaredEventBlock.matchAll(/'([a-z][a-z_.]+)'/g)].map((match) => match[1]);
    const nativeAllowedEvents = [...nativeAllowedEventBlock.matchAll(/"([a-z][a-z_.]+)"/g)].map((match) => match[1]);

    expect(declaredEvents.length).toBeGreaterThan(40);
    expect(new Set(declaredEvents).size).toBe(declaredEvents.length);
    expect(new Set(nativeAllowedEvents)).toEqual(new Set(declaredEvents));
    expect(clipboardModule).toContain('recordSaveAppDiagnosticEvent(event: SaveAppDiagnosticEvent)');
    expect(clipboardNative).toContain('guard SaveAppClipboardDiagnostics.allowedEvents.contains(event) else { return }');
    expect(clipboardNative).toContain('Logger(subsystem: "com.luanrigatti.saveapp", category: "diagnostics")');
    expect(clipboardNative).toContain('SaveAppClipboardDiagnostics.logger.notice("event=\\(event, privacy: .public)")');
    expect(clipboardNative).not.toMatch(/\.logger\.info\(/);
    expect(quickSaveIntent).not.toMatch(/\.logger\.info\(/);
    expect(quickSaveSQLite).not.toMatch(/\.logger\.info\(/);
    expect(quickSaveButton).not.toMatch(/diagnosticLogger\.info\(/);
    expect(clipboardNative).not.toMatch(/logger\.(?:info|notice|error)\([^\n]*(?:pasteboard\.(?:string|url)|clipboardText|normalizedURL|token|activityID)/i);
    expect(quickSaveIntent).not.toMatch(/logger\.(?:info|notice|error)\([^\n]*(?:clipboard\.value|normalized\.url|link\.url|\\\(activityID,\s*privacy:\s*\.public)/i);
    expect(quickSaveSQLite).not.toMatch(/logger\.(?:info|notice|error)\([^\n]*(?:normalizedURL|link\.url|databaseURL\.path)/i);
  });

  test('traces clipboard sources, Home reads, filters, and tokenized composer without recording content', () => {
    expect(expoSQLiteModule).toContain('appContext?.config.documentDirectory?.appendingPathComponent("SQLite").standardized.path');
    expect(quickSaveSQLite).toContain('appendingPathComponent("SQLite", isDirectory: true)');
    expect(quickSaveSQLite).toContain('appendingPathComponent(databaseName, isDirectory: false)');
    expect(savedContentLibrary).toContain('home.catalog.query_started');
    expect(savedContentLibrary).toContain('home.catalog.query_completed_links_present');
    expect(savedContentLibrary).toContain('home.catalog.query_completed_links_absent');
    expect(savedContentLibrary).toContain('home.catalog.query_failed');
    expect(savedContentLibrary).toContain('deleted_at IS NULL ORDER BY created_at DESC, id DESC');
    expect(savedContentProvider).toContain('home.catalog.initialize_started');
    expect(savedContentProvider).toContain('home.catalog.refresh_from_home_focus');
    expect(savedContentProvider).toContain('home.catalog.app_foreground');
    expect(homeScreen).toContain('navigation.home.expanded_deep_link_received');
    expect(homeScreen).toContain('home.filter.favorites');
    expect(homeScreen).toContain('home.filter.folder');
    expect(homeGallery).toContain('home.filter.category');
    expect(homeScreen).toContain('home.filter.all');
    expect(homeGallery).toContain('home.gallery.links_visible');
    expect(homeGallery).toContain('home.gallery.links_filtered_out');
    expect(homeGallery).toContain('home.gallery.no_links_in_catalog');
    expect(homeGallery).toContain('home.gallery.content_hidden');
    expect(composerRoute).toContain('navigation.composer.token_present');
    expect(composerRoute).toContain('navigation.composer.token_valid');
    expect(composerRoute).toContain('navigation.composer.token_invalid');
    expect(composerRoute).toContain('navigation.composer.candidate_valid');
    expect(composerRoute).not.toMatch(/recordSaveAppDiagnosticEvent\([^\n]*(?:activityToken|clipboardText|normalizedURL)/i);
    expect(homeGallery).not.toMatch(/recordSaveAppDiagnosticEvent\([^\n]*(?:item\.id|folder\.id|searchQuery)/i);
  });

  test('mirrors the config plugin and exact local native sources without broadening module paths', () => {
    const requiredPaths = [
      'plugins/withSaveLinkQuickSave.js',
      'modules/dynamic-island-quick-save/ios/expo_widgets_quick_save.rb',
      'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveIntent.swift',
      'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveAppIntentsPackage.swift',
      'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveLiveActivityButton.swift',
      'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveSQLite.swift',
      'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveQueue.swift',
    ];
    for (const file of requiredPaths) {
      expect(mirrorSecurity).toContain(`'${file}'`);
      expect(mirrorSnapshot).toContain(`'${file}'`);
    }
    expect(mirrorSnapshot).toContain("'src/features/dynamic-island/quickSaveQueue.ts'");
    expect(mirrorSnapshot).toContain("'src/features/dynamic-island/quickSaveQueueImportPipeline.ts'");
    expect(mirrorSnapshot).toContain("'src/features/dynamic-island/quickSaveLockScreenHistory.ts'");
    expect(mirrorSnapshot).toContain("'src/features/home-content/quickSaveLinkPreviewEnrichment.ts'");
    expect(mirrorSnapshot).toContain("'src/features/home-content/quickSavePreviewEnrichmentSchemaMigration.ts'");
    expect(mirrorSecurity).toContain("'src/features/dynamic-island/quickSaveQueue.ts'");
    expect(mirrorSecurity).toContain("'src/features/dynamic-island/quickSaveQueueImportPipeline.ts'");
    expect(mirrorSecurity).toContain("'src/features/dynamic-island/quickSaveLockScreenHistory.ts'");
    expect(mirrorSecurity).toContain("'src/features/home-content/quickSaveLinkPreviewEnrichment.ts'");
    expect(mirrorSecurity).toContain("'src/features/home-content/quickSavePreviewEnrichmentSchemaMigration.ts'");
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
