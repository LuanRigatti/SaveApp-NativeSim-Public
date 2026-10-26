[CmdletBinding()]
param([switch]$Publish)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$nl = [Environment]::NewLine
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 or newer is required.' }

$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$destinationRoot = [IO.Path]::GetFullPath((Join-Path $sourceRoot '..\SaveApp-NativeSim-Public'))
$expectedSource = [IO.Path]::GetFullPath('C:\Projetos\SaveApp')
$expectedDestination = [IO.Path]::GetFullPath('C:\Projetos\SaveApp-NativeSim-Public')
if ($sourceRoot -ne $expectedSource -or $destinationRoot -ne $expectedDestination) {
  throw 'Resolved paths are outside the two authorized SaveApp folders.'
}
Import-Module (Join-Path $PSScriptRoot 'SaveAppMirrorSecurity.psm1') -Force -DisableNameChecking -ErrorAction Stop
$sourceRoot = Assert-SaveAppMirrorRoot -Root $sourceRoot
$destinationRoot = Assert-SaveAppMirrorRoot -Root $destinationRoot

$allowedFiles = @(
  'README.md','AI_CONTEXT.md','AGENTS.md','.gitignore',
  'app.config.js','babel.config.js','eas.json','eslint.config.js','expo-env.d.ts',
  'index.ts','jest.config.js','metro.config.js','package.json','package-lock.json','tsconfig.json',
  'modules/document-thumbnailing/package.json','modules/document-thumbnailing/expo-module.config.json',
  'modules/document-thumbnailing/ios/SaveAppDocumentThumbnailing.podspec',
  'modules/document-thumbnailing/ios/SaveAppDocumentThumbnailingModule.swift',
  'modules/document-thumbnailing/src/index.ts',
  'plugins/withStarterToolbarSync.js',
  'scripts/patch-expo-ui-bottom-sheet.js','scripts/patch-expo-module-scan-timeout.js',
  'scripts/verify-saveapp-native.js',
  'scripts/create-saveapp-provisional-icon.ps1',
  'scripts/mirror-saveapp.ps1','scripts/Invoke-SaveAppSwiftPreflight.ps1',
  'scripts/Start-SaveAppNativeSim.ps1','scripts/Download-SaveAppSimulatorArchive.ps1',
  'scripts/SaveAppMirrorSecurity.psm1','scripts/SaveAppNativeSimCliGuard.psm1',
  '.github/workflows/native-sim.yml','.github/workflows/swift-preflight.yml',
  '.github/workflows/eas-build.yml','.github/native-sim/gate.cjs'
)
$allowedDirectories = @('assets','src','docs','.agents/skills','tests')
function Invoke-Git {
  param([string]$Repository,[string[]]$GitArguments)
  $result = & git -C $Repository @GitArguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "git $($GitArguments -join ' ') failed in $Repository : $result" }
  return @($result | ForEach-Object { "$_" })
}
function Get-RelativePath {
  param([string]$Base,[string]$FullPath)
  return [IO.Path]::GetRelativePath($Base,$FullPath).Replace('\','/')
}
function Test-AllowedRelativePath {
  param([string]$RelativePath)
  return Test-SaveAppMirrorAllowedRelativePath -RelativePath $RelativePath `
    -AllowedFiles $allowedFiles -AllowedDirectories $allowedDirectories
}
function Get-CandidateFiles {
  $result = [Collections.Generic.List[string]]::new()
  foreach ($relative in $allowedFiles) {
    if ($relative -eq '.nativesim-source') { continue }
    $path = Resolve-SaveAppMirrorPath -Base $sourceRoot -RelativePath $relative -ExpectedType File -AllowMissingLeaf
    if ($null -ne $path) { $result.Add($relative) }
  }
  foreach ($relativeDirectory in $allowedDirectories) {
    $path = Resolve-SaveAppMirrorPath -Base $sourceRoot -RelativePath $relativeDirectory -ExpectedType Directory -AllowMissingLeaf
    if ($null -eq $path) { continue }
    $pending = [Collections.Generic.Stack[string]]::new()
    $pending.Push($relativeDirectory)
    while ($pending.Count -gt 0) {
      $currentRelative = $pending.Pop()
      $currentPath = Resolve-SaveAppMirrorPath -Base $sourceRoot -RelativePath $currentRelative -ExpectedType Directory
      foreach ($item in Get-ChildItem -LiteralPath $currentPath -Force -ErrorAction Stop) {
        $itemRelative = Get-RelativePath -Base $sourceRoot -FullPath $item.FullName
        $expectedType = if ($item.PSIsContainer) { 'Directory' } else { 'File' }
        $null = Resolve-SaveAppMirrorPath -Base $sourceRoot -RelativePath $itemRelative -ExpectedType $expectedType
        if ($item.PSIsContainer) {
          $pending.Push($itemRelative)
        } else {
          $result.Add($itemRelative)
        }
      }
    }
  }
  return @($result | Sort-Object -Unique)
}
function Assert-SafeFiles {
  param([string]$Base,[string[]]$RelativePaths)
  foreach ($relative in $RelativePaths) {
    $normalized = $relative.Replace('\','/')
    if (-not (Test-AllowedRelativePath $normalized) -and $normalized -ne '.nativesim-source') {
      throw "File is outside the publication allowlist: $normalized"
    }
    if (Test-SaveAppMirrorBlockedName -RelativePath $normalized) { throw "Blocked file name: $normalized" }
    $fullPath = Resolve-SaveAppMirrorPath -Base $Base -RelativePath $normalized -ExpectedType File -AllowMissingLeaf
    if ($null -eq $fullPath) { continue }
    if ([IO.Path]::GetExtension($fullPath) -in @('.png','.jpg','.jpeg','.webp','.pdf','.zip','.tar','.gz')) { continue }
    $text = Get-Content -LiteralPath $fullPath -Raw -ErrorAction Stop
    $null = Assert-SaveAppSafeContent -RelativePath $normalized -Content $text
  }
}
function Assert-Remote {
  param([string]$Repository,[string]$ExpectedSlug)
  $repositoryPath = "LuanRigatti/$ExpectedSlug"
  $fetchUrls = @(Invoke-Git -Repository $Repository -GitArguments @('remote','get-url','--all','origin'))
  if (-not (Test-SaveAppGitHubRemote -RemoteUrls $fetchUrls -ExpectedRepository $repositoryPath)) {
    throw "origin fetch URL must be the exact GitHub repository $repositoryPath, with exactly one URL."
  }
  $pushUrls = @(Invoke-Git -Repository $Repository -GitArguments @('remote','get-url','--push','--all','origin'))
  if (-not (Test-SaveAppGitHubRemote -RemoteUrls $pushUrls -ExpectedRepository $repositoryPath)) {
    throw "origin push URL must be the exact GitHub repository $repositoryPath, with exactly one URL."
  }
}
function Assert-GitRoot {
  param([string]$Repository)
  $actual = [IO.Path]::GetFullPath(((Invoke-Git -Repository $Repository -GitArguments @('rev-parse','--show-toplevel')) -join $nl).Trim())
  if ($actual -ne [IO.Path]::GetFullPath($Repository)) { throw "Unexpected Git root: $actual" }
  $item = Get-Item -LiteralPath $Repository -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Git root is a linked/reparse path: $Repository" }
}
$sourceBranch = ((Invoke-Git $sourceRoot @('branch','--show-current')) -join '').Trim()
if ($sourceBranch -ne 'main') { throw "SaveApp source must be on main; found $sourceBranch." }
Assert-GitRoot $sourceRoot
Assert-Remote $sourceRoot 'SaveApp'
$sourceStatus = (Invoke-Git $sourceRoot @('status','--porcelain=v1','--untracked-files=all')) -join $nl
if ($sourceStatus.Trim()) { throw 'SaveApp source worktree must be clean before mirroring.' }
$sourceSha = ((Invoke-Git $sourceRoot @('rev-parse','HEAD')) -join '').Trim()
$sourceRemote = ((Invoke-Git $sourceRoot @('ls-remote','origin','refs/heads/main')) -join $nl).Trim()
if (-not $sourceRemote -or $sourceRemote.Split()[0] -ne $sourceSha) {
  throw 'The private SaveApp remote is not exactly at the local source SHA.'
}
$privateVisibility = (& gh repo view LuanRigatti/SaveApp --json visibility --jq .visibility 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $privateVisibility.ToUpperInvariant() -ne 'PRIVATE') {
  throw 'LuanRigatti/SaveApp must exist and be PRIVATE.'
}
$publicVisibility = (& gh repo view LuanRigatti/SaveApp-NativeSim-Public --json visibility --jq .visibility 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $publicVisibility.ToUpperInvariant() -ne 'PUBLIC') {
  throw 'LuanRigatti/SaveApp-NativeSim-Public must exist and be PUBLIC.'
}

if (-not (Test-Path -LiteralPath (Join-Path $destinationRoot '.git'))) {
  throw 'The public mirror folder must already be an initialized Git checkout; refusing to initialize or replace it.'
}
Assert-GitRoot $destinationRoot
Assert-Remote $destinationRoot 'SaveApp-NativeSim-Public'
$destinationBranch = ((Invoke-Git $destinationRoot @('branch','--show-current')) -join '').Trim()
if ($destinationBranch -ne 'main') { throw "Public mirror must be on main; found $destinationBranch." }
$destinationStatus = (Invoke-Git $destinationRoot @('status','--porcelain=v1','--untracked-files=all')) -join $nl
if ($destinationStatus.Trim() -and -not $Publish) { throw 'Public mirror worktree must be clean before creating a mirror preview.' }
$hasStagedPreview = [bool]$destinationStatus.Trim()
if ($hasStagedPreview) {
  $previewUnstaged = (Invoke-Git $destinationRoot @('diff','--name-only')) -join $nl
  $previewUntracked = @(Invoke-Git $destinationRoot @('ls-files','--others','--exclude-standard'))
  if ($previewUnstaged.Trim() -or $previewUntracked.Count) {
    throw 'An automatic publish can consume only a clean, script-generated staged preview; unstaged or untracked files exist.'
  }
}
$destinationHead = ((Invoke-Git $destinationRoot @('rev-parse','HEAD')) -join '').Trim()
if ($destinationHead -notmatch '^[0-9a-f]{40}$') { throw 'Public mirror main has no valid local commit; refusing replacement.' }
$destinationLive = ((Invoke-Git $destinationRoot @('ls-remote','origin','refs/heads/main')) -join $nl).Trim()
if (-not $destinationLive) {
  throw 'Public mirror origin/main is empty; after all local checks, root must bootstrap it with an empty root commit before publication.'
}
if ($destinationLive.Split()[0] -ne $destinationHead) {
  throw 'Public mirror local main must exactly match live origin/main before mirroring.'
}

$candidates = @(Get-CandidateFiles)
if ($candidates.Count -lt 1) { throw 'The mirror allowlist produced no files.' }
Assert-SafeFiles $sourceRoot $candidates
$expectedProvenance = @(
  'source_repository=LuanRigatti/SaveApp'
  'source_branch=main'
  "source_commit=$sourceSha"
) -join $nl
if ($hasStagedPreview) {
  $previewPaths = @(Invoke-Git $destinationRoot @('diff','--cached','--name-only'))
  foreach ($relative in $previewPaths) {
    if (-not (Test-AllowedRelativePath $relative) -and $relative -ne '.nativesim-source') {
      throw "Staged preview includes a path outside the allowlist: $relative"
    }
  }
  foreach ($relative in $candidates) {
    $sourceFile = Resolve-SaveAppMirrorPath -Base $sourceRoot -RelativePath $relative -ExpectedType File
    $previewFile = Resolve-SaveAppMirrorPath -Base $destinationRoot -RelativePath $relative -ExpectedType File -AllowMissingLeaf
    if ($null -eq $previewFile -or
        (Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $previewFile -Algorithm SHA256).Hash) {
      throw "Staged preview does not exactly match the current private source snapshot: $relative"
    }
  }
  $previewProvenancePath = Resolve-SaveAppMirrorPath -Base $destinationRoot -RelativePath '.nativesim-source' -ExpectedType File
  $previewProvenance = Get-Content -LiteralPath $previewProvenancePath -Raw
  if ($previewProvenance.TrimEnd([char[]]@("`r","`n")) -ne $expectedProvenance) {
    throw 'Staged preview provenance does not match the current private source commit.'
  }
}
foreach ($relative in $candidates) {
  $null = Copy-SaveAppMirrorFile -SourceRoot $sourceRoot -MirrorRoot $destinationRoot -RelativePath $relative
}
$provenance = $expectedProvenance
$null = Write-SaveAppProvenance -MirrorRoot $destinationRoot -Content $provenance
$candidates = @($candidates + '.nativesim-source' | Sort-Object -Unique)
Assert-SafeFiles $destinationRoot $candidates

$knownPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($relative in $candidates) { [void]$knownPaths.Add($relative) }
$destinationEntries = @(Invoke-Git $destinationRoot @('ls-files','-co','--exclude-standard'))
$destinationEntries += @(Invoke-Git $destinationRoot @('diff','--cached','--name-only'))
$destinationEntries = @($destinationEntries | Sort-Object -Unique)
$stalePaths = [Collections.Generic.List[string]]::new()
foreach ($entry in $destinationEntries) {
  $relative = $entry.Replace('\','/')
  if ($relative -eq '.nativesim-source') { continue }
  if ((Test-AllowedRelativePath $relative) -and -not $knownPaths.Contains($relative)) { $stalePaths.Add($relative) }
}
foreach ($relative in $stalePaths) {
  $full = Resolve-SaveAppMirrorPath -Base $destinationRoot -RelativePath $relative -ExpectedType File -AllowMissingLeaf
  if ($null -ne $full) { Remove-Item -LiteralPath $full }
}

$stagePaths = @($candidates + $stalePaths | Sort-Object -Unique | ForEach-Object { ':(literal)' + $_ })
& git -C $destinationRoot add -A -- @stagePaths
if ($LASTEXITCODE -ne 0) { throw 'Could not stage the exact allowlist.' }
& git -C $destinationRoot diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Staged mirror diff failed git diff --check.' }
$stagedPathResult = Get-SaveAppMirrorStagedPathResult `
  -GitOutput (Invoke-Git $destinationRoot @('diff','--cached','--name-only')) `
  -AllowedFiles $allowedFiles `
  -AllowedDirectories $allowedDirectories `
  -AdditionalAllowedPaths @('.nativesim-source')
$stagedPaths = $stagedPathResult.Paths
foreach ($relative in $stagedPaths) {
  $normalized = $relative.Replace('\','/')
  if (-not (Test-AllowedRelativePath $normalized) -and $normalized -ne '.nativesim-source') {
    throw "Staged path is outside the mirror allowlist: $normalized"
  }
}
$untrackedPaths = @(Invoke-Git $destinationRoot @('ls-files','--others','--exclude-standard'))
if ($untrackedPaths.Count) { throw "Untracked files exist outside the reviewed mirror snapshot: $($untrackedPaths -join ', ')" }
$unstaged = (Invoke-Git $destinationRoot @('diff','--name-only')) -join $nl
if ($unstaged.Trim()) { throw 'The public mirror has unstaged edits; inspect them before publication.' }

Write-Output "Source SHA: $sourceSha"
Write-Output "Allowlisted files: $($candidates.Count)"
Write-Output "Stale allowlisted files removed: $($stalePaths.Count)"
Write-Output 'Credential and previous-application scan: passed'
Write-Output 'Added, changed, and removed paths:'
& git -C $destinationRoot diff --cached --name-status
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the staged mirror path changes.' }
if ($Publish) {
  Write-Output 'The exact staged snapshot passed the allowlist, provenance, credential, and previous-application checks.'
} else {
  Write-Output 'Review the staged diff before using -Publish.'
}
& git -C $destinationRoot diff --cached --stat
if (-not $Publish) {
  Write-Output 'Preview only: no commit or push was performed.'
  return
}
if (-not $stagedPathResult.HasChanges) {
  Write-Output 'The public mirror already matches this source snapshot; no commit or push is needed.'
  return
}

$hasHead = $true
& git -C $destinationRoot rev-parse --verify HEAD *> $null
if ($LASTEXITCODE -ne 0) { $hasHead = $false }
$liveOutput = (& git -C $destinationRoot ls-remote origin refs/heads/main 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw "Could not read live public main: $liveOutput" }
$liveSha = if ($liveOutput) { $liveOutput.Split()[0] } else { '' }
if ($liveSha) {
  & git -C $destinationRoot fetch --no-tags origin main
  if ($LASTEXITCODE -ne 0) { throw 'Could not fetch public main for fast-forward validation.' }
  if (-not $hasHead) { throw 'Public main exists remotely but local history is absent; refusing replacement.' }
  $localHead = ((Invoke-Git $destinationRoot @('rev-parse','HEAD')) -join '').Trim()
  & git -C $destinationRoot merge-base --is-ancestor $liveSha $localHead
  if ($LASTEXITCODE -ne 0) { throw 'Live public main is not an ancestor of local main; no reset or force push will be attempted.' }
} elseif ($hasHead) {
  throw 'Local public history exists but remote main is empty; refusing ambiguous publication.'
}

$identity = & git -C $destinationRoot var GIT_AUTHOR_IDENT 2>$null
if ($LASTEXITCODE -ne 0) {
  & git -C $destinationRoot config user.name 'SaveApp Mirror'
  & git -C $destinationRoot config user.email 'saveapp-mirror@users.noreply.github.com'
}
$commitArgs = @(
  'commit',
  '-m',"Mirror SaveApp source $($sourceSha.Substring(0,12))",
  '-m','Source-Repository: LuanRigatti/SaveApp',
  '-m',"Source-Commit: $sourceSha",
  '-m','Source-Branch: main'
)
& git -C $destinationRoot @commitArgs
if ($LASTEXITCODE -ne 0) { throw 'Mirror commit failed.' }
& git -C $destinationRoot push --set-upstream origin main
if ($LASTEXITCODE -ne 0) { throw 'Normal fast-forward push failed; no force push was attempted.' }
$publishedSha = ((Invoke-Git $destinationRoot @('rev-parse','HEAD')) -join '').Trim()
$remoteAfter = ((Invoke-Git $destinationRoot @('ls-remote','origin','refs/heads/main')) -join $nl).Trim()
if (-not $remoteAfter -or $remoteAfter.Split()[0] -ne $publishedSha) { throw 'Post-push remote SHA verification failed.' }
$finalStatus = (Invoke-Git $destinationRoot @('status','--porcelain=v1','--untracked-files=all')) -join $nl
if ($finalStatus.Trim()) { throw 'Public mirror is not clean after the successful mirror push.' }
Write-Output "Published source $sourceSha as mirror commit $publishedSha."
