'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mirrorSecurity = fs.readFileSync(path.join(root, 'scripts/SaveAppMirrorSecurity.psm1'), 'utf8');
const mirrorPublisher = fs.readFileSync(path.join(root, 'scripts/mirror-saveapp.ps1'), 'utf8');
const nativeSimLauncher = fs.readFileSync(path.join(root, 'scripts/Start-SaveAppNativeSim.ps1'), 'utf8');
const snapshotGate = fs.readFileSync(path.join(root, 'scripts/Test-SaveAppMirrorSnapshot.ps1'), 'utf8');
const securitySimulations = fs.readFileSync(path.join(root, 'tests/SaveAppSecurity.Simulations.ps1'), 'utf8');

describe('sanitized NativeSim mirror snapshot gate', () => {
  test('allowlists the build-settings verifier and the local validation gate explicitly', () => {
    expect(mirrorSecurity).toContain("'scripts/verify-saveapp-simulator-build-settings.js'");
    expect(mirrorSecurity).toContain("'scripts/Test-SaveAppMirrorSnapshot.ps1'");
    expect(mirrorPublisher).toContain('Get-SaveAppMirrorAllowlist');
    expect(mirrorPublisher).toContain('Get-SaveAppMirrorCandidateFiles');
    expect(require.resolve('../scripts/verify-saveapp-simulator-build-settings')).toBe(
      path.join(root, 'scripts/verify-saveapp-simulator-build-settings.js'),
    );
  });

  test('keeps script and module mirroring explicit rather than recursive', () => {
    expect(mirrorSecurity).toContain("$allowedDirectories = @('assets','src','docs','.agents/skills','tests')");
    expect(mirrorSecurity).not.toContain("$allowedDirectories = @('scripts'");
    expect(mirrorSecurity).not.toContain("$allowedDirectories = @('modules'");
    for (const requiredLocalFile of [
      'modules/document-thumbnailing/package.json',
      'modules/document-thumbnailing/ios/SaveAppDocumentThumbnailing.podspec',
      'modules/document-thumbnailing/ios/SaveAppDocumentThumbnailingModule.swift',
      'modules/clipboard-url-detection/package.json',
      'modules/clipboard-url-detection/ios/SaveAppClipboardURLDetection.podspec',
      'modules/clipboard-url-detection/ios/SaveAppClipboardURLDetectionModule.swift',
      'modules/rich-note-keyboard-toolbar/package.json',
      'modules/rich-note-keyboard-toolbar/expo-module.config.json',
      'modules/rich-note-keyboard-toolbar/ios/SaveAppRichNoteKeyboardToolbar.podspec',
      'modules/rich-note-keyboard-toolbar/ios/SaveAppRichNoteKeyboardToolbarModule.swift',
      'modules/rich-note-keyboard-toolbar/src/index.ts',
    ]) {
      expect(mirrorSecurity).toContain("'" + requiredLocalFile + "'");
    }
  });

  test('allows only the exact rich-note keyboard toolbar module files in the mirror', () => {
    for (const file of [
      'modules/rich-note-keyboard-toolbar/package.json',
      'modules/rich-note-keyboard-toolbar/expo-module.config.json',
      'modules/rich-note-keyboard-toolbar/ios/SaveAppRichNoteKeyboardToolbar.podspec',
      'modules/rich-note-keyboard-toolbar/ios/SaveAppRichNoteKeyboardToolbarModule.swift',
      'modules/rich-note-keyboard-toolbar/src/index.ts',
    ]) {
      expect(mirrorSecurity).toContain("'" + file + "'");
      expect(snapshotGate).toContain("'" + file + "'");
    }
    expect(mirrorSecurity).not.toContain("$allowedDirectories = @('assets','src','docs','.agents/skills','tests','modules')");
  });

  test('requires the explicitly scoped no-Preflight skill in the safe mirror snapshot', () => {
    const skillPath = '.agents/skills/saveapp-nativesim-nopreflight/SKILL.md';
    expect(mirrorSecurity).toContain("'" + skillPath + "'");
    expect(snapshotGate).toContain("'" + skillPath + "'");
    expect(mirrorSecurity).toContain("$allowedDirectories = @('assets','src','docs','.agents/skills','tests')");
    expect(mirrorSecurity).not.toContain("$allowedDirectories = @('scripts'");
    expect(mirrorSecurity).not.toContain("$allowedDirectories = @('modules'");
  });

  test('validates the exact copied hashes and provenance before public mirror writes', () => {
    expect(snapshotGate).toContain('Get-SaveAppMirrorCandidateFiles');
    expect(snapshotGate).toContain('Get-FileHash');
    expect(snapshotGate).toContain('source_commit=');
    expect(snapshotGate).toContain("$tempBase = [IO.Path]::GetFullPath((Join-Path $sourceFull '..'))");
    expect(snapshotGate).toContain('$snapshotPath = $tempRoot');
    expect(snapshotGate).toContain('npm ci');
    expect(snapshotGate).toContain('full Jest suite');
    expect(snapshotGate).toContain('native contracts');
    expect(snapshotGate).toContain('Expo dependency compatibility');
    expect(snapshotGate).toContain('Expo Doctor');

    const gateIndex = mirrorPublisher.indexOf('Test-SaveAppMirrorSnapshot.ps1');
    const publicCopyIndex = mirrorPublisher.indexOf(
      'Copy-SaveAppMirrorFile -SourceRoot $sourceRoot -MirrorRoot $destinationRoot',
    );
    const publicStageIndex = mirrorPublisher.indexOf('git -C $destinationRoot add');
    const publicPushIndex = mirrorPublisher.indexOf('push --set-upstream origin main');
    expect(gateIndex).toBeGreaterThanOrEqual(0);
    expect(publicCopyIndex).toBeGreaterThan(gateIndex);
    expect(publicStageIndex).toBeGreaterThan(gateIndex);
    expect(publicPushIndex).toBeGreaterThan(gateIndex);
  });

  test('prevents Preflight and NativeSim launch when the mirror snapshot gate fails', () => {
    const mirrorIndex = nativeSimLauncher.indexOf(
      '& pwsh.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $mirrorScript -Publish',
    );
    const failureIndex = nativeSimLauncher.indexOf(
      'Sanitized SaveApp mirror did not complete successfully; Preflight and NativeSim were not started.',
    );
    const preflightIndex = nativeSimLauncher.indexOf('& $preflightScript -PassThru');
    const nativeSimIndex = nativeSimLauncher.indexOf('$nativeProcess.Start()');
    expect(mirrorIndex).toBeGreaterThanOrEqual(0);
    expect(failureIndex).toBeGreaterThan(mirrorIndex);
    expect(preflightIndex).toBeGreaterThan(failureIndex);
    expect(nativeSimIndex).toBeGreaterThan(preflightIndex);
  });

  test('simulates an omitted required helper blocking before npm and publication', () => {
    expect(snapshotGate).toContain(
      'Required mirror dependency is absent from the validated snapshot',
    );
    expect(securitySimulations).toContain(
      'an omitted mandatory build-settings helper blocks the local snapshot gate before npm or publication',
    );
    expect(securitySimulations).toContain(
      'incomplete snapshots are rejected before any public mirror copy, staging, commit, or push',
    );
  });
});
