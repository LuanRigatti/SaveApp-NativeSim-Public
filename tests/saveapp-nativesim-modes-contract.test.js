'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('SaveApp NativeSim explicit Preflight modes', () => {
  const launcher = read('scripts/Start-SaveAppNativeSim.ps1');
  const cliGuard = read('scripts/SaveAppNativeSimCliGuard.psm1');
  const primarySkill = read('.agents/skills/saveapp-nativesim/SKILL.md');
  const noPreflightSkill = read('.agents/skills/saveapp-nativesim-nopreflight/SKILL.md');
  const allowlist = read('scripts/SaveAppMirrorSecurity.psm1');
  const snapshotGate = read('scripts/Test-SaveAppMirrorSnapshot.ps1');

  test('keeps Swift Preflight mandatory by default and exposes only an explicit switch', () => {
    expect(launcher).toContain('[switch]$SkipSwiftPreflight');
    expect(launcher).toContain('Invoke-SaveAppSwiftPreflightGate');
    expect(launcher).toContain('-SkipPreflight:$SkipSwiftPreflight');
    expect(launcher).toContain('-InvokePreflight { & $preflightScript -PassThru }');
    expect(launcher).not.toContain('$preflightResults = @(& $preflightScript -PassThru)');
    expect(cliGuard).toContain('Swift Preflight is mandatory unless -SkipSwiftPreflight is explicitly selected.');
    expect(primarySkill).toContain('reuse or run exact-SHA Swift Preflight');
    expect(primarySkill).not.toContain('-SkipSwiftPreflight');
  });

  test('skip mode is documented as omitting only Preflight while retaining NativeSim build gates', () => {
    expect(noPreflightSkill).toContain('$saveapp-nativesim-nopreflight');
    expect(noPreflightSkill).toContain('-SkipSwiftPreflight -CaptureOSLog');
    expect(noPreflightSkill).toContain('It skips invoking, querying, dispatching, or waiting for Swift Preflight.');
    expect(noPreflightSkill).toContain('app and extension signing');
    expect(noPreflightSkill).toContain('App Group');
    expect(noPreflightSkill).toContain('NativeSim can therefore fail later');
  });

  test('both choices share the early validated transport handoff and OSLog behavior', () => {
    const nativeDispatch = launcher.indexOf('$nativeProcess.Start()');
    const transportValidation = launcher.indexOf('Assert-SaveAppNativeSimTransportHandoff');
    const simulatorLink = launcher.indexOf('Authenticated Simulator: $simulatorUrl');
    const cleanup = launcher.indexOf('} finally {', simulatorLink);
    expect(transportValidation).toBeGreaterThan(nativeDispatch);
    expect(simulatorLink).toBeGreaterThan(transportValidation);
    expect(cleanup).toBeGreaterThan(simulatorLink);
    expect(launcher).toContain('TRANSPORTE PRONTO — BUILD/OSLOG PENDENTES');
    expect(launcher).toContain('GitHub Actions: $actionsUrl');
    expect(launcher).toContain('$nativeProcess.Kill($true)');
    expect(launcher).not.toContain('gh run cancel');
    expect(primarySkill).toContain('TRANSPORTE PRONTO — BUILD/OSLOG PENDENTES');
    expect(primarySkill).toContain('stops only its local CLI after handoff');
    expect(primarySkill).toContain('The remote workflow continues.');
    expect(primarySkill).toContain('-CaptureOSLog');
    expect(noPreflightSkill).toContain('native-sim-capture/<session>');
    expect(noPreflightSkill).toContain('do not poll or cancel the remote workflow');
    expect(noPreflightSkill).toContain('complete authenticated Simulator URL');
  });

  test('snapshot gate and explicit allowlist include the exact new skill path', () => {
    const skillPath = '.agents/skills/saveapp-nativesim-nopreflight/SKILL.md';
    expect(allowlist).toContain("'" + skillPath + "'");
    expect(snapshotGate).toContain("'" + skillPath + "'");
    expect(allowlist).toContain("$allowedDirectories = @('assets','src','docs','.agents/skills','tests')");
    expect(allowlist).not.toContain("$allowedDirectories = @('scripts'");
    expect(allowlist).not.toContain("$allowedDirectories = @('modules'");
  });

  test('the shared gate records an explicit skip and retains strict exact-SHA validation', () => {
    expect(cliGuard).toContain('function Invoke-SaveAppSwiftPreflightGate');
    expect(cliGuard).toContain('Skipped = $true');
    expect(cliGuard).toContain('Skipped = $false');
    expect(cliGuard).toContain('Assert-SaveAppSwiftPreflightResult -Results $results');
    expect(cliGuard).toContain('-ExpectedSha $ExpectedSha');
  });
});
