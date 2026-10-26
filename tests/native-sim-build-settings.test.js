/* global afterEach, describe, expect, test */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifySaveAppSimulatorBuildSettings } = require('../scripts/verify-saveapp-simulator-build-settings');

describe('NativeSim target-specific Xcode build settings', () => {
  let fixtureRoot;

  function writeSettings(filename, target, entitlementPath) {
    const settingsPath = path.join(fixtureRoot, filename);
    fs.writeFileSync(
      settingsPath,
      JSON.stringify([
        {
          target,
          buildSettings: {
            CONFIGURATION: 'Release',
            SRCROOT: path.join(fixtureRoot, 'ios'),
            PROJECT_DIR: path.join(fixtureRoot, 'ios'),
            CODE_SIGN_ENTITLEMENTS: entitlementPath,
          },
        },
      ]),
    );
    return settingsPath;
  }

  function prepareFixture() {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'saveapp-sim-build-settings-'));
    const iosRoot = path.join(fixtureRoot, 'ios');
    fs.mkdirSync(path.join(iosRoot, 'SaveApp'), { recursive: true });
    fs.mkdirSync(path.join(iosRoot, 'ExpoWidgetsTarget'), { recursive: true });
    fs.writeFileSync(path.join(iosRoot, 'SaveApp', 'SaveApp.entitlements'), '<plist/>');
    fs.writeFileSync(path.join(iosRoot, 'ExpoWidgetsTarget', 'ExpoWidgetsTarget.entitlements'), '<plist/>');

    return {
      iosRoot,
      appSettingsPath: writeSettings(
        'app-settings.json',
        'SaveApp',
        '$(SRCROOT)/SaveApp/SaveApp.entitlements',
      ),
      widgetSettingsPath: writeSettings(
        'widget-settings.json',
        'ExpoWidgetsTarget',
        '$(PROJECT_DIR)/ExpoWidgetsTarget/ExpoWidgetsTarget.entitlements',
      ),
    };
  }

  afterEach(() => {
    if (fixtureRoot) fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  test('validates separately queried Release settings for the app and extension in the generated project', () => {
    const fixture = prepareFixture();

    expect(() =>
      verifySaveAppSimulatorBuildSettings(
        fixture.appSettingsPath,
        fixture.widgetSettingsPath,
        fixture.iosRoot,
      ),
    ).not.toThrow();
  });

  test('fails closed when a separate query does not return its requested target', () => {
    const fixture = prepareFixture();
    writeSettings('widget-settings.json', 'SaveApp', '$(SRCROOT)/SaveApp/SaveApp.entitlements');

    expect(() =>
      verifySaveAppSimulatorBuildSettings(
        fixture.appSettingsPath,
        fixture.widgetSettingsPath,
        fixture.iosRoot,
      ),
    ).toThrow('Expected one Xcode build settings result for target ExpoWidgetsTarget; received 0');
  });

  test('fails closed when a target uses another entitlement file', () => {
    const fixture = prepareFixture();
    const widgetSettings = JSON.parse(fs.readFileSync(fixture.widgetSettingsPath, 'utf8'));
    widgetSettings[0].buildSettings.CODE_SIGN_ENTITLEMENTS = 'SomeOther.entitlements';
    fs.writeFileSync(fixture.widgetSettingsPath, JSON.stringify(widgetSettings));

    expect(() =>
      verifySaveAppSimulatorBuildSettings(
        fixture.appSettingsPath,
        fixture.widgetSettingsPath,
        fixture.iosRoot,
      ),
    ).toThrow('ExpoWidgetsTarget CODE_SIGN_ENTITLEMENTS does not point to its generated App Group entitlements file');
  });

  test('fails closed when a target query resolves a non-Release configuration', () => {
    const fixture = prepareFixture();
    const widgetSettings = JSON.parse(fs.readFileSync(fixture.widgetSettingsPath, 'utf8'));
    widgetSettings[0].buildSettings.CONFIGURATION = 'Debug';
    fs.writeFileSync(fixture.widgetSettingsPath, JSON.stringify(widgetSettings));

    expect(() =>
      verifySaveAppSimulatorBuildSettings(
        fixture.appSettingsPath,
        fixture.widgetSettingsPath,
        fixture.iosRoot,
      ),
    ).toThrow('ExpoWidgetsTarget build settings were not resolved for Release configuration');
  });
});
