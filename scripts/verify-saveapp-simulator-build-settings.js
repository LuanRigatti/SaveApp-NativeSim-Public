'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TARGET_QUERIES = [
  {
    targetName: 'SaveApp',
    expectedRelativePath: 'SaveApp/SaveApp.entitlements',
  },
  {
    targetName: 'ExpoWidgetsTarget',
    expectedRelativePath: 'ExpoWidgetsTarget/ExpoWidgetsTarget.entitlements',
  },
];

function readBuildSettings(settingsPath, targetName) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    throw new Error(`Xcode did not return valid JSON build settings for target ${targetName}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Xcode did not return JSON build settings for target ${targetName}`);
  }

  const targetEntries = parsed.filter((entry) => entry?.target === targetName);
  if (targetEntries.length !== 1) {
    throw new Error(
      `Expected one Xcode build settings result for target ${targetName}; received ${targetEntries.length}`,
    );
  }

  return targetEntries[0].buildSettings ?? {};
}

function resolveEntitlementsPath(settings, targetName) {
  let entitlementSetting = settings.CODE_SIGN_ENTITLEMENTS;
  const sourceRoot = settings.SRCROOT;
  const projectDirectory = settings.PROJECT_DIR || sourceRoot;

  if (typeof entitlementSetting !== 'string' || !entitlementSetting.trim()) {
    throw new Error(`${targetName} has no effective CODE_SIGN_ENTITLEMENTS build setting`);
  }
  if (typeof sourceRoot !== 'string' || !sourceRoot.trim()) {
    throw new Error(`Xcode did not report SRCROOT for ${targetName}; cannot verify its entitlements path`);
  }
  if (typeof projectDirectory !== 'string' || !projectDirectory.trim()) {
    throw new Error(`Xcode did not report PROJECT_DIR for ${targetName}; cannot verify its entitlements path`);
  }

  entitlementSetting = entitlementSetting.trim().replace(/^['"]|['"]$/g, '');
  entitlementSetting = entitlementSetting
    .replace(/\$\(SRCROOT\)|\$\{SRCROOT\}/g, sourceRoot)
    .replace(/\$\(PROJECT_DIR\)|\$\{PROJECT_DIR\}/g, projectDirectory);
  if (/\$\([^)]+\)|\$\{[^}]+\}/.test(entitlementSetting)) {
    throw new Error(`${targetName} CODE_SIGN_ENTITLEMENTS contains an unresolved Xcode variable`);
  }

  return path.normalize(
    path.isAbsolute(entitlementSetting)
      ? entitlementSetting
      : path.resolve(sourceRoot, entitlementSetting),
  );
}

function verifySaveAppSimulatorBuildSettings(appSettingsPath, widgetSettingsPath, iosRootArgument) {
  const iosRoot = path.resolve(iosRootArgument);
  const settingsPaths = new Map([
    ['SaveApp', appSettingsPath],
    ['ExpoWidgetsTarget', widgetSettingsPath],
  ]);

  for (const { targetName, expectedRelativePath } of TARGET_QUERIES) {
    const settings = readBuildSettings(settingsPaths.get(targetName), targetName);
    if (settings.CONFIGURATION !== 'Release') {
      throw new Error(`${targetName} build settings were not resolved for Release configuration`);
    }

    const effectivePath = resolveEntitlementsPath(settings, targetName);
    const expectedPath = path.normalize(path.join(iosRoot, expectedRelativePath));
    if (effectivePath !== expectedPath) {
      throw new Error(
        `${targetName} CODE_SIGN_ENTITLEMENTS does not point to its generated App Group entitlements file`,
      );
    }
    if (!fs.existsSync(effectivePath)) {
      throw new Error(`${targetName} effective CODE_SIGN_ENTITLEMENTS file does not exist`);
    }

    console.log(`Verified Release CODE_SIGN_ENTITLEMENTS for ${targetName}: ${expectedRelativePath}`);
  }
}

if (require.main === module) {
  const [appSettingsPath, widgetSettingsPath, iosRoot] = process.argv.slice(2);
  if (!appSettingsPath || !widgetSettingsPath || !iosRoot) {
    console.error(
      'Usage: node scripts/verify-saveapp-simulator-build-settings.js <app-settings.json> <widget-settings.json> <ios-root>',
    );
    process.exit(2);
  }

  try {
    verifySaveAppSimulatorBuildSettings(appSettingsPath, widgetSettingsPath, iosRoot);
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}

module.exports = { verifySaveAppSimulatorBuildSettings };
