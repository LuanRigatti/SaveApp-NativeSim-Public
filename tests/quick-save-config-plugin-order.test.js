/* global describe, expect, test, afterEach */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { withPlugins } = require('@expo/config-plugins');

const appConfig = require('../app.config.js').expo;
const quickSavePlugin = require('../plugins/withSaveLinkQuickSave');
const widgetsPluginModule = require('../node_modules/expo-widgets/app.plugin');
const widgetsPlugin = widgetsPluginModule.default ?? widgetsPluginModule;
const expoWidgetsPackage = require('../node_modules/expo-widgets/package.json');

const projectRoot = path.resolve(__dirname, '..');
const widgetPluginName = 'expo-widgets';
const quickSavePluginName = './plugins/withSaveLinkQuickSave';
const relevantPluginEntries = appConfig.plugins.filter((entry) => {
  const name = Array.isArray(entry) ? entry[0] : entry;
  return name === widgetPluginName || name === quickSavePluginName;
});
const temporaryRoots = [];

function resolvePluginEntry(entry) {
  const name = Array.isArray(entry) ? entry[0] : entry;
  if (name === widgetPluginName) return [widgetsPlugin, entry[1]];
  if (name === quickSavePluginName) return quickSavePlugin;
  throw new Error(`Unexpected plugin in quick-save composition: ${name}`);
}

function composePlugins(entries = relevantPluginEntries) {
  return withPlugins(
    {
      name: 'SaveApp',
      slug: 'saveapp',
      version: '1.0.0',
      ios: { bundleIdentifier: 'com.luanrigatti.saveapp', deploymentTarget: '16.4' },
      _internal: { projectRoot },
      mods: { ios: {} },
    },
    entries.map(resolvePluginEntry),
  );
}

function createTemporaryProject(podfile) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saveapp-quick-save-config-'));
  temporaryRoots.push(root);
  const iosRoot = path.join(root, 'ios');
  fs.mkdirSync(iosRoot, { recursive: true });
  fs.writeFileSync(path.join(iosRoot, 'Podfile'), podfile, 'utf8');
  return { root, iosRoot, podfilePath: path.join(iosRoot, 'Podfile') };
}

async function runIosDangerousMods(config, project) {
  return config.mods.ios.dangerous({
    ...config,
    modResults: null,
    modRawConfig: config,
    modRequest: {
      projectRoot: project.root,
      projectName: 'SaveApp',
      platformProjectRoot: project.iosRoot,
      platform: 'ios',
      modName: 'dangerous',
      introspect: false,
      ignoreExistingNativeFiles: false,
    },
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('SaveApp Quick Save Expo config plugin composition', () => {
  test('runs the real expo-widgets 58.0.23 Podfile hook before the Quick Save integration', async () => {
    expect(expoWidgetsPackage.version).toBe('58.0.23');
    expect(relevantPluginEntries.map((entry) => Array.isArray(entry) ? entry[0] : entry)).toEqual([
      quickSavePluginName,
      widgetPluginName,
    ]);

    const podfile = [
      "target 'SaveApp' do",
      'end',
      '',
      "target 'UnrelatedNativeTarget' do",
      'end',
      '',
      'post_install do |installer|',
      '  react_native_post_install(installer)',
      'end',
      '',
    ].join('\n');
    const project = createTemporaryProject(podfile);
    const config = composePlugins();

    await runIosDangerousMods(config, project);

    const generated = fs.readFileSync(project.podfilePath, 'utf8');
    const occurrences = (value) => generated.split(value).length - 1;
    const widgetHookIndex = generated.indexOf('expo_widgets_post_install(installer)');
    const quickSaveCallIndex = generated.indexOf('saveapp_configure_expo_widgets_quick_save(installer, File.expand_path(\'..\', __dir__))');

    expect(generated).toContain('target "ExpoWidgetsTarget" do');
    expect(generated).toContain("target 'SaveApp' do");
    expect(generated).toContain("target 'UnrelatedNativeTarget' do\nend");
    expect(occurrences('post_install do |installer|')).toBe(1);
    expect(occurrences('expo_widgets_post_install(installer)')).toBe(1);
    expect(occurrences('saveapp_configure_expo_widgets_quick_save(')).toBe(1);
    expect(occurrences("require_relative '../modules/dynamic-island-quick-save/ios/expo_widgets_quick_save'")).toBe(1);
    expect(quickSaveCallIndex).toBeGreaterThan(widgetHookIndex);
  });

  test('remains idempotent when the composed dangerous mods run again', async () => {
    const project = createTemporaryProject([
      "target 'SaveApp' do",
      'end',
      '',
      'post_install do |installer|',
      '  react_native_post_install(installer)',
      'end',
      '',
    ].join('\n'));
    const config = composePlugins();

    await runIosDangerousMods(config, project);
    const firstPass = fs.readFileSync(project.podfilePath, 'utf8');
    await runIosDangerousMods(config, project);
    const secondPass = fs.readFileSync(project.podfilePath, 'utf8');

    expect(secondPass).toBe(firstPass);
    expect(secondPass.split('post_install do |installer|').length - 1).toBe(1);
    expect(secondPass.split('expo_widgets_post_install(installer)').length - 1).toBe(1);
    expect(secondPass.split('saveapp_configure_expo_widgets_quick_save(').length - 1).toBe(1);
  });

  test('fails closed when the official hook is absent or the helper patch is partial', async () => {
    const noHookProject = createTemporaryProject([
      "target 'SaveApp' do",
      'end',
      '',
      'post_install do |installer|',
      '  react_native_post_install(installer)',
      'end',
      '',
    ].join('\n'));

    await expect(runIosDangerousMods(composePlugins([quickSavePluginName]), noHookProject))
      .rejects.toThrow('requires exactly one expo-widgets post_install hook');

    const partialPatchProject = createTemporaryProject([
      "require_relative '../modules/dynamic-island-quick-save/ios/expo_widgets_quick_save'",
      "target 'SaveApp' do",
      'end',
      '',
      'post_install do |installer|',
      '  saveapp_configure_expo_widgets_quick_save(installer, File.expand_path(\'..\', __dir__))',
      'end',
      '',
    ].join('\n'));

    await expect(runIosDangerousMods(composePlugins([quickSavePluginName]), partialPatchProject))
      .rejects.toThrow('requires exactly one expo-widgets post_install hook');
  });
});
