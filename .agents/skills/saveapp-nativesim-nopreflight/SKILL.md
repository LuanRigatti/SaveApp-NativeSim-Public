---
name: saveapp-nativesim-nopreflight
description: Safely mirror the clean published SaveApp source and start one NativeSim session without running or waiting for Swift Preflight; use only when explicitly invoked.
---

# SaveApp NativeSim without Swift Preflight

Use only for an explicit `$saveapp-nativesim-nopreflight` invocation. This is the opt-in path that skips Swift Preflight. Do not infer this mode from environment variables, a failed Preflight, or an ordinary `$saveapp-nativesim` request. The original `$saveapp-nativesim` remains the default and continues to require an exact-SHA successful Swift Preflight.

## Fixed target and shared implementation

Use only the private source `C:\Projetos\SaveApp` (`LuanRigatti/SaveApp`, `main`) and the public build mirror `C:\Projetos\SaveApp-NativeSim-Public` (`LuanRigatti/SaveApp-NativeSim-Public`, `main`). The private source is authoritative; the mirror is one-way and filtered. Do not copy mirror changes back.

Use the shared official launcher, which retains the snapshot, mirror, provenance, CLI, transport, OSLog, and NativeSim gates:

```powershell
pwsh.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\Start-SaveAppNativeSim.ps1 -SkipSwiftPreflight
```

`-SkipSwiftPreflight` is the sole operational difference. It skips invoking, querying, dispatching, or waiting for Swift Preflight. The launcher does not modify the installed NativeSim CLI. Without that explicit switch, Swift Preflight remains mandatory.

## Required gates

Skipping Swift Preflight does not bypass any other requirement. The shared launcher must still verify:

- Correct private and public repositories, `main` branches, clean working trees, synchronized private `origin/main`, and no concurrent NativeSim session.
- The complete local snapshot gate and its tests, hashes, required paths, and safe explicit mirror allowlist before any public write.
- Secret/content scanners, path validation, exact source-to-public provenance, public SHA, destination isolation, fast-forward publication, and post-push equality.
- The installed NativeSim CLI and scaffold contract, exact workflow/template compatibility, isolated checkout at the audited public SHA, export behavior, and local push sink.
- Exact per-run OSLog choice handshake. Capture is OFF unless `-CaptureOSLog` is explicitly supplied; only that mode requires a valid public age recipient. Never display, store, or publish the private age identity or authenticated Simulator key.
- Exact NativeSim run, initial attempt, repository, workflow, public SHA, status, tunnel, GitHub Actions URL, and complete authenticated Simulator URL before link handoff.
- The NativeSim workflow's real macOS build, app and extension signing, App Group entitlements, embedded extension, installation, launch, and any other workflow gates. Skipping Preflight does not make those build gates optional.

The mirror snapshot still runs local JavaScript/Expo/Jest, native contracts and security simulations. It is not a replacement for Swift Preflight. Without Preflight, its Ruby/Xcodeproj and Swift parsing/build-integration checks are not performed in advance. NativeSim can therefore fail later on a native generation, compilation, or linking issue that Preflight would normally detect first. Do not claim those checks passed or that a successful Simulator build is guaranteed.

## OSLog and early link handoff

OSLog is OFF by default for this skill. The command above starts a normal visual session: no collector, OSLog readiness gate, artifact, or later `$oslog` recovery is required. A configured public `SAVEAPP_LOG_AGE_RECIPIENT` does not enable capture; the legacy `SAVEAPP_OSLOG_CAPTURE_ENABLED` repository variable is ignored.

To instrument one run, require the public Actions variable `SAVEAPP_LOG_AGE_RECIPIENT` to contain a valid public age recipient and explicitly pass `-CaptureOSLog`:

```powershell
pwsh.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\Start-SaveAppNativeSim.ps1 -SkipSwiftPreflight -CaptureOSLog
```

The installed CLI does not accept additional workflow inputs. The shared launcher therefore publishes an explicit status choice bound to this run ID, attempt, session, and public SHA. The workflow accepts exactly one status from the dispatch actor and fails closed on missing, stale, duplicated, or mismatched choices after a bounded wait. It does not toggle a global variable. Only an explicit `capture=true` choice prepares the age-encrypted artifact and capture statuses.

Both modes publish the tunnel transport status before Expo prebuild and return the validated Actions and authenticated Simulator links immediately. A normal run is reported as `TRANSPORTE PRONTO — OSLOG NÃO SOLICITADO`; an instrumented run as `TRANSPORTE PRONTO — BUILD/OSLOG PENDENTES`. The link is not proof of build or capture readiness. In capture mode, the stream starts before app launch and the independent `native-sim-capture/<session>` status becomes successful only after the fixed startup probe reaches the filtered file. The workflow keeps its normal build, signing, entitlements, App Group, install, and launch gates in both modes.

After manual tests from an instrumented run, use `$oslog` with the exact run ID, `-Profile SaveApp -Stop` to stop gracefully and recover the encrypted artifact. Do not use `$oslog` for a normal run. Never reconstruct, shorten, log, or persist the authenticated URL/key, and never publish the private age identity. The workflow remains remote after the local CLI and Codex handoff ends.

## Stop conditions

Stop without handing off a session if any snapshot, security, provenance, SHA, CLI/scaffold, OSLog configuration, concurrency, transport, run identity, or URL check fails or is ambiguous. With the explicit skip mode, do not start or wait for Swift Preflight. Never bypass another gate, cancel a remote run to recover its key, run a second session, or switch silently to the primary or no-Preflight mode.
