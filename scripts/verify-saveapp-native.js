'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const prohibitedDependencies = [
  'firebase',
  '@react-native-google-signin/google-signin',
  'expo-auth-session',
  'expo-location',
  'expo-maps',
  'expo-widgets',
];

const expectedVersions = {
  expo: '~58.0.12',
  'react-native-screens': '4.30.0',
  '@expo/ui': '~58.0.19',
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
  ['.github/workflows/native-sim.yml', 'native-sim-template-version: 18'],
];

for (const [relativePath, marker] of checks) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath) || !fs.readFileSync(filePath, 'utf8').includes(marker)) {
    fail('missing expected native contract: ' + relativePath);
  }
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

console.log('SaveApp identity and native contracts are present.');
