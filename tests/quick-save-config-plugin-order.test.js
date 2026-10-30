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
  fs.mkdirSync(path.join(iosRoot, 'ExpoWidgetsTarget'), { recursive: true });
  const assetsRoot = path.join(root, 'assets');
  fs.mkdirSync(assetsRoot, { recursive: true });
  for (const filename of ['live-activity-icon.png', 'live-activity-icon-dark.png']) {
    fs.copyFileSync(path.join(projectRoot, 'assets', filename), path.join(assetsRoot, filename));
  }
  fs.writeFileSync(path.join(iosRoot, 'Podfile'), podfile, 'utf8');
  return { root, iosRoot, podfilePath: path.join(iosRoot, 'Podfile') };
}

function createTemporaryXcodeProject({ useAliasedProjectRoot = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saveapp-quick-save-app-intents-'));
  temporaryRoots.push(root);
  const canonicalIosRoot = path.join(root, 'ios');
  const xcodeProjectPath = path.join(canonicalIosRoot, 'SaveApp.xcodeproj');
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

  let projectRootPath = root;
  if (useAliasedProjectRoot) {
    const aliasContainer = fs.mkdtempSync(path.join(os.tmpdir(), 'saveapp-quick-save-app-intents-alias-'));
    temporaryRoots.push(aliasContainer);
    projectRootPath = path.join(aliasContainer, 'project-root');
    fs.symlinkSync(root, projectRootPath, process.platform === 'win32' ? 'junction' : 'dir');
  }

  const project = xcode.project(projectFilePath);
  project.parseSync();
  const targetEntry = Object.entries(project.pbxNativeTargetSection()).find(([key]) => !key.endsWith('_comment'));
  if (!targetEntry) throw new Error('The Xcode project fixture has no native target.');
  targetEntry[1].name = 'SaveApp';
  targetEntry[1].productType = '"com.apple.product-type.application"';

  return {
    root,
    projectRoot: projectRootPath,
    iosRoot: path.join(projectRootPath, 'ios'),
    projectFilePath,
    sourcePath,
    project,
  };
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
      projectRoot: projectFixture.projectRoot,
      projectName: 'SaveApp',
      platformProjectRoot: projectFixture.iosRoot,
      platform: 'ios',
      modName: 'xcodeproj',
      introspect: false,
      ignoreExistingNativeFiles: false,
    },
  });
}

function inspectBuildMembership(project, targetName, sourceRelativePath) {
  const fileReferences = Object.entries(project.pbxFileReferenceSection())
    .filter(([key]) => !key.endsWith('_comment'))
    .filter(([, fileReference]) =>
      fileReference.path?.replace(/^"|"$/g, '').replace(/\\/g, '/') === sourceRelativePath,
    );
  if (fileReferences.length !== 1) {
    return { references: fileReferences.length, buildFiles: 0, memberships: 0, membershipTargets: [] };
  }

  const [fileReferenceUuid] = fileReferences[0];
  const target = Object.entries(project.pbxNativeTargetSection())
    .filter(([key]) => !key.endsWith('_comment'))
    .map(([uuid, value]) => ({ uuid, value }))
    .find(({ value }) => value.name === targetName);
  if (!target) {
    return { references: fileReferences.length, buildFiles: 0, memberships: 0, membershipTargets: [] };
  }

  const buildFiles = project.pbxBuildFileSection();
  const matchingBuildFiles = Object.entries(buildFiles)
    .filter(([key]) => !key.endsWith('_comment'))
    .filter(([, buildFile]) => buildFile.fileRef === fileReferenceUuid)
    .map(([uuid]) => uuid);
  const matchingBuildFileUuids = new Set(matchingBuildFiles);
  const memberships = [];
  const objects = project.hash.project.objects;

  for (const [targetUuid, targetValue] of Object.entries(project.pbxNativeTargetSection())) {
    if (targetUuid.endsWith('_comment')) continue;
    for (const phaseReference of targetValue.buildPhases ?? []) {
      const phaseUuid = phaseReference.value.replace(/^"|"$/g, '');
      const phase = Object.entries(objects)
        .filter(([sectionName]) => !sectionName.endsWith('_comment'))
        .map(([, section]) => section?.[phaseUuid])
        .find((candidate) => candidate?.isa?.endsWith('BuildPhase'));
      for (const buildFileReference of phase?.files ?? []) {
        if (matchingBuildFileUuids.has(buildFileReference.value.replace(/^"|"$/g, ''))) {
          memberships.push({ targetUuid, phaseIsa: phase.isa });
        }
      }
    }
  }

  return {
    references: fileReferences.length,
    buildFiles: matchingBuildFiles.length,
    memberships: memberships.length,
    membershipTargets: memberships.map(({ targetUuid }) => targetUuid),
    membershipPhaseIsas: memberships.map(({ phaseIsa }) => phaseIsa),
    orphanBuildFiles: matchingBuildFiles.length - memberships.length,
    appTargetUuid: target.uuid,
  };
}

function addExpoWidgetsTarget(project) {
  const targetUuid = project.generateUuid();
  project.pbxNativeTargetSection()[targetUuid] = {
    isa: 'PBXNativeTarget',
    name: 'ExpoWidgetsTarget',
    productName: 'ExpoWidgetsTarget',
    productType: '"com.apple.product-type.app-extension"',
    buildPhases: [],
    buildRules: [],
    dependencies: [],
  };
  const groupUuid = project.generateUuid();
  const groups = project.hash.project.objects.PBXGroup;
  groups[groupUuid] = {
    isa: 'PBXGroup',
    children: [],
    name: 'ExpoWidgetsTarget',
    path: 'ExpoWidgetsTarget',
    sourceTree: '"<group>"',
  };
  groups[`${groupUuid}_comment`] = 'ExpoWidgetsTarget';
  const mainGroupUuid = project.getFirstProject().firstProject.mainGroup.replace(/^"|"$/g, '');
  project.hash.project.objects.PBXGroup[mainGroupUuid].children.push({
    value: groupUuid,
    comment: 'ExpoWidgetsTarget',
  });
  return { targetUuid, groupUuid };
}

function expectPhysicalSourceReference(project, fixture, sourceRelativePath) {
  const sourcePath = fs.realpathSync(fixture.sourcePath);
  const platformProjectRoot = fs.realpathSync(fixture.iosRoot);
  const fileReference = Object.entries(project.pbxFileReferenceSection())
    .filter(([key]) => !key.endsWith('_comment'))
    .map(([, value]) => value)
    .find((value) => value.path?.replace(/^"|"$/g, '').replace(/\\/g, '/') === sourceRelativePath);
  expect(fileReference).toBeDefined();
  expect(fileReference.sourceTree.replace(/^"|"$/g, '')).toBe('<group>');

  const mainGroupUuid = project.getFirstProject().firstProject.mainGroup.replace(/^"|"$/g, '');
  const mainGroup = project.hash.project.objects.PBXGroup[mainGroupUuid];
  const mainGroupReferences = (mainGroup.children ?? []).filter(
    ({ value }) => value.replace(/^"|"$/g, '') === Object.entries(project.pbxFileReferenceSection())
      .find(([, value]) => value === fileReference)?.[0],
  );
  expect(mainGroupReferences).toHaveLength(1);

  const resolvedReference = path.resolve(
    platformProjectRoot,
    mainGroup.path?.replace(/^"|"$/g, '') ?? '',
    fileReference.path.replace(/^"|"$/g, ''),
  );
  expect(fs.realpathSync(resolvedReference)).toBe(sourcePath);
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
  test('adds the appearance-aware asset catalog to ExpoWidgetsTarget resources idempotently', () => {
    const fixture = createTemporaryXcodeProject();
    const { targetUuid } = addExpoWidgetsTarget(fixture.project);

    const first = quickSavePlugin.ensureLiveActivityAssetCatalogTargetReference(fixture.project);
    expect(first.targetUuid).toBe(targetUuid);
    expect(first.fileReferenceUuid).toBeTruthy();
    const firstProject = fixture.project.writeSync();

    const second = quickSavePlugin.ensureLiveActivityAssetCatalogTargetReference(fixture.project);
    expect(second).toEqual(first);
    expect(fixture.project.writeSync()).toBe(firstProject);
  });

  test('generates both verified source variants into the extension asset catalog', async () => {
    const fixture = createTemporaryProject('');
    const assetsRoot = path.join(fixture.root, 'assets');
    const extensionRoot = path.join(fixture.iosRoot, 'ExpoWidgetsTarget');
    fs.mkdirSync(assetsRoot, { recursive: true });
    fs.mkdirSync(extensionRoot, { recursive: true });
    for (const filename of ['live-activity-icon.png', 'live-activity-icon-dark.png']) {
      fs.copyFileSync(path.join(projectRoot, 'assets', filename), path.join(assetsRoot, filename));
    }

    await quickSavePlugin.createLiveActivityAssetCatalog(fixture.root, fixture.iosRoot);

    const imageSet = path.join(
      extensionRoot,
      'SaveAppLiveActivityIcons.xcassets',
      'SaveAppLiveActivityIcon.imageset',
    );
    const manifest = JSON.parse(fs.readFileSync(path.join(imageSet, 'Contents.json'), 'utf8'));
    expect(manifest.images.map(({ filename, appearances }) => [filename, appearances[0].value])).toEqual([
      ['live-activity-icon.png', 'light'],
      ['live-activity-icon-dark.png', 'dark'],
    ]);
    expect(fs.readFileSync(path.join(imageSet, 'live-activity-icon.png')))
      .toEqual(fs.readFileSync(path.join(assetsRoot, 'live-activity-icon.png')));
    expect(fs.readFileSync(path.join(imageSet, 'live-activity-icon-dark.png')))
      .toEqual(fs.readFileSync(path.join(assetsRoot, 'live-activity-icon-dark.png')));
  });

  test('adds the AppIntentsPackage registry to the real application target idempotently', async () => {
    const fixture = createTemporaryXcodeProject({ useAliasedProjectRoot: true });
    const sourceRelativePath = path.relative(
      fs.realpathSync(fixture.iosRoot),
      fs.realpathSync(fixture.sourcePath),
    ).replace(/\\/g, '/');
    const otherTargetsBefore = Object.entries(fixture.project.pbxNativeTargetSection())
      .filter(([key]) => !key.endsWith('_comment'))
      .filter(([, target]) => target.name !== 'SaveApp')
      .map(([uuid, target]) => [uuid, JSON.stringify(target.buildPhases)]);

    const firstModResult = await runAppIntentsXcodeProjectMod(fixture);
    const projectAfterFirstMod = firstModResult.modResults;
    expect(projectAfterFirstMod).toBe(fixture.project);
    let membership = inspectBuildMembership(projectAfterFirstMod, 'SaveApp', sourceRelativePath);
    expect(membership).toEqual({
      references: 1,
      buildFiles: 1,
      memberships: 1,
      membershipTargets: [membership.appTargetUuid],
      membershipPhaseIsas: ['PBXSourcesBuildPhase'],
      orphanBuildFiles: 0,
      appTargetUuid: membership.appTargetUuid,
    });
    expectPhysicalSourceReference(projectAfterFirstMod, fixture, sourceRelativePath);
    expect(quickSavePlugin.verifySaveAppQuickSaveAppIntentsPackage(
      projectAfterFirstMod,
      fixture.projectRoot,
      fixture.iosRoot,
      'SaveApp',
    ).relativeSourcePath).toBe(sourceRelativePath);

    const firstPass = projectAfterFirstMod.writeSync();
    fs.writeFileSync(fixture.projectFilePath, firstPass, 'utf8');
    const reopenedProject = xcode.project(fixture.projectFilePath);
    reopenedProject.parseSync();
    fixture.project = reopenedProject;
    membership = inspectBuildMembership(reopenedProject, 'SaveApp', sourceRelativePath);
    expect(membership).toEqual({
      references: 1,
      buildFiles: 1,
      memberships: 1,
      membershipTargets: [membership.appTargetUuid],
      membershipPhaseIsas: ['PBXSourcesBuildPhase'],
      orphanBuildFiles: 0,
      appTargetUuid: membership.appTargetUuid,
    });
    expectPhysicalSourceReference(reopenedProject, fixture, sourceRelativePath);

    const secondModResult = await runAppIntentsXcodeProjectMod(fixture);
    expect(secondModResult.modResults).toBe(reopenedProject);
    const secondPass = secondModResult.modResults.writeSync();
    expect(secondPass).toBe(firstPass);
    membership = inspectBuildMembership(secondModResult.modResults, 'SaveApp', sourceRelativePath);
    expect(membership).toEqual({
      references: 1,
      buildFiles: 1,
      memberships: 1,
      membershipTargets: [membership.appTargetUuid],
      membershipPhaseIsas: ['PBXSourcesBuildPhase'],
      orphanBuildFiles: 0,
      appTargetUuid: membership.appTargetUuid,
    });
    expectPhysicalSourceReference(secondModResult.modResults, fixture, sourceRelativePath);

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

  test('fails closed with a precise error when the project contains duplicate AppIntentsPackage references', async () => {
    const fixture = createTemporaryXcodeProject();
    const firstResult = await runAppIntentsXcodeProjectMod(fixture);
    fixture.project = firstResult.modResults;
    const fileReferences = fixture.project.pbxFileReferenceSection();
    const expectedPath = '../modules/dynamic-island-quick-save/ios/SaveAppQuickSaveAppIntentsPackage.swift';
    const existingReference = Object.entries(fileReferences)
      .find(([key, value]) => !key.endsWith('_comment') &&
        value.path?.replace(/^"|"$/g, '').replace(/\\/g, '/') === expectedPath)?.[1];
    expect(existingReference).toBeDefined();

    fileReferences[fixture.project.generateUuid()] = { ...existingReference };

    await expect(runAppIntentsXcodeProjectMod(fixture))
      .rejects.toThrow(`found duplicate app-intents package file references at ${expectedPath}.`);
  });

  test('runs the real expo-widgets 58.0.25 Podfile hook before the Quick Save integration', async () => {
    expect(expoWidgetsPackage.version).toBe('58.0.25');
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
