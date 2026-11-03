[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[1-9][0-9]*$')][string]$RunId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 or newer is required.' }

$repo = 'LuanRigatti/SaveApp-NativeSim-Public'
$workflowPath = '.github/workflows/simulator-archive.yml'
$publicRoot = [IO.Path]::GetFullPath('C:\Projetos\SaveApp-NativeSim-Public')
$expectedRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\SaveApp-NativeSim-Public'))
if ($publicRoot -cne $expectedRoot -or -not (Test-Path -LiteralPath $publicRoot -PathType Container)) {
  throw 'The initialized SaveApp-NativeSim-Public checkout is required at its authorized path.'
}

Import-Module (Join-Path $PSScriptRoot 'SaveAppNativeSimCliGuard.psm1') -Force -DisableNameChecking -ErrorAction Stop
Import-Module (Join-Path $PSScriptRoot 'SaveAppMirrorSecurity.psm1') -Force -DisableNameChecking -ErrorAction Stop

function Invoke-GitText {
  param([Parameter(Mandatory)][string[]]$GitArguments)
  $output = & git -C $publicRoot @GitArguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "git $($GitArguments -join ' ') failed in the authorized public mirror." }
  return (($output | ForEach-Object { "$_" }) -join "`n").Trim()
}

function Invoke-GhText {
  param([Parameter(Mandatory)][string[]]$GhArguments)
  $output = & gh @GhArguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "GitHub CLI operation failed: gh $($GhArguments -join ' ')" }
  return (($output | ForEach-Object { "$_" }) -join "`n").Trim()
}

function Get-VerifiedRun {
  $json = Invoke-GhText @('api',"repos/$repo/actions/runs/$RunId")
  $run = $json | ConvertFrom-Json
  if ([string]$run.id -cne $RunId -or [string]$run.path -cne $workflowPath -or
      [string]$run.event -cne 'workflow_dispatch' -or [string]$run.head_branch -cne 'main' -or
      [string]$run.status -cne 'completed' -or [string]$run.conclusion -cne 'success' -or
      [string]$run.head_sha -notmatch '^[0-9a-f]{40}$') {
    throw "Run $RunId is not a successful completed Release Simulator archive workflow on public main."
  }
  return $run
}

function Get-TitleParts {
  param([Parameter(Mandatory)][string]$Title)
  $match = [regex]::Match($Title,'^SaveApp simulator archive \| source=(?<source>[0-9a-f]{40}) \| public=(?<public>[0-9a-f]{40}) \| preflight=(?<preflight>[1-9][0-9]*) \| Release$')
  if (-not $match.Success) { throw 'The archive run title does not identify the source, public SHA, exact Preflight, and Release configuration.' }
  return [pscustomobject]@{
    SourceSha = $match.Groups['source'].Value
    PublicSha = $match.Groups['public'].Value
    PreflightRunId = $match.Groups['preflight'].Value
  }
}

function Assert-Preflight {
  param([Parameter(Mandatory)][string]$PublicSha,[Parameter(Mandatory)][string]$PreflightRunId)
  $json = Invoke-GhText @('api',"repos/$repo/actions/runs/$PreflightRunId")
  $run = $json | ConvertFrom-Json
  if ([string]$run.id -cne $PreflightRunId -or
      [string]$run.path -cne '.github/workflows/swift-preflight.yml' -or
      [string]$run.event -cne 'workflow_dispatch' -or [string]$run.head_branch -cne 'main' -or
      [string]$run.head_sha -cne $PublicSha -or [string]$run.status -cne 'completed' -or
      [string]$run.conclusion -cne 'success') {
    throw 'The archive Run ID does not reference a successful Swift Preflight for its exact public SHA.'
  }
}

function Assert-Provenance {
  param([Parameter(Mandatory)][string]$PublicSha,[Parameter(Mandatory)][string]$SourceSha)
  $json = Invoke-GhText @('api',"repos/$repo/contents/.nativesim-source?ref=$PublicSha")
  $response = $json | ConvertFrom-Json
  if ([string]$response.encoding -cne 'base64' -or [string]$response.path -cne '.nativesim-source') {
    throw 'GitHub did not return the expected provenance file at the exact archive SHA.'
  }
  $content = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(([string]$response.content -replace '\s','')))
  $expected = "source_repository=LuanRigatti/SaveApp`nsource_branch=main`nsource_commit=$SourceSha"
  if ($content.Replace("`r`n","`n").TrimEnd("`n") -cne $expected) {
    throw 'Archive provenance does not match the private SaveApp main commit recorded in its run title.'
  }
}

function Assert-SuccessfulBuildSteps {
  $json = Invoke-GhText @('api',"repos/$repo/actions/runs/$RunId/jobs?per_page=100")
  $jobs = @(($json | ConvertFrom-Json).jobs)
  if ($jobs.Count -ne 1 -or [string]$jobs[0].status -cne 'completed' -or [string]$jobs[0].conclusion -cne 'success') {
    throw 'The archive workflow job is not completed successfully.'
  }
  $steps = @($jobs[0].steps)
  foreach ($name in @(
    'Compile Release app for generic iOS Simulator',
    'Ad hoc sign app and ExpoWidgets extension, then verify both signatures',
    'Export SaveApp.app.tar.gz',
    'Upload SaveApp Simulator archive'
  )) {
    $matches = @($steps | Where-Object { [string]$_.name -ceq $name })
    if ($matches.Count -ne 1 -or [string]$matches[0].status -cne 'completed' -or [string]$matches[0].conclusion -cne 'success') {
      throw "Required Release archive step did not succeed: $name"
    }
  }
}

function Assert-NoReparsePath {
  param([Parameter(Mandatory)][string]$Base,[Parameter(Mandatory)][string]$RelativePath)
  $current = $Base
  foreach ($segment in $RelativePath.Replace('\','/').Split('/')) {
    $current = Join-Path $current $segment
    if (-not (Test-Path -LiteralPath $current)) { continue }
    $item = Get-Item -LiteralPath $current -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Refusing a linked/reparse artifact path: $RelativePath"
    }
  }
}

function Assert-SafeTarEntries {
  param([Parameter(Mandatory)][string]$ArchivePath)
  $entries = @(& tar -tzf $ArchivePath 2>&1)
  if ($LASTEXITCODE -ne 0 -or $entries.Count -eq 0) { throw 'The downloaded archive is unreadable or empty.' }
  $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($entryValue in $entries) {
    $entry = ([string]$entryValue).Replace('\','/').TrimEnd('/')
    $segments = @($entry.Split('/'))
    if ([string]::IsNullOrWhiteSpace($entry) -or $entry.StartsWith('/') -or
        $entry -match '^[A-Za-z]:' -or
        @($segments | Where-Object { $_ -in @('','.', '..') }).Count -gt 0 -or
        ($entry -cne 'SaveApp.app' -and -not $entry.StartsWith('SaveApp.app/',[StringComparison]::Ordinal)) -or
        -not $seen.Add($entry)) {
      throw 'The archive contains an unsafe or escaping member path.'
    }
  }
  foreach ($required in @('SaveApp.app/Info.plist','SaveApp.app/PlugIns/ExpoWidgetsTarget.appex/Info.plist')) {
    if ($entries -cnotcontains $required) { throw "The archive is missing required iOS app bundle content: $required" }
  }
  return $entries.Count
}

$null = & gh auth status --hostname github.com 2>&1
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI authentication is unavailable.' }
$root = [IO.Path]::GetFullPath((Invoke-GitText @('rev-parse','--show-toplevel')))
if ($root -cne $publicRoot) { throw 'Unexpected Git root for the public SaveApp mirror.' }
if ((Invoke-GitText @('branch','--show-current')) -cne 'main') { throw 'The public SaveApp mirror must be on main.' }
if (-not (Test-SaveAppGitHubRemote -RemoteUrls @(Invoke-GitText @('remote','get-url','--all','origin')) -ExpectedRepository $repo) -or
    -not (Test-SaveAppGitHubRemote -RemoteUrls @(Invoke-GitText @('remote','get-url','--push','--all','origin')) -ExpectedRepository $repo)) {
  throw 'The public mirror fetch and push remotes must both be the exact authorized GitHub repository.'
}
if ((Invoke-GhText @('repo','view',$repo,'--json','visibility','--jq','.visibility')).ToUpperInvariant() -cne 'PUBLIC') {
  throw 'SaveApp-NativeSim-Public must be public.'
}

$run = Get-VerifiedRun
$title = Invoke-GhText @('run','view',$RunId,'--repo',$repo,'--json','displayTitle') | ConvertFrom-Json
$parts = Get-TitleParts -Title ([string]$title.displayTitle)
if ([string]$run.head_sha -cne $parts.PublicSha) { throw 'The archive title public SHA differs from the workflow run head SHA.' }
Assert-Preflight -PublicSha $parts.PublicSha -PreflightRunId $parts.PreflightRunId
Assert-Provenance -PublicSha $parts.PublicSha -SourceSha $parts.SourceSha
Assert-SuccessfulBuildSteps

$artifactName = "saveapp-simulator-archive-$RunId"
$artifactJson = Invoke-GhText @('api',"repos/$repo/actions/runs/$RunId/artifacts?per_page=100")
$artifactResponse = $artifactJson | ConvertFrom-Json
$artifact = Select-SaveAppArchiveArtifact -Artifacts @($artifactResponse.artifacts) -ExpectedName $artifactName
if ($null -eq $artifact) { throw "Run $RunId has no unique available artifact named $artifactName." }

$artifactRoot = Join-Path $publicRoot 'artifacts'
Assert-NoReparsePath -Base $publicRoot -RelativePath 'artifacts'
if (-not (Test-Path -LiteralPath $artifactRoot -PathType Container)) {
  New-Item -ItemType Directory -Path $artifactRoot | Out-Null
}
$finalRoot = Join-Path $artifactRoot $RunId
if (Test-Path -LiteralPath $finalRoot) { throw "Refusing to overwrite existing archive output: $finalRoot" }
$stagingName = '.archive-download-' + [guid]::NewGuid().ToString('N')
$stagingRoot = Join-Path $artifactRoot $stagingName
Assert-NoReparsePath -Base $publicRoot -RelativePath (Join-Path 'artifacts' $stagingName)
New-Item -ItemType Directory -Path $stagingRoot | Out-Null
try {
  & gh run download $RunId --repo $repo --name $artifactName --dir $stagingRoot
  if ($LASTEXITCODE -ne 0) { throw "GitHub could not download the verified artifact from run $RunId." }
  $files = @(Get-ChildItem -LiteralPath $stagingRoot -File -Recurse -Force)
  $directories = @(Get-ChildItem -LiteralPath $stagingRoot -Directory -Recurse -Force)
  foreach ($entry in @($files + $directories)) {
    if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Downloaded artifact contains a reparse point.' }
  }
  if ($files.Count -ne 1 -or $files[0].Name -cne 'SaveApp.app.tar.gz' -or $directories.Count -ne 0) {
    throw 'The run artifact must contain only SaveApp.app.tar.gz.'
  }
  $null = Assert-SaveAppSimulatorArchive -Path $files[0].FullName
  $entryCount = Assert-SafeTarEntries -ArchivePath $files[0].FullName
  $archiveSha256 = (Get-FileHash -LiteralPath $files[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.Directory]::Move($stagingRoot,$finalRoot)
  $finalArchive = Join-Path $finalRoot 'SaveApp.app.tar.gz'
  Write-Output "Verified archive: $finalArchive"
  Write-Output "Run ID: $RunId | Private source SHA: $($parts.SourceSha) | Public SHA: $($parts.PublicSha) | Preflight Run ID: $($parts.PreflightRunId)"
  Write-Output "Artifact: $artifactName | Entries: $entryCount | SHA-256: $archiveSha256"
  Write-Output "GitHub Actions: $($run.html_url)"
} finally {
  if (Test-Path -LiteralPath $stagingRoot) {
    $stageItem = Get-Item -LiteralPath $stagingRoot -Force -ErrorAction SilentlyContinue
    if ($stageItem -and ($stageItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
      Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}
