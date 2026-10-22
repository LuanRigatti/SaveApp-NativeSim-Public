[CmdletBinding()]
param(
  [ValidateRange(1, 300)][int]$TimeoutMinutes = 120,
  [switch]$NoWait,
  [switch]$PassThru
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 or newer is required.' }

$publicRoot = [IO.Path]::GetFullPath('C:\Projetos\SaveApp-NativeSim-Public')
$expectedRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\SaveApp-NativeSim-Public'))
if ($publicRoot -ne $expectedRoot -or -not (Test-Path -LiteralPath $publicRoot -PathType Container)) {
  throw 'SaveApp-NativeSim-Public is missing or resolves outside the authorized mirror folder.'
}

$repo = 'LuanRigatti/SaveApp-NativeSim-Public'
$workflow = 'swift-preflight.yml'
$workflowPath = '.github/workflows/swift-preflight.yml'
Import-Module (Join-Path $PSScriptRoot 'SaveAppMirrorSecurity.psm1') -Force -DisableNameChecking -ErrorAction Stop
$originUrls = @(& git -C $publicRoot remote get-url --all origin 2>&1)
if ($LASTEXITCODE -ne 0 -or -not (Test-SaveAppGitHubRemote -RemoteUrls $originUrls -ExpectedRepository $repo)) {
  throw 'The public mirror origin must be the exact GitHub repository LuanRigatti/SaveApp-NativeSim-Public with one fetch URL.'
}
$pushUrls = @(& git -C $publicRoot remote get-url --push --all origin 2>&1)
if ($LASTEXITCODE -ne 0 -or -not (Test-SaveAppGitHubRemote -RemoteUrls $pushUrls -ExpectedRepository $repo)) {
  throw 'The public mirror origin must have exactly one push URL targeting LuanRigatti/SaveApp-NativeSim-Public.'
}
$root = [IO.Path]::GetFullPath((& git -C $publicRoot rev-parse --show-toplevel 2>&1 | Out-String).Trim())
if ($LASTEXITCODE -ne 0 -or $root -ne $publicRoot) { throw 'Unexpected Git root for the NativeSim mirror.' }
$branch = (& git -C $publicRoot branch --show-current 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'main') { throw "Public mirror must be on main; found '$branch'." }
$status = (& git -C $publicRoot status --porcelain=v1 --untracked-files=all 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $status) { throw 'Public mirror worktree must be clean before Swift Preflight.' }
$sha = (& git -C $publicRoot rev-parse HEAD 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $sha -notmatch '^[0-9a-f]{40}$') { throw 'Could not resolve the public mirror HEAD SHA.' }
$live = (& git -C $publicRoot ls-remote origin refs/heads/main 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $live -or $live.Split()[0] -ne $sha) {
  throw 'Public mirror main is not exactly synchronized with its GitHub remote.'
}
$visibility = (& gh repo view $repo --json visibility --jq .visibility 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $visibility.ToUpperInvariant() -ne 'PUBLIC') { throw 'SaveApp-NativeSim-Public must exist and be public.' }
if (-not (Test-Path -LiteralPath (Join-Path $publicRoot $workflowPath) -PathType Leaf)) {
  throw "Swift Preflight workflow is missing: $workflowPath."
}

function Get-PreflightRuns {
  $json = & gh run list --repo $repo --workflow $workflow --branch main --commit $sha --limit 100 --json databaseId,headSha,headBranch,status,conclusion,url,event 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Could not query Swift Preflight runs: $json" }
  $parsed = @($json | ConvertFrom-Json)
  return $parsed
}

function Get-VerifiedPreflightRun {
  param([Parameter(Mandatory)][string]$RunId)
  $json = & gh api "repos/$repo/actions/runs/$RunId" 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Could not inspect Swift Preflight run $RunId : $json" }
  $run = $json | ConvertFrom-Json
  if ([string]$run.id -ne $RunId -or $run.path -ne $workflowPath -or $run.event -ne 'workflow_dispatch' -or
      $run.head_branch -ne 'main' -or $run.head_sha -ne $sha) {
    throw "Swift Preflight run $RunId does not match $repo, $workflowPath, workflow_dispatch, main, and exact SHA $sha."
  }
  return $run
}

function New-PreflightResult {
  param(
    [Parameter(Mandatory)]$Run,
    [Parameter(Mandatory)][bool]$Reused,
    [Parameter(Mandatory)][bool]$Passed
  )

  return [pscustomobject]@{
    Passed = $Passed
    Reused = $Reused
    Repository = $repo
    WorkflowPath = [string]$Run.path
    Event = [string]$Run.event
    RunId = [string]$Run.id
    Branch = [string]$Run.head_branch
    Sha = [string]$Run.head_sha
    Url = [string]$Run.html_url
    Status = [string]$Run.status
    Conclusion = [string]$Run.conclusion
  }
}

$runs = @(Get-PreflightRuns | Where-Object {
  $_.headSha -eq $sha -and $_.headBranch -eq 'main' -and $_.event -eq 'workflow_dispatch'
})
$lastKnownRunId = 0L
foreach ($candidate in $runs) {
  $candidateId = [long]$candidate.databaseId
  if ($candidateId -gt $lastKnownRunId) { $lastKnownRunId = $candidateId }
}
$active = @($runs | Where-Object { $_.status -in @('queued','in_progress','waiting','requested','pending') })
if ($active.Count -gt 1) { throw 'Multiple active Preflight runs target this exact SHA; refusing an ambiguous result.' }

$reused = $false
$run = $null
if ($active.Count -eq 1) {
  $run = Get-VerifiedPreflightRun -RunId ([string]$active[0].databaseId)
  $reused = $true
} else {
  $successful = @($runs | Where-Object { $_.status -eq 'completed' -and $_.conclusion -eq 'success' })
  if ($successful.Count -gt 0) {
    $ordered = @($successful | Sort-Object { [long]$_.databaseId } -Descending)
    foreach ($candidate in $ordered) {
      $verified = Get-VerifiedPreflightRun -RunId ([string]$candidate.databaseId)
      if ($verified.status -eq 'completed' -and $verified.conclusion -eq 'success') {
        $run = $verified
        $reused = $true
        break
      }
    }
  }
}

if (-not $run) {
  Write-Host "No successful or active exact-SHA Swift Preflight exists for $sha; dispatching one run."
  $dispatchOutput = @(& gh workflow run $workflow --repo $repo --ref main 2>&1)
  $dispatchExitCode = $LASTEXITCODE
  if ($dispatchExitCode -ne 0) {
    $dispatchDetails = ($dispatchOutput | ForEach-Object { "$_" }) -join "`n"
    throw "GitHub rejected Swift Preflight dispatch. $dispatchDetails"
  }

  $run = $null
  $discoverUntil = [DateTimeOffset]::UtcNow.AddMinutes(2)
  do {
    $matches = @(Get-PreflightRuns | Where-Object {
      $_.headSha -eq $sha -and $_.headBranch -eq 'main' -and $_.event -eq 'workflow_dispatch' -and
      [long]$_.databaseId -gt $lastKnownRunId
    })
    if ($matches.Count -gt 1) { throw 'Dispatch created multiple candidate runs; refusing an ambiguous result.' }
    if ($matches.Count -eq 1) {
      $run = Get-VerifiedPreflightRun -RunId ([string]$matches[0].databaseId)
      break
    }
    Start-Sleep -Seconds 5
  } while ([DateTimeOffset]::UtcNow -lt $discoverUntil)
  if (-not $run) { throw "No Swift Preflight run appeared for exact SHA $sha after dispatch." }
}

$runId = [string]$run.id
if (-not $runId) { throw 'Swift Preflight run has no GitHub run ID.' }
if ($NoWait -and $run.status -ne 'completed') {
  $result = New-PreflightResult -Run $run -Reused $reused -Passed $false
  if ($PassThru) { return $result }
  Write-Output "Swift Preflight run: $($result.Url)"
  Write-Output "Run ID: $runId | Branch: main | SHA: $sha | Status: $($result.Status)"
  return
}

$deadline = [DateTimeOffset]::UtcNow.AddMinutes($TimeoutMinutes)
do {
  $current = Get-VerifiedPreflightRun -RunId $runId
  if ($current.status -eq 'completed') { break }
  Write-Host "Swift Preflight $runId is $($current.status); waiting for exact SHA $sha."
  Start-Sleep -Seconds 10
} while ([DateTimeOffset]::UtcNow -lt $deadline)

if ($current.status -ne 'completed') { throw "Swift Preflight run $runId did not complete within $TimeoutMinutes minutes: $($current.html_url)" }
if ($current.conclusion -ne 'success') { throw "Swift Preflight concluded '$($current.conclusion)' for $sha. Run: $($current.html_url)" }

$result = New-PreflightResult -Run $current -Reused $reused -Passed $true
if ($PassThru) { return $result }
$reuseText = if ($reused) { 'reused' } else { 'passed' }
Write-Output "Swift Preflight ${reuseText}: $($result.Url)"
Write-Output "Run ID: $runId | Branch: main | SHA: $sha | Conclusion: success"
