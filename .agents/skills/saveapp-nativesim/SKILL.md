---
name: saveapp-nativesim
description: Safely mirror the clean published SaveApp source, reuse or run exact-SHA Swift Preflight, and start one 120-minute authenticated NativeSim session. Use for an explicit $saveapp-nativesim request.
---

# SaveApp NativeSim — primary flow

Use only for an explicit `$saveapp-nativesim` invocation or direct request to start the SaveApp Simulator. That invocation authorizes the audited one-way mirror publication when needed. Do not ask for an intermediate confirmation when every gate passes. Stop on any failed or ambiguous gate.

## Fixed target

- Public build repository: `C:\Projetos\SaveApp-NativeSim-Public`, `LuanRigatti/SaveApp-NativeSim-Public`, branch `main`.
- Private source: `C:\Projetos\SaveApp`, `LuanRigatti/SaveApp`, branch `main`.
- The public provenance file must name the exact live private source commit. Keep commands within these two fixed SaveApp roots.

## Run

Run from `C:\Projetos\SaveApp` with PowerShell 7, GitHub CLI authentication, and the installed NativeSim CLI. The private `main` must be clean and equal to `origin/main`; never commit or push it. Before publication, the launcher runs `tests/SaveAppSecurity.Tests.ps1`, which uses temporary local fixtures and a mocked GitHub CLI for its Preflight reuse case; it does not dispatch a workflow or start a session. The launcher then invokes `scripts/mirror-saveapp.ps1 -Publish`, which operates only on the SaveApp source and SaveApp public mirror, rechecks both repositories, visibility, exact remotes, destination cleanliness and SHA, allowlist, credential/reference scans, staged paths, fast-forward history, provenance, and post-push equality. It commits and pushes only to the public mirror when files differ. A dirty/unpublished private source, dirty/divergent public checkout, failed test or scan, or unexpected path stops the flow.

```powershell
pwsh.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\Start-SaveAppNativeSim.ps1
```

The launcher reuses an active or successful Swift Preflight only when the GitHub repository, workflow path, `workflow_dispatch` event, `main` branch, exact public SHA, and success conclusion all match. Otherwise it dispatches once and waits for that SHA to pass. A failure blocks NativeSim. It then rechecks source/mirror SHA and provenance, refuses any active NativeSim run on `main`, and starts the installed `native-sim.ps1` CLI with the validated iPhone 17 Pro, SaveApp scheme, public tunnel, `--export`, and default `--minutes 120`. The launcher verifies the installed CLI maps `--export` to the workflow input `export_app=true` and prints both links before entering its local artifact wait. A requested valid `-Minutes` value from 1 through 350 is honored.

The Swift Preflight validates the Expo SDK 58 `expo-widgets` pin, effective plugin options and App Group in the resolved app config, Expo iOS autolinking for `ExpoWidgets` and the local Swift modules, and the generated `ExpoWidgetsTarget` project, Live Activities plist keys, and App Group entitlements for both app and extension. It then compiles the unsigned Simulator app and verifies that `ExpoWidgetsTarget.appex` is embedded. `createLiveActivity` uses the plugin's generated generic Live Activity entry; do not require an app-config `widgets[]` entry. These checks establish Simulator build integration, not Apple provisioning, signing, runtime authorization, or Dynamic Island appearance on a device.

The CLI runs in a disposable clone pinned to the public SHA. Its fetch URL identifies the public GitHub repository, while its push URL points to a temporary local bare sink seeded with that same SHA. Before `native-sim up`, the launcher inspects the installed CLI's real scaffold and auto-commit behavior, checks both workflow and gate template versions, verifies `gate.cjs` against the installed template with only the approved `TOKEN` to `GATE_VALUE` rename, and runs the actual scaffold function against the isolated clone. The scaffold must leave workflow, gate, Git status, and HEAD byte-for-byte unchanged. The launcher checks the same file hashes, clone SHA, clean status, and local push sink again after CLI output. The workflow must be active and compatible; never modify the global CLI or workflow to make a run proceed.

The CLI's output is captured privately in memory. Return the full GitHub Actions URL and the exact authenticated Simulator URL printed by this invocation, including the complete `k` value. Never reconstruct, shorten, log, or save that authenticated URL/key. Confirm the run ID, `main`, exact public SHA, Preflight outcome, 120-minute (or requested) duration, and one-time initial workflow/build status. Persist only the CLI's validated non-secret session metadata under the public checkout's Git metadata when available.

As soon as both links and run identity are verified, terminate only the local CLI process tree and return, before its separate artifact wait/download. GitHub Actions continues the same build, exports and uploads the `.app.tar.gz`, installs and opens SaveApp, then keeps the stream available for the requested session duration. Do not wait for any of those remote steps or poll logs. If an active NativeSim run already exists, stop and report its Actions link without attempting to recover or invent its key. For later artifact retrieval, use `$saveapp-simulator-archive`; it can download as soon as that run's build, export, and upload steps succeed, even while the 120-minute stream remains active.
