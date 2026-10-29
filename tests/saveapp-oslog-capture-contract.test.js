const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function stepBlock(workflow, name) {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  if (start < 0) return '';
  const next = workflow.indexOf('\n      - name:', start + marker.length);
  return workflow.slice(start, next < 0 ? workflow.length : next);
}

describe('SaveApp per-session OSLog NativeSim choice', () => {
  const workflow = read('.github/workflows/native-sim.yml');
  const helper = read('.github/native-sim/oslog-capture.sh');
  const launcher = read('scripts/Start-SaveAppNativeSim.ps1');
  const cliGuard = read('scripts/SaveAppNativeSimCliGuard.psm1');
  const mirrorPolicy = read('scripts/SaveAppMirrorSecurity.psm1');
  const snapshotGate = read('scripts/Test-SaveAppMirrorSnapshot.ps1');
  const primarySkill = read('.agents/skills/saveapp-nativesim/SKILL.md');
  const noPreflightSkill = read('.agents/skills/saveapp-nativesim-nopreflight/SKILL.md');

  test('OSLog defaults OFF and the old repository-wide switch is not consulted', () => {
    expect(workflow).not.toContain('SAVEAPP_OSLOG_CAPTURE_ENABLED');
    expect(launcher).not.toContain('SAVEAPP_OSLOG_CAPTURE_ENABLED');
    expect(cliGuard).not.toContain('SAVEAPP_OSLOG_CAPTURE_ENABLED');
    expect(workflow).toContain('cancel-in-progress: false');
    expect(cliGuard).toContain('CaptureEnabled = $CaptureRequested');
    expect(workflow).toContain("if: steps.capture_decision.outputs.enabled == 'true'");
    expect(helper).not.toContain('CAPTURE_REQUESTED');
    expect(helper).toContain('capture_requested=$(jq -r');
    expect(helper).toContain('capture=(?<choice>true|false)');
    expect(helper).toContain('printf \'enabled=%s\\n\' "$capture_requested"');
  });

  test('launcher publishes an explicit run-bound choice because the installed CLI path uses no custom workflow input', () => {
    expect(workflow).not.toMatch(/inputs:\s*[\s\S]*?capture_oslog:/);
    expect(launcher).toContain('function Publish-SaveAppOSLogCaptureDecision');
    expect(launcher).toContain("'api','--method','POST',\"repos/$repo/statuses/$ExpectedSha\"");
    expect(launcher).toContain('New-SaveAppOSLogCaptureDecisionContract');
    expect(helper).toContain('saveapp_capture_resolve_session_choice');
    expect(helper).toContain('saveapp/oslog-choice/$run_id/$attempt/$session_id');
    expect(helper).toContain('local actor="${GITHUB_ACTOR:-}"');
    expect(helper).toContain('.actor.login == $actor');
    expect(helper).toContain('GITHUB_RUN_ATTEMPT');
    expect(helper).toContain('GITHUB_SHA');
    expect(launcher).not.toContain("'--capture-oslog'");
  });

  test('the workflow fails closed on missing, duplicate, stale or mismatched choice statuses', () => {
    expect(helper).toContain('No exact per-run SaveApp OSLog choice arrived before the bounded timeout');
    expect(helper).toContain('SaveApp per-run OSLog choice is ambiguous');
    expect(helper).toContain('SaveApp per-run OSLog choice failed exact identity validation');
    expect(helper).toContain('.creator.login == $actor');
    expect(helper).toContain('.sha == $sha');
    expect(cliGuard).toContain('choice_status_ambiguous');
    expect(cliGuard).toContain('choice_status_identity_mismatch');
    expect(cliGuard).toContain('choice_run_identity_mismatch');
    expect(cliGuard).toContain('choice_status_not_visible');
    expect(cliGuard).toContain('$statusCreatedAt -lt $runCreatedAt');
    expect(launcher).toContain('links were withheld');
    expect(launcher).toContain('Test-SaveAppOSLogCaptureDecision');
    expect(launcher).toContain('-CaptureRequested $CaptureRequested -Run $run -Statuses @($response)');
  });

  test('all sessions deliver the exact early transport link without waiting for build or OSLog', () => {
    const tunnelStep = stepBlock(workflow, 'Open tunnel and publish protected status');
    const prebuildIndex = workflow.indexOf('npx expo prebuild --platform ios --no-install');
    const tunnelIndex = workflow.indexOf('      - name: Open tunnel and publish protected status');
    const outputIndex = launcher.indexOf('Authenticated Simulator: $simulatorUrl');
    const cleanupIndex = launcher.indexOf('} finally {', outputIndex);
    expect(tunnelStep).toContain('-f state=success');
    expect(tunnelStep).toContain('SaveApp transport ready capture=$CAPTURE_ENABLED');
    expect(tunnelIndex).toBeGreaterThanOrEqual(0);
    expect(prebuildIndex).toBeGreaterThan(tunnelIndex);
    expect(cliGuard).toContain('$statusKind = \'transport\'');
    expect(launcher).toContain('TRANSPORTE PRONTO — BUILD/OSLOG PENDENTES');
    expect(launcher).toContain('TRANSPORTE PRONTO — OSLOG NÃO SOLICITADO');
    expect(outputIndex).toBeGreaterThan(0);
    expect(cleanupIndex).toBeGreaterThan(outputIndex);
    expect(launcher.slice(cleanupIndex)).not.toContain('Invoke-GhText');
    expect(launcher.slice(cleanupIndex)).not.toContain('Wait-Event');
    expect(launcher.slice(cleanupIndex)).not.toContain('Start-Sleep');
    expect(launcher.slice(cleanupIndex)).toContain('$nativeProcess.Kill($true)');
    expect(launcher).not.toContain('gh run cancel');
  });

  test('normal sessions skip capture preparation, probe, finalization and artifact upload', () => {
    for (const name of [
      'Prepare encrypted SaveApp OSLog capture',
      'Start SaveApp OSLog capture',
      'Verify SaveApp OSLog capture probe',
    ]) {
      expect(stepBlock(workflow, name)).toContain("steps.capture_decision.outputs.enabled == 'true'");
    }
    expect(stepBlock(workflow, 'Finalize SaveApp OSLog capture')).toContain("steps.capture_decision.outputs.enabled == 'true'");
    expect(stepBlock(workflow, 'Upload encrypted SaveApp OSLog capture')).toContain("steps.capture_decision.outputs.enabled == 'true'");
    expect(stepBlock(workflow, 'Publish SaveApp capture pending status')).toContain("steps.capture_decision.outputs.enabled == 'true'");
    expect(workflow).toContain('native-sim-session/${{ inputs.session }}');
    expect(workflow).not.toContain('vars.SAVEAPP_OSLOG_CAPTURE_ENABLED');
  });

  test('explicit capture is validated before mirror publication and age recipient cannot activate capture', () => {
    expect(launcher).toContain('[switch]$CaptureOSLog');
    expect(launcher).toContain('if ($CaptureRequested) {');
    expect(launcher).toContain('SAVEAPP_LOG_AGE_RECIPIENT');
    expect(launcher).toContain('Assert-SaveAppOSLogCaptureConfiguration -CaptureRequested $CaptureRequested');
    expect(launcher.indexOf('& pwsh.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $mirrorScript -Publish'))
      .toBeGreaterThan(launcher.indexOf('Get-SaveAppOSLogCaptureConfiguration -CaptureRequested'));
    expect(cliGuard).toContain('Explicit SaveApp OSLog capture requires one valid public age recipient.');
    expect(cliGuard).not.toContain('Write-Output $recipient');
    expect(launcher).not.toContain('Write-Output $recipient');
    expect(workflow).toContain('SAVEAPP_LOG_AGE_RECIPIENT: ${{ vars.SAVEAPP_LOG_AGE_RECIPIENT }}');
  });

  test('capture starts before app launch and readiness remains separate from transport', () => {
    const install = workflow.indexOf('      - name: Install SaveApp');
    const start = workflow.indexOf('      - name: Start SaveApp OSLog capture');
    const launch = workflow.indexOf('      - name: Launch SaveApp');
    const probe = workflow.indexOf('      - name: Verify SaveApp OSLog capture probe');
    const ready = workflow.indexOf('      - name: Publish SaveApp capture ready status');
    expect(start).toBeGreaterThan(install);
    expect(launch).toBeGreaterThan(start);
    expect(probe).toBeGreaterThan(launch);
    expect(ready).toBeGreaterThan(probe);
    expect(workflow).toContain('CAPTURE_STATUS_CONTEXT: native-sim-capture/${{ inputs.session }}');
    expect(stepBlock(workflow, 'Publish SaveApp capture ready status')).toContain('READY_CONTEXT="$CAPTURE_STATUS_CONTEXT"');
    expect(stepBlock(workflow, 'Publish SaveApp capture ready status')).toContain('context=$READY_CONTEXT');
    expect(stepBlock(workflow, 'Open tunnel and publish protected status')).not.toContain('CAPTURE_STATUS_CONTEXT');
  });

  test('the capture probe is bounded and proves an app-owned event reached the filtered file', () => {
    const start = helper.indexOf('saveapp_capture_wait_for_probe()');
    const stop = helper.indexOf('saveapp_capture_stop_stream() {', start);
    const probe = helper.slice(start, stop);
    expect(probe).toContain("expected_event='event=home.catalog.initialize_started'");
    expect(probe).toContain('max_wait_seconds=30');
    expect(probe).toContain('kill -0 "$SAVEAPP_LOG_STREAM_PID"');
    expect(probe).toContain('grep -Fq "$expected_event" "$SAVEAPP_CAPTURE_RAW"');
    expect(probe).not.toContain('cat "$SAVEAPP_CAPTURE_RAW"');
    expect(probe).not.toContain('echo "$SAVEAPP_CAPTURE_RAW"');
  });

  test('statuses and diagnostics do not expose gate tokens, recipient, authenticated URL or clipboard', () => {
    const statusSteps = [
      stepBlock(workflow, 'Publish SaveApp session pending status'),
      stepBlock(workflow, 'Resolve exact-run OSLog choice'),
      stepBlock(workflow, 'Open tunnel and publish protected status'),
      stepBlock(workflow, 'Publish SaveApp capture ready status'),
    ].join('\n');
    expect(statusSteps).not.toContain('gate_token');
    expect(statusSteps).not.toContain('SAVEAPP_LOG_AGE_RECIPIENT');
    expect(statusSteps).not.toContain('/?k=');
    expect(launcher).toContain('[authenticated simulator URL withheld]');
    expect(helper).not.toContain('UIPasteboard');
    expect(helper).not.toContain('echo "$SAVEAPP_LOG_AGE_RECIPIENT"');
  });

  test('both official SaveApp skills explain normal and explicitly instrumented runs', () => {
    for (const skill of [primarySkill, noPreflightSkill]) {
      expect(skill).toContain('-CaptureOSLog');
      expect(skill).toMatch(/default|disabled|OFF/i);
      expect(skill).toContain('TRANSPORTE PRONTO');
      expect(skill).toContain('`$oslog`');
      expect(skill).not.toContain('SAVEAPP_OSLOG_CAPTURE_ENABLED=true');
    }
    expect(noPreflightSkill).toContain('-SkipSwiftPreflight');
    expect(primarySkill).not.toContain('-SkipSwiftPreflight');
  });

  test('capture helper remains exact-allowlisted and artifacts remain encrypted-only', () => {
    expect(mirrorPolicy).toContain("'.github/native-sim/oslog-capture.sh'");
    expect(snapshotGate).toContain("'.github/native-sim/oslog-capture.sh'");
    expect(mirrorPolicy).not.toContain("$allowedDirectories = @('.github/native-sim'");
    const finalizer = stepBlock(workflow, 'Finalize SaveApp OSLog capture');
    const uploader = stepBlock(workflow, 'Upload encrypted SaveApp OSLog capture');
    expect(finalizer).toContain('if: always()');
    expect(finalizer).toContain("steps.saveapp_capture_start.outcome == 'success'");
    expect(uploader).toContain('saveapp-native-sim-oslog-${{ github.run_id }}-${{ github.run_attempt }}');
    expect(uploader).toContain('native-sim-oslog.age');
    expect(uploader).toContain('manifest.json');
    expect(uploader).not.toContain('saveapp-native-sim-oslog.log');
  });
});
