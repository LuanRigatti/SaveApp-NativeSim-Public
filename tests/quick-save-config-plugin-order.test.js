/* global describe, expect, test, afterEach */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { withPlugins } = require('@expo/config-plugins');
const xcode = require('xcode');

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

function createTemporaryXcodeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saveapp-quick-save-app-intents-'));
  temporaryRoots.push(root);
  const iosRoot = path.join(root, 'ios');
  const xcodeProjectPath = path.join(iosRoot, 'SaveApp.xcodeproj');
  const projectFilePath = path.join(xcodeProjectPath, 'project.pbxproj');
  fs.mkdirSync(xcodeProjectPath, { recursive: true });
  const templatePath = path.join(
    projectRoot,
    'node_modules/react-native-screens/ios/RNScreens.xcodeproj/project.pbxproj',
  );
  fs.copyFileSync(templatePath, projectFilePath);

  const sourceRelativePath = quickSavePlugin.APP_INTENTS_PACKAGE_SOURCE;
  const sourcePath = path.join(root, sourceRelativePath);
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.copyFileSync(path.join(projectRoot, sourceRelativePath), sourcePath);

  const project = xcode.project(projectFilePath);
  project.parseSync();
  const targetEntry = Object.entries(project.pbxNativeTargetSection()).find(([key]) => !key.endsWith('_comment'));
  if (!targetEntry) throw new Error('The Xcode project fixture has no native target.');
  targetEntry[1].name = 'SaveApp';
  targetEntry[1].productType = '"com.apple.product-type.application"';

  return { root, iosRoot, projectFilePath, project };
}

async function runAppIntentsXcodeProjectMod(projectFixture) {
  const config = quickSavePlugin.withSaveAppQuickSaveAppIntentsPackage({
    name: 'SaveApp',
    mods: { ios: {} },
  });
  return config.mods.ios.xcodeproj({
    ...config,
    modResults: projectFixture.project,
    modRawConfig: config,
    modRequest: {
      projectRoot: projectFixture.root,
      projectName: 'SaveApp',
      platformProjectRoot: projectFixture.iosRoot,
      platform: 'ios',
      modName: 'xcodeproj',
      introspect: false,
      ignoreExistingNativeFiles: false,
    },
  });
}

function getBuildMembershipCount(project, targetName, sourceRelativePath) {
  const fileReferences = Object.entries(project.pbxFileReferenceSection())
    .filter(([key]) => !key.endsWith('_comment'))
    .filter(([, fileReference]) => fileReference.path?.replace(/^"|"$/g, '') === sourceRelativePath);
  if (fileReferences.length !== 1) return { references: fileReferences.length, memberships: 0 };
  const [fileReferenceUuid] = fileReferences[0];
  const target = Object.entries(project.pbxNativeTargetSection())
    .filter(([key]) => !key.endsWith('_comment'))
    .map(([uuid, value]) => ({ uuid, value }))
    .find(({ value }) => value.name === targetName);
  if (!target) return { references: fileReferences.length, memberships: 0 };
  const buildFiles = project.pbxBuildFileSection();
  const memberships = (target.value.buildPhases ?? []).flatMap(({ value }) => {
    const phase = project.hash.project.objects.PBXSourcesBuildPhase?.[value];
    return (phase?.files ?? []).filter(({ value: buildFileUuid }) =>
      buildFiles[buildFileUuid]?.fileRef === fileReferenceUuid,
    );
  }).length;
  return { references: fileReferences.length, memberships };
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
  test('adds the AppIntentsPackage registry to the real application target idempotently', async () => {
    const fixture = createTemporaryXcodeProject();
    const sourceRelativePath = '../modules/dynamic-island-quick-save/ios/SaveAppQuickSaveAppIntentsPackage.swift';
    const otherTargetsBefore = Object.entries(fixture.project.pbxNativeTargetSection())
      .filter(([key]) => !key.endsWith('_comment'))
      .filter(([, target]) => target.name !== 'SaveApp')
      .map(([uuid, target]) => [uuid, JSON.stringify(target.buildPhases)]);

    await runAppIntentsXcodeProjectMod(fixture);
    let membership = getBuildMembershipCount(fixture.project, 'SaveApp', sourceRelativePath);
    expect(membership).toEqual({ references: 1, memberships: 1 });
    expect(quickSavePlugin.verifySaveAppQuickSaveAppIntentsPackage(
      fixture.project,
      fixture.root,
      fixture.iosRoot,
      'SaveApp',
    ).relativeSourcePath).toBe(sourceRelativePath);

    const firstPass = fixture.project.writeSync();
    fs.writeFileSync(fixture.projectFilePath, firstPass, 'utf8');
    fixture.project = xcode.project(fixture.projectFilePath);
    fixture.project.parseSync();
    await runAppIntentsXcodeProjectMod(fixture);
    const secondPass = fixture.project.writeSync();
    expect(secondPass).toBe(firstPass);
    membership = getBuildMembershipCount(fixture.project, 'SaveApp', sourceRelativePath);
    expect(membership).toEqual({ references: 1, memberships: 1 });

    const otherTargetsAfter = Object.entries(fixture.project.pbxNativeTargetSection())
      .filter(([key]) => !key.endsWith('_comment'))
      .filter(([, target]) => target.name !== 'SaveApp')
      .map(([uuid, target]) => [uuid, JSON.stringify(target.buildPhases)]);
    expect(otherTargetsAfter).toEqual(otherTargetsBefore);
  });

  test('fails closed when the generated project has no uniquely named app target', async () => {
    const fixture = createTemporaryXcodeProject();
    const target = Object.entries(fixture.project.pbxNativeTargetSection())
      .find(([key]) => !key.endsWith('_comment'))?.[1];
    target.productType = '"com.apple.product-type.framework"';

    await expect(runAppIntentsXcodeProjectMod(fixture))
      .rejects.toThrow('expected exactly one application PBXNativeTarget named SaveApp; found 0');
  });

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
