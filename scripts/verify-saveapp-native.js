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
  expo: '~58.0.19',
  'expo-asset': '~58.0.18',
  'expo-crypto': '~58.0.7',
  'expo-widgets': '~58.0.23',
  'react-native-screens': '4.30.0',
  '@expo/ui': '~58.0.23',
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
  if (pkg.dependencies?.[name] !== version) {
    fail(name + ' must remain pinned to ' + version);
  }
}

if (pkg.name !== 'saveapp') fail('package.json must identify the independent SaveApp package');

const checks = [
  ['src/app/(tabs)/_layout.tsx', 'expo-router/native-tabs'],
  ['plugins/withStarterToolbarSync.js', 'StarterToolbarMorphExperimentVariant'],
  ['scripts/patch-expo-ui-bottom-sheet.js', 'ignoresSafeArea(.container, edges: .bottom)'],
  ['.github/workflows/swift-preflight.yml', 'CODE_SIGNING_ALLOWED=NO'],
  ['.github/workflows/native-sim.yml', 'native-sim-template-version: 20'],
];

for (const [relativePath, marker] of checks) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath) || !fs.readFileSync(filePath, 'utf8').includes(marker)) {
    fail('missing expected native contract: ' + relativePath);
  }
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

      const widgetsModule = resolution.modules?.find(
        (module) => module.packageName === 'expo-widgets',
      );
      const widgetsPod = widgetsModule?.pods?.find((pod) => pod.podName === 'ExpoWidgets');
      if (
        !widgetsPod ||
        !widgetsModule.swiftModuleNames?.includes('ExpoWidgets') ||
        widgetsModule.packageVersion !== '~58.0.23' && widgetsModule.packageVersion !== '58.0.23'
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
    /(?:UIPasteboard\.general\.)?(?:string|url|urls|items|itemProviders|detectedValues)\b/.test(clipboardDetectorSource)
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
  console.log('Expo SDK 58 autolinks SaveApp native modules, including ExpoWidgets.');
  console.log('SaveApp identity and native contracts are present.');
}
