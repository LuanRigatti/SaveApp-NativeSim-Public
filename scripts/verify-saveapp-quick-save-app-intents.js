#!/usr/bin/env node

const path = require('node:path');
const xcode = require('xcode');
const {
  verifySaveAppQuickSaveAppIntentsPackage,
} = require('../plugins/withSaveLinkQuickSave');

const [projectFileArgument, projectRootArgument = '.'] = process.argv.slice(2);
if (!projectFileArgument) {
  console.error('Usage: node scripts/verify-saveapp-quick-save-app-intents.js <project.pbxproj> [project-root]');
  process.exit(2);
}

try {
  const projectFile = path.resolve(projectFileArgument);
  if (path.basename(projectFile) !== 'project.pbxproj' || path.basename(path.dirname(projectFile)) !== 'SaveApp.xcodeproj') {
    throw new Error('Expected the generated ios/SaveApp.xcodeproj/project.pbxproj file.');
  }
  const projectRoot = path.resolve(projectRootArgument);
  const platformProjectRoot = path.resolve(path.dirname(projectFile), '..');
  const project = xcode.project(projectFile);
  project.parseSync();

  const result = verifySaveAppQuickSaveAppIntentsPackage(
    project,
    projectRoot,
    platformProjectRoot,
    'SaveApp',
  );
  console.log(`Quick Save AppIntents package is compiled once in SaveApp: ${result.relativeSourcePath}`);
} catch (error) {
  console.error(`Quick Save AppIntents package verification failed: ${error.message}`);
  process.exitCode = 1;
}
