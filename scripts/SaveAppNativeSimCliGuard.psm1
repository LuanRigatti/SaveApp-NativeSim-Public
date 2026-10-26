Set-StrictMode -Version Latest

function Get-NativeSimTemplateVersion {
  param([Parameter(Mandatory)][string]$Content,[Parameter(Mandatory)][string]$Label)
  $match = [regex]::Match($Content,'(?m)^\s*(?:#|//)\s*native-sim-template-version:\s*(?<version>[0-9]+)\s*$')
  if (-not $match.Success) { throw "$Label has no supported native-sim-template-version marker." }
  return [int]$match.Groups['version'].Value
}

function Normalize-NativeSimGateContent {
  param([Parameter(Mandatory)][string]$Content)
  $normalized = [regex]::Replace($Content,'(?<![A-Z_])TOKEN(?![A-Z_])','GATE_VALUE')
  return $normalized.Replace("`r`n","`n").Replace("`r","`n")
}

function Remove-SaveAppNativeSimEventSubscriptions {
  [CmdletBinding()]
  param(
    [AllowNull()][object[]]$Subscriptions = @(),
    [AllowNull()][string[]]$SourceIdentifiers = @(),
    [scriptblock]$UnregisterEventAction,
    [scriptblock]$RemoveEventAction,
    [scriptblock]$RemoveJobAction
  )

  foreach ($sourceIdentifier in $SourceIdentifiers) {
    if ([string]::IsNullOrWhiteSpace($sourceIdentifier)) { continue }
    try {
      if ($UnregisterEventAction) { $null = & $UnregisterEventAction $sourceIdentifier }
      else { Unregister-Event -SourceIdentifier $sourceIdentifier -ErrorAction SilentlyContinue }
    } catch { }
    try {
      if ($RemoveEventAction) { $null = & $RemoveEventAction $sourceIdentifier }
      else { Remove-Event -SourceIdentifier $sourceIdentifier -ErrorAction SilentlyContinue }
    } catch { }
  }
  foreach ($subscription in $Subscriptions) {
    if ($null -eq $subscription) { continue }
    try {
      if ($RemoveJobAction) { $null = & $RemoveJobAction $subscription }
      else { Remove-Job -Job $subscription -Force -ErrorAction SilentlyContinue }
    } catch { }
  }
}

function Select-SaveAppNativeSimActiveRuns {
  [CmdletBinding()]
  param([object[]]$Runs = @())

  $activeStatuses = @('queued','in_progress','waiting','requested','pending')
  $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $selected = [Collections.Generic.List[object]]::new()
  foreach ($run in $Runs) {
    $id = [string]$run.id
    if ($run.path -eq '.github/workflows/native-sim.yml' -and $run.event -eq 'workflow_dispatch' -and
        $run.head_branch -eq 'main' -and $run.status -in $activeStatuses -and $id -and $seen.Add($id)) {
      $selected.Add($run)
    }
  }
  return @($selected)
}

function Assert-SaveAppSwiftPreflightResult {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Results,
    [Parameter(Mandatory)][string]$ExpectedRepository,
    [Parameter(Mandatory)][string]$ExpectedWorkflowPath,
    [Parameter(Mandatory)][string]$ExpectedBranch,
    [Parameter(Mandatory)][string]$ExpectedSha
  )

  if ($Results.Count -ne 1) {
    throw "Swift Preflight must return exactly one structured result; received $($Results.Count) output items."
  }
  $result = $Results[0]
  if ($result -isnot [pscustomobject]) {
    throw 'Swift Preflight returned a non-structured success-pipeline item.'
  }

  $requiredProperties = @('Passed','Reused','Repository','WorkflowPath','Event','RunId','Branch','Sha','Url','Status','Conclusion')
  foreach ($propertyName in $requiredProperties) {
    if ($null -eq $result.PSObject.Properties[$propertyName]) {
      throw "Swift Preflight result is missing required metadata '$propertyName'."
    }
  }
  if ($result.Passed -isnot [bool] -or -not $result.Passed -or $result.Reused -isnot [bool]) {
    throw 'Swift Preflight did not report a passed structured result.'
  }
  if ([string]$result.Repository -cne $ExpectedRepository -or
      [string]$result.WorkflowPath -cne $ExpectedWorkflowPath -or
      [string]$result.Event -cne 'workflow_dispatch' -or
      [string]$result.Branch -cne $ExpectedBranch -or
      [string]$result.Sha -cne $ExpectedSha) {
    throw 'Swift Preflight result does not match the expected repository, workflow, event, branch, and exact SHA.'
  }
  if ([string]$result.Status -cne 'completed' -or [string]$result.Conclusion -cne 'success') {
    throw 'Swift Preflight result is not completed with conclusion success.'
  }
  if ([string]$result.RunId -notmatch '^\d+$' -or
      [string]$result.Url -cne "https://github.com/$ExpectedRepository/actions/runs/$($result.RunId)") {
    throw 'Swift Preflight result has an invalid GitHub Actions run ID or URL.'
  }

  return $result
}

function Assert-SaveAppSimulatorUrl {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$Url)

  if ($Url -notmatch '^https://[A-Za-z0-9.-]+\.trycloudflare\.com/\?[^\s]*\bk=[A-Za-z0-9_-]{20,}(?:&[^\s]*)?$') {
    throw 'NativeSim did not provide a complete authenticated Simulator URL with its full k value.'
  }
  return $Url
}

function Assert-SaveAppNativeSimExportBehavior {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$NativeSimUpText,
    [Parameter(Mandatory)][string]$WorkflowText
  )

  $exportInputPattern = "export_app\s*:\s*flags\.export\s*\?\s*'true'\s*:\s*'false'"
  $linkOutputIndex = $NativeSimUpText.IndexOf('console.log(`  ${url}`)',[StringComparison]::Ordinal)
  $archiveWaitIndex = $NativeSimUpText.IndexOf('if (flags.export) await exportArtifact',[StringComparison]::Ordinal)
  if ($NativeSimUpText -notmatch $exportInputPattern -or $linkOutputIndex -lt 0 -or $archiveWaitIndex -le $linkOutputIndex) {
    throw 'Installed NativeSim does not reliably dispatch export_app and print the Simulator URL before its artifact wait.'
  }
  if ($WorkflowText -notmatch '(?m)^\s*export_app:\s*$' -or
      $WorkflowText -notmatch "(?m)^\s*if:\s*inputs\.export_app\s*==\s*'true'\s*$" -or
      $WorkflowText -notmatch '(?m)^\s*retention-days:\s*7\s*$') {
    throw 'The public NativeSim workflow does not declare the archive export or seven-day retention contract.'
  }
  return $true
}

function Assert-SaveAppSimulatorArchive {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$Path)

  $archive = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  if ($archive.PSIsContainer -or ($archive.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
      $archive.Name -notmatch '\.app\.tar\.gz$') {
    throw 'Downloaded archive path is not a regular .app.tar.gz file.'
  }
  $entries = & tar -tzf $archive.FullName 2>&1
  if ($LASTEXITCODE -ne 0 -or -not ($entries | Where-Object { $_ -match '\.app/' })) {
    throw 'Downloaded artifact is not a readable iOS Simulator .app tar.gz.'
  }
  return [pscustomobject]@{ Path = $archive.FullName; EntryCount = @($entries).Count }
}

function Assert-SaveAppArchiveRun {
  [CmdletBinding()]
  param([Parameter(Mandatory)]$Run,[Parameter(Mandatory)][string]$ExpectedId)

  if ([string]$Run.id -ne $ExpectedId -or $Run.path -ne '.github/workflows/native-sim.yml' -or
      $Run.event -ne 'workflow_dispatch' -or $Run.head_branch -ne 'main' -or
      $Run.status -notin @('in_progress','completed') -or [string]$Run.head_sha -notmatch '^[0-9a-f]{40}$') {
    throw "Run $ExpectedId is not an eligible active or completed SaveApp NativeSim workflow_dispatch on main."
  }
  return $Run
}

function Select-SaveAppArchiveArtifact {
  [CmdletBinding()]
  param([object[]]$Artifacts = @(),[Parameter(Mandatory)][string]$ExpectedName)

  $matches = @($Artifacts | Where-Object { $_.name -eq $ExpectedName -and -not $_.expired -and [long]$_.size_in_bytes -gt 0 })
  if ($matches.Count -ne 1) { return $null }
  return $matches[0]
}

function Test-SaveAppArchiveBuildSteps {
  [CmdletBinding()]
  param([object[]]$Steps = @())

  $buildSteps = @($Steps | Where-Object { $_.name -in @('Build ad hoc signed Simulator app','Build unsigned Simulator app') })
  if ($buildSteps.Count -ne 1 -or $buildSteps[0].status -ne 'completed' -or $buildSteps[0].conclusion -ne 'success') { return $false }

  foreach ($requiredName in @('Export the .app archive','Upload Simulator archive')) {
    $matches = @($Steps | Where-Object { $_.name -eq $requiredName })
    if ($matches.Count -ne 1 -or $matches[0].status -ne 'completed' -or $matches[0].conclusion -ne 'success') { return $false }
  }
  return $true
}

function Assert-SaveAppNativeSimCliCompatible {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$CliPackageRoot,
    [Parameter(Mandatory)][string]$WorkflowPath,
    [Parameter(Mandatory)][string]$GatePath
  )

  $templateWorkflow = Join-Path $CliPackageRoot 'templates\native-sim.yml'
  $templateGate = Join-Path $CliPackageRoot 'templates\gate.cjs'
  $initPath = Join-Path $CliPackageRoot 'src\commands\init.js'
  $upPath = Join-Path $CliPackageRoot 'src\commands\up.js'
  $gitPath = Join-Path $CliPackageRoot 'src\lib\git.js'
  foreach ($path in @($templateWorkflow,$templateGate,$initPath,$upPath,$gitPath,$WorkflowPath,$GatePath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "NativeSim compatibility input is missing: $path" }
  }

  $workflowTemplateText = Get-Content -LiteralPath $templateWorkflow -Raw -ErrorAction Stop
  $gateTemplateText = Get-Content -LiteralPath $templateGate -Raw -ErrorAction Stop
  $workflowText = Get-Content -LiteralPath $WorkflowPath -Raw -ErrorAction Stop
  $gateText = Get-Content -LiteralPath $GatePath -Raw -ErrorAction Stop
  $workflowTemplateVersion = Get-NativeSimTemplateVersion -Content $workflowTemplateText -Label 'Installed NativeSim workflow template'
  $gateTemplateVersion = Get-NativeSimTemplateVersion -Content $gateTemplateText -Label 'Installed NativeSim gate template'
  $workflowVersion = Get-NativeSimTemplateVersion -Content $workflowText -Label 'SaveApp NativeSim workflow'
  $gateVersion = Get-NativeSimTemplateVersion -Content $gateText -Label 'SaveApp NativeSim gate'

  if ($workflowVersion -lt $workflowTemplateVersion -or $gateVersion -lt $gateTemplateVersion) {
    throw "SaveApp NativeSim files are older than the installed CLI templates (workflow $workflowVersion/$workflowTemplateVersion; gate $gateVersion/$gateTemplateVersion)."
  }

  # The only approved difference from the bundled gate is the sanitized local identifier.
  if ((Normalize-NativeSimGateContent $gateText) -cne (Normalize-NativeSimGateContent $gateTemplateText)) {
    throw 'SaveApp gate.cjs differs from the exact installed template beyond the approved TOKEN-to-GATE_VALUE rename.'
  }

  $initText = Get-Content -LiteralPath $initPath -Raw -ErrorAction Stop
  $upText = Get-Content -LiteralPath $upPath -Raw -ErrorAction Stop
  $gitText = Get-Content -LiteralPath $gitPath -Raw -ErrorAction Stop
  $scaffoldTargetsBoth = $initText.Contains("[[WORKFLOW_PATH, 'native-sim.yml'], [GATE_PATH, 'gate.cjs']]")
  $scaffoldHasVersionNoWriteGuard = $initText -match '(?s)if\s*\(have\s*>=\s*want\)\s*\{.*?continue;\s*\}\s*mkdirSync\(dirname\(dest\),\s*\{\s*recursive:\s*true\s*\}\);\s*writeFileSync\(dest,\s*template\)'
  $upCommitsScaffoldChanges = $upText -match '(?s)if\s*\(scaffold\(cwd\)\s*\|\|\s*git\.isDirty\(cwd\)\)\s*\{\s*git\.commitAll\(cwd,\s*[^;]+;\s*git\.push\(cwd,\s*branch\)'
  $pushTargetsOrigin = $gitText -match "shx\('git',\s*\['push',\s*'-u',\s*'origin',\s*branch\]"
  if (-not $scaffoldTargetsBoth -or -not $scaffoldHasVersionNoWriteGuard -or -not $upCommitsScaffoldChanges -or -not $pushTargetsOrigin) {
    throw 'Installed NativeSim scaffold or push behavior is not the reviewed workflow+gate implementation; refusing to run it.'
  }

  return [pscustomobject]@{
    WorkflowVersion = $workflowVersion
    WorkflowTemplateVersion = $workflowTemplateVersion
    GateVersion = $gateVersion
    GateTemplateVersion = $gateTemplateVersion
    GateContentMatchesApprovedNormalization = $true
    ScaffoldTargetsWorkflowAndGate = $true
    ScaffoldChangesAreCommittedAndPushed = $true
  }
}

function Invoke-SaveAppNativeSimScaffoldPreview {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$CliPackageRoot,
    [Parameter(Mandatory)][string]$CheckoutRoot,
    [Parameter(Mandatory)][string]$ExpectedSha,
    [Parameter(Mandatory)][string]$NodeExecutable
  )

  $workflowPath = Join-Path $CheckoutRoot '.github\workflows\native-sim.yml'
  $gatePath = Join-Path $CheckoutRoot '.github\native-sim\gate.cjs'
  $CheckoutRoot = Assert-SaveAppMirrorRoot -Root $CheckoutRoot
  $compatibility = Assert-SaveAppNativeSimCliCompatible -CliPackageRoot $CliPackageRoot -WorkflowPath $workflowPath -GatePath $gatePath
  $initPath = Join-Path $CliPackageRoot 'src\commands\init.js'
  $head = (& git -C $CheckoutRoot rev-parse HEAD 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $head -ne $ExpectedSha) { throw 'NativeSim scaffold preview checkout is not at the exact audited public SHA.' }
  $status = (& git -C $CheckoutRoot status --porcelain=v1 --untracked-files=all 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $status) { throw 'NativeSim scaffold preview requires a clean exact-SHA checkout.' }

  $workflowHash = (Get-FileHash -LiteralPath $workflowPath -Algorithm SHA256).Hash
  $gateHash = (Get-FileHash -LiteralPath $gatePath -Algorithm SHA256).Hash
  $nodeScript = @'
import { pathToFileURL } from 'node:url';
const [, initPath, checkoutRoot] = process.argv;
const { scaffold } = await import(pathToFileURL(initPath).href);
const changed = scaffold(checkoutRoot);
process.stdout.write(JSON.stringify({ changed }) + '\n');
'@
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $NodeExecutable
  $startInfo.WorkingDirectory = $CheckoutRoot
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  foreach ($argument in @('--input-type=module','--eval',$nodeScript,$initPath,$CheckoutRoot)) {
    [void]$startInfo.ArgumentList.Add($argument)
  }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  try {
    if (-not $process.Start()) { throw 'Could not start the isolated NativeSim scaffold preview.' }
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "NativeSim scaffold preview failed safely: $stderr" }
    $resultLine = @($stdout -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -Last 1)
    if ($resultLine.Count -ne 1) { throw 'NativeSim scaffold preview returned no machine-readable result.' }
    $result = $resultLine[0] | ConvertFrom-Json -ErrorAction Stop
    if ($result.changed -ne $false) { throw 'NativeSim scaffold would modify generated files; refusing the session before invoking native-sim up.' }
  } finally {
    $process.Dispose()
  }

  $workflowAfter = (Get-FileHash -LiteralPath $workflowPath -Algorithm SHA256).Hash
  $gateAfter = (Get-FileHash -LiteralPath $gatePath -Algorithm SHA256).Hash
  $headAfter = (& git -C $CheckoutRoot rev-parse HEAD 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Could not verify the checkout after NativeSim scaffold preview.' }
  $statusAfter = (& git -C $CheckoutRoot status --porcelain=v1 --untracked-files=all 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $workflowHash -ne $workflowAfter -or $gateHash -ne $gateAfter -or
      $headAfter -ne $ExpectedSha -or $statusAfter) {
    throw 'NativeSim scaffold preview changed a file or the Git state; the local CLI session was not started.'
  }

  return [pscustomobject]@{
    ScaffoldChanged = $false
    WorkflowSha256 = $workflowHash
    GateSha256 = $gateHash
    WorkflowVersion = $compatibility.WorkflowVersion
    GateVersion = $compatibility.GateVersion
    CheckoutSha = $headAfter
  }
}

Export-ModuleMember -Function Remove-SaveAppNativeSimEventSubscriptions,Select-SaveAppNativeSimActiveRuns,Assert-SaveAppSwiftPreflightResult,Assert-SaveAppSimulatorUrl,Assert-SaveAppNativeSimExportBehavior,Assert-SaveAppSimulatorArchive,Assert-SaveAppArchiveRun,Select-SaveAppArchiveArtifact,Test-SaveAppArchiveBuildSteps,Assert-SaveAppNativeSimCliCompatible,Invoke-SaveAppNativeSimScaffoldPreview
