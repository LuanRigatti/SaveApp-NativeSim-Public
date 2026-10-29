const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function toBashPath(value) {
  const normalized = value.replace(/\\/g, '/');
  const windowsDrive = normalized.match(/^([A-Za-z]):\/(.*)$/);
  return windowsDrive ? `/${windowsDrive[1].toLowerCase()}/${windowsDrive[2]}` : normalized;
}

function resolveBash() {
  if (process.platform !== 'win32') return 'bash';
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
    'C:\\Program Files\\Git\\bin\\bash.exe',
  ];
  const candidate = candidates.find((value) => fs.existsSync(value));
  if (!candidate) throw new Error('Git Bash is required to execute the SaveApp OSLog choice regression cases.');
  return candidate;
}

function makeChoiceStatus({
  id = 123456789,
  context = 'saveapp/oslog-choice/987654321/1/a1b2c3d4',
  capture = false,
  sha = undefined,
  state = 'success',
  creator = 'saveapp-owner',
  createdAt = '2026-10-29T12:00:01Z',
  description = undefined,
  malformed = false,
} = {}) {
  const commitSha = 'a'.repeat(40);
  const status = {
    id,
    context,
    state,
    description: description || `SaveApp OSLog choice capture=${capture} sha=${commitSha}`,
    target_url: null,
    created_at: createdAt,
    creator: { login: creator },
  };
  if (sha !== undefined) status.sha = sha;
  if (malformed) delete status.id;
  return status;
}

const jqShimSource = String.raw`
const fs = require('node:fs');
const args = process.argv.slice(2);
const flags = new Set();
const vars = {};
const rest = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--arg') { vars[args[i + 1]] = args[i + 2]; i += 2; }
  else if (args[i] === '-er') { flags.add('-e'); flags.add('-r'); }
  else if (['-e', '-r', '-c', '-s'].includes(args[i])) flags.add(args[i]);
  else rest.push(args[i]);
}
const filter = rest.join(' ');
const rawInput = fs.readFileSync(0, 'utf8').trim();
function parse() { return JSON.parse(rawInput); }
function result(value) {
  if (flags.has('-e') && (value === false || value === null || value === undefined)) process.exit(1);
  if (flags.has('-r')) process.stdout.write(value === null || value === undefined ? '' : String(value));
  else process.stdout.write(flags.has('-c') ? JSON.stringify(value) : JSON.stringify(value, null, 2) + '\n');
}
function fail() { process.exit(4); }
try {
  if (flags.has('-s')) {
    const pages = [parse()];
    if (filter.startsWith('if length > 0')) {
      if (!pages.length || !pages.every(Array.isArray)) fail();
      result(pages.flat());
    } else if (filter === 'add') {
      if (!pages.every(Array.isArray)) fail();
      result(pages.flat());
    } else fail();
  } else {
    const value = parse();
    if (filter === '.id|tostring == $run_id') result(String(value.id) === vars.run_id);
    else if (filter === '.run_attempt|tostring == $attempt') result(String(value.run_attempt) === vars.attempt);
    else if (filter.startsWith('.path == ".github/workflows/native-sim.yml"')) {
      result(value.path === '.github/workflows/native-sim.yml' && value.event === 'workflow_dispatch' &&
        value.head_branch === 'main' && value.head_sha === vars.sha && value.actor?.login === vars.actor &&
        value.status === 'in_progress' && value.conclusion === null && typeof value.created_at === 'string' &&
        value.created_at.length > 0 && value.display_title === 'native-sim ' + vars.session + ' · release · ' + vars.minutes + 'm');
    } else if (filter === '.created_at | select(type == "string" and length > 0)') {
      result(typeof value.created_at === 'string' && value.created_at.length ? value.created_at : null);
    } else if (filter.includes('all(.[]; type == "object"')) {
      const valid = Array.isArray(value) && value.every((item) => item && typeof item === 'object' &&
        typeof item.id === 'number' && item.id > 0 && typeof item.context === 'string' &&
        typeof item.state === 'string' && typeof item.description === 'string' &&
        typeof item.created_at === 'string' && typeof item.creator?.login === 'string' &&
        (item.target_url === null || typeof item.target_url === 'string') &&
        (!Object.prototype.hasOwnProperty.call(item, 'sha') || typeof item.sha === 'string'));
      result(valid);
    } else if (filter.includes('[.[] | select(.context == $context)] | length')) {
      result(value.filter((item) => item.context === vars.context).length);
    } else if (filter.includes('[.[] | select(.context == $context)][0]')) {
      result(value.filter((item) => item.context === vars.context)[0] ?? null);
    } else if (filter.includes('capture("^SaveApp OSLog choice')) {
      const match = typeof value.description === 'string' && value.description.match(/^SaveApp OSLog choice capture=(true|false) sha=[0-9a-fA-F]{40}$/);
      result(match ? match[1] : '');
    } else if (filter.includes('.context == $context and .state == "success"')) {
      const date = Date.parse(value.created_at);
      const runDate = Date.parse(vars.run_created_at);
      result(value.context === vars.context && value.state === 'success' && value.description === vars.description &&
        (!Object.prototype.hasOwnProperty.call(value, 'sha') || value.sha === vars.sha) &&
        value.creator?.login === vars.actor && (value.target_url === null || value.target_url === '') &&
        Number.isFinite(date) && Number.isFinite(runDate) && date >= runDate);
    } else fail();
  }
} catch { fail(); }
`;

let jqShimPath;
beforeAll(() => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'saveapp-oslog-choice-'));
  jqShimPath = path.join(tempRoot, 'jq-shim.js');
  fs.writeFileSync(jqShimPath, jqShimSource, 'utf8');
});
afterAll(() => {
  if (jqShimPath) fs.rmSync(path.dirname(jqShimPath), { recursive: true, force: true });
});

function runBashChoice({ run = {}, statuses = [], apiFailure = '', invalidPages = false } = {}) {
  const session = 'a1b2c3d4';
  const minutes = '120';
  const runId = '987654321';
  const sha = 'a'.repeat(40);
  const actor = 'saveapp-owner';
  const runData = {
    id: runId,
    run_attempt: 1,
    path: '.github/workflows/native-sim.yml',
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_sha: sha,
    actor: { login: actor },
    status: 'in_progress',
    conclusion: null,
    created_at: '2026-10-29T12:00:00Z',
    display_title: `native-sim ${session} · release · ${minutes}m`,
    ...run,
  };
  const bashScript = String.raw`
set -u
source "$SAVEAPP_TEST_HELPER"
if ! command -v jq >/dev/null 2>&1; then
  jq() { node "$SAVEAPP_TEST_JQ_SHIM" "$@"; }
fi
gh() {
  case "$*" in
    *"actions/runs/\${GITHUB_RUN_ID}"*)
      [[ "\${SAVEAPP_TEST_API_FAILURE:-}" != 'run' ]] || return 22
      printf '%s\n' "$SAVEAPP_TEST_RUN_JSON"
      ;;
    *"commits/\${GITHUB_SHA}/statuses?per_page=100"*)
      [[ "\${SAVEAPP_TEST_API_FAILURE:-}" != 'statuses' ]] || return 22
      if [[ "\${SAVEAPP_TEST_INVALID_PAGES:-false}" == 'true' ]]; then printf '%s\n' 'not-json';
      else printf '%s\n' "$SAVEAPP_TEST_STATUSES_JSON"; fi
      ;;
    *) return 23 ;;
  esac
}
sleep() { SECONDS=$((SECONDS + 61)); }
GITHUB_OUTPUT="$(mktemp)"
export GITHUB_OUTPUT
if saveapp_capture_resolve_session_choice; then choice_exit=0; else choice_exit=$?; fi
printf '\n__CHOICE_EXIT__=%s\n' "$choice_exit"
cat "$GITHUB_OUTPUT"
rm -f "$GITHUB_OUTPUT"
exit 0
`.replaceAll('\\${', '${');
  const bash = resolveBash();
  const env = {
    ...process.env,
    SAVEAPP_TEST_HELPER: toBashPath(path.join(root, '.github/native-sim/oslog-capture.sh')),
    SAVEAPP_TEST_JQ_SHIM: toBashPath(jqShimPath),
    SAVEAPP_TEST_RUN_JSON: JSON.stringify(runData),
    SAVEAPP_TEST_STATUSES_JSON: JSON.stringify(invalidPages ? [] : statuses),
    SAVEAPP_TEST_API_FAILURE: apiFailure,
    SAVEAPP_TEST_INVALID_PAGES: String(invalidPages),
    SESSION_ID: session,
    SESSION_MINUTES: minutes,
    GITHUB_RUN_ID: runId,
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_SHA: sha,
    GITHUB_REPOSITORY: 'LuanRigatti/SaveApp-NativeSim-Public',
    GITHUB_ACTOR: actor,
  };
  const result = spawnSync(bash, ['-c', bashScript], { cwd: root, env, encoding: 'utf8', timeout: 10000 });
  if (result.error) throw result.error;
  return { exitCode: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

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
    expect(launcher).toContain("'api','--paginate','--slurp',\"repos/$repo/commits/$ExpectedSha/statuses?per_page=100\"");
    expect(launcher).toContain("$response.PSObject.Properties['id']");
    expect(launcher).toContain("$postedStatusId = [Convert]::ToString");
    expect(launcher).toContain('The per-run OSLog choice was not visible by its exact SHA endpoint before the bounded read-back timeout');
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
    expect(helper).toContain('((has("sha") | not) or .sha == $sha)');
    expect(helper).not.toContain('and .sha == $sha');
    expect(helper).toContain('fromdateiso8601');
    expect(helper).toContain('all(.[]; type == "object"');
    expect(cliGuard).toContain('choice_status_ambiguous');
    expect(cliGuard).toContain('choice_status_identity_mismatch');
    expect(cliGuard).toContain('choice_status_response_invalid');
    expect(cliGuard).toContain('choice_run_identity_mismatch');
    expect(cliGuard).toContain('choice_status_not_visible');
    expect(cliGuard).toContain('$statusCreatedAt -lt $runCreatedAt');
    expect(launcher).toContain('links were withheld');
    expect(launcher).toContain('Test-SaveAppOSLogCaptureDecision');
    expect(launcher).toContain('repos/$repo/commits/$ExpectedSha/statuses?per_page=100');
    expect(launcher).toContain('-ExpectedStatusId $postedStatusId');
    expect(launcher).toContain('if ($readBack.State -eq \'ready\') { return $readBack }');
    expect(cliGuard).not.toContain('[string]$status.sha -cne $ExpectedSha');
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

describe('SaveApp Bash exact-run OSLog choice behavior', () => {
  test('accepts capture=false and capture=true from realistic GitHub statuses without sha', () => {
    for (const capture of [false, true]) {
      const outcome = runBashChoice({ statuses: [makeChoiceStatus({ capture })] });
      expect(outcome.exitCode).toBe(0);
      expect(outcome.stdout).toContain('__CHOICE_EXIT__=0');
      expect(outcome.stdout).toContain(`enabled=${capture}`);
    }
  }, 30000);

  test('fails closed for wrong identities, altered status data, ambiguity, missing data, and API failures', () => {
    const cases = [
      ['run ID mismatch', { run: { id: '987654322' }, statuses: [makeChoiceStatus()] }, 'run ID'],
      ['attempt mismatch', { run: { run_attempt: 2 }, statuses: [makeChoiceStatus()] }, 'run metadata'],
      ['SHA mismatch on run', { run: { head_sha: 'b'.repeat(40) }, statuses: [makeChoiceStatus()] }, 'run metadata'],
      ['session mismatch', { run: { display_title: 'native-sim 0a1b2c3d · release · 120m' }, statuses: [makeChoiceStatus()] }, 'run metadata'],
      ['context/session mismatch', { statuses: [makeChoiceStatus({ context: 'saveapp/oslog-choice/987654321/1/0a1b2c3d' })] }, 'bounded timeout'],
      ['duplicate status', { statuses: [makeChoiceStatus(), makeChoiceStatus({ id: 123456790 })] }, 'ambiguous'],
      ['wrong creator', { statuses: [makeChoiceStatus({ creator: 'other-user' })] }, 'identity validation'],
      ['stale timestamp', { statuses: [makeChoiceStatus({ createdAt: '2026-10-28T11:59:59Z' })] }, 'identity validation'],
      ['invalid timestamp', { statuses: [makeChoiceStatus({ createdAt: 'invalid-date' })] }, 'identity validation'],
      ['malformed capture description', { statuses: [makeChoiceStatus({ description: `SaveApp OSLog choice capture=maybe sha=${'a'.repeat(40)}` })] }, 'identity validation'],
      ['description bound to another SHA', { statuses: [makeChoiceStatus({ description: `SaveApp OSLog choice capture=false sha=${'b'.repeat(40)}` })] }, 'identity validation'],
      ['wrong optional SHA', { statuses: [makeChoiceStatus({ sha: 'b'.repeat(40) })] }, 'identity validation'],
      ['non-success state', { statuses: [makeChoiceStatus({ state: 'pending' })] }, 'identity validation'],
      ['malformed status object', { statuses: [makeChoiceStatus({ malformed: true })] }, 'invalid SaveApp status object'],
      ['invalid status pages', { invalidPages: true }, 'invalid SaveApp status response'],
      ['status API failure', { apiFailure: 'statuses' }, 'bounded timeout'],
      ['run API failure', { apiFailure: 'run' }, 'Could not verify the SaveApp NativeSim run'],
      ['missing status', { statuses: [] }, 'bounded timeout'],
    ];

    for (const [, fixture, expectedMessage] of cases) {
      const outcome = runBashChoice(fixture);
      expect(outcome.exitCode).toBe(0);
      expect(outcome.stdout).toContain('__CHOICE_EXIT__=1');
      expect(outcome.stdout).toContain(expectedMessage);
      expect(outcome.stdout).not.toContain('enabled=');
      expect(outcome.stderr).toBe('');
    }
  }, 30000);
});
