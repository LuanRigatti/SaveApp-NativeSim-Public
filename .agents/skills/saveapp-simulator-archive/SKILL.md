---
name: saveapp-simulator-archive
description: Locate an existing SaveApp NativeSim run with a verified uploaded .app.tar.gz and download it without starting another session or build.
---

# Download the SaveApp Simulator archive

Use only for an explicit archive retrieval request or `$saveapp-simulator-archive`. Never dispatch Swift Preflight, NativeSim, or another build from this skill. The main `$saveapp-nativesim` flow dispatches `export_app=true` and returns its links without waiting for the workflow artifact. SaveApp also has a separate Release archive workflow started by `$saveapp-archive-pipeline`; that orchestrator stops after it confirms the archive Run ID.

## Download

From either SaveApp folder, use PowerShell 7. Omit `-RunId` to find the newest existing `workflow_dispatch` run on public `main` whose Simulator build, archive export, and upload have succeeded and whose artifact is available. This can be an active 120-minute session; the script does not wait for it to finish. Pass `-RunId` to select one exact run:

```powershell
pwsh.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\Download-SaveAppSimulatorArchive.ps1
```

The script verifies the exact public repository, workflow path, `workflow_dispatch` event, `main` branch, run ID and SHA, successful Xcode build, archive-export and upload steps, session ID, exact `native-sim-app-<session>` name, and non-expired artifact attached to that run. It reports the run SHA even when it differs from today's `main`, downloads only that run's artifact, and validates one readable `.app.tar.gz` containing an `.app` bundle. It prints the archive SHA-256 and stores the verified file under `C:\Projetos\SaveApp-NativeSim-Public\artifacts\<run-id>` without overwriting an existing output.

The workflow retains new artifacts for seven days, subject to any lower repository or organization retention cap. The artifacts directory is ignored by Git. Stop if no qualifying artifact exists, if the run or artifact is ambiguous, or if archive integrity checks fail. Never start a new session, rerun Preflight, or rebuild to replace a missing artifact.

## Download a Release archive from the separate pipeline

When the user explicitly requests an archive created by `.github/workflows/simulator-archive.yml`, require its exact Actions Run ID and use the separate downloader. It accepts only that completed successful workflow run, validates the source/public SHA title and `.nativesim-source` provenance, confirms successful Swift Preflight for that exact public SHA, verifies the Release compile/sign/export/upload steps and exact non-expired `saveapp-simulator-archive-<run-id>` artifact, then stores it under `C:\Projetos\SaveApp-NativeSim-Public\artifacts\<run-id>` without overwriting existing files.

```powershell
pwsh.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\Download-SaveAppArchivePipelineArtifact.ps1 -RunId <RUN_ID>
```

The script reports the `.app.tar.gz` path, private and public SHAs, Preflight Run ID, and SHA-256. It does not dispatch workflows, wait for builds, start NativeSim, or download artifacts from another Run ID. Use the verified `.app` bundle in VibeView only after the script reports successful validation.
