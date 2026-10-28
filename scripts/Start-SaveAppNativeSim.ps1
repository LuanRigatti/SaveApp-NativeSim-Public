[CmdletBinding()]
param(
  [ValidateRange(1, 350)][int]$Minutes = 120,
  [string]$Device = 'iPhone 17 Pro',
  [string]$Scheme = 'SaveApp',
  [switch]$CaptureOSLog,
  [switch]$SkipSwiftPreflight
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 or newer is required.' }

$repo = 'LuanRigatti/SaveApp-NativeSim-Public'
$sourceRepo = 'LuanRigatti/SaveApp'
$sourceRoot = [IO.Path]::GetFullPath('C:\Projetos\SaveApp')
$expectedSource = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$publicRoot = [IO.Path]::GetFullPath('C:\Projetos\SaveApp-NativeSim-Public')
$expectedPublic = [IO.Path]::GetFullPath((Join-Path $sourceRoot '..\SaveApp-NativeSim-Public'))
if ($sourceRoot -ne $expectedSource -or $publicRoot -ne $expectedPublic -or
    -not (Test-Path -LiteralPath $sourceRoot -PathType Container) -or
    -not (Test-Path -LiteralPath $publicRoot -PathType Container)) {
  throw 'SaveApp source or public mirror is missing or resolves outside the two authorized folders.'
}
Import-Module (Join-Path $sourceRoot 'scripts\SaveAppMirrorSecurity.psm1') -Force -DisableNameChecking -ErrorAction Stop
$sourceRoot = Assert-SaveAppMirrorRoot -Root $sourceRoot
$publicRoot = Assert-SaveAppMirrorRoot -Root $publicRoot
Import-Module (Join-Path $sourceRoot 'scripts\SaveAppNativeSimCliGuard.psm1') -Force -DisableNameChecking -ErrorAction Stop

function Invoke-GitText {
  param([string]$Repository,[string[]]$GitArguments)
  $output = & git -C $Repository @GitArguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "git $($GitArguments -join ' ') failed in $Repository : $output" }
  return (($output | ForEach-Object { "$_" }) -join "`n").Trim()
}

function Invoke-GhText {
  param([string[]]$GhArguments)
  $output = & gh @GhArguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "gh $($GhArguments -join ' ') failed: $output" }
  return (($output | ForEach-Object { "$_" }) -join "`n").Trim()
}

function Get-SaveAppOSLogCaptureConfiguration {
  param([bool]$CaptureRequested)

  $variableNames = @(& gh api --paginate --jq '.variables[].name' "repos/$repo/actions/variables?per_page=100" 2>$null)
  if ($LASTEXITCODE -ne 0) { throw 'Could not safely inspect SaveApp NativeSim capture opt-in; no mirror, Preflight, or NativeSim session was started.' }
  $variableNames = @($variableNames | ForEach-Object { [string]$_ })
  $variables = [Collections.Generic.List[object]]::new()

  if ($variableNames -ccontains 'SAVEAPP_OSLOG_CAPTURE_ENABLED') {
    $value = & gh api --jq '.value' "repos/$repo/actions/variables/SAVEAPP_OSLOG_CAPTURE_ENABLED" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Could not safely read the SaveApp OSLog capture opt-in; no session was started.' }
    $variables.Add([pscustomobject]@{ name = 'SAVEAPP_OSLOG_CAPTURE_ENABLED'; value = [string]$value })
  }

  $enabled = @($variables | Where-Object { $_.value -ceq 'true' }).Count -eq 1
  if ($enabled -and $variableNames -ccontains 'SAVEAPP_LOG_AGE_RECIPIENT') {
    $recipient = & gh api --jq '.value' "repos/$repo/actions/variables/SAVEAPP_LOG_AGE_RECIPIENT" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Could not safely read the SaveApp OSLog encryption configuration; no session was started.' }
    $variables.Add([pscustomobject]@{ name = 'SAVEAPP_LOG_AGE_RECIPIENT'; value = [string]$recipient })
  }

  return (Assert-SaveAppOSLogCaptureConfiguration -CaptureRequested $CaptureRequested -Variables @($variables.ToArray()))
}

function Assert-Repository {
  param([string]$Root,[string]$Slug,[string]$ExpectedBranch)
  $actualRoot = [IO.Path]::GetFullPath((Invoke-GitText $Root @('rev-parse','--show-toplevel')))
  if ($actualRoot -ne $Root) { throw "Unexpected Git root: $actualRoot" }
  $item = Get-Item -LiteralPath $Root -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Repository root is a linked/reparse path: $Root" }
  $branch = Invoke-GitText $Root @('branch','--show-current')
  if ($branch -ne $ExpectedBranch) { throw "Expected $Slug branch $ExpectedBranch; found '$branch'." }
  $status = Invoke-GitText $Root @('status','--porcelain=v1','--untracked-files=all')
  if ($status) { throw "$Slug worktree must be clean before this operation: $Root" }
  $originText = Invoke-GitText $Root @('remote','get-url','--all','origin')
  $originUrls = @($originText -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if (-not (Test-SaveAppGitHubRemote -RemoteUrls $originUrls -ExpectedRepository $Slug)) {
    throw "$Slug origin fetch URL is not the exact authorized GitHub repository."
  }
  $pushText = Invoke-GitText $Root @('remote','get-url','--push','--all','origin')
  $pushUrls = @($pushText -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if (-not (Test-SaveAppGitHubRemote -RemoteUrls $pushUrls -ExpectedRepository $Slug)) {
    throw "$Slug origin push URL is not the exact authorized GitHub repository."
  }
  $head = Invoke-GitText $Root @('rev-parse','HEAD')
  if ($head -notmatch '^[0-9a-f]{40}$') { throw "$Slug HEAD is not a valid commit SHA." }
  $remote = Invoke-GitText $Root @('ls-remote','origin','refs/heads/' + $ExpectedBranch)
  if (-not $remote -or $remote.Split()[0] -ne $head) { throw "$Slug local $ExpectedBranch must exactly match live origin/$ExpectedBranch." }
  return $head
}

function Get-RepoVisibility {
  param([string]$Slug)
  return Invoke-GhText @('repo','view',$Slug,'--json','visibility','--jq','.visibility')
}

function Get-ActiveNativeSimRuns {
  $activeRuns = [Collections.Generic.List[object]]::new()
  $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($status in @('queued','in_progress','waiting','requested','pending')) {
    $endpoint = "repos/$repo/actions/workflows/native-sim.yml/runs?branch=main&status=$status&per_page=100"
    $json = Invoke-GhText @('api',$endpoint)
    $response = $json | ConvertFrom-Json
    foreach ($run in @($response.workflow_runs)) {
      $id = [string]$run.id
      if ($run.path -eq '.github/workflows/native-sim.yml' -and $run.event -eq 'workflow_dispatch' -and
          $run.head_branch -eq 'main' -and $seen.Add($id)) {
        $activeRuns.Add($run)
      }
    }
  }
  return @(Select-SaveAppNativeSimActiveRuns -Runs @($activeRuns))
}

function Get-SafeCliDiagnostics {
  param([string[]]$Lines)
  $safe = foreach ($line in ($Lines | Select-Object -Last 8)) {
    $text = [regex]::Replace([string]$line,'https://\S+\?k=\S+','[authenticated simulator URL withheld]')
    $text = [regex]::Replace($text,'(?i)(gate[_-]?token\s*[=:]\s*)\S+','$1[redacted]')
    $text
  }
  return ($safe -join "`n").Trim()
}

function Save-SafeSessionMetadata {
  param([string]$CloneRoot,[string]$MirrorRoot,[string]$ExpectedRunId,[string]$ExpectedSha,[string]$ActionsUrl,[string]$SimulatorUrl)
  $relativePath = Invoke-GitText $CloneRoot @('rev-parse','--git-path','native-sim-session.json')
  $sourcePath = if ([IO.Path]::IsPathRooted($relativePath)) { $relativePath } else { Join-Path $CloneRoot $relativePath }
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { return $false }
  $json = Get-Content -LiteralPath $sourcePath -Raw
  $data = $json | ConvertFrom-Json -AsHashtable
  $allowedKeys = @('session','runId','sha','repo','context','url','startedAt')
  if (@($data.Keys | Where-Object { $_ -notin $allowedKeys }).Count -gt 0 -or $json.Contains($SimulatorUrl)) {
    throw 'NativeSim local session metadata contains an unexpected field; authenticated URL was not saved.'
  }
  $session = [string]$data.session
  if ($session -notmatch '^[a-f0-9]{8}$' -or [string]$data.runId -ne $ExpectedRunId -or
      [string]$data.sha -ne $ExpectedSha -or [string]$data.repo -ne $repo -or
      [string]$data.context -ne "native-sim/$session" -or [string]$data.url -ne $ActionsUrl -or
      -not $data.startedAt) {
    throw 'NativeSim local session metadata does not match the validated run; it was not saved.'
  }
  $gitDirectory = [IO.Path]::GetFullPath((Invoke-GitText $MirrorRoot @('rev-parse','--absolute-git-dir')))
  $targetPath = Join-Path $gitDirectory 'native-sim-session.json'
  if (Test-Path -LiteralPath $targetPath) {
    $target = Get-Item -LiteralPath $targetPath -Force
    if (($target.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'NativeSim session metadata target is a linked/reparse file.' }
  }
  $temporaryPath = Join-Path $gitDirectory ('.native-sim-session-' + [guid]::NewGuid().ToString('N') + '.tmp')
  try {
    [IO.File]::WriteAllText($temporaryPath,$json,[Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporaryPath -Destination $targetPath -Force
  } finally {
    if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath -Force }
  }
  return $true
}

$mutex = [Threading.Mutex]::new($false,'Local\SaveAppNativeSimLaunch')
$mutexAcquired = $false
$temporaryRoot = $null
$nativeProcess = $null
$stdoutSubscription = $null
$stderrSubscription = $null
$stdoutEventName = $null
$stderrEventName = $null
$stdoutLines = [Collections.Generic.List[string]]::new()
$stderrLines = [Collections.Generic.List[string]]::new()
$actionsUrl = $null
$simulatorUrl = $null
try {
  try { $mutexAcquired = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $mutexAcquired = $true }
  if (-not $mutexAcquired) { throw 'Another SaveApp NativeSim launcher is already running; refusing a duplicate session.' }

  $sourceSha = Assert-Repository -Root $sourceRoot -Slug $sourceRepo -ExpectedBranch 'main'
  if ((Get-RepoVisibility $sourceRepo).ToUpperInvariant() -ne 'PRIVATE') { throw 'LuanRigatti/SaveApp must be PRIVATE.' }
  Write-Output "Private SaveApp is clean and synchronized at $sourceSha."
  $captureConfiguration = Get-SaveAppOSLogCaptureConfiguration -CaptureRequested $CaptureOSLog.IsPresent
  if ($captureConfiguration.CaptureEnabled) {
    Write-Output 'SaveApp OSLog capture opt-in verified; the public age recipient remains undisplayed.'
  } else {
    Write-Output 'SaveApp OSLog capture is disabled for this NativeSim session.'
  }

  $securityTests = Join-Path $sourceRoot 'tests\SaveAppSecurity.Tests.ps1'
  if (-not (Test-Path -LiteralPath $securityTests -PathType Leaf)) { throw 'SaveApp security simulation tests are missing; mirror and NativeSim were not started.' }
  $securityTestResult = Invoke-Pester -Path $securityTests -PassThru
  if ($null -eq $securityTestResult -or [int]$securityTestResult.FailedCount -ne 0 -or [int]$securityTestResult.PassedCount -lt 1) {
    throw 'SaveApp Pester security simulations failed or reported no passing tests; mirror and NativeSim were not started.'
  }
  Write-Output "SaveApp security simulations passed: $($securityTestResult.PassedCount) passed, $($securityTestResult.FailedCount) failed."

  $mirrorScript = Join-Path $sourceRoot 'scripts\mirror-saveapp.ps1'
  & pwsh.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $mirrorScript -Publish
  if ($LASTEXITCODE -ne 0) { throw 'Sanitized SaveApp mirror did not complete successfully; Preflight and NativeSim were not started.' }

  $sourceSha = Assert-Repository -Root $sourceRoot -Slug $sourceRepo -ExpectedBranch 'main'
  $mirrorSha = Assert-Repository -Root $publicRoot -Slug $repo -ExpectedBranch 'main'
  if ((Get-RepoVisibility $repo).ToUpperInvariant() -ne 'PUBLIC') { throw 'LuanRigatti/SaveApp-NativeSim-Public must be PUBLIC.' }
  $provenancePath = Resolve-SaveAppMirrorPath -Base $publicRoot -RelativePath '.nativesim-source' -ExpectedType File
  $provenance = Get-Content -LiteralPath $provenancePath -Raw
  if ($provenance -notmatch "(?m)^source_repository=$([regex]::Escape($sourceRepo))\r?$" -or
      $provenance -notmatch '(?m)^source_branch=main\r?$' -or
      $provenance -notmatch "(?m)^source_commit=$([regex]::Escape($sourceSha))\r?$") {
    throw 'Public mirror provenance does not identify the exact private SaveApp commit.'
  }
  $latestMessage = Invoke-GitText $publicRoot @('log','-1','--format=%B')
  if ($latestMessage -notmatch "(?m)^Source-Repository: $([regex]::Escape($sourceRepo))\r?$" -or
      $latestMessage -notmatch "(?m)^Source-Commit: $([regex]::Escape($sourceSha))\r?$" -or
      $latestMessage -notmatch '(?m)^Source-Branch: main\r?$') {
    throw 'Public mirror HEAD commit trailers do not prove exact SaveApp source provenance.'
  }
  $workflowPath = Resolve-SaveAppMirrorPath -Base $publicRoot -RelativePath '.github\workflows\native-sim.yml' -ExpectedType File
  $gatePath = Resolve-SaveAppMirrorPath -Base $publicRoot -RelativePath '.github\native-sim\gate.cjs' -ExpectedType File

  $preflightScript = Join-Path $sourceRoot 'scripts\Invoke-SaveAppSwiftPreflight.ps1'
  $preflight = Invoke-SaveAppSwiftPreflightGate `
    -SkipPreflight:$SkipSwiftPreflight `
    -InvokePreflight { & $preflightScript -PassThru } `
    -ExpectedRepository $repo `
    -ExpectedWorkflowPath '.github/workflows/swift-preflight.yml' `
    -ExpectedBranch 'main' `
    -ExpectedSha $mirrorSha
  if ($preflight.Skipped) {
    Write-Output "Swift Preflight: explicitly skipped by -SkipSwiftPreflight | public SHA $mirrorSha. NativeSim's own native build and signing gates remain required."
  }

  $postSourceSha = Assert-Repository -Root $sourceRoot -Slug $sourceRepo -ExpectedBranch 'main'
  $postMirrorSha = Assert-Repository -Root $publicRoot -Slug $repo -ExpectedBranch 'main'
  if ($postSourceSha -ne $sourceSha -or $postMirrorSha -ne $mirrorSha) {
    throw 'Source or public mirror SHA changed during pre-NativeSim validation; NativeSim was not started.'
  }
  $postProvenance = Get-Content -LiteralPath $provenancePath -Raw
  if ($postProvenance -notmatch "(?m)^source_commit=$([regex]::Escape($sourceSha))\r?$") {
    throw 'Public mirror provenance changed during pre-NativeSim validation; NativeSim was not started.'
  }

  $workflowJson = Invoke-GhText @('api',"repos/$repo/actions/workflows/native-sim.yml")
  $workflow = $workflowJson | ConvertFrom-Json
  if ($workflow.path -ne '.github/workflows/native-sim.yml' -or $workflow.state -ne 'active') {
    throw 'The public NativeSim workflow is not registered and active; refusing the CLI recovery push path.'
  }
  $activeRuns = @(Get-ActiveNativeSimRuns)
  if ($activeRuns.Count -gt 0) {
    $activeRun = $activeRuns[0]
    throw "An active NativeSim run already exists on main (run $($activeRun.id), SHA $($activeRun.head_sha)): $($activeRun.html_url). No duplicate was started."
  }

  $nativeSimCommand = Get-Command native-sim.ps1 -ErrorAction SilentlyContinue
  if (-not $nativeSimCommand -or -not (Test-Path -LiteralPath $nativeSimCommand.Source -PathType Leaf)) {
    throw 'Installed NativeSim CLI is unavailable; native-sim.ps1 is not on PATH.'
  }
  $nativeSimPackage = Join-Path (Split-Path -Parent $nativeSimCommand.Source) 'node_modules\native-sim'
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $nodeCommand -or -not (Test-Path -LiteralPath $nodeCommand.Source -PathType Leaf)) {
    throw 'Node.js is unavailable; cannot inspect the installed NativeSim scaffold safely.'
  }
  $cliCompatibility = Assert-SaveAppNativeSimCliCompatible -CliPackageRoot $nativeSimPackage -WorkflowPath $workflowPath -GatePath $gatePath
  $nativeSimUpSource = Join-Path $nativeSimPackage 'src\commands\up.js'
  if (-not (Test-Path -LiteralPath $nativeSimUpSource -PathType Leaf)) {
    throw 'Could not verify the installed NativeSim export behavior; refusing to start a session without guaranteed archive export.'
  }
  $nativeSimUpText = Get-Content -LiteralPath $nativeSimUpSource -Raw
  $workflowText = Get-Content -LiteralPath $workflowPath -Raw
  $null = Assert-SaveAppNativeSimExportBehavior -NativeSimUpText $nativeSimUpText -WorkflowText $workflowText
  $pwshCommand = Get-Command pwsh.exe -ErrorAction Stop
  $temporaryRoot = Join-Path $sourceRoot ('.saveapp-nativesim-' + [guid]::NewGuid().ToString('N'))
  $cloneRoot = Join-Path $temporaryRoot 'mirror'
  $pushSink = Join-Path $temporaryRoot 'push-sink.git'
  New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
  & git clone --quiet --no-hardlinks --single-branch --branch main $publicRoot $cloneRoot
  if ($LASTEXITCODE -ne 0) { throw 'Could not create an isolated NativeSim checkout.' }
  & git init --bare --quiet $pushSink
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated no-op push destination.' }
  & git -C $cloneRoot push --quiet $pushSink 'main:refs/heads/main'
  if ($LASTEXITCODE -ne 0) { throw 'Could not seed the isolated push destination at the public mirror SHA.' }
  & git -C $cloneRoot remote set-url origin "https://github.com/$repo.git"
  if ($LASTEXITCODE -ne 0) { throw 'Could not set the isolated checkout fetch URL.' }
  & git -C $cloneRoot remote set-url --push origin $pushSink
  if ($LASTEXITCODE -ne 0) { throw 'Could not redirect the NativeSim CLI push to the isolated local sink.' }
  $cloneRootFound = [IO.Path]::GetFullPath((Invoke-GitText $cloneRoot @('rev-parse','--show-toplevel')))
  $cloneBranch = Invoke-GitText $cloneRoot @('branch','--show-current')
  $cloneSha = Invoke-GitText $cloneRoot @('rev-parse','HEAD')
  $cloneStatus = Invoke-GitText $cloneRoot @('status','--porcelain=v1','--untracked-files=all')
  $cloneFetchUrl = Invoke-GitText $cloneRoot @('remote','get-url','origin')
  $clonePushUrl = [IO.Path]::GetFullPath((Invoke-GitText $cloneRoot @('remote','get-url','--push','origin')))
  $sinkSha = Invoke-GitText $pushSink @('rev-parse','refs/heads/main')
  $githubSha = Invoke-GitText $cloneRoot @('ls-remote','origin','refs/heads/main')
  if ($cloneRootFound -ne [IO.Path]::GetFullPath($cloneRoot) -or $cloneBranch -ne 'main' -or
      $cloneSha -ne $mirrorSha -or $cloneStatus -or $sinkSha -ne $mirrorSha -or
      $cloneFetchUrl -notmatch "(?i)^https://github\.com/$([regex]::Escape($repo))\.git$" -or
      $clonePushUrl -ne [IO.Path]::GetFullPath($pushSink) -or $githubSha.Split()[0] -ne $mirrorSha) {
    throw 'Isolated NativeSim checkout failed exact-SHA, clean-tree, live-origin, or no-op push-destination verification.'
  }
  $scaffoldPreview = Invoke-SaveAppNativeSimScaffoldPreview -CliPackageRoot $nativeSimPackage -CheckoutRoot $cloneRoot -ExpectedSha $mirrorSha -NodeExecutable $nodeCommand.Source
  if ($scaffoldPreview.ScaffoldChanged -or $scaffoldPreview.CheckoutSha -ne $mirrorSha) {
    throw 'NativeSim scaffold preview did not preserve the audited public SHA; NativeSim was not started.'
  }
  Write-Output "NativeSim scaffold preview: workflow v$($cliCompatibility.WorkflowVersion), gate v$($cliCompatibility.GateVersion); generated files unchanged at $mirrorSha."

  $global:SaveAppNativeSimStdoutQueue = [Collections.Concurrent.ConcurrentQueue[string]]::new()
  $global:SaveAppNativeSimStderrQueue = [Collections.Concurrent.ConcurrentQueue[string]]::new()
  $eventSuffix = [guid]::NewGuid().ToString('N')
  $stdoutEventName = "SaveAppNativeSimStdout-$eventSuffix"
  $stderrEventName = "SaveAppNativeSimStderr-$eventSuffix"
  $nativeProcess = [Diagnostics.Process]::new()
  $nativeProcess.StartInfo.FileName = $pwshCommand.Source
  $nativeProcess.StartInfo.WorkingDirectory = $cloneRoot
  $nativeProcess.StartInfo.UseShellExecute = $false
  $nativeProcess.StartInfo.CreateNoWindow = $true
  $nativeProcess.StartInfo.RedirectStandardOutput = $true
  $nativeProcess.StartInfo.RedirectStandardError = $true
  $cliArguments = @('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$nativeSimCommand.Source,
    'up','--public','--minutes',[string]$Minutes,'--device',$Device,'--scheme',$Scheme,'--no-open','--export')
  if ($cliArguments -notcontains '--export') { throw 'NativeSim must be dispatched with --export so the workflow receives export_app=true.' }
  Write-Output 'Verified NativeSim --export dispatches export_app=true; the local CLI will be stopped after both links, before its artifact wait/download.'
  foreach ($argument in $cliArguments) { [void]$nativeProcess.StartInfo.ArgumentList.Add($argument) }
  $stdoutSubscription = Register-ObjectEvent -InputObject $nativeProcess -EventName OutputDataReceived -SourceIdentifier $stdoutEventName -Action {
    $line = $Event.SourceEventArgs.Data
    if ($null -ne $line) { [void]$global:SaveAppNativeSimStdoutQueue.Enqueue($line) }
  }
  $stderrSubscription = Register-ObjectEvent -InputObject $nativeProcess -EventName ErrorDataReceived -SourceIdentifier $stderrEventName -Action {
    $line = $Event.SourceEventArgs.Data
    if ($null -ne $line) { [void]$global:SaveAppNativeSimStderrQueue.Enqueue($line) }
  }
  if (-not $nativeProcess.Start()) { throw 'Could not start the installed NativeSim CLI.' }
  $nativeProcess.BeginOutputReadLine()
  $nativeProcess.BeginErrorReadLine()
  Write-Output "NativeSim dispatched for public main SHA $mirrorSha with a $Minutes-minute session; the launcher will return links after validating this run's exact transport handoff."

  $linkDeadline = [DateTimeOffset]::UtcNow.AddMinutes(50)
  $runId = $null
  while ([DateTimeOffset]::UtcNow -lt $linkDeadline) {
    $null = Wait-Event -Timeout 0.5
    $line = $null
    while ($global:SaveAppNativeSimStdoutQueue.TryDequeue([ref]$line)) {
      $stdoutLines.Add($line)
      $plainLine = [regex]::Replace($line,"`e\[[0-?]*[ -/]*[@-~]",'').Trim()
      if (-not $actionsUrl) {
        $runMatch = [regex]::Match($plainLine,'https://github\.com/LuanRigatti/SaveApp-NativeSim-Public/actions/runs/(?<id>[0-9]+)')
        if ($runMatch.Success) {
          $actionsUrl = $runMatch.Value
          $runId = $runMatch.Groups['id'].Value
        }
      }
      if (-not $simulatorUrl) {
        $simulatorMatch = [regex]::Match($plainLine,'https://[A-Za-z0-9.-]+\.trycloudflare\.com/\?[^\s]+')
        if ($simulatorMatch.Success) { $simulatorUrl = $simulatorMatch.Value }
      }
    }
    $line = $null
    while ($global:SaveAppNativeSimStderrQueue.TryDequeue([ref]$line)) { $stderrLines.Add($line) }
    if ($actionsUrl -and $simulatorUrl) { break }
    if ($nativeProcess.HasExited) { break }
  }

  if ((-not $actionsUrl -or -not $simulatorUrl) -and -not $nativeProcess.HasExited) {
    $nativeProcess.Kill($true)
    $nativeProcess.WaitForExit(15000) | Out-Null
  }
  $null = Wait-Event -Timeout 0.2
  $line = $null
  while ($global:SaveAppNativeSimStdoutQueue.TryDequeue([ref]$line)) { $stdoutLines.Add($line) }
  while ($global:SaveAppNativeSimStderrQueue.TryDequeue([ref]$line)) { $stderrLines.Add($line) }
  if (-not $actionsUrl -or -not $simulatorUrl) {
    $allDiagnostics = @($stderrLines)
    $allDiagnostics += @($stdoutLines)
    $diagnostics = Get-SafeCliDiagnostics -Lines $allDiagnostics
    if (-not $diagnostics) { $diagnostics = 'The CLI exited or timed out before emitting both links.' }
    throw "NativeSim did not provide both verified links. $diagnostics"
  }
  $cloneAfterSha = Invoke-GitText $cloneRoot @('rev-parse','HEAD')
  $sinkAfterSha = Invoke-GitText $pushSink @('rev-parse','refs/heads/main')
  $cloneAfterStatus = Invoke-GitText $cloneRoot @('status','--porcelain=v1','--untracked-files=all')
  $workflowAfterHash = (Get-FileHash -LiteralPath (Join-Path $cloneRoot '.github\workflows\native-sim.yml') -Algorithm SHA256).Hash
  $gateAfterHash = (Get-FileHash -LiteralPath (Join-Path $cloneRoot '.github\native-sim\gate.cjs') -Algorithm SHA256).Hash
  if ($cloneAfterSha -ne $mirrorSha -or $sinkAfterSha -ne $mirrorSha -or $cloneAfterStatus -or
      $workflowAfterHash -ne $scaffoldPreview.WorkflowSha256 -or $gateAfterHash -ne $scaffoldPreview.GateSha256) {
    throw 'NativeSim changed or attempted to publish from its disposable checkout; refusing to deliver an unverified session.'
  }
  $simulatorUrl = Assert-SaveAppSimulatorUrl -Url $simulatorUrl

  $runJson = Invoke-GhText @('api',"repos/$repo/actions/runs/$runId")
  $run = $runJson | ConvertFrom-Json
  if ([string]$run.id -ne $runId -or $run.path -ne '.github/workflows/native-sim.yml' -or
      $run.event -ne 'workflow_dispatch' -or $run.head_branch -ne 'main' -or $run.head_sha -ne $mirrorSha -or
      [string]$run.html_url -ne $actionsUrl) {
    throw "NativeSim run $runId does not match the exact public repository, workflow, branch, SHA, and CLI Actions URL."
  }

  $statusesJson = Invoke-GhText @('api',"repos/$repo/commits/$mirrorSha/statuses?per_page=100")
  $statuses = @($statusesJson | ConvertFrom-Json)
  $expectedAttempt = [int]$run.run_attempt
  $handoff = Assert-SaveAppNativeSimTransportHandoff `
    -ExpectedRepository $repo `
    -ExpectedRunId $runId `
    -ExpectedAttempt $expectedAttempt `
    -ExpectedSha $mirrorSha `
    -CaptureRequested $captureConfiguration.CaptureEnabled `
    -ActionsUrl $actionsUrl `
    -SimulatorUrl $simulatorUrl `
    -Run $run `
    -Statuses $statuses
  try {
    if (-not (Save-SafeSessionMetadata -CloneRoot $cloneRoot -MirrorRoot $publicRoot -ExpectedRunId $runId -ExpectedSha $mirrorSha -ActionsUrl $actionsUrl -SimulatorUrl $simulatorUrl)) {
      Write-Warning 'The CLI session metadata was not present in its isolated checkout; the two returned links remain valid.'
    }
  } catch {
    Write-Warning 'Could not save safe NativeSim session metadata in the public checkout; no authenticated URL was written to disk.'
  }

  $handoffState = if ($captureConfiguration.CaptureEnabled) {
    'TRANSPORTE PRONTO — BUILD/OSLOG PENDENTES'
  } else {
    'SESSÃO PRONTA — OSLOG NÃO SOLICITADO'
  }
  if (-not $preflight.Skipped) {
    $preflightKind = if ($preflight.Reused) { 'reused exact-SHA success' } else { 'new exact-SHA success' }
    Write-Output "Swift Preflight: $preflightKind | run $($preflight.RunId) | SHA $mirrorSha | $($preflight.Url)"
  }
  Write-Output "NativeSim: run $runId | attempt $($handoff.Attempt) | session $($handoff.Session) | branch main | private SHA $sourceSha | public SHA $mirrorSha | $Minutes minutes"
  Write-Output $handoffState
  if ($captureConfiguration.CaptureEnabled) {
    Write-Output "OSLog: readiness was not checked by this handoff; verify success in native-sim-capture/$($handoff.Session) for this run before manual tests that require recoverable logs."
  }
  Write-Output "GitHub Actions: $actionsUrl"
  Write-Output "Authenticated Simulator: $simulatorUrl"
} finally {
  if ($nativeProcess) {
    try {
      if (-not $nativeProcess.HasExited) { $nativeProcess.Kill($true); $nativeProcess.WaitForExit(10000) | Out-Null }
    } catch { }
    try { $nativeProcess.Dispose() } catch { }
  }
  try { Remove-SaveAppNativeSimEventSubscriptions -SourceIdentifiers @($stdoutEventName,$stderrEventName) -Subscriptions @($stdoutSubscription,$stderrSubscription) } catch { }
  try { Remove-Variable -Name SaveAppNativeSimStdoutQueue,SaveAppNativeSimStderrQueue -Scope Global -ErrorAction SilentlyContinue } catch { }
  if ($temporaryRoot) {
    try {
      $sourceBase = [IO.Path]::GetFullPath($sourceRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
      $resolvedTemp = [IO.Path]::GetFullPath($temporaryRoot)
      if ($resolvedTemp.StartsWith($sourceBase,[StringComparison]::OrdinalIgnoreCase) -and
          (Split-Path -Leaf $resolvedTemp) -match '^\.saveapp-nativesim-[a-f0-9]{32}$') {
        $item = Get-Item -LiteralPath $resolvedTemp -Force -ErrorAction SilentlyContinue
        if ($item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
          Remove-Item -LiteralPath $resolvedTemp -Recurse -Force -ErrorAction SilentlyContinue
        }
      }
    } catch { }
  }
  if ($mutexAcquired) { try { $mutex.ReleaseMutex() } catch { } }
  try { $mutex.Dispose() } catch { }
}
