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
pwsh.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\Start-SaveAppNativeSim.ps1 -SkipSwiftPreflight -CaptureOSLog
```

`-SkipSwiftPreflight` is the sole operational difference. It skips invoking, querying, dispatching, or waiting for Swift Preflight. The launcher does not modify the installed NativeSim CLI. Without that explicit switch, Swift Preflight remains mandatory.

## Required gates

Skipping Swift Preflight does not bypass any other requirement. The shared launcher must still verify:

- Correct private and public repositories, `main` branches, clean working trees, synchronized private `origin/main`, and no concurrent NativeSim session.
- The complete local snapshot gate and its tests, hashes, required paths, and safe explicit mirror allowlist before any public write.
- Secret/content scanners, path validation, exact source-to-public provenance, public SHA, destination isolation, fast-forward publication, and post-push equality.
- The installed NativeSim CLI and scaffold contract, exact workflow/template compatibility, isolated checkout at the audited public SHA, export behavior, and local push sink.
- OSLog opt-in agreement and a valid public age recipient when `-CaptureOSLog` is requested. Never display, store, or publish the private age identity or authenticated Simulator key.
- Exact NativeSim run, initial attempt, repository, workflow, public SHA, status, tunnel, GitHub Actions URL, and complete authenticated Simulator URL before link handoff.
- The NativeSim workflow's real macOS build, app and extension signing, App Group entitlements, embedded extension, installation, launch, and any other workflow gates. Skipping Preflight does not make those build gates optional.

The mirror snapshot still runs local JavaScript/Expo/Jest, native contracts and security simulations. It is not a replacement for Swift Preflight. Without Preflight, its Ruby/Xcodeproj and Swift parsing/build-integration checks are not performed in advance. NativeSim can therefore fail later on a native generation, compilation, or linking issue that Preflight would normally detect first. Do not claim those checks passed or that a successful Simulator build is guaranteed.

## OSLog and early link handoff

Use the same existing capture integration as the primary skill. With capture enabled, the workflow starts the filtered OSLog collector before launching SaveApp and publishes capture readiness only after its fixed startup probe is present. The session transport link and OSLog readiness are separate states; a delivered link means `TRANSPORTE PRONTO — BUILD/OSLOG PENDENTES`, not that build or capture has succeeded.

As soon as the shared launcher validates the current run ID, initial attempt, public SHA, session, tunnel origin, complete authenticated Simulator URL, and Actions URL, return both full links with the run identity and the pending state. Never reconstruct, shorten, log, or persist the authenticated URL/key. Then end local CLI execution and Codex follow-up immediately. Do not wait for build, OSLog readiness, artifact upload, user testing, or workflow completion; do not poll or cancel the remote workflow. The GitHub Actions workflow continues independently.

The user can later confirm the exact `native-sim-capture/<session>` status for that run/attempt/SHA and use the installed `$oslog` skill to stop and recover the encrypted artifact. Only that capture status confirms logs are ready for recovery; a pending or failed capture must be reported as such.

## Stop conditions

Stop without handing off a session if any snapshot, security, provenance, SHA, CLI/scaffold, OSLog configuration, concurrency, transport, run identity, or URL check fails or is ambiguous. With the explicit skip mode, do not start or wait for Swift Preflight. Never bypass another gate, cancel a remote run to recover its key, run a second session, or switch silently to the primary or no-Preflight mode.
