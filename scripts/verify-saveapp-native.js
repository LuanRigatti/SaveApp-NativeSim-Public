'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const prohibitedDependencies = [
  'firebase',
  '@react-native-google-signin/google-signin',
  'expo-auth-session',
  'expo-location',
  'expo-maps',
];

const expectedVersions = {
  '@expo/ui': '~58.0.25',
  expo: '~58.0.21',
  'expo-asset': '~58.0.19',
  'expo-constants': '~58.0.14',
  'expo-crypto': '~58.0.7',
  'expo-dev-client': '~58.0.17',
  'expo-file-system': '~58.0.13',
  'expo-font': '~58.0.11',
  'expo-image': '~58.0.18',
  'expo-image-manipulator': '~58.0.16',
  'expo-linking': '~58.0.15',
  'expo-media-library': '~58.0.13',
  'expo-router': '~58.0.28',
  'expo-splash-screen': '~58.0.12',
  'expo-video': '~58.0.13',
  'expo-widgets': '~58.0.25',
  'react-native-screens': '4.30.0',
  'react-native': '0.88.1',
  'jest-expo': '~58.0.13',
};

function fail(message) {
  console.error('SaveApp native verification failed: ' + message);
  process.exitCode = 1;
}

for (const name of prohibitedDependencies) {
  if (pkg.dependencies?.[name] || pkg.devDependencies?.[name]) {
    fail('prohibited app-specific dependency is present: ' + name);
  }
}

for (const [name, version] of Object.entries(expectedVersions)) {
  const declaredVersion = name === 'jest-expo'
    ? pkg.devDependencies?.[name]
    : pkg.dependencies?.[name];
  if (declaredVersion !== version) {
    fail(name + ' must remain pinned to ' + version);
  }
}

if (pkg.name !== 'saveapp') fail('package.json must identify the independent SaveApp package');

const checks = [
  ['src/app/(tabs)/_layout.tsx', 'expo-router/native-tabs'],
  ['plugins/withStarterToolbarSync.js', 'StarterToolbarMorphExperimentVariant'],
  ['plugins/withSaveLinkQuickSave.js', 'saveapp_configure_expo_widgets_quick_save'],
  ['scripts/patch-expo-ui-bottom-sheet.js', 'ignoresSafeArea(.container, edges: .bottom)'],
  ['scripts/patch-expo-ui-bottom-sheet.js', "EXPECTED_UI_VERSION = '58.0.25'"],
  ['.github/workflows/swift-preflight.yml', 'CODE_SIGNING_ALLOWED=NO'],
  ['.github/workflows/native-sim.yml', 'native-sim-template-version: 20'],
];

for (const [relativePath, marker] of checks) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath) || !fs.readFileSync(filePath, 'utf8').includes(marker)) {
    fail('missing expected native contract: ' + relativePath);
  }
}

const richNoteToolbarNativePath = path.join(
  root,
  'modules',
  'rich-note-keyboard-toolbar',
  'ios',
  'SaveAppRichNoteKeyboardToolbarModule.swift',
);
const richNoteToolbarNativeSource = fs.existsSync(richNoteToolbarNativePath)
  ? fs.readFileSync(richNoteToolbarNativePath, 'utf8')
  : '';
const richNoteToolbarComponentPath = path.join(root, 'src/components/homeContent/RichNoteKeyboardToolbar.ios.tsx');
const richNoteToolbarComponentSource = fs.existsSync(richNoteToolbarComponentPath)
  ? fs.readFileSync(richNoteToolbarComponentPath, 'utf8')
  : '';
const richNoteEditorPath = path.join(root, 'src/components/homeContent/RichNoteEditor.tsx');
const richNoteEditorSource = fs.existsSync(richNoteEditorPath)
  ? fs.readFileSync(richNoteEditorPath, 'utf8')
  : '';
const richNoteToolbarMarkers = [
  'parentView.keyboardLayoutGuide',
  'followsUndockedKeyboard = true',
  'keyboardLayoutGuide.topAnchor',
  'ViewName("Dock")',
  'UIHostingController<RichNoteKeyboardToolbarContent>',
  'Events("onAction")',
  'Menu {',
  'glassEffect(.regular.interactive(), in: Capsule())',
  '.fill(.regularMaterial)',
];
const keyboardObserverBlock = richNoteToolbarNativeSource.match(
  /private func observeKeyboard\(\) \{([\s\S]*?)\n  \}/,
)?.[1] ?? '';
const keyboardNotificationsAreIndicatorOnly =
  keyboardObserverBlock.includes('keyboardWillShowNotification') &&
  keyboardObserverBlock.includes('model.keyboardVisible = true') &&
  keyboardObserverBlock.includes('keyboardWillHideNotification') &&
  keyboardObserverBlock.includes('model.keyboardVisible = false') &&
  !/layoutIfNeeded|setNeedsLayout|NSLayoutConstraint|\.constant\s*=|\.frame\s*=/.test(keyboardObserverBlock) &&
  !/keyboardDidShow|keyboardDidHide/.test(richNoteToolbarNativeSource) &&
  [...richNoteToolbarNativeSource.matchAll(/keyboardWill(?:Show|Hide)Notification/g)].length === 2;
if (
  !richNoteToolbarNativeSource ||
  richNoteToolbarMarkers.some((marker) => !richNoteToolbarNativeSource.includes(marker)) ||
  /\bName\("Dock"\)|usesBottomSafeArea\s*=/.test(richNoteToolbarNativeSource) ||
  !keyboardNotificationsAreIndicatorOnly ||
  !richNoteToolbarComponentSource.includes('requireOptionalNativeModule') ||
  !richNoteToolbarComponentSource.includes('ViewPrototypes?.[`${moduleName}_Dock`]') ||
  !richNoteToolbarComponentSource.includes("requireNativeViewManager<NativeToolbarProps>(moduleName, 'Dock')") ||
  /InputAccessoryView|inputAccessoryViewID|ACCESSORY_ID|KeyboardAvoidingView/.test(richNoteEditorSource)
) {
  fail('rich-note toolbar must use the stable UIKit keyboard guide, a persistent native SwiftUI host, optional Expo module availability, and native menu controls without accessory/KAV or JS keyboard-event positioning');
}

const nativeSimWorkflowPath = path.join(root, '.github/workflows/native-sim.yml');
if (fs.existsSync(nativeSimWorkflowPath)) {
  const nativeSimWorkflow = fs.readFileSync(nativeSimWorkflowPath, 'utf8');
  const buildStep = nativeSimWorkflow.match(
    /- name: Build ad hoc signed Simulator app[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? '';
  const requiredSimulatorSigningMarkers = [
    'APP_XCODE_PROJECT="$PWD/ios/SaveApp.xcodeproj"',
    '-project "$APP_XCODE_PROJECT"',
    '-target SaveApp',
    '-target ExpoWidgetsTarget',
    '-sdk iphonesimulator',
    'CODE_SIGNING_ALLOWED=YES',
    'CODE_SIGNING_REQUIRED=YES',
    'CODE_SIGN_IDENTITY=-',
    '-showBuildSettings',
    '-json',
    'saveapp-simulator-app-build-settings.json',
    'saveapp-simulator-widget-build-settings.json',
    'node scripts/verify-saveapp-simulator-build-settings.js',
    'SaveApp/SaveApp.entitlements',
    'ExpoWidgetsTarget/ExpoWidgetsTarget.entitlements',
    'assert_generated_app_group "$APP_ENTITLEMENTS" "SaveApp"',
    'assert_generated_app_group "$WIDGET_ENTITLEMENTS" "ExpoWidgetsTarget"',
    'codesign --force --sign - --entitlements "$WIDGET_ENTITLEMENTS" "$APPEX"',
    'codesign --force --sign - --entitlements "$APP_ENTITLEMENTS" "$APP"',
    "Signature=adhoc",
    'codesign -d --entitlements :-',
    'com.apple.security.application-groups',
    'ExpoWidgetsTarget.appex',
    'NSSupportsLiveActivities',
    'ExpoWidgetsAppGroupIdentifier',
    'verify_app_group_signature "$APP" "SaveApp"',
    'verify_app_group_signature "$APPEX" "ExpoWidgetsTarget"',
  ];
  if (
    !buildStep ||
    buildStep.includes('CODE_SIGNING_ALLOWED=NO') ||
    requiredSimulatorSigningMarkers.some((marker) => !buildStep.includes(marker))
  ) {
    fail('NativeSim must query Release build settings separately for the app and extension, verify generated entitlements, explicitly ad hoc-sign both iOS Simulator bundles, and verify their signed App Group entitlements');
  }
  const widgetResignIndex = buildStep.indexOf(
    'codesign --force --sign - --entitlements "$WIDGET_ENTITLEMENTS" "$APPEX"',
  );
  const appResignIndex = buildStep.indexOf(
    'codesign --force --sign - --entitlements "$APP_ENTITLEMENTS" "$APP"',
  );
  const widgetSignatureCheckIndex = buildStep.indexOf(
    'verify_app_group_signature "$APPEX" "ExpoWidgetsTarget"',
  );
  const appSignatureCheckIndex = buildStep.indexOf(
    'verify_app_group_signature "$APP" "SaveApp"',
  );
  if (
    widgetResignIndex < 0 ||
    appResignIndex <= widgetResignIndex ||
    widgetSignatureCheckIndex <= appResignIndex ||
    appSignatureCheckIndex <= appResignIndex ||
    buildStep.includes('codesign --deep')
  ) {
    fail('NativeSim must sign the extension before the app, verify both signed bundles, and preserve nested component signatures');
  }
}

const simulatorBuildSettingsVerifierPath = path.join(
  root,
  'scripts',
  'verify-saveapp-simulator-build-settings.js',
);
if (!fs.existsSync(simulatorBuildSettingsVerifierPath)) {
  fail('target-specific Simulator build settings verifier is missing');
} else {
  const simulatorBuildSettingsVerifier = fs.readFileSync(simulatorBuildSettingsVerifierPath, 'utf8');
  const requiredBuildSettingsVerifierMarkers = [
    "targetName: 'SaveApp'",
    "targetName: 'ExpoWidgetsTarget'",
    "settings.CONFIGURATION !== 'Release'",
    'settings.CODE_SIGN_ENTITLEMENTS',
    'settings.SRCROOT',
    'settings.PROJECT_DIR',
    'SaveApp/SaveApp.entitlements',
    'ExpoWidgetsTarget/ExpoWidgetsTarget.entitlements',
    'targetEntries.length !== 1',
  ];
  if (requiredBuildSettingsVerifierMarkers.some((marker) => !simulatorBuildSettingsVerifier.includes(marker))) {
    fail('target-specific Simulator verifier must require Release settings and each generated entitlement path');
  }
}

const mirrorSecurityPath = path.join(root, 'scripts', 'SaveAppMirrorSecurity.psm1');
const mirrorScriptPath = path.join(root, 'scripts', 'mirror-saveapp.ps1');
const snapshotGatePath = path.join(root, 'scripts', 'Test-SaveAppMirrorSnapshot.ps1');
if (!fs.existsSync(mirrorSecurityPath) || !fs.existsSync(mirrorScriptPath) || !fs.existsSync(snapshotGatePath)) {
  fail('the shared mirror allowlist, publisher, or local snapshot gate is missing');
} else {
  const mirrorSecuritySource = fs.readFileSync(mirrorSecurityPath, 'utf8');
  const mirrorScriptSource = fs.readFileSync(mirrorScriptPath, 'utf8');
  const snapshotGateSource = fs.readFileSync(snapshotGatePath, 'utf8');
  const requiredMirrorDependencies = [
    "'.github/native-sim/oslog-capture.sh'",
    "'scripts/verify-saveapp-simulator-build-settings.js'",
    "'scripts/Test-SaveAppMirrorSnapshot.ps1'",
    "'scripts/SaveAppMirrorSecurity.psm1'",
    "'modules/document-thumbnailing/ios/SaveAppDocumentThumbnailing.podspec'",
    "'modules/clipboard-url-detection/ios/SaveAppClipboardURLDetection.podspec'",
    "'modules/rich-note-keyboard-toolbar/ios/SaveAppRichNoteKeyboardToolbar.podspec'",
    "'modules/rich-note-keyboard-toolbar/ios/SaveAppRichNoteKeyboardToolbarModule.swift'",
    "'plugins/withSaveLinkQuickSave.js'",
    "'modules/dynamic-island-quick-save/ios/expo_widgets_quick_save.rb'",
    "'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveIntent.swift'",
    "'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveLiveActivityButton.swift'",
    "'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveSQLite.swift'",
    "'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveQueue.swift'",
    "'src/features/dynamic-island/quickSaveQueue.ts'",
    "'src/features/dynamic-island/quickSaveQueueImportPipeline.ts'",
  ];
  if (requiredMirrorDependencies.some((marker) => !mirrorSecuritySource.includes(marker))) {
    fail('the exact mirror allowlist omits a required NativeSim helper or local module dependency');
  }
  if (
    mirrorSecuritySource.includes("$allowedDirectories = @('scripts'") ||
    mirrorSecuritySource.includes("$allowedDirectories = @('modules'")
  ) {
    fail('the mirror allowlist must not recursively include sensitive scripts or modules directories');
  }
  const snapshotGateIndex = mirrorScriptSource.indexOf('Test-SaveAppMirrorSnapshot.ps1');
  const publicCopyIndex = mirrorScriptSource.indexOf(
    'Copy-SaveAppMirrorFile -SourceRoot $sourceRoot -MirrorRoot $destinationRoot',
  );
  const publicStageIndex = mirrorScriptSource.indexOf('git -C $destinationRoot add');
  const publicPushIndex = mirrorScriptSource.indexOf('push --set-upstream origin main');
  if (
    !snapshotGateSource.includes('Required mirror dependency is absent') ||
    snapshotGateIndex < 0 ||
    publicCopyIndex <= snapshotGateIndex ||
    publicStageIndex <= snapshotGateIndex ||
    publicPushIndex <= snapshotGateIndex
  ) {
    fail('the complete isolated mirror snapshot gate must run before public copy, staging, or push');
  }
}

const saveAppOSLogCapturePath = path.join(root, '.github', 'native-sim', 'oslog-capture.sh');
if (!fs.existsSync(saveAppOSLogCapturePath)) {
  fail('the exact SaveApp OSLog capture helper is missing from the NativeSim snapshot');
} else {
  const captureHelperSource = fs.readFileSync(saveAppOSLogCapturePath, 'utf8');
  const captureMarkers = [
    'saveapp_capture_preflight()',
    'saveapp_capture_start()',
    'saveapp_capture_stop_stream()',
    'saveapp_capture_finish()',
    'subsystem BEGINSWITH "com.luanrigatti.saveapp"',
    'age -r "$SAVEAPP_LOG_AGE_RECIPIENT"',
    'ciphertext_sha256',
    'artifact_ready=true',
  ];
  if (captureMarkers.some((marker) => !captureHelperSource.includes(marker)) ||
      captureHelperSource.includes('echo "$SAVEAPP_LOG_AGE_RECIPIENT"') ||
      captureHelperSource.includes('cat "$SAVEAPP_CAPTURE_RAW"')) {
    fail('SaveApp OSLog capture must remain subsystem-scoped, encrypted, and free of plaintext log output');
  }
}

const autolinkingCli = path.join(
  root,
  'node_modules',
  'expo-modules-autolinking',
  'bin',
  'expo-modules-autolinking.js',
);
if (!fs.existsSync(autolinkingCli)) {
  fail('Expo SDK 58 autolinking CLI is missing; install the locked project dependencies first');
} else {
  const autolinkingResult = spawnSync(
    process.execPath,
    [autolinkingCli, 'resolve', '--platform', 'ios', '--json'],
    { cwd: root, encoding: 'utf8', windowsHide: true },
  );
  if (autolinkingResult.error || autolinkingResult.status !== 0) {
    fail(
      'Expo SDK 58 iOS autolinking failed: ' +
        (autolinkingResult.error?.message || autolinkingResult.stderr?.trim() || 'unknown CLI error'),
    );
  } else {
    try {
      const resolution = JSON.parse(autolinkingResult.stdout);
      const thumbnailModule = resolution.modules?.find(
        (module) => module.packageName === 'saveapp-document-thumbnailing',
      );
      const thumbnailPod = thumbnailModule?.pods?.find(
        (pod) => pod.podName === 'SaveAppDocumentThumbnailing',
      );
      const expectedPodspecDirectory = path.resolve(root, 'modules/document-thumbnailing/ios');
      if (
        !thumbnailPod ||
        path.resolve(thumbnailPod.podspecDir) !== expectedPodspecDirectory ||
        !thumbnailModule.swiftModuleNames?.includes('SaveAppDocumentThumbnailing') ||
        !thumbnailModule.modules?.some(
          (module) => module.class === 'SaveAppDocumentThumbnailingModule',
        )
      ) {
        fail('Expo SDK 58 did not resolve the local SaveApp Quick Look pod and Swift module');
      }

      const clipboardDetectionModule = resolution.modules?.find(
        (module) => module.packageName === 'saveapp-clipboard-url-detection',
      );
      const clipboardDetectionPod = clipboardDetectionModule?.pods?.find(
        (pod) => pod.podName === 'SaveAppClipboardURLDetection',
      );
      const expectedClipboardPodspecDirectory = path.resolve(root, 'modules/clipboard-url-detection/ios');
      if (
        !clipboardDetectionPod ||
        path.resolve(clipboardDetectionPod.podspecDir) !== expectedClipboardPodspecDirectory ||
        !clipboardDetectionModule.swiftModuleNames?.includes('SaveAppClipboardURLDetection') ||
        !clipboardDetectionModule.modules?.some(
          (module) => module.class === 'SaveAppClipboardURLDetectionModule',
        )
      ) {
        fail('Expo SDK 58 did not resolve the local privacy-preserving clipboard URL detector');
      }

      const richNoteToolbarModule = resolution.modules?.find(
        (module) => module.packageName === 'saveapp-rich-note-keyboard-toolbar',
      );
      const richNoteToolbarPod = richNoteToolbarModule?.pods?.find(
        (pod) => pod.podName === 'SaveAppRichNoteKeyboardToolbar',
      );
      const expectedRichNoteToolbarPodspecDirectory = path.resolve(root, 'modules/rich-note-keyboard-toolbar/ios');
      if (
        !richNoteToolbarPod ||
        path.resolve(richNoteToolbarPod.podspecDir) !== expectedRichNoteToolbarPodspecDirectory ||
        !richNoteToolbarModule.swiftModuleNames?.includes('SaveAppRichNoteKeyboardToolbar') ||
        !richNoteToolbarModule.modules?.some(
          (module) => module.class === 'SaveAppRichNoteKeyboardToolbarModule',
        )
      ) {
        fail('Expo SDK 58 did not resolve the native rich-note keyboard toolbar module');
      }

      const widgetsModule = resolution.modules?.find(
        (module) => module.packageName === 'expo-widgets',
      );
      const widgetsPod = widgetsModule?.pods?.find((pod) => pod.podName === 'ExpoWidgets');
      if (
        !widgetsPod ||
        !widgetsModule.swiftModuleNames?.includes('ExpoWidgets') ||
        widgetsModule.packageVersion !== '~58.0.25' && widgetsModule.packageVersion !== '58.0.25'
      ) {
        fail('Expo SDK 58 did not resolve the pinned ExpoWidgets native module');
      }
    } catch (error) {
      fail('Expo SDK 58 iOS autolinking returned invalid JSON: ' + error.message);
    }
  }
}

const clipboardDetectorPath = path.join(
  root,
  'modules',
  'clipboard-url-detection',
  'ios',
  'SaveAppClipboardURLDetectionModule.swift',
);
if (fs.existsSync(clipboardDetectorPath)) {
  const clipboardDetectorSource = fs.readFileSync(clipboardDetectorPath, 'utf8');
  if (
    !clipboardDetectorSource.includes('detectedPatterns(for: [probableWebURL])') ||
    !clipboardDetectorSource.includes('pasteboard.changeCount') ||
    /(?:UIPasteboard\.general|pasteboard)\.(?:string|url|urls|items|itemProviders|detectedValues)\b/.test(clipboardDetectorSource)
  ) {
    fail('clipboard detector must use pattern/change-count metadata without reading pasteboard values');
  }
} else {
  fail('missing local clipboard URL detector source');
}

const appConfigPath = path.join(root, 'app.config.js');
const previousProjectId = process.env.SAVEAPP_EAS_PROJECT_ID;
let resolvedAppConfig;
try {
  delete process.env.SAVEAPP_EAS_PROJECT_ID;
  delete require.cache[require.resolve(appConfigPath)];
  resolvedAppConfig = require(appConfigPath).expo;
} catch (error) {
  fail('app.config.js could not be resolved: ' + error.message);
} finally {
  if (previousProjectId !== undefined) process.env.SAVEAPP_EAS_PROJECT_ID = previousProjectId;
}

if (resolvedAppConfig) {
  if (
    resolvedAppConfig.name !== 'SaveApp' ||
    resolvedAppConfig.slug !== 'saveapp' ||
    resolvedAppConfig.scheme !== 'saveapp' ||
    resolvedAppConfig.ios?.bundleIdentifier !== 'com.luanrigatti.saveapp' ||
    resolvedAppConfig.android?.package !== 'com.luanrigatti.saveapp'
  ) {
    fail('app.config.js must use the coordinated SaveApp identity');
  }
  if (resolvedAppConfig.extra?.eas?.projectId) {
    fail('app.config.js must remain unlinked until a SaveApp-owned EAS project is explicitly configured');
  }
  if (resolvedAppConfig.extra?.saveAppDemo !== true) {
    fail('app.config.js must identify the UI demonstration app');
  }

  const widgetsPlugin = resolvedAppConfig.plugins?.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-widgets',
  );
  if (!resolvedAppConfig.plugins?.includes('./plugins/withSaveLinkQuickSave')) {
    fail('app.config.js must register the prebuild-persistent ExpoWidgets quick-save renderer plugin');
  }
  const widgetsOptions = widgetsPlugin?.[1];
  if (
    !widgetsOptions ||
    widgetsOptions.groupIdentifier !== 'group.com.luanrigatti.saveapp' ||
    widgetsOptions.enablePushNotifications !== false ||
    widgetsOptions.frequentUpdates !== false ||
    widgetsOptions.widgets?.length
  ) {
    fail('expo-widgets must use the SaveApp App Group without APNs, frequent updates, or unrelated widgets');
  }
}

const quickSaveNativeSources = [
  'modules/dynamic-island-quick-save/ios/expo_widgets_quick_save.rb',
  'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveIntent.swift',
  'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveLiveActivityButton.swift',
  'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveSQLite.swift',
  'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveQueue.swift',
];
for (const relativePath of quickSaveNativeSources) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    fail('missing prebuild-persistent Dynamic Island quick-save source: ' + relativePath);
  }
}
const quickSaveIntentSource = fs.readFileSync(path.join(root, quickSaveNativeSources[1]), 'utf8');
const quickSaveButtonSource = fs.readFileSync(path.join(root, quickSaveNativeSources[2]), 'utf8');
const quickSaveQueueSource = fs.readFileSync(path.join(root, quickSaveNativeSources[4]), 'utf8');
const quickSaveQueueImportPath = path.join(root, 'src/features/dynamic-island/quickSaveQueue.ts');
const quickSaveQueueImportSource = fs.existsSync(quickSaveQueueImportPath)
  ? fs.readFileSync(quickSaveQueueImportPath, 'utf8')
  : '';
const quickSaveQueuePipelinePath = path.join(root, 'src/features/dynamic-island/quickSaveQueueImportPipeline.ts');
const quickSaveQueuePipelineSource = fs.existsSync(quickSaveQueuePipelinePath)
  ? fs.readFileSync(quickSaveQueuePipelinePath, 'utf8')
  : '';
const quickSavePodHelperSource = fs.readFileSync(path.join(root, quickSaveNativeSources[0]), 'utf8');
const quickSaveXcodeprojTestPath = path.join(root, 'tests/quick-save-xcodeproj-contract.rb');
const quickSaveAppIntentsPackagePath = path.join(root, 'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveAppIntentsPackage.swift');
const quickSaveAppIntentsPackageSource = fs.existsSync(quickSaveAppIntentsPackagePath)
  ? fs.readFileSync(quickSaveAppIntentsPackagePath, 'utf8')
  : '';
const quickSaveAppIntentsVerifierPath = path.join(root, 'scripts/verify-saveapp-quick-save-app-intents.js');
const widgetsRendererPath = path.join(root, 'node_modules/expo-widgets/ios/Widgets/ViewRenderer.swift');
const widgetsLiveActivityPath = path.join(root, 'node_modules/expo-widgets/ios/Widgets/WidgetLiveActivity.swift');
if (!fs.existsSync(widgetsRendererPath) || !fs.existsSync(widgetsLiveActivityPath) || !fs.existsSync(quickSaveXcodeprojTestPath) || !fs.existsSync(quickSaveAppIntentsVerifierPath)) {
  fail('the installed expo-widgets renderer, Xcodeproj regression contract, or app-intents target verifier is unavailable for quick-save validation');
}
const widgetsRendererSource = fs.readFileSync(widgetsRendererPath, 'utf8');
const widgetsLiveActivitySource = fs.readFileSync(widgetsLiveActivityPath, 'utf8');
if (
  !quickSaveIntentSource.includes('LiveActivityIntent') ||
  !quickSaveIntentSource.includes('public struct ExpoWidgetsQuickSaveAppIntentsPackage: AppIntentsPackage') ||
  !quickSaveAppIntentsPackageSource.includes('struct SaveAppQuickSaveAppIntentsPackage: AppIntentsPackage') ||
  !quickSaveAppIntentsPackageSource.includes('ExpoWidgetsQuickSaveAppIntentsPackage.self') ||
  !quickSaveAppIntentsPackageSource.includes('import ExpoWidgets') ||
  !quickSaveIntentSource.includes('UIPasteboard.general') ||
  !quickSaveIntentSource.includes('SaveAppQuickSaveQueue.enqueue(normalized)') ||
  quickSaveIntentSource.includes('SaveLinkQuickSaveSQLite.insertOrFindExisting') ||
  !quickSaveButtonSource.includes('props.target == saveAppQuickSaveTarget') ||
  !quickSaveButtonSource.includes('SaveLinkQuickSaveIntent(activityID: props.source)') ||
  !widgetsRendererSource.includes('buttonProps.source = name') ||
  !widgetsLiveActivitySource.includes('WidgetsDynamicView(name: context.activityID') ||
  !quickSaveQueueSource.includes('FileManager.default.containerURL') ||
  !quickSaveQueueSource.includes('forSecurityApplicationGroupIdentifier: appGroupIdentifier') ||
  !quickSaveQueueSource.includes('Darwin.rename(') ||
  !quickSaveQueueSource.includes('fsync(descriptor)') ||
  !quickSaveQueueSource.includes('flock(descriptor, LOCK_EX)') ||
  !quickSaveQueueSource.includes('completeUntilFirstUserAuthentication') ||
  quickSaveQueueSource.includes('saveapp-photos.db') ||
  !quickSaveQueueImportSource.includes('Paths.appleSharedContainers[APP_GROUP_IDENTIFIER]') ||
  !quickSaveQueueImportSource.includes('importQueuedQuickSaveLink') ||
  !quickSaveQueuePipelineSource.includes('await adapter.acknowledge(entry)') ||
  !quickSaveQueuePipelineSource.includes("adapter.record('commit_confirmed')") ||
  !quickSaveQueuePipelineSource.includes("adapter.record('duplicate_confirmed')") ||
  !quickSavePodHelperSource.includes('project.native_targets.select') ||
  !quickSavePodHelperSource.includes('PBXSourcesBuildPhase') ||
  !quickSavePodHelperSource.includes('file_ref.real_path') ||
  !quickSavePodHelperSource.includes('phase.remove_build_file(build_file)')
) {
  fail('quick-save contract must validate the SDK 58 Live Activity route, real native compile target, canonical Xcode paths, renderer replacement, and durable App Group queue');
}

const appConfigSource = fs.readFileSync(appConfigPath, 'utf8');
const staleEasVariable = 'STARTER_' + 'EAS_PROJECT_ID';
const staleBundleIdentifier = 'com.luanrigatti.' + 'starter';
if (appConfigSource.includes(staleEasVariable) || appConfigSource.toLowerCase().includes(staleBundleIdentifier)) {
  fail('app.config.js contains a stale project identity');
}
if (/firebase|google-signin/i.test(appConfigSource)) {
  fail('app.config.js contains a removed service');
}

if (!process.exitCode) {
  console.log('Expo SDK 58 autolinks SaveApp native modules, including the rich-note keyboard toolbar and ExpoWidgets.');
  console.log('SaveApp identity and native contracts are present.');
}
