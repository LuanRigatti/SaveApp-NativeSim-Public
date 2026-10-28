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

describe('SaveApp OSLog NativeSim capture integration', () => {
  const workflow = read('.github/workflows/native-sim.yml');
  const helper = read('.github/native-sim/oslog-capture.sh');
  const launcher = read('scripts/Start-SaveAppNativeSim.ps1');
  const cliGuard = read('scripts/SaveAppNativeSimCliGuard.psm1');
  const mirrorPolicy = read('scripts/SaveAppMirrorSecurity.psm1');
  const snapshotGate = read('scripts/Test-SaveAppMirrorSnapshot.ps1');
  const oslogSkill = read('.agents/skills/saveapp-nativesim/SKILL.md');

  test('capture is opt-in and avoids cancel-in-progress while active', () => {
    expect(workflow).toContain("vars.SAVEAPP_OSLOG_CAPTURE_ENABLED != 'true'");
    expect(workflow).toContain("vars.SAVEAPP_OSLOG_CAPTURE_ENABLED == 'true' && 'true' || 'false'");
    expect(workflow).toContain("if: env.SAVEAPP_OSLOG_CAPTURE_ENABLED == 'true'");
  });

  test('workflow publishes a transport-only signal before the long build and keeps capture pending', () => {
    const pending = workflow.indexOf('      - name: Publish SaveApp session pending status');
    const tunnel = workflow.indexOf('      - name: Open tunnel and publish protected status');
    const tunnelStep = stepBlock(workflow, 'Open tunnel and publish protected status');
    const install = workflow.indexOf('      - name: Install SaveApp');
    expect(pending).toBeGreaterThanOrEqual(0);
    expect(tunnel).toBeGreaterThan(pending);
    expect(tunnelStep).toContain("if [ \"$SAVEAPP_OSLOG_CAPTURE_ENABLED\" = 'true' ]");
    expect(tunnelStep).toContain('SaveApp transport ready session=$SESSION_ID run=$GITHUB_RUN_ID attempt=$GITHUB_RUN_ATTEMPT sha=$GITHUB_SHA');
    expect(tunnelStep).toContain('SaveApp tunnel pending run=$GITHUB_RUN_ID attempt=$GITHUB_RUN_ATTEMPT sha=$GITHUB_SHA');
    expect(tunnel).toBeLessThan(install);
    expect(tunnelStep).toContain('-f state=success');
    expect(tunnelStep).not.toContain('/?k=');
    expect(tunnelStep).not.toContain('gate_token');
    expect(workflow).toContain('CAPTURE_STATUS_CONTEXT: native-sim-capture/${{ inputs.session }}');
    expect(workflow).toContain('SaveApp OSLog capture pending session=$SESSION_ID run=$GITHUB_RUN_ID attempt=$GITHUB_RUN_ATTEMPT sha=$GITHUB_SHA');
    expect(workflow).toContain('The installed NativeSim CLI has a fixed 45-minute wait for this');
    expect(workflow).toContain('transport signal. The launcher validates this exact run and');
  });

  test('capture starts after install and before launch; a real startup event precedes ready', () => {
    const install = workflow.indexOf('      - name: Install SaveApp');
    const start = workflow.indexOf('      - name: Start SaveApp OSLog capture');
    const launch = workflow.indexOf('      - name: Launch SaveApp');
    const probe = workflow.indexOf('      - name: Verify SaveApp OSLog capture probe');
    const ready = workflow.indexOf('      - name: Publish SaveApp capture ready status');
    const hold = workflow.indexOf('      - name: Keep the stream available');
    const readyStep = stepBlock(workflow, 'Publish SaveApp capture ready status');
    expect(install).toBeGreaterThanOrEqual(0);
    expect(start).toBeGreaterThan(install);
    expect(launch).toBeGreaterThan(start);
    expect(probe).toBeGreaterThan(launch);
    expect(ready).toBeGreaterThan(probe);
    expect(hold).toBeGreaterThan(ready);
    expect(stepBlock(workflow, 'Start SaveApp OSLog capture')).toContain('id: saveapp_capture_start');
    expect(stepBlock(workflow, 'Verify SaveApp OSLog capture probe')).toContain('saveapp_capture_wait_for_probe');
    expect(readyStep).toContain('READY_CONTEXT="$CAPTURE_STATUS_CONTEXT"');
    expect(readyStep).toContain('SaveApp OSLog capture ready session=$SESSION_ID run=$GITHUB_RUN_ID attempt=$GITHUB_RUN_ATTEMPT sha=$GITHUB_SHA');
    expect(readyStep).toContain('-f state=success');
    expect(readyStep).not.toContain('GITHUB_ATTEMPT');
  });

  test('launcher returns authenticated links after exact transport readiness without waiting for build or capture', () => {
    const deadlineStart = cliGuard.indexOf('function Get-SaveAppOSLogReadinessDeadline');
    const dispatchStart = launcher.indexOf('NativeSim dispatched for public main SHA');
    const simulatorOutput = launcher.indexOf('Authenticated Simulator: $simulatorUrl', dispatchStart);
    const cleanupStart = launcher.indexOf('} finally {', simulatorOutput);
    const handoffBlock = launcher.slice(dispatchStart, simulatorOutput);
    expect(deadlineStart).toBeGreaterThanOrEqual(0);
    expect(cliGuard.slice(deadlineStart)).toContain('AddMinutes(120)');
    expect(cliGuard.slice(deadlineStart)).toContain('AddMinutes(375)');
    expect(cliGuard).toContain('ConvertTo-SaveAppNativeSimDateTimeOffset');
    expect(cliGuard).toContain('[Globalization.CultureInfo]::InvariantCulture');
    expect(launcher).not.toContain('function Get-SaveAppOSLogReadinessDeadline');
    expect(handoffBlock).toContain('Assert-SaveAppNativeSimTransportHandoff');
    expect(handoffBlock).toContain('commits/$mirrorSha/statuses?per_page=100');
    expect(launcher).not.toContain('Get-SaveAppOSLogReadinessSnapshot');
    expect(handoffBlock).not.toContain('Test-SaveAppNativeSimCaptureReadiness');
    expect(handoffBlock).not.toContain('Start-Sleep');
    expect(handoffBlock).not.toContain('Get-SaveAppOSLogReadinessDeadline');
    expect(handoffBlock).toContain('TRANSPORTE PRONTO — BUILD/OSLOG PENDENTES');
    expect(handoffBlock).toContain('private SHA $sourceSha | public SHA $mirrorSha');
    expect(handoffBlock).toContain('SESSÃO PRONTA — OSLOG NÃO SOLICITADO');
    expect(launcher).toContain('readiness was not checked by this handoff');
    expect(simulatorOutput).toBeGreaterThan(dispatchStart);
    expect(cleanupStart).toBeGreaterThan(simulatorOutput);
    expect(launcher.slice(cleanupStart)).not.toContain('Invoke-GhText');
    expect(launcher.slice(cleanupStart)).not.toContain('Wait-Event');
    expect(launcher.slice(cleanupStart)).not.toContain('Start-Sleep');
    expect(launcher).toContain('if ((-not $actionsUrl -or -not $simulatorUrl) -and -not $nativeProcess.HasExited)');
    expect(launcher).toContain('$nativeProcess.Kill($true)');
    expect(launcher).not.toContain('gh run cancel');
    expect(cliGuard).toContain('function Assert-SaveAppNativeSimTransportHandoff');
    expect(cliGuard).toContain('transport_ready');
    expect(cliGuard).toContain('session_ready');
    expect(cliGuard).toContain('capture_not_requested');
    expect(cliGuard).toContain('exact_attempt_transport_capture_probe_and_stream_confirmed');
  });

  test('transport handoff validator checks exact repo, URLs, run identity, status and timestamp without returning the auth URL', () => {
    expect(cliGuard).toContain("$ExpectedRepository -cne 'LuanRigatti/SaveApp-NativeSim-Public'");
    expect(cliGuard).toContain("$ActionsUrl -cne $expectedActionsUrl");
    expect(cliGuard).toContain('Get-SaveAppSimulatorStatusTarget -AuthenticatedUrl $SimulatorUrl');
    expect(cliGuard).toContain('Test-SaveAppNativeSimTransportReadiness');
    expect(cliGuard).toContain('"SaveApp transport ready session=$session run=$ExpectedRunId attempt=$ExpectedAttempt sha=$ExpectedSha"');
    expect(cliGuard).toContain('"SaveApp session ready session=$session run=$ExpectedRunId attempt=$ExpectedAttempt sha=$ExpectedSha"');
    expect(cliGuard).toContain('result intentionally contains no URL, query string, or gate credential');
  });

  test('capture readiness validator rejects stale status and mismatched identity', () => {
    expect(cliGuard).toContain("'current_capture_ready_status_missing'");
    expect(cliGuard).toContain("'stale_session_status'");
    expect(cliGuard).toContain("'run_identity_mismatch'");
    expect(cliGuard).toContain("'simulator_job_identity_mismatch'");
    expect(cliGuard).toContain("'required_capture_step_failed'");
    expect(cliGuard).toContain("'simulator_stream_not_active'");
    expect(cliGuard).toContain("'^native-sim (?<session>[a-f0-9]{8}) · release · (?<minutes>[0-9]{1,3})m$'");
  });

  test('normal sessions do not require OSLog capture or its readiness signal', () => {
    expect(cliGuard).toContain("if (-not $CaptureRequested) {");
    expect(cliGuard).toContain("-State 'ready' -Reason 'capture_not_requested'");
    expect(launcher).toContain('if ($captureConfiguration.CaptureEnabled)');
    expect(workflow).toContain("if: env.SAVEAPP_OSLOG_CAPTURE_ENABLED == 'true'");
  });

  test('capture probe is bounded and proves an app-owned event reached the file', () => {
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

  test('status and diagnostics do not contain the gate token, recipient, authenticated URL or clipboard', () => {
    const statusSteps = [
      stepBlock(workflow, 'Publish SaveApp session pending status'),
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

  test('opt-in and public recipient are validated before mirror publication', () => {
    expect(launcher).toContain('[switch]$CaptureOSLog');
    expect(launcher).toContain('Get-SaveAppOSLogCaptureConfiguration -CaptureRequested $CaptureOSLog.IsPresent');
    expect(launcher.indexOf('& pwsh.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $mirrorScript -Publish'))
      .toBeGreaterThan(launcher.indexOf('Get-SaveAppOSLogCaptureConfiguration -CaptureRequested'));
    expect(cliGuard).toContain('SaveApp OSLog capture opt-in and launcher -CaptureOSLog option must agree.');
    expect(cliGuard).toContain('SaveApp OSLog capture requires one valid public age recipient variable.');
    expect(cliGuard).not.toContain('Write-Output $recipient');
    expect(launcher).not.toContain('Write-Output $recipient');
  });

  test('capture helper remains an exact allowlisted snapshot dependency', () => {
    expect(mirrorPolicy).toContain("'.github/native-sim/oslog-capture.sh'");
    expect(snapshotGate).toContain("'.github/native-sim/oslog-capture.sh'");
    expect(mirrorPolicy).not.toContain("$allowedDirectories = @('.github/native-sim'");
    expect(oslogSkill).toContain('-CaptureOSLog');
  });

  test('collector uses the existing controlled stop and encrypted artifact contract', () => {
    const hold = stepBlock(workflow, 'Keep the stream available');
    const finalizer = stepBlock(workflow, 'Finalize SaveApp OSLog capture');
    const uploader = stepBlock(workflow, 'Upload encrypted SaveApp OSLog capture');
    expect(hold).toContain('native-sim-stop/$GITHUB_RUN_ID/$GITHUB_RUN_ATTEMPT');
    expect(hold).toContain('stop requested');
    expect(hold).not.toContain('gh run cancel');
    expect(hold).toContain('kill -0 "$SAVEAPP_LOG_STREAM_PID"');
    expect(finalizer).toContain('if: always()');
    expect(finalizer).toContain("steps.saveapp_capture_start.outcome == 'success'");
    expect(uploader).toContain('saveapp-native-sim-oslog-${{ github.run_id }}-${{ github.run_attempt }}');
    expect(uploader).toContain('retention-days: 1');
    expect(uploader).toContain('native-sim-oslog.age');
    expect(uploader).toContain('manifest.json');
    expect(uploader).not.toContain('saveapp-native-sim-oslog.log');
  });
});
