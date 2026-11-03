/* global describe, expect, test */

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('SaveApp Release Simulator archive pipeline contracts', () => {
  const workflow = read('.github/workflows/simulator-archive.yml');
  const downloader = read('scripts/Download-SaveAppArchivePipelineArtifact.ps1');
  const mirrorSecurity = read('scripts/SaveAppMirrorSecurity.psm1');
  const snapshotGate = read('scripts/Test-SaveAppMirrorSnapshot.ps1');
  const nativeSimWorkflow = read('.github/workflows/native-sim.yml');

  test('parses as valid GitHub Actions YAML with workflow_dispatch inputs', () => {
    const parsed = yaml.load(workflow, { schema: yaml.JSON_SCHEMA });
    expect(parsed.on.workflow_dispatch.inputs).toHaveProperty('source_sha');
    expect(parsed.on.workflow_dispatch.inputs).toHaveProperty('preflight_run_id');
    expect(parsed.jobs['simulator-archive'].steps.at(-1).uses).toBe('actions/upload-artifact@v4');
  });

  test('is a separately dispatched Release simulator workflow on the pinned Xcode 27.1 toolchain', () => {
    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).toMatch(/source_sha:/);
    expect(workflow).toMatch(/preflight_run_id:/);
    expect(workflow).toContain('runs-on: xcode-27');
    expect(workflow).toContain('Xcode_27.1.app');
    expect(workflow).toContain('test "$XCODE_VERSION" = \'27.1\'');
    expect(workflow).toContain('test "$SWIFT_VERSION" = \'6.4\'');
    expect(workflow).toContain('test "$IOS_SDK_VERSION" = \'27.1\'');
    expect(workflow).toContain('-configuration Release');
    expect(workflow).toContain("-destination 'generic/platform=iOS Simulator'");
    expect(workflow).toContain('retention-days: 7');
  });

  test('fails before build unless source provenance and exact public-SHA Preflight passed', () => {
    expect(workflow).toMatch(/source_repository=LuanRigatti\/SaveApp/);
    expect(workflow).toMatch(/source_commit=%s/);
    expect(workflow).toMatch(/\.path == "\.github\/workflows\/swift-preflight\.yml"/);
    expect(workflow).toMatch(/\.event == "workflow_dispatch"/);
    expect(workflow).toMatch(/\.head_branch == "main"/);
    expect(workflow).toMatch(/\.head_sha == \$sha/);
    expect(workflow).toMatch(/\.status == "completed"/);
    expect(workflow).toMatch(/\.conclusion == "success"/);
    expect(workflow.indexOf('Validate source provenance and successful exact-SHA Swift Preflight'))
      .toBeLessThan(workflow.indexOf('Compile Release app for generic iOS Simulator'));
  });

  test('checks Expo Widgets, Live Activity, App Group and signs the extension before the app', () => {
    for (const contract of [
      'ExpoWidgetsTarget',
      'WidgetLiveActivity()',
      'NSSupportsLiveActivities',
      'group.com.luanrigatti.saveapp',
      'com.apple.security.application-groups',
      'CODE_SIGNING_ALLOWED=YES',
      'codesign --verify --strict',
      'Signature=adhoc',
    ]) {
      expect(workflow).toContain(contract);
    }

    const signStep = workflow.slice(
      workflow.indexOf('Ad hoc sign app and ExpoWidgets extension, then verify both signatures'),
      workflow.indexOf('Export SaveApp.app.tar.gz'),
    );
    expect(signStep.indexOf('verify_bundle "$APPEX"')).toBeLessThan(signStep.indexOf('verify_bundle "$APP"'));
  });

  test('exports one verified app archive including the ExpoWidgets extension and stops after upload', () => {
    expect(workflow).toContain('SaveApp.app.tar.gz');
    expect(workflow).toContain('SaveApp.app/PlugIns/ExpoWidgetsTarget.appex/Info.plist');
    expect(workflow).toContain('name: saveapp-simulator-archive-${{' + ' github.run_id }}');
    expect(workflow).not.toMatch(/cloudflared|trycloudflare|native-sim\.yml|eas-cli|expo eas|simulator streaming/i);
    expect(workflow).not.toMatch(/xcrun simctl boot|Start-SaveAppNativeSim|gh workflow run/);
  });

  test('download requires a completed exact run, successful gates, provenance, and the exact artifact', () => {
    expect(downloader).toMatch(/Parameter\(Mandatory\).*RunId/);
    for (const contract of [
      "'.github/workflows/simulator-archive.yml'",
      "'workflow_dispatch'",
      "'completed'",
      "'success'",
      "'.github/workflows/swift-preflight.yml'",
      'saveapp-simulator-archive-$RunId',
      "'Upload SaveApp Simulator archive'",
      "'SaveApp.app/PlugIns/ExpoWidgetsTarget.appex/Info.plist'",
      "-Algorithm SHA256",
    ]) {
      expect(downloader).toContain(contract);
    }
    expect(downloader).not.toMatch(/gh\s+workflow\s+run|Invoke-SaveAppSwiftPreflight|Start-SaveAppNativeSim/);
    expect(downloader.indexOf('Assert-SuccessfulBuildSteps')).toBeLessThan(downloader.indexOf('& gh run download'));
    expect(downloader.indexOf('Assert-Provenance')).toBeLessThan(downloader.indexOf('& gh run download'));
  });

  test('keeps private pipeline instructions out of the public snapshot while allowlisting public components', () => {
    expect(mirrorSecurity).toContain('scripts/Download-SaveAppArchivePipelineArtifact.ps1');
    expect(mirrorSecurity).toContain('.github/workflows/simulator-archive.yml');
    expect(mirrorSecurity).toContain('.agents/skills/saveapp-archive-pipeline');
    expect(snapshotGate).toContain('scripts/Download-SaveAppArchivePipelineArtifact.ps1');
    expect(snapshotGate).toContain('.github/workflows/simulator-archive.yml');
    expect(snapshotGate).toContain('tests/simulator-archive-workflow-contract.test.js');
  });

  test('does not modify the existing NativeSim workflow content', () => {
    expect(nativeSimWorkflow).toContain('name: native-sim');
    expect(nativeSimWorkflow).toContain('SaveApp OSLog capture ready');
    expect(nativeSimWorkflow).not.toContain('saveapp-simulator-archive-');
  });
});
