const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const PODFILE_REQUIRE = "require_relative '../modules/dynamic-island-quick-save/ios/expo_widgets_quick_save'";
const POST_INSTALL_CALL = 'saveapp_configure_expo_widgets_quick_save(installer, File.expand_path(\'..\', __dir__))';
const EXPO_WIDGETS_HOOK = 'expo_widgets_post_install(installer)';
const POST_INSTALL_HEADER = 'post_install do |installer|';
const APP_INTENTS_PACKAGE_SOURCE = 'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveAppIntentsPackage.swift';
const LIVE_ACTIVITY_TARGET = 'ExpoWidgetsTarget';
const LIVE_ACTIVITY_ASSET_CATALOG = 'SaveAppLiveActivityIcons.xcassets';
const LIVE_ACTIVITY_ASSET_SET = 'SaveAppLiveActivityIcon.imageset';
const LIVE_ACTIVITY_LIGHT_ICON = 'live-activity-icon.png';
const LIVE_ACTIVITY_DARK_ICON = 'live-activity-icon-dark.png';

function isExpectedLiveActivityIcon(bytes) {
  return bytes.length >= 33 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.readUInt32BE(8) === 13 &&
    bytes.toString('ascii', 12, 16) === 'IHDR' &&
    bytes.readUInt32BE(16) === 96 &&
    bytes.readUInt32BE(20) === 96 &&
    bytes[24] === 8 &&
    bytes[25] === 6;
}

function liveActivityAssetCatalogManifest() {
  return {
    images: [
      {
        filename: LIVE_ACTIVITY_LIGHT_ICON,
        idiom: 'universal',
        appearances: [{ appearance: 'luminosity', value: 'light' }],
      },
      {
        filename: LIVE_ACTIVITY_DARK_ICON,
        idiom: 'universal',
        appearances: [{ appearance: 'luminosity', value: 'dark' }],
      },
    ],
    info: { author: 'xcode', version: 1 },
  };
}

async function createLiveActivityAssetCatalog(projectRoot, platformProjectRoot) {
  const canonicalProjectRoot = fs.realpathSync(projectRoot);
  const canonicalPlatformRoot = fs.realpathSync(platformProjectRoot);
  if (!isPathWithin(canonicalProjectRoot, canonicalPlatformRoot)) {
    throw new Error('SaveApp Live Activity asset destination resolves outside the iOS project.');
  }

  const targetDirectory = path.resolve(canonicalPlatformRoot, LIVE_ACTIVITY_TARGET);
  if (!isPathWithin(canonicalPlatformRoot, targetDirectory)) {
    throw new Error('SaveApp Live Activity asset target resolves outside the iOS project.');
  }
  const assetSetDirectory = path.join(targetDirectory, LIVE_ACTIVITY_ASSET_CATALOG, LIVE_ACTIVITY_ASSET_SET);
  fs.mkdirSync(assetSetDirectory, { recursive: true });

  for (const filename of [LIVE_ACTIVITY_LIGHT_ICON, LIVE_ACTIVITY_DARK_ICON]) {
    const sourcePath = path.resolve(canonicalProjectRoot, 'assets', filename);
    const canonicalSourcePath = fs.realpathSync(sourcePath);
    if (!isPathWithin(canonicalProjectRoot, canonicalSourcePath)) {
      throw new Error(`SaveApp Live Activity icon source resolves outside the project: ${filename}.`);
    }
    const sourceBytes = fs.readFileSync(canonicalSourcePath);
    if (!isExpectedLiveActivityIcon(sourceBytes)) {
      throw new Error(`SaveApp Live Activity icon is not a valid 96 by 96 RGBA PNG: ${filename}.`);
    }
    const destinationPath = path.join(assetSetDirectory, filename);
    fs.writeFileSync(destinationPath, sourceBytes);
    const copiedBytes = fs.readFileSync(destinationPath);
    if (!copiedBytes.equals(sourceBytes) || !isExpectedLiveActivityIcon(copiedBytes)) {
      throw new Error(`SaveApp could not verify the copied Live Activity icon: ${filename}.`);
    }
  }

  fs.writeFileSync(
    path.join(assetSetDirectory, 'Contents.json'),
    `${JSON.stringify(liveActivityAssetCatalogManifest(), null, 2)}\n`,
    'utf8',
  );
}

function ensureLiveActivityAssetCatalogTargetReference(xcodeProject) {
  const targetMatches = Object.entries(xcodeProject.pbxNativeTargetSection())
    .filter(([key]) => !key.endsWith('_comment'))
    .filter(([, target]) =>
      unquoteXcodeValue(target.name) === LIVE_ACTIVITY_TARGET &&
      unquoteXcodeValue(target.productType) === 'com.apple.product-type.app-extension',
    );
  if (targetMatches.length !== 1) {
    throw new Error(`SaveApp expected exactly one ${LIVE_ACTIVITY_TARGET} app extension target; found ${targetMatches.length}.`);
  }

  const [targetUuid, target] = targetMatches[0];
  const objects = xcodeProject.hash.project.objects;
  const resourcesPhases = (target.buildPhases ?? [])
    .map(({ value }) => objects.PBXResourcesBuildPhase?.[unquoteXcodeValue(value)])
    .filter(Boolean);
  if (resourcesPhases.length > 1) {
    throw new Error(`SaveApp found ambiguous Resources phases in ${LIVE_ACTIVITY_TARGET}.`);
  }
  if (resourcesPhases.length === 0) {
    xcodeProject.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', targetUuid, 'app_extension', '""');
  }

  const targetGroups = Object.entries(objects.PBXGroup ?? {})
    .filter(([key]) => !key.endsWith('_comment'))
    .filter(([, group]) =>
      unquoteXcodeValue(group.name) === LIVE_ACTIVITY_TARGET ||
      unquoteXcodeValue(group.path) === LIVE_ACTIVITY_TARGET,
    );
  if (targetGroups.length !== 1) {
    throw new Error(`SaveApp expected exactly one Xcode group for ${LIVE_ACTIVITY_TARGET}; found ${targetGroups.length}.`);
  }
  const [groupUuid, targetGroup] = targetGroups[0];

  const references = Object.entries(xcodeProject.pbxFileReferenceSection())
    .filter(([key]) => !key.endsWith('_comment'))
    .filter(([, fileReference]) =>
      unquoteXcodeValue(fileReference.path).replace(/\\/g, '/') === LIVE_ACTIVITY_ASSET_CATALOG,
    );
  if (references.length > 1) {
    throw new Error('SaveApp found duplicate Live Activity asset catalog references.');
  }

  let fileReferenceUuid;
  if (references.length === 0) {
    const added = xcodeProject.addResourceFile(
      LIVE_ACTIVITY_ASSET_CATALOG,
      { target: targetUuid, lastKnownFileType: 'folder.assetcatalog' },
      groupUuid,
    );
    if (!added) throw new Error('SaveApp could not add the Live Activity asset catalog to the widget target.');
    fileReferenceUuid = added.fileRef;
  } else {
    [fileReferenceUuid] = references[0];
    if (unquoteXcodeValue(references[0][1].lastKnownFileType) !== 'folder.assetcatalog') {
      throw new Error('SaveApp Live Activity asset catalog reference has an unexpected Xcode file type.');
    }
  }

  const groupMemberships = Object.entries(objects.PBXGroup ?? [])
    .filter(([key]) => !key.endsWith('_comment'))
    .flatMap(([uuid, group]) => (group.children ?? [])
      .filter(({ value }) => unquoteXcodeValue(value) === fileReferenceUuid)
      .map(() => uuid));
  if (groupMemberships.length !== 1 || groupMemberships[0] !== groupUuid || !targetGroup) {
    throw new Error('SaveApp Live Activity asset catalog must appear exactly once in the ExpoWidgetsTarget Xcode group.');
  }

  const buildFiles = xcodeProject.pbxBuildFileSection();
  const matchingBuildFiles = Object.entries(buildFiles)
    .filter(([key]) => !key.endsWith('_comment'))
    .filter(([, buildFile]) => unquoteXcodeValue(buildFile.fileRef) === fileReferenceUuid);
  const memberships = [];
  for (const [ownerUuid, owner] of Object.entries(xcodeProject.pbxNativeTargetSection())) {
    if (ownerUuid.endsWith('_comment')) continue;
    for (const phaseReference of owner.buildPhases ?? []) {
      const phaseUuid = unquoteXcodeValue(phaseReference.value);
      for (const [buildFileUuid, buildFile] of matchingBuildFiles) {
        const phase = Object.values(objects)
          .find((section) => section?.[phaseUuid]?.isa?.endsWith('BuildPhase'))?.[phaseUuid];
        if (phase?.files?.some(({ value }) => unquoteXcodeValue(value) === buildFileUuid)) {
          memberships.push({ ownerUuid, phaseIsa: phase.isa });
        }
        void buildFile;
      }
    }
  }
  if (matchingBuildFiles.length !== 1 || memberships.length !== 1 ||
      memberships[0].ownerUuid !== targetUuid || memberships[0].phaseIsa !== 'PBXResourcesBuildPhase') {
    throw new Error('SaveApp Live Activity asset catalog must be compiled exactly once as an ExpoWidgetsTarget resource.');
  }
  return { targetUuid, fileReferenceUuid };
}

function withSaveAppLiveActivityIconAssets(config) {
  config = withXcodeProject(config, (config) => {
    ensureLiveActivityAssetCatalogTargetReference(config.modResults);
    return config;
  });
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      await createLiveActivityAssetCatalog(
        config.modRequest.projectRoot,
        config.modRequest.platformProjectRoot,
      );
      return config;
    },
  ]);
}

function unquoteXcodeValue(value) {
  return typeof value === 'string' ? value.replace(/^"|"$/g, '') : '';
}

function isPathWithin(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === '' || (
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

function getCanonicalQuickSavePaths(projectRoot, platformProjectRoot) {
  let canonicalProjectRoot;
  let canonicalPlatformProjectRoot;
  let canonicalSourcePath;

  try {
    canonicalProjectRoot = fs.realpathSync(projectRoot);
    canonicalPlatformProjectRoot = fs.realpathSync(platformProjectRoot);
    canonicalSourcePath = fs.realpathSync(
      path.resolve(canonicalProjectRoot, APP_INTENTS_PACKAGE_SOURCE),
    );
  } catch (error) {
    throw new Error(
      `SaveApp quick-save could not resolve its project, iOS project, or AppIntentsPackage source path: ${error.message}`,
    );
  }

  if (!isPathWithin(canonicalProjectRoot, canonicalPlatformProjectRoot)) {
    throw new Error('SaveApp quick-save iOS project directory resolves outside the project root.');
  }
  if (!isPathWithin(canonicalProjectRoot, canonicalSourcePath)) {
    throw new Error('SaveApp quick-save AppIntentsPackage source resolves outside the project root.');
  }

  return {
    platformProjectRoot: canonicalPlatformProjectRoot,
    sourcePath: canonicalSourcePath,
    relativeSourcePath: path
      .relative(canonicalPlatformProjectRoot, canonicalSourcePath)
      .replace(/\\/g, '/'),
  };
}

function getMainGroup(xcodeProject) {
  const mainGroupUuid = unquoteXcodeValue(xcodeProject.getFirstProject().firstProject.mainGroup);
  const mainGroup = xcodeProject.hash.project.objects.PBXGroup?.[mainGroupUuid];
  if (!mainGroup) {
    throw new Error('SaveApp quick-save could not find the Xcode project main group.');
  }

  return { uuid: mainGroupUuid, group: mainGroup };
}

function getBuildPhase(xcodeProject, phaseReference) {
  const phaseUuid = unquoteXcodeValue(phaseReference.value);
  const objects = xcodeProject.hash.project.objects;

  for (const [sectionName, section] of Object.entries(objects)) {
    if (sectionName.endsWith('_comment')) continue;
    const phase = section?.[phaseUuid];
    if (phase?.isa?.endsWith('BuildPhase')) return phase;
  }

  return null;
}

function getSaveAppApplicationTarget(xcodeProject, projectName) {
  const targets = Object.entries(xcodeProject.pbxNativeTargetSection())
    .filter(([key]) => !key.endsWith('_comment'))
    .filter(([, target]) =>
      unquoteXcodeValue(target.name) === projectName &&
      unquoteXcodeValue(target.productType) === 'com.apple.product-type.application',
    );

  if (targets.length !== 1) {
    throw new Error(
      `SaveApp quick-save expected exactly one application PBXNativeTarget named ${projectName}; found ${targets.length}.`,
    );
  }

  const [uuid, target] = targets[0];
  const phases = (target.buildPhases ?? [])
    .map(({ value }) => xcodeProject.hash.project.objects.PBXSourcesBuildPhase?.[value.replace(/^"|"$/g, '')])
    .filter(Boolean);
  if (phases.length !== 1) {
    throw new Error(
      `SaveApp quick-save expected one Compile Sources phase in application target ${projectName}; found ${phases.length}.`,
    );
  }

  return { uuid, target, phase: phases[0] };
}

function verifySaveAppQuickSaveAppIntentsPackage(xcodeProject, projectRoot, platformProjectRoot, projectName) {
  const paths = getCanonicalQuickSavePaths(projectRoot, platformProjectRoot);
  const { uuid: appTargetUuid, phase } = getSaveAppApplicationTarget(xcodeProject, projectName);
  const fileReferences = Object.entries(xcodeProject.pbxFileReferenceSection())
    .filter(([key]) => !key.endsWith('_comment'))
    .filter(([, fileReference]) =>
      unquoteXcodeValue(fileReference.path).replace(/\\/g, '/') === paths.relativeSourcePath,
    );

  if (fileReferences.length !== 1) {
    throw new Error(
      `SaveApp quick-save expected exactly one app-intents package PBXFileReference at ${paths.relativeSourcePath}; found ${fileReferences.length}.`,
    );
  }

  const [fileReferenceUuid] = fileReferences[0];
  const fileReference = fileReferences[0][1];
  if (unquoteXcodeValue(fileReference.sourceTree) !== '<group>') {
    throw new Error('SaveApp quick-save AppIntentsPackage PBXFileReference must use the main Xcode group source tree.');
  }

  const { uuid: mainGroupUuid, group: mainGroup } = getMainGroup(xcodeProject);
  const mainGroupPath = unquoteXcodeValue(mainGroup.path);
  const mainGroupSourceTree = unquoteXcodeValue(mainGroup.sourceTree) || '<group>';
  if (mainGroupSourceTree !== '<group>' && mainGroupSourceTree !== 'SOURCE_ROOT') {
    throw new Error(`SaveApp quick-save cannot resolve the Xcode main group source tree ${mainGroupSourceTree}.`);
  }
  const sourceGroupBasePath = path.resolve(paths.platformProjectRoot, mainGroupPath);
  const referencedSourcePath = path.resolve(sourceGroupBasePath, unquoteXcodeValue(fileReference.path));
  let canonicalReferencedSourcePath;
  try {
    canonicalReferencedSourcePath = fs.realpathSync(referencedSourcePath);
  } catch (error) {
    throw new Error(
      `SaveApp quick-save Xcode file reference does not resolve to an existing AppIntentsPackage source: ${paths.relativeSourcePath}.`,
    );
  }
  if (path.relative(paths.sourcePath, canonicalReferencedSourcePath) !== '') {
    throw new Error(
      `SaveApp quick-save Xcode file reference resolves to a different file than ${APP_INTENTS_PACKAGE_SOURCE}.`,
    );
  }

  const groupMemberships = Object.entries(xcodeProject.hash.project.objects.PBXGroup ?? [])
    .filter(([key]) => !key.endsWith('_comment'))
    .flatMap(([groupUuid, group]) => (group.children ?? [])
      .filter(({ value }) => unquoteXcodeValue(value) === fileReferenceUuid)
      .map(() => groupUuid));
  if (groupMemberships.length !== 1 || groupMemberships[0] !== mainGroupUuid) {
    throw new Error('SaveApp quick-save AppIntentsPackage reference must appear exactly once in the Xcode main group.');
  }

  const buildFiles = xcodeProject.pbxBuildFileSection();
  const buildFilesForReference = Object.entries(buildFiles)
    .filter(([key]) => !key.endsWith('_comment'))
    .filter(([, buildFile]) => unquoteXcodeValue(buildFile.fileRef) === fileReferenceUuid);
  if (buildFilesForReference.length !== 1) {
    throw new Error(
      `SaveApp quick-save expected exactly one AppIntentsPackage PBXBuildFile; found ${buildFilesForReference.length}.`,
    );
  }

  const [buildFileUuid] = buildFilesForReference[0];
  const memberships = [];
  for (const [targetUuid, target] of Object.entries(xcodeProject.pbxNativeTargetSection())) {
    if (targetUuid.endsWith('_comment')) continue;
    for (const phaseReference of target.buildPhases ?? []) {
      const phase = getBuildPhase(xcodeProject, phaseReference);
      if (!phase) continue;
      for (const buildFileReference of phase.files ?? []) {
        if (unquoteXcodeValue(buildFileReference.value) !== buildFileUuid) continue;
        memberships.push({ targetUuid, phaseIsa: phase.isa });
      }
    }
  }

  if (memberships.length !== 1 || memberships[0].targetUuid !== appTargetUuid ||
      memberships[0].phaseIsa !== 'PBXSourcesBuildPhase' ||
      !(phase.files ?? []).some((buildFileReference) =>
        unquoteXcodeValue(buildFileReference.value) === buildFileUuid,
      )) {
    throw new Error(
      'SaveApp quick-save app-intents package must be compiled exactly once by the SaveApp application target and no other target.',
    );
  }

  return { relativeSourcePath: paths.relativeSourcePath, appTargetUuid };
}

function withSaveAppQuickSaveAppIntentsPackage(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectRoot = config.modRequest.projectRoot;
    const platformProjectRoot = config.modRequest.platformProjectRoot;
    const projectName = config.modRequest.projectName;
    const paths = getCanonicalQuickSavePaths(projectRoot, platformProjectRoot);
    const { uuid: appTargetUuid } = getSaveAppApplicationTarget(project, projectName);
    const existingReferences = Object.entries(project.pbxFileReferenceSection())
      .filter(([key]) => !key.endsWith('_comment'))
      .filter(([, fileReference]) =>
        unquoteXcodeValue(fileReference.path).replace(/\\/g, '/') === paths.relativeSourcePath,
      );

    if (existingReferences.length === 0) {
      const mainGroupUuid = unquoteXcodeValue(project.getFirstProject().firstProject.mainGroup);
      const addedFile = project.addSourceFile(
        paths.relativeSourcePath,
        { target: appTargetUuid },
        mainGroupUuid,
      );
      if (!addedFile) {
        throw new Error('SaveApp quick-save could not add the app-intents package source to the application target.');
      }
    } else if (existingReferences.length > 1) {
      throw new Error(
        `SaveApp quick-save found duplicate app-intents package file references at ${paths.relativeSourcePath}.`,
      );
    }

    verifySaveAppQuickSaveAppIntentsPackage(project, projectRoot, platformProjectRoot, projectName);
    return config;
  });
}

function countOccurrences(source, value) {
  return source.split(value).length - 1;
}

function assertPostInstallContract(podfile) {
  const postInstallBlocks = podfile.match(/^\s*post_install\b[^\r\n]*/gm) ?? [];
  if (postInstallBlocks.length !== 1 || !postInstallBlocks[0].trim().startsWith(POST_INSTALL_HEADER)) {
    throw new Error('SaveApp quick-save requires exactly one ExpoWidgets-compatible post_install block.');
  }

  if (countOccurrences(podfile, EXPO_WIDGETS_HOOK) !== 1) {
    throw new Error('SaveApp quick-save requires exactly one expo-widgets post_install hook; refusing an incomplete or ambiguous native integration.');
  }

  const postInstallIndex = podfile.indexOf(POST_INSTALL_HEADER);
  const widgetsHookIndex = podfile.indexOf(EXPO_WIDGETS_HOOK);
  if (postInstallIndex < 0 || widgetsHookIndex < postInstallIndex) {
    throw new Error('SaveApp quick-save found the expo-widgets hook outside its post_install block.');
  }
}

/**
 * Routes only the explicitly tagged Save button to a native LiveActivityIntent.
 * The checked-in Ruby helper modifies the CocoaPods project after pod install;
 * generated iOS files and node_modules are never edited by this plugin.
 */
function withSaveLinkQuickSave(config) {
  config = withSaveAppQuickSaveAppIntentsPackage(config);
  config = withSaveAppLiveActivityIconAssets(config);
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) {
        throw new Error('SaveApp quick-save requires the ExpoWidgets Podfile generated by expo-widgets.');
      }

      let podfile = fs.readFileSync(podfilePath, 'utf8');
      assertPostInstallContract(podfile);

      const requireCount = countOccurrences(podfile, PODFILE_REQUIRE);
      const callCount = countOccurrences(podfile, POST_INSTALL_CALL);
      if (requireCount > 1 || callCount > 1) {
        throw new Error('SaveApp quick-save Ruby helper integration is duplicated; refusing an ambiguous CocoaPods patch.');
      }
      if (callCount === 1 && requireCount !== 1) {
        throw new Error('SaveApp quick-save found a partial Ruby helper integration; refusing an incomplete CocoaPods patch.');
      }

      if (callCount === 0) {
        if (requireCount === 0) {
          podfile = `${PODFILE_REQUIRE}\n${podfile}`;
        }
        podfile = podfile.replace(
          EXPO_WIDGETS_HOOK,
          `${EXPO_WIDGETS_HOOK}\n  ${POST_INSTALL_CALL}`,
        );
      }

      assertPostInstallContract(podfile);
      if (
        countOccurrences(podfile, PODFILE_REQUIRE) !== 1 ||
        countOccurrences(podfile, POST_INSTALL_CALL) !== 1 ||
        podfile.indexOf(POST_INSTALL_CALL) <= podfile.indexOf(EXPO_WIDGETS_HOOK)
      ) {
        throw new Error('SaveApp quick-save could not verify the complete helper call after the expo-widgets hook.');
      }

      fs.writeFileSync(podfilePath, podfile, 'utf8');
      return config;
    },
  ]);
}

module.exports = withSaveLinkQuickSave;
module.exports.APP_INTENTS_PACKAGE_SOURCE = APP_INTENTS_PACKAGE_SOURCE;
module.exports.verifySaveAppQuickSaveAppIntentsPackage = verifySaveAppQuickSaveAppIntentsPackage;
module.exports.withSaveAppQuickSaveAppIntentsPackage = withSaveAppQuickSaveAppIntentsPackage;
module.exports.ensureLiveActivityAssetCatalogTargetReference = ensureLiveActivityAssetCatalogTargetReference;
module.exports.createLiveActivityAssetCatalog = createLiveActivityAssetCatalog;
module.exports.liveActivityAssetCatalogManifest = liveActivityAssetCatalogManifest;
module.exports.withSaveAppLiveActivityIconAssets = withSaveAppLiveActivityIconAssets;
