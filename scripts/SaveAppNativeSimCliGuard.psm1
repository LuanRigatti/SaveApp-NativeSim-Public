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

function ConvertTo-SaveAppNativeSimDateTimeOffset {
  [CmdletBinding()]
  param([AllowNull()][object]$Value)

  if ($null -eq $Value) { return $null }
  if ($Value -is [DateTimeOffset]) { return $Value.ToUniversalTime() }
  if ($Value -is [DateTime]) {
    switch ($Value.Kind) {
      ([DateTimeKind]::Utc) { return [DateTimeOffset]::new($Value) }
      ([DateTimeKind]::Local) { return ([DateTimeOffset]::new($Value)).ToUniversalTime() }
      default {
        # GitHub API timestamps are UTC/offset ISO values. ConvertFrom-Json can
        # produce Unspecified DateTime values on some PowerShell/.NET versions.
        return [DateTimeOffset]::new([DateTime]::SpecifyKind($Value,[DateTimeKind]::Utc))
      }
    }
  }
  if ($Value -isnot [string]) { return $null }

  $text = $Value.Trim()
  if ($text -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$') {
    return $null
  }

  $parsed = [DateTimeOffset]::MinValue
  if ([DateTimeOffset]::TryParse(
      $text,
      [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::None,
      [ref]$parsed)) {
    return $parsed.ToUniversalTime()
  }
  return $null
}

function Get-SaveAppOSLogReadinessDeadline {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][object]$Run,
    [AllowEmptyCollection()][object[]]$Jobs = @()
  )

  $runCreatedAt = ConvertTo-SaveAppNativeSimDateTimeOffset -Value $Run.created_at
  if ($null -eq $runCreatedAt) {
    throw 'NativeSim run creation time is unavailable or invalid; capture readiness cannot use a bounded deadline.'
  }

  # Bound queueing separately. Once the job starts, allow its complete 360-minute
  # workflow timeout plus 15 minutes for final API propagation and status checks.
  $deadline = $runCreatedAt.AddMinutes(120)
  $jobStarts = @($Jobs | Where-Object { [string]$_.name -ceq 'Build and stream SaveApp' })
  $startValues = [Collections.Generic.List[object]]::new()
  if ($Run.PSObject.Properties.Name -contains 'run_started_at' -and $null -ne $Run.run_started_at) {
    $startValues.Add($Run.run_started_at)
  }
  foreach ($job in $jobStarts) {
    if ($null -ne $job.started_at) { $startValues.Add($job.started_at) }
  }
  foreach ($value in $startValues) {
    $startedAt = ConvertTo-SaveAppNativeSimDateTimeOffset -Value $value
    if ($null -eq $startedAt) {
      throw 'NativeSim run or job start time is invalid; capture readiness cannot use a bounded deadline.'
    }
    $candidate = $startedAt.AddMinutes(375)
    if ($candidate -gt $deadline) { $deadline = $candidate }
  }
  return $deadline
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

function Invoke-SaveAppSwiftPreflightGate {
  [CmdletBinding()]
  param(
    [switch]$SkipPreflight,
    [AllowNull()][scriptblock]$InvokePreflight,
    [Parameter(Mandatory)][string]$ExpectedRepository,
    [Parameter(Mandatory)][string]$ExpectedWorkflowPath,
    [Parameter(Mandatory)][string]$ExpectedBranch,
    [Parameter(Mandatory)][string]$ExpectedSha
  )

  if ($SkipPreflight) {
    return [pscustomobject]@{
      Skipped = $true
      Passed = $false
      Reused = $false
      Repository = $ExpectedRepository
      WorkflowPath = $ExpectedWorkflowPath
      Event = 'not_run'
      RunId = ''
      Branch = $ExpectedBranch
      Sha = $ExpectedSha
      Url = ''
      Status = 'not_run'
      Conclusion = 'not_run'
    }
  }

  if ($null -eq $InvokePreflight) {
    throw 'Swift Preflight is mandatory unless -SkipSwiftPreflight is explicitly selected.'
  }

  $results = @(& $InvokePreflight)
  $validated = Assert-SaveAppSwiftPreflightResult -Results $results `
    -ExpectedRepository $ExpectedRepository `
    -ExpectedWorkflowPath $ExpectedWorkflowPath `
    -ExpectedBranch $ExpectedBranch `
    -ExpectedSha $ExpectedSha

  return [pscustomobject]@{
    Skipped = $false
    Passed = $validated.Passed
    Reused = $validated.Reused
    Repository = $validated.Repository
    WorkflowPath = $validated.WorkflowPath
    Event = $validated.Event
    RunId = $validated.RunId
    Branch = $validated.Branch
    Sha = $validated.Sha
    Url = $validated.Url
    Status = $validated.Status
    Conclusion = $validated.Conclusion
  }
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

function Assert-SaveAppNativeSimCaptureChoiceCompatibility {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$NativeSimUpText,
    [Parameter(Mandatory)][string]$WorkflowText,
    [Parameter(Mandatory)][string]$CaptureHelperText
  )

  $dispatch = [regex]::Match($NativeSimUpText,'(?s)await\s+gh\.dispatch\([^,]+,\s*WORKFLOW,\s*branch,\s*\{(?<inputs>.*?)\}\s*\);')
  if (-not $dispatch.Success) {
    throw 'Installed NativeSim CLI dispatch contract is not recognizable; per-session OSLog choice cannot be sent safely.'
  }
  $inputs = $dispatch.Groups['inputs'].Value
  foreach ($required in @('session','gate_token','minutes','export_app')) {
    $fieldPattern = if ($required -eq 'session') { '(?m)^\s*session\s*[,,:]' } else { "(?m)^\s*$required\s*:" }
    if ($inputs -notmatch $fieldPattern) {
      throw "Installed NativeSim CLI dispatch input is missing its required field: $required"
    }
  }
  if ($inputs -match '(?i)capture[_-]?oslog' -or $NativeSimUpText -match '(?i)flags\[[^]]*capture[_-]?oslog[^]]*\]') {
    throw 'Installed NativeSim CLI capture input behavior changed; review the per-run OSLog handshake before launching.'
  }
  if ($WorkflowText -match '(?m)^\s*capture_oslog:\s*$' -or
      $WorkflowText -notmatch '(?m)^\s*- name: Resolve exact-run OSLog choice\s*$' -or
      $WorkflowText -notmatch "steps\.capture_decision\.outputs\.enabled == 'true'" -or
      $CaptureHelperText -notmatch 'saveapp_capture_resolve_session_choice' -or
      $CaptureHelperText -notmatch 'saveapp/oslog-choice/\$run_id/\$attempt/\$session_id') {
    throw 'SaveApp workflow does not implement the reviewed exact-run status handshake for per-session OSLog choice.'
  }
  return $true
}

function Assert-SaveAppOSLogCaptureConfiguration {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][bool]$CaptureRequested,
    [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Variables
  )

  $recipientEntries = @($Variables | Where-Object { [string]$_.name -ceq 'SAVEAPP_LOG_AGE_RECIPIENT' })
  if ($recipientEntries.Count -gt 1) { throw 'SaveApp OSLog configuration contains duplicate public age recipients.' }

  $recipient = if ($recipientEntries.Count -eq 1) { [string]$recipientEntries[0].value } else { '' }
  if ($CaptureRequested -and ($recipient -notmatch '^age1[0-9a-z]{20,100}$')) {
    throw 'Explicit SaveApp OSLog capture requires one valid public age recipient.'
  }

  return [pscustomobject]@{
    CaptureEnabled = $CaptureRequested
    RecipientConfigured = [bool]$recipient
  }
}

function New-SaveAppOSLogCaptureDecisionContract {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$ExpectedRunId,
    [Parameter(Mandatory)][int]$ExpectedAttempt,
    [Parameter(Mandatory)][string]$ExpectedSession,
    [Parameter(Mandatory)][string]$ExpectedSha,
    [Parameter(Mandatory)][bool]$CaptureRequested
  )

  if ($ExpectedRunId -notmatch '^\d+$' -or $ExpectedAttempt -lt 1 -or
      $ExpectedSession -notmatch '^[a-f0-9]{8}$' -or $ExpectedSha -notmatch '^[0-9a-fA-F]{40}$') {
    throw 'SaveApp OSLog choice has an invalid run, attempt, session, or SHA identity.'
  }

  $choice = if ($CaptureRequested) { 'true' } else { 'false' }
  return [pscustomobject]@{
    Context = "saveapp/oslog-choice/$ExpectedRunId/$ExpectedAttempt/$ExpectedSession"
    Description = "SaveApp OSLog choice capture=$choice sha=$ExpectedSha"
    CaptureEnabled = $CaptureRequested
    RunId = $ExpectedRunId
    Attempt = $ExpectedAttempt
    Session = $ExpectedSession
    Sha = $ExpectedSha
  }
}

function Test-SaveAppOSLogCaptureDecision {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$ExpectedRunId,
    [Parameter(Mandatory)][int]$ExpectedAttempt,
    [Parameter(Mandatory)][string]$ExpectedSession,
    [Parameter(Mandatory)][string]$ExpectedSha,
    [Parameter(Mandatory)][bool]$CaptureRequested,
    [AllowNull()][object]$Run,
    [AllowEmptyCollection()][object[]]$Statuses = @()
  )

  $contract = New-SaveAppOSLogCaptureDecisionContract `
    -ExpectedRunId $ExpectedRunId -ExpectedAttempt $ExpectedAttempt `
    -ExpectedSession $ExpectedSession -ExpectedSha $ExpectedSha `
    -CaptureRequested $CaptureRequested
  if ($null -eq $Run) { return New-SaveAppCaptureReadinessResult -State 'waiting' -Reason 'choice_run_not_visible' -Session $ExpectedSession }

  $attempt = 0
  $title = [regex]::Match([string]$Run.display_title,'^native-sim (?<session>[a-f0-9]{8}) · release · (?<minutes>[0-9]{1,3})m$')
  if ([string]$Run.id -cne $ExpectedRunId -or
      -not [int]::TryParse([string]$Run.run_attempt,[ref]$attempt) -or $attempt -ne $ExpectedAttempt -or
      [string]$Run.path -cne '.github/workflows/native-sim.yml' -or
      [string]$Run.event -cne 'workflow_dispatch' -or [string]$Run.head_branch -cne 'main' -or
      [string]$Run.head_sha -cne $ExpectedSha -or $null -ne $Run.conclusion -or
      [string]$Run.status -notin @('queued','in_progress') -or
      -not $title.Success -or $title.Groups['session'].Value -cne $ExpectedSession -or
      [string]::IsNullOrWhiteSpace([string]$Run.actor.login)) {
    return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'choice_run_identity_mismatch' -Session $ExpectedSession
  }

  $matching = @($Statuses | Where-Object { [string]$_.context -ceq $contract.Context })
  if ($matching.Count -eq 0) { return New-SaveAppCaptureReadinessResult -State 'waiting' -Reason 'choice_status_not_visible' -Session $ExpectedSession }
  if ($matching.Count -ne 1) { return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'choice_status_ambiguous' -Session $ExpectedSession }

  $status = $matching[0]
  $runCreatedAt = ConvertTo-SaveAppNativeSimDateTimeOffset -Value $Run.created_at
  $statusCreatedAt = ConvertTo-SaveAppNativeSimDateTimeOffset -Value $status.created_at
  if ($null -eq $runCreatedAt -or $null -eq $statusCreatedAt) {
    return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'choice_status_timestamp_invalid' -Session $ExpectedSession
  }
  if ([string]$status.state -cne 'success' -or
      [string]$status.description -cne $contract.Description -or
      [string]$status.sha -cne $ExpectedSha -or
      [string]$status.creator.login -cne [string]$Run.actor.login -or
      -not [string]::IsNullOrEmpty([string]$status.target_url) -or
      $statusCreatedAt -lt $runCreatedAt) {
    return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'choice_status_identity_mismatch' -Session $ExpectedSession
  }

  return [pscustomobject]@{
    State = 'ready'
    Reason = 'exact_run_capture_choice_confirmed'
    Session = $ExpectedSession
    CaptureEnabled = $CaptureRequested
    RunId = $ExpectedRunId
    Attempt = $ExpectedAttempt
    Sha = $ExpectedSha
  }
}

function Get-SaveAppSimulatorStatusTarget {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$AuthenticatedUrl)

  $validatedUrl = Assert-SaveAppSimulatorUrl -Url $AuthenticatedUrl
  $uri = [Uri]$validatedUrl
  return $uri.GetLeftPart([UriPartial]::Authority)
}

function New-SaveAppCaptureReadinessResult {
  param([string]$State,[string]$Reason,[string]$Session = '')
  return [pscustomobject]@{ State = $State; Reason = $Reason; Session = $Session }
}

function Test-SaveAppNativeSimTransportReadiness {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$ExpectedRunId,
    [Parameter(Mandatory)][int]$ExpectedAttempt,
    [Parameter(Mandatory)][string]$ExpectedSha,
    [Parameter(Mandatory)][string]$ExpectedBareUrl,
    [Parameter(Mandatory)][bool]$ExpectedCaptureRequested,
    [ValidateSet('transport','session')][string]$ExpectedStatusKind = 'transport',
    [AllowNull()][object]$Run,
    [AllowEmptyCollection()][object[]]$Statuses = @()
  )

  if ($ExpectedRunId -notmatch '^\d+$' -or $ExpectedAttempt -ne 1 -or
      $ExpectedSha -notmatch '^[0-9a-fA-F]{40}$' -or
      $ExpectedBareUrl -notmatch '^https://[a-z0-9-]+\.trycloudflare\.com$') {
    return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'invalid_transport_identity'
  }
  if ($null -eq $Run) {
    return New-SaveAppCaptureReadinessResult -State 'waiting' -Reason 'run_not_visible'
  }

  $runAttempt = 0
  if ([string]$Run.id -cne $ExpectedRunId -or
      -not [int]::TryParse([string]$Run.run_attempt,[ref]$runAttempt) -or $runAttempt -ne $ExpectedAttempt -or
      [string]$Run.path -cne '.github/workflows/native-sim.yml' -or
      [string]$Run.event -cne 'workflow_dispatch' -or
      [string]$Run.head_branch -cne 'main' -or
      [string]$Run.head_sha -cne $ExpectedSha) {
    return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'run_identity_mismatch'
  }
  if ([string]$Run.status -cne 'in_progress' -or $null -ne $Run.conclusion) {
    return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'run_not_active'
  }

  $titleMatch = [regex]::Match([string]$Run.display_title,'^native-sim (?<session>[a-f0-9]{8}) · release · (?<minutes>[0-9]{1,3})m$')
  if (-not $titleMatch.Success) {
    return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'session_identity_missing'
  }
  $session = $titleMatch.Groups['session'].Value
  $expectedContext = "native-sim/$session"
  $captureChoice = if ($ExpectedCaptureRequested) { 'true' } else { 'false' }
  $expectedDescription = if ($ExpectedStatusKind -eq 'transport') {
    "SaveApp transport ready capture=$captureChoice session=$session run=$ExpectedRunId attempt=$ExpectedAttempt sha=$ExpectedSha"
  } else {
    "SaveApp session ready session=$session run=$ExpectedRunId attempt=$ExpectedAttempt sha=$ExpectedSha"
  }
  $statusesForContext = @($Statuses | Where-Object { [string]$_.context -ceq $expectedContext })
  if ($statusesForContext.Count -eq 0) {
    $reason = if ($ExpectedStatusKind -eq 'transport') { 'transport_status_not_visible' } else { 'session_status_not_visible' }
    return New-SaveAppCaptureReadinessResult -State 'waiting' -Reason $reason -Session $session
  }

  $parsedStatuses = [Collections.Generic.List[object]]::new()
  foreach ($status in $statusesForContext) {
    $createdAt = ConvertTo-SaveAppNativeSimDateTimeOffset -Value $status.created_at
    if ($null -eq $createdAt) {
      return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'transport_status_timestamp_invalid' -Session $session
    }
    $parsedStatuses.Add([pscustomobject]@{ Status = $status; CreatedAt = $createdAt })
  }
  $latestStatus = @($parsedStatuses | Sort-Object -Property CreatedAt -Descending | Select-Object -First 1)[0].Status
  if ([string]$latestStatus.state -cne 'success' -or
      [string]$latestStatus.description -cne $expectedDescription -or
      [string]$latestStatus.target_url -cne $ExpectedBareUrl) {
    $reason = if ($ExpectedStatusKind -eq 'transport') { 'current_transport_status_missing' } else { 'current_session_status_missing' }
    return New-SaveAppCaptureReadinessResult -State 'waiting' -Reason $reason -Session $session
  }

  $runCreatedAt = ConvertTo-SaveAppNativeSimDateTimeOffset -Value $Run.created_at
  $statusCreatedAt = ConvertTo-SaveAppNativeSimDateTimeOffset -Value $latestStatus.created_at
  if ($null -eq $runCreatedAt -or $null -eq $statusCreatedAt) {
    return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'transport_timestamp_invalid' -Session $session
  }
  if ($statusCreatedAt -lt $runCreatedAt) {
    $reason = if ($ExpectedStatusKind -eq 'transport') { 'stale_transport_status' } else { 'stale_session_status' }
    return New-SaveAppCaptureReadinessResult -State 'waiting' -Reason $reason -Session $session
  }

  $reason = if ($ExpectedStatusKind -eq 'transport') { 'exact_run_transport_ready' } else { 'exact_run_session_ready' }
  return New-SaveAppCaptureReadinessResult -State 'ready' -Reason $reason -Session $session
}

function Assert-SaveAppNativeSimTransportHandoff {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$ExpectedRepository,
    [Parameter(Mandatory)][string]$ExpectedRunId,
    [Parameter(Mandatory)][int]$ExpectedAttempt,
    [Parameter(Mandatory)][string]$ExpectedSha,
    [Parameter(Mandatory)][bool]$CaptureRequested,
    [Parameter(Mandatory)][string]$ActionsUrl,
    [Parameter(Mandatory)][string]$SimulatorUrl,
    [AllowNull()][object]$Run,
    [AllowEmptyCollection()][object[]]$Statuses = @()
  )

  if ($ExpectedRepository -cne 'LuanRigatti/SaveApp-NativeSim-Public' -or
      $ExpectedRunId -notmatch '^\d+$' -or $ExpectedAttempt -ne 1 -or
      $ExpectedSha -notmatch '^[0-9a-fA-F]{40}$') {
    throw 'NativeSim transport handoff has an invalid repository or run identity; session links were withheld.'
  }

  $expectedActionsUrl = "https://github.com/$ExpectedRepository/actions/runs/$ExpectedRunId"
  if ($ActionsUrl -cne $expectedActionsUrl) {
    throw 'NativeSim Actions URL does not match the expected public repository and run; session links were withheld.'
  }

  $bareUrl = Get-SaveAppSimulatorStatusTarget -AuthenticatedUrl $SimulatorUrl
  if ($null -eq $Run -or [string]$Run.html_url -cne $expectedActionsUrl) {
    throw 'NativeSim run metadata does not match the Actions URL; session links were withheld.'
  }

  $statusKind = 'transport'
  $readiness = Test-SaveAppNativeSimTransportReadiness `
    -ExpectedRunId $ExpectedRunId `
    -ExpectedAttempt $ExpectedAttempt `
    -ExpectedSha $ExpectedSha `
    -ExpectedBareUrl $bareUrl `
    -ExpectedCaptureRequested $CaptureRequested `
    -ExpectedStatusKind $statusKind `
    -Run $Run `
    -Statuses $Statuses
  if ($readiness.State -ne 'ready') {
    throw "NativeSim $statusKind readiness was not confirmed for the exact current run ($($readiness.Reason)); session links were withheld."
  }

  # Keep the authenticated URL only in the caller's transient memory. This
  # result intentionally contains no URL, query string, or gate credential.
  return [pscustomobject]@{
    State = 'transport_ready'
    Repository = $ExpectedRepository
    RunId = $ExpectedRunId
    Attempt = $ExpectedAttempt
    Sha = $ExpectedSha
    Session = $readiness.Session
    CaptureRequested = $CaptureRequested
  }
}

function Test-SaveAppNativeSimCaptureReadiness {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][bool]$CaptureRequested,
    [Parameter(Mandatory)][string]$ExpectedRunId,
    [Parameter(Mandatory)][int]$ExpectedAttempt,
    [Parameter(Mandatory)][string]$ExpectedSha,
    [Parameter(Mandatory)][string]$ExpectedBareUrl,
    [AllowNull()][object]$Run,
    [AllowEmptyCollection()][object[]]$Jobs = @(),
    [AllowEmptyCollection()][object[]]$Statuses = @()
  )

  if (-not $CaptureRequested) {
    return New-SaveAppCaptureReadinessResult -State 'ready' -Reason 'capture_not_requested'
  }

  if ($ExpectedRunId -notmatch '^\d+$' -or $ExpectedAttempt -ne 1 -or $ExpectedSha -notmatch '^[0-9a-fA-F]{40}$' -or
      $ExpectedBareUrl -notmatch '^https://[a-z0-9-]+\.trycloudflare\.com$') {
    return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'invalid_expected_identity'
  }
  if ($null -eq $Run) {
    return New-SaveAppCaptureReadinessResult -State 'waiting' -Reason 'run_not_visible'
  }

  $runId = [string]$Run.id
  $runAttempt = 0
  if (-not [int]::TryParse([string]$Run.run_attempt,[ref]$runAttempt) -or
      $runId -cne $ExpectedRunId -or $runAttempt -ne $ExpectedAttempt -or
      [string]$Run.path -cne '.github/workflows/native-sim.yml' -or
      [string]$Run.event -cne 'workflow_dispatch' -or [string]$Run.head_branch -cne 'main' -or
      [string]$Run.head_sha -cne $ExpectedSha) {
    return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'run_identity_mismatch'
  }
  if ([string]$Run.status -cne 'in_progress' -or $null -ne $Run.conclusion) {
    return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'run_not_active'
  }

  $displayTitle = [string]$Run.display_title
  $titleMatch = [regex]::Match($displayTitle,'^native-sim (?<session>[a-f0-9]{8}) · release · (?<minutes>[0-9]{1,3})m$')
  if (-not $titleMatch.Success) {
    return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'session_identity_missing'
  }
  $minutes = 0
  if (-not [int]::TryParse($titleMatch.Groups['minutes'].Value,[ref]$minutes) -or $minutes -lt 1 -or $minutes -gt 350) {
    return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'session_duration_invalid'
  }
  $session = $titleMatch.Groups['session'].Value
  $expectedContext = "native-sim-capture/$session"
  $expectedDescription = "SaveApp OSLog capture ready session=$session run=$ExpectedRunId attempt=$ExpectedAttempt sha=$ExpectedSha"

  $runCreatedAt = ConvertTo-SaveAppNativeSimDateTimeOffset -Value $Run.created_at
  if ($null -eq $runCreatedAt) {
    return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'run_timestamp_invalid' -Session $session
  }

  $transport = Test-SaveAppNativeSimTransportReadiness `
    -ExpectedRunId $ExpectedRunId `
    -ExpectedAttempt $ExpectedAttempt `
    -ExpectedSha $ExpectedSha `
    -ExpectedBareUrl $ExpectedBareUrl `
    -ExpectedCaptureRequested $true `
    -Run $Run `
    -Statuses $Statuses
  if ($transport.State -ne 'ready') { return $transport }

  $contextStatuses = @($Statuses | Where-Object { [string]$_.context -ceq $expectedContext })
  if ($contextStatuses.Count -eq 0) {
    return New-SaveAppCaptureReadinessResult -State 'waiting' -Reason 'capture_status_not_visible' -Session $session
  }
  $parsedStatuses = [Collections.Generic.List[object]]::new()
  foreach ($status in $contextStatuses) {
    $createdAt = ConvertTo-SaveAppNativeSimDateTimeOffset -Value $status.created_at
    if ($null -eq $createdAt) {
      return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'session_status_timestamp_invalid' -Session $session
    }
    $parsedStatuses.Add([pscustomobject]@{ Status = $status; CreatedAt = $createdAt })
  }
  $latestStatus = @($parsedStatuses | Sort-Object -Property CreatedAt -Descending | Select-Object -First 1)[0].Status
  if ([string]$latestStatus.state -ceq 'failure') {
    return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'capture_status_failed' -Session $session
  }
  if ([string]$latestStatus.state -cne 'success' -or
      [string]$latestStatus.description -cne $expectedDescription -or
      [string]$latestStatus.target_url -cne $ExpectedBareUrl) {
    return New-SaveAppCaptureReadinessResult -State 'waiting' -Reason 'current_capture_ready_status_missing' -Session $session
  }
  $statusCreatedAt = ConvertTo-SaveAppNativeSimDateTimeOffset -Value $latestStatus.created_at
  if ($null -eq $statusCreatedAt -or $statusCreatedAt -lt $runCreatedAt) {
    return New-SaveAppCaptureReadinessResult -State 'waiting' -Reason 'stale_session_status' -Session $session
  }

  $matchingJobs = @($Jobs | Where-Object { [string]$_.name -ceq 'Build and stream SaveApp' })
  if ($matchingJobs.Count -eq 0) {
    return New-SaveAppCaptureReadinessResult -State 'waiting' -Reason 'simulator_job_not_visible' -Session $session
  }
  if ($matchingJobs.Count -ne 1) {
    return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'simulator_job_ambiguous' -Session $session
  }
  $job = $matchingJobs[0]
  if ([string]$job.run_id -cne $ExpectedRunId -or [string]$job.head_sha -cne $ExpectedSha -or
      ($job.PSObject.Properties.Name -contains 'run_attempt' -and [int]$job.run_attempt -ne $ExpectedAttempt)) {
    return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'simulator_job_identity_mismatch' -Session $session
  }

  $stepNames = @(
    'Start SaveApp OSLog capture',
    'Verify SaveApp OSLog capture probe',
    'Publish SaveApp capture ready status',
    'Keep the stream available'
  )
  $stepResults = @{}
  foreach ($name in $stepNames) {
    $matchingSteps = @($job.steps | Where-Object { [string]$_.name -ceq $name })
    if ($matchingSteps.Count -eq 0) {
      return New-SaveAppCaptureReadinessResult -State 'waiting' -Reason 'required_capture_step_not_visible' -Session $session
    }
    if ($matchingSteps.Count -ne 1) {
      return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'required_capture_step_ambiguous' -Session $session
    }
    $stepResults[$name] = $matchingSteps[0]
    $step = $matchingSteps[0]
    if ([string]$step.status -ceq 'completed' -and [string]$step.conclusion -cne 'success') {
      return New-SaveAppCaptureReadinessResult -State 'failed' -Reason 'required_capture_step_failed' -Session $session
    }
  }

  foreach ($name in @('Start SaveApp OSLog capture','Verify SaveApp OSLog capture probe','Publish SaveApp capture ready status')) {
    if ([string]$stepResults[$name].status -cne 'completed' -or [string]$stepResults[$name].conclusion -cne 'success') {
      return New-SaveAppCaptureReadinessResult -State 'waiting' -Reason 'capture_not_confirmed_by_steps' -Session $session
    }
  }
  if ([string]$stepResults['Keep the stream available'].status -cne 'in_progress') {
    return New-SaveAppCaptureReadinessResult -State 'waiting' -Reason 'simulator_stream_not_active' -Session $session
  }

  $probeCompletedAt = ConvertTo-SaveAppNativeSimDateTimeOffset -Value $stepResults['Verify SaveApp OSLog capture probe'].completed_at
  $captureStatusCreatedAt = ConvertTo-SaveAppNativeSimDateTimeOffset -Value $latestStatus.created_at
  if ($null -eq $probeCompletedAt -or $null -eq $captureStatusCreatedAt) {
    return New-SaveAppCaptureReadinessResult -State 'waiting' -Reason 'capture_probe_timestamp_not_visible' -Session $session
  }
  if ($captureStatusCreatedAt -lt $probeCompletedAt) {
    return New-SaveAppCaptureReadinessResult -State 'waiting' -Reason 'capture_status_precedes_probe' -Session $session
  }

  return New-SaveAppCaptureReadinessResult -State 'ready' -Reason 'exact_attempt_transport_capture_probe_and_stream_confirmed' -Session $session
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

Export-ModuleMember -Function Remove-SaveAppNativeSimEventSubscriptions,Select-SaveAppNativeSimActiveRuns,Assert-SaveAppSwiftPreflightResult,Invoke-SaveAppSwiftPreflightGate,Assert-SaveAppSimulatorUrl,Assert-SaveAppNativeSimExportBehavior,Assert-SaveAppNativeSimCaptureChoiceCompatibility,Assert-SaveAppOSLogCaptureConfiguration,New-SaveAppOSLogCaptureDecisionContract,Test-SaveAppOSLogCaptureDecision,Get-SaveAppSimulatorStatusTarget,Assert-SaveAppNativeSimTransportHandoff,ConvertTo-SaveAppNativeSimDateTimeOffset,Get-SaveAppOSLogReadinessDeadline,Test-SaveAppNativeSimCaptureReadiness,Assert-SaveAppSimulatorArchive,Assert-SaveAppArchiveRun,Select-SaveAppArchiveArtifact,Test-SaveAppArchiveBuildSteps,Assert-SaveAppNativeSimCliCompatible,Invoke-SaveAppNativeSimScaffoldPreview
