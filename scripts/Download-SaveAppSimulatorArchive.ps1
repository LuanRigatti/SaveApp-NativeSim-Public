[CmdletBinding()]
param(
  [ValidatePattern('^[0-9]+$')][string]$RunId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 or newer is required.' }

$repo = 'LuanRigatti/SaveApp-NativeSim-Public'
$publicRoot = [IO.Path]::GetFullPath('C:\Projetos\SaveApp-NativeSim-Public')
$expectedRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\SaveApp-NativeSim-Public'))
if ($publicRoot -ne $expectedRoot -or -not (Test-Path -LiteralPath $publicRoot -PathType Container)) {
  throw 'SaveApp-NativeSim-Public is missing or resolves outside the authorized mirror folder.'
}
Import-Module (Join-Path $PSScriptRoot 'SaveAppNativeSimCliGuard.psm1') -Force -DisableNameChecking -ErrorAction Stop
Import-Module (Join-Path $PSScriptRoot 'SaveAppMirrorSecurity.psm1') -Force -DisableNameChecking -ErrorAction Stop

function Invoke-GitText {
  param([string[]]$GitArguments)
  $output = & git -C $publicRoot @GitArguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "git $($GitArguments -join ' ') failed: $output" }
  return (($output | ForEach-Object { "$_" }) -join "`n").Trim()
}

function Invoke-GhText {
  param([string[]]$GhArguments)
  $output = & gh @GhArguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "gh $($GhArguments -join ' ') failed: $output" }
  return (($output | ForEach-Object { "$_" }) -join "`n").Trim()
}

function Get-VerifiedRun {
  param([Parameter(Mandatory)][string]$Id)
  $json = Invoke-GhText @('api',"repos/$repo/actions/runs/$Id")
  $run = $json | ConvertFrom-Json
  return (Assert-SaveAppArchiveRun -Run $run -ExpectedId $Id)
}

function Get-ArchiveArtifact {
  param([Parameter(Mandatory)][string]$Id,[Parameter(Mandatory)][string]$Session)
  $artifactName = "native-sim-app-$Session"
  $json = Invoke-GhText @('api',"repos/$repo/actions/runs/$Id/artifacts?per_page=100")
  $response = $json | ConvertFrom-Json
  return (Select-SaveAppArchiveArtifact -Artifacts @($response.artifacts) -ExpectedName $artifactName)
}

function Test-ArchiveBuildSteps {
  param([Parameter(Mandatory)][string]$Id)
  $json = Invoke-GhText @('api',"repos/$repo/actions/runs/$Id/jobs?per_page=100")
  $jobs = @(($json | ConvertFrom-Json).jobs)
  $steps = @($jobs | ForEach-Object { $_.steps })
  return Test-SaveAppArchiveBuildSteps -Steps $steps
}

function Assert-ArchiveBuildSteps {
  param([Parameter(Mandatory)][string]$Id)
  if (-not (Test-ArchiveBuildSteps -Id $Id)) {
    throw "Run $Id has not completed the Simulator build, archive export, and artifact upload successfully."
  }
}

function Assert-NoReparsePath {
  param([string]$Base,[string]$RelativePath)
  $current = $Base
  foreach ($segment in $RelativePath.Replace('\','/').Split('/')) {
    $current = Join-Path $current $segment
    if (-not (Test-Path -LiteralPath $current)) { continue }
    $item = Get-Item -LiteralPath $current -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Refusing to use a linked/reparse archive path: $RelativePath"
    }
  }
}

$root = [IO.Path]::GetFullPath((Invoke-GitText @('rev-parse','--show-toplevel')))
if ($root -ne $publicRoot) { throw 'Unexpected Git root for the NativeSim mirror.' }
$branch = Invoke-GitText @('branch','--show-current')
if ($branch -ne 'main') { throw "Public mirror must be on main; found '$branch'." }
if (-not (Test-SaveAppGitHubRemote -RemoteUrls @(Invoke-GitText @('remote','get-url','--all','origin')) -ExpectedRepository $repo)) {
  throw 'The public mirror fetch remote must be the exact GitHub repository with one URL.'
}
if (-not (Test-SaveAppGitHubRemote -RemoteUrls @(Invoke-GitText @('remote','get-url','--push','--all','origin')) -ExpectedRepository $repo)) {
  throw 'The public mirror push remote must be the exact GitHub repository with one URL.'
}
$visibility = Invoke-GhText @('repo','view',$repo,'--json','visibility','--jq','.visibility')
if ($visibility.ToUpperInvariant() -ne 'PUBLIC') { throw 'SaveApp-NativeSim-Public must be public.' }
$liveMain = Invoke-GitText @('ls-remote','origin','refs/heads/main')
if (-not $liveMain) { throw 'Could not resolve the live public main SHA.' }
$liveSha = $liveMain.Split()[0]

$selectedRun = $null
$selectedArtifact = $null
if ($RunId) {
  $selectedRun = Get-VerifiedRun -Id $RunId
  $titleJson = Invoke-GhText @('run','view',$RunId,'--repo',$repo,'--json','displayTitle')
  $title = ($titleJson | ConvertFrom-Json).displayTitle
  if ($title -notmatch '^native-sim (?<session>[a-f0-9]{8})\s+') { throw "Run $RunId has no valid NativeSim session identifier in its title." }
  $selectedArtifact = Get-ArchiveArtifact -Id $RunId -Session $Matches.session
  if (-not $selectedArtifact) { throw "Run $RunId has no available non-expired .app archive artifact." }
} else {
  $runsJson = Invoke-GhText @('run','list','--repo',$repo,'--workflow','native-sim.yml','--branch','main','--limit','100',
    '--json','databaseId,headSha,headBranch,status,conclusion,event')
  $runs = @($runsJson | ConvertFrom-Json | Where-Object {
    $_.headBranch -eq 'main' -and $_.event -eq 'workflow_dispatch' -and $_.status -in @('in_progress','completed')
  } | Sort-Object { [long]$_.databaseId } -Descending)
  foreach ($candidate in $runs) {
    $verified = Get-VerifiedRun -Id ([string]$candidate.databaseId)
    if ([string]$candidate.headSha -ne [string]$verified.head_sha) { continue }
    $titleJson = Invoke-GhText @('run','view',[string]$candidate.databaseId,'--repo',$repo,'--json','displayTitle')
    $title = ($titleJson | ConvertFrom-Json).displayTitle
    if ($title -notmatch '^native-sim (?<session>[a-f0-9]{8})\s+') { continue }
    $artifact = Get-ArchiveArtifact -Id ([string]$candidate.databaseId) -Session $Matches.session
    if ($artifact -and (Test-ArchiveBuildSteps -Id ([string]$candidate.databaseId))) {
      $selectedRun = $verified
      $selectedArtifact = $artifact
      break
    }
  }
  if (-not $selectedRun) { throw 'No existing NativeSim run with completed successful build, archive-export, upload steps, and an available artifact was found; no session or workflow was started.' }
}

Assert-ArchiveBuildSteps -Id ([string]$selectedRun.id)
$artifactName = [string]$selectedArtifact.name
$runIdValue = [string]$selectedRun.id
$sessionId = $artifactName.Substring('native-sim-app-'.Length)
$actionsUrl = [string]$selectedRun.html_url
$sourceSha = [string]$selectedRun.head_sha
$artifactRoot = Join-Path $publicRoot 'artifacts'
Assert-NoReparsePath -Base $publicRoot -RelativePath 'artifacts'
if (-not (Test-Path -LiteralPath $artifactRoot -PathType Container)) { New-Item -ItemType Directory -Path $artifactRoot | Out-Null }
$finalRoot = Join-Path $artifactRoot $runIdValue
if (Test-Path -LiteralPath $finalRoot) { throw "Archive output already exists for run $runIdValue; refusing to overwrite it: $finalRoot" }
$stagingRoot = Join-Path $artifactRoot ('.download-' + [guid]::NewGuid().ToString('N'))
Assert-NoReparsePath -Base $publicRoot -RelativePath (Join-Path 'artifacts' (Split-Path -Leaf $stagingRoot))
New-Item -ItemType Directory -Path $stagingRoot | Out-Null
try {
  & gh run download $runIdValue --repo $repo --name $artifactName --dir $stagingRoot
  if ($LASTEXITCODE -ne 0) { throw "GitHub CLI could not download artifact '$artifactName' from run $runIdValue." }
  $archives = @(Get-ChildItem -LiteralPath $stagingRoot -Filter '*.app.tar.gz' -File -Recurse)
  if ($archives.Count -ne 1) { throw "Expected one .app.tar.gz in downloaded artifact; found $($archives.Count)." }
  $null = Assert-SaveAppSimulatorArchive -Path $archives[0].FullName
  $archiveHash = (Get-FileHash -LiteralPath $archives[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  Move-Item -LiteralPath $stagingRoot -Destination $finalRoot
  $finalArchive = Join-Path $finalRoot $archives[0].Name
  Write-Output "Verified Simulator archive: $finalArchive"
  Write-Output "Run ID: $runIdValue | Session: $sessionId | SHA: $sourceSha | Current public main: $liveSha | Artifact: $artifactName"
  Write-Output "SHA-256: $archiveHash | GitHub Actions: $actionsUrl"
} finally {
  if (Test-Path -LiteralPath $stagingRoot) {
    $stageItem = Get-Item -LiteralPath $stagingRoot -Force -ErrorAction SilentlyContinue
    if ($stageItem -and ($stageItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
      Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}
