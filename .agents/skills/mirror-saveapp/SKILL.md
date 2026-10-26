---
name: mirror-saveapp
description: Preview and independently publish the approved SaveApp main snapshot one way to SaveApp-NativeSim-Public. The primary $saveapp-nativesim flow also invokes the audited mirror script automatically.
---

# Mirror SaveApp to NativeSim Public

Use this skill for an explicit request to mirror/publish SaveApp, or an explicit `$mirror-saveapp` invocation. It remains the standalone preview-and-review flow. The explicit `$saveapp-nativesim` invocation authorizes its separate automated `-Publish` use after every script gate passes.

## Fixed repositories

- Private source: `C:\Projetos\SaveApp`, `LuanRigatti/SaveApp`, branch `main`.
- Public mirror: `C:\Projetos\SaveApp-NativeSim-Public`, `LuanRigatti/SaveApp-NativeSim-Public`, branch `main`.
- The direction is always private SaveApp to public mirror. Never copy or merge from public to private.
- Never operate on any other repository or checkout. The local snapshot gate may create and clean only its validated, uniquely named `C:\Projetos\SaveAppMirrorValidation-<GUID>` temporary directory beside the private source; it does not write to the public mirror.

## Publish flow

The public script refuses an empty remote `main`. After all local checks are complete, the repository owner must bootstrap `LuanRigatti/SaveApp-NativeSim-Public` with an empty root commit. This skill never bypasses that gate or initializes the public checkout.

Run in PowerShell 7 or later from the SaveApp folder:

Run the offline mirror/NativeSim security simulations first; they use temporary local fixtures and a mocked `gh` command and do not publish or dispatch workflows:

```powershell
Invoke-Pester -Path .\tests\SaveAppSecurity.Tests.ps1
```

Stop if the test exits unsuccessfully. Then preview the mirror:

The mirror script first creates an exact snapshot from the publication allowlist and validates its hashes/provenance, performs a clean `npm ci`, runs typecheck, lint, the complete Jest suite, native contracts, Expo dependency checks, Expo Doctor, and the NativeSim security simulations. The snapshot is kept in the dedicated temporary sibling path above and removed afterward. A missing required file or failed check blocks before any public copy, staging, commit, push, Swift Preflight, or NativeSim.

```powershell
pwsh.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\mirror-saveapp.ps1
```

The default run copies the explicit allowlist into the public mirror and stages those files as a review preview. Inspect the script's safety result and the complete staged diff before publishing:

```powershell
git -C C:\Projetos\SaveApp-NativeSim-Public diff --cached --check
git -C C:\Projetos\SaveApp-NativeSim-Public diff --cached --name-status
git -C C:\Projetos\SaveApp-NativeSim-Public diff --cached
```

Confirm that the source is clean on `main` and exactly matches the private GitHub remote, the public mirror is `PUBLIC`, every staged file is allowlisted, no credentials or original-application references were found, and only the intended SaveApp template files are staged. The script blocks `.env`, credentials, Firebase files, certificates, build output, and unapproved paths. It records the source commit in `.nativesim-source` and the mirror commit trailers.

When those checks pass, publish the reviewed snapshot:

```powershell
pwsh.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\mirror-saveapp.ps1 -Publish
```

The script requires the private source and public destination to be clean and the public local `main` to equal live `origin/main` before copying. Before reading, enumerating, copying, deleting, or writing it validates every path component from the volume/share root through the authorized repository root, and rejects symlinks, junctions, other reparse points, unresolved paths, and escapes. It prints added, changed, and removed paths; scans the allowlist for credentials and blocked references; and uses only a normal fast-forward push. Each copied file and `.nativesim-source` is written to a validated same-directory temporary file created exclusively, then atomically replaced, so an existing hard link cannot redirect writes outside the mirror. It verifies provenance, remote equality, and a clean destination afterward. It never force-pushes. Stop if any gate fails; do not work around a failed allowlist or scanner result.

## Report

Return the private source SHA, public mirror commit SHA, changed paths, scan result, branch/remote equality, and whether a commit/push occurred. A preview leaves staged changes in the public mirror and is not a completed publication.
