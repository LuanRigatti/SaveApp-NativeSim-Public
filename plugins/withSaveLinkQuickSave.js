const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const PODFILE_REQUIRE = "require_relative '../modules/dynamic-island-quick-save/ios/expo_widgets_quick_save'";
const POST_INSTALL_CALL = 'saveapp_configure_expo_widgets_quick_save(installer, File.expand_path(\'..\', __dir__))';
const EXPO_WIDGETS_HOOK = 'expo_widgets_post_install(installer)';
const POST_INSTALL_HEADER = 'post_install do |installer|';
const APP_INTENTS_PACKAGE_SOURCE = 'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveAppIntentsPackage.swift';

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
