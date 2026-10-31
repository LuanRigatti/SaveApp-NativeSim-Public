Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Import-Module (Join-Path $repositoryRoot 'scripts\SaveAppMirrorSecurity.psm1') -Force -DisableNameChecking -ErrorAction Stop
Import-Module (Join-Path $repositoryRoot 'scripts\SaveAppNativeSimCliGuard.psm1') -Force -DisableNameChecking -ErrorAction Stop

function Assert-True {
  param([bool]$Condition,[string]$Message)
  if (-not $Condition) { throw "FAIL: $Message" }
  Write-Output "PASS: $Message"
}

function Assert-Refused {
  param([scriptblock]$Action,[string]$Message)
  $refused = $false
  try { & $Action | Out-Null } catch { $refused = $true }
  Assert-True $refused $Message
}

function New-SaveAppCaptureReadinessFixture {
  $sha = 'a' * 40
  $run = [pscustomobject]@{
    id = '987654321'
    run_attempt = 1
    path = '.github/workflows/native-sim.yml'
    event = 'workflow_dispatch'
    head_branch = 'main'
    head_sha = $sha
    status = 'in_progress'
    conclusion = $null
    html_url = 'https://github.com/LuanRigatti/SaveApp-NativeSim-Public/actions/runs/987654321'
    display_title = 'native-sim a1b2c3d4 · release · 120m'
    actor = [pscustomobject]@{ login='saveapp-owner' }
    created_at = '2026-10-27T12:00:00Z'
    run_started_at = '2026-10-27T12:00:30Z'
  }
  $transportStatus = [pscustomobject]@{
    context = 'native-sim/a1b2c3d4'
    state = 'success'
    description = "SaveApp transport ready capture=true session=a1b2c3d4 run=$($run.id) attempt=1 sha=$sha"
    target_url = 'https://capture-probe.trycloudflare.com'
    created_at = '2026-10-27T12:01:00Z'
  }
  $captureStatus = [pscustomobject]@{
    context = 'native-sim-capture/a1b2c3d4'
    state = 'success'
    description = "SaveApp OSLog capture ready session=a1b2c3d4 run=$($run.id) attempt=1 sha=$sha"
    target_url = 'https://capture-probe.trycloudflare.com'
    created_at = '2026-10-27T12:02:00Z'
  }
  $steps = @(
    [pscustomobject]@{ name='Start SaveApp OSLog capture'; status='completed'; conclusion='success'; completed_at='2026-10-27T12:01:30Z' },
    [pscustomobject]@{ name='Verify SaveApp OSLog capture probe'; status='completed'; conclusion='success'; completed_at='2026-10-27T12:01:50Z' },
    [pscustomobject]@{ name='Publish SaveApp capture ready status'; status='completed'; conclusion='success'; completed_at='2026-10-27T12:02:01Z' },
    [pscustomobject]@{ name='Keep the stream available'; status='in_progress'; conclusion=$null }
  )
  $job = [pscustomobject]@{
    name = 'Build and stream SaveApp'
    run_id = $run.id
    run_attempt = 1
    head_sha = $sha
    steps = $steps
  }
  return [pscustomobject]@{ Run=$run; Jobs=@($job); Statuses=@($transportStatus,$captureStatus); Sha=$sha; BareUrl=$transportStatus.target_url }
}

function Invoke-GitChecked {
  param([string]$Root,[string[]]$Arguments)
  $result = & git -C $Root @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Test fixture git command failed: git $($Arguments -join ' ') $result" }
}

function Invoke-GitOutputChecked {
  param([string]$Root,[string[]]$Arguments)
  $result = & git -C $Root @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Test fixture git command failed: git $($Arguments -join ' ') $result" }
  return @($result | ForEach-Object { "$_" })
}

function Invoke-ScaffoldOnly {
  param([string]$Node,[string]$InitFile,[string]$Root)
  $code = @'
import { pathToFileURL } from 'node:url';
const [, initPath, checkoutRoot] = process.argv;
const { scaffold } = await import(pathToFileURL(initPath).href);
process.stdout.write(JSON.stringify({ changed: scaffold(checkoutRoot) }) + '\n');
'@
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $Node
  $startInfo.WorkingDirectory = $Root
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  foreach ($argument in @('--input-type=module','--eval',$code,$InitFile,$Root)) { [void]$startInfo.ArgumentList.Add($argument) }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  try {
    if (-not $process.Start()) { throw 'Could not start the local NativeSim scaffold fixture.' }
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "NativeSim scaffold fixture failed: $stderr" }
    $line = @($stdout -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -Last 1)
    if ($line.Count -ne 1) { throw 'NativeSim scaffold fixture returned no result.' }
    return ($line[0] | ConvertFrom-Json -ErrorAction Stop)
  } finally { $process.Dispose() }
}

function New-NativeSimGitFixture {
  param([string]$Root,[string]$Workflow,[string]$Gate)
  New-Item -ItemType Directory -Path (Join-Path $Root '.github\workflows') -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $Root '.github\native-sim') -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $Root '.github\workflows\native-sim.yml'),$Workflow,[Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText((Join-Path $Root '.github\native-sim\gate.cjs'),$Gate,[Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText((Join-Path $Root '.gitignore'),"node_modules/`n.expo/`n",[Text.UTF8Encoding]::new($false))
  Invoke-GitChecked $Root @('init','-b','main')
  Invoke-GitChecked $Root @('config','user.email','saveapp-security-tests@example.invalid')
  Invoke-GitChecked $Root @('config','user.name','SaveApp Security Tests')
  Invoke-GitChecked $Root @('add','-A')
  Invoke-GitChecked $Root @('commit','-m','temporary NativeSim scaffold fixture')
  return ((& git -C $Root rev-parse HEAD 2>&1 | Out-String).Trim())
}

$tempRoot = Join-Path $repositoryRoot ('.saveapp-security-tests-' + [guid]::NewGuid().ToString('N'))
$linkPaths = [Collections.Generic.List[string]]::new()
try {
  $source = Join-Path $tempRoot 'source'
  $mirror = Join-Path $tempRoot 'mirror'
  $outside = Join-Path $tempRoot 'outside'
  New-Item -ItemType Directory -Path $source,$mirror,$outside -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $source 'src'),(Join-Path $source 'assets') -Force | Out-Null
  $oldPrivateRoot = 'C:\Projetos\' + 'Starter'
  $oldPrivateRepository = 'LuanRigatti/' + 'Starter'
  $oldPublicRepository = 'LuanRigatti/' + 'Starter' + '-NativeSim-Public'
  $formerSaveAppIdentifier = 'com.luanrigatti.' + 'starter'
  $formerEasVariable = 'STARTER_' + 'EAS_PROJECT_ID'
  Assert-Refused { Assert-SaveAppSafeContent -RelativePath 'scripts/unsafe.ps1' -Content $oldPrivateRoot } 'content scanner rejects the former source path in code'
  Assert-Refused { Assert-SaveAppSafeContent -RelativePath '.agents/skills/mirror-saveapp/SKILL.md' -Content $oldPrivateRepository } 'content scanner rejects the former private repository in the mirror skill'
  Assert-Refused { Assert-SaveAppSafeContent -RelativePath '.agents/skills/saveapp-nativesim/SKILL.md' -Content $oldPrivateRepository } 'content scanner rejects the former private repository in the NativeSim skill'
  Assert-Refused { Assert-SaveAppSafeContent -RelativePath '.agents/skills/saveapp-swift-preflight/SKILL.md' -Content $oldPublicRepository } 'content scanner rejects the former public repository in the Preflight skill'
  Assert-Refused { Assert-SaveAppSafeContent -RelativePath '.agents/skills/saveapp-simulator-archive/SKILL.md' -Content $oldPublicRepository } 'content scanner rejects the former public repository in the archive skill'
  Assert-Refused { Assert-SaveAppSafeContent -RelativePath 'app.config.js' -Content $formerSaveAppIdentifier } 'content scanner rejects the former Starter application identifier'
  Assert-Refused { Assert-SaveAppSafeContent -RelativePath '.github/workflows/eas-build.yml' -Content $formerEasVariable } 'content scanner rejects the former Starter EAS variable'
  Assert-Refused { Assert-SaveAppSafeContent -RelativePath 'src/leaked-key.ts' -Content ('cloud key AKIA' + ('A' * 16)) } 'content scanner still rejects AWS-style access keys'
  Assert-Refused { Assert-SaveAppSafeContent -RelativePath 'scripts/leaked-token.ps1' -Content ('token=' + ('x' * 32)) } 'content scanner still rejects long credential assignments'
  $privateKeyMarker = '-----BEGIN ' + 'PRIVATE KEY-----'
  Assert-Refused { Assert-SaveAppSafeContent -RelativePath 'src/private-key.ts' -Content $privateKeyMarker } 'content scanner still rejects private key material'
  $simulationSource = Get-Content -LiteralPath (Join-Path $repositoryRoot 'tests\SaveAppSecurity.Simulations.ps1') -Raw
  Assert-True (Assert-SaveAppSafeContent -RelativePath 'tests/SaveAppSecurity.Simulations.ps1' -Content $simulationSource) 'credential scanner accepts its own split private-key fixture while still rejecting its assembled value'
  Assert-True (Test-SaveAppGitHubRemote -RemoteUrls @('https://github.com/LuanRigatti/SaveApp.git') -ExpectedRepository 'LuanRigatti/SaveApp') 'remote validator accepts the exact SaveApp GitHub URL'
  Assert-True (-not (Test-SaveAppGitHubRemote -RemoteUrls @('https://example.invalid/github.com/LuanRigatti/SaveApp.git') -ExpectedRepository 'LuanRigatti/SaveApp')) 'remote validator rejects a URL that merely ends in the authorized repository path'
  Assert-True (-not (Test-SaveAppGitHubRemote -RemoteUrls @('https://github.com/LuanRigatti/SaveApp.git','https://github.com/other/target.git') -ExpectedRepository 'LuanRigatti/SaveApp')) 'remote validator rejects multiple configured destinations'

  $mirrorAllowedFiles = @('README.md','app.config.js')
  $mirrorAllowedDirectories = @('src','docs')
  $stagedGitFixture = Join-Path $tempRoot 'staged-path-fixture'
  New-Item -ItemType Directory -Path (Join-Path $stagedGitFixture 'src') -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $stagedGitFixture 'README.md'),'base readme',[Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText((Join-Path $stagedGitFixture 'src\one.ts'),'one',[Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText((Join-Path $stagedGitFixture 'src\two.ts'),'two',[Text.UTF8Encoding]::new($false))
  Invoke-GitChecked $stagedGitFixture @('init','-b','main')
  Invoke-GitChecked $stagedGitFixture @('config','user.email','saveapp-security-tests@example.invalid')
  Invoke-GitChecked $stagedGitFixture @('config','user.name','SaveApp Security Tests')
  Invoke-GitChecked $stagedGitFixture @('add','-A')
  Invoke-GitChecked $stagedGitFixture @('commit','-m','temporary staged path fixture')

  $emptyGitOutput = Invoke-GitOutputChecked $stagedGitFixture @('diff','--cached','--name-only')
  $emptyStagedResult = Get-SaveAppMirrorStagedPathResult -GitOutput $emptyGitOutput `
    -AllowedFiles $mirrorAllowedFiles -AllowedDirectories $mirrorAllowedDirectories
  Assert-True ($emptyStagedResult.Paths -is [string[]] -and $emptyStagedResult.Paths.Length -eq 0 -and
    -not $emptyStagedResult.HasChanges) 'an up-to-date Git mirror produces an empty string array and no-change result under StrictMode Latest'

  [IO.File]::WriteAllText((Join-Path $stagedGitFixture 'src\one.ts'),'one changed',[Text.UTF8Encoding]::new($false))
  Invoke-GitChecked $stagedGitFixture @('add','--','src/one.ts')
  $singleGitOutput = Invoke-GitOutputChecked $stagedGitFixture @('diff','--cached','--name-only')
  $singleStagedResult = Get-SaveAppMirrorStagedPathResult -GitOutput $singleGitOutput `
    -AllowedFiles $mirrorAllowedFiles -AllowedDirectories $mirrorAllowedDirectories
  Assert-True ($singleStagedResult.Paths -is [string[]] -and $singleStagedResult.Paths.Length -eq 1 -and
    $singleStagedResult.Paths[0] -ceq 'src/one.ts' -and $singleStagedResult.HasChanges) 'one staged path remains a one-item collection and is recognized as a mirror change'

  Invoke-GitChecked $stagedGitFixture @('commit','-m','temporary single staged path')
  [IO.File]::WriteAllText((Join-Path $stagedGitFixture 'README.md'),'changed readme',[Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText((Join-Path $stagedGitFixture 'src\two.ts'),'two changed',[Text.UTF8Encoding]::new($false))
  Invoke-GitChecked $stagedGitFixture @('add','--','README.md','src/two.ts')
  $multipleGitOutput = Invoke-GitOutputChecked $stagedGitFixture @('diff','--cached','--name-only')
  $multipleStagedResult = Get-SaveAppMirrorStagedPathResult -GitOutput $multipleGitOutput `
    -AllowedFiles $mirrorAllowedFiles -AllowedDirectories $mirrorAllowedDirectories
  Assert-True ($multipleStagedResult.Paths -is [string[]] -and $multipleStagedResult.Paths.Length -eq 2 -and
    $multipleStagedResult.Paths[0] -ceq 'README.md' -and $multipleStagedResult.Paths[1] -ceq 'src/two.ts' -and
    $multipleStagedResult.HasChanges) 'multiple staged paths remain an ordered collection and are recognized as mirror changes'

  New-Item -ItemType Directory -Path (Join-Path $stagedGitFixture 'private') -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $stagedGitFixture 'private\secret.txt'),'blocked',[Text.UTF8Encoding]::new($false))
  Invoke-GitChecked $stagedGitFixture @('add','--','private/secret.txt')
  $outsideAllowlistGitOutput = Invoke-GitOutputChecked $stagedGitFixture @('diff','--cached','--name-only')
  Assert-Refused {
    Get-SaveAppMirrorStagedPathResult -GitOutput $outsideAllowlistGitOutput `
      -AllowedFiles $mirrorAllowedFiles -AllowedDirectories $mirrorAllowedDirectories
  } 'staged paths outside the configured mirror allowlist are rejected'

  $mirrorScript = Get-Content -LiteralPath (Join-Path $repositoryRoot 'scripts\mirror-saveapp.ps1') -Raw
  $snapshotValidator = Get-Content -LiteralPath (Join-Path $repositoryRoot 'scripts\Test-SaveAppMirrorSnapshot.ps1') -Raw
  $productionAllowlist = Get-SaveAppMirrorAllowlist
  $productionAllowedFiles = $productionAllowlist.AllowedFiles
  $productionAllowedDirectories = $productionAllowlist.AllowedDirectories
  Assert-True ($productionAllowedFiles -contains 'scripts/verify-saveapp-simulator-build-settings.js' -and
    $productionAllowedFiles -contains 'scripts/Test-SaveAppMirrorSnapshot.ps1' -and
    $productionAllowedFiles -contains 'scripts/verify-saveapp-quick-save-app-intents.js' -and
    $productionAllowedDirectories -notcontains 'scripts' -and $productionAllowedDirectories -notcontains 'modules') 'mirror path policy explicitly includes the simulator build-settings helper and snapshot gate without broadening sensitive directories'
  $documentThumbnailModuleFiles = @(
    'modules/document-thumbnailing/package.json',
    'modules/document-thumbnailing/expo-module.config.json',
    'modules/document-thumbnailing/ios/SaveAppDocumentThumbnailing.podspec',
    'modules/document-thumbnailing/ios/SaveAppDocumentThumbnailingModule.swift',
    'modules/document-thumbnailing/src/index.ts'
  )
  $clipboardDetectionModuleFiles = @(
    'modules/clipboard-url-detection/package.json',
    'modules/clipboard-url-detection/expo-module.config.json',
    'modules/clipboard-url-detection/ios/SaveAppClipboardURLDetection.podspec',
    'modules/clipboard-url-detection/ios/SaveAppClipboardURLDetectionModule.swift',
    'modules/clipboard-url-detection/src/index.ts'
  )
  $richNoteKeyboardToolbarModuleFiles = @(
    'modules/rich-note-keyboard-toolbar/package.json',
    'modules/rich-note-keyboard-toolbar/expo-module.config.json',
    'modules/rich-note-keyboard-toolbar/ios/SaveAppRichNoteKeyboardToolbar.podspec',
    'modules/rich-note-keyboard-toolbar/ios/SaveAppRichNoteKeyboardToolbarModule.swift',
    'modules/rich-note-keyboard-toolbar/src/index.ts'
  )
  $quickSaveIntegrationFiles = @(
    'modules/dynamic-island-quick-save/ios/expo_widgets_quick_save.rb',
    'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveIntent.swift',
    'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveAppIntentsPackage.swift',
    'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveLiveActivityButton.swift',
    'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveSQLite.swift',
    'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveQueue.swift',
    'scripts/verify-saveapp-quick-save-app-intents.js',
    'plugins/withSaveLinkQuickSave.js'
  )
  $allAllowedLocalModuleFiles = @($documentThumbnailModuleFiles + $clipboardDetectionModuleFiles + $richNoteKeyboardToolbarModuleFiles + $quickSaveIntegrationFiles)
  Assert-True ($productionAllowedDirectories -notcontains 'modules' -and
    $productionAllowedDirectories -notcontains 'modules/document-thumbnailing' -and
    $productionAllowedDirectories -notcontains 'modules/clipboard-url-detection') 'the mirror does not recursively allow modules or either local module directory'
  $productionCandidates = @(Get-SaveAppMirrorCandidateFiles -SourceRoot $repositoryRoot `
    -AllowedFiles $productionAllowedFiles -AllowedDirectories $productionAllowedDirectories)
  Assert-True ($productionCandidates -contains 'scripts/verify-saveapp-simulator-build-settings.js' -and
    $productionCandidates -contains 'scripts/Test-SaveAppMirrorSnapshot.ps1' -and
    $productionCandidates -contains 'tests/quick-save-xcodeproj-contract.rb' -and
    $productionCandidates -contains 'scripts/verify-saveapp-quick-save-app-intents.js' -and
    $productionCandidates -contains 'src/features/dynamic-island/quickSaveQueue.ts' -and
    $productionCandidates -contains 'src/features/dynamic-island/quickSaveQueueImportPipeline.ts' -and
    $productionCandidates -contains 'src/features/dynamic-island/quickSaveLockScreenHistory.ts' -and
    $productionCandidates -contains 'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveQueue.swift' -and
    $productionCandidates -contains 'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveAppIntentsPackage.swift') 'the exact production candidate set contains the Xcodeproj fixture, AppIntents target verifier, package registry source and pre-publication snapshot gate'
  $noPreflightSkillPath = '.agents/skills/saveapp-nativesim-nopreflight/SKILL.md'
  $noPreflightSkillFile = Resolve-SaveAppMirrorPath -Base $repositoryRoot -RelativePath $noPreflightSkillPath -ExpectedType File
  Assert-True ($productionAllowedFiles -contains $noPreflightSkillPath -and
    $snapshotValidator.Contains("'$noPreflightSkillPath'") -and $productionCandidates -contains $noPreflightSkillPath -and
    (Test-SaveAppMirrorAllowedRelativePath -RelativePath $noPreflightSkillPath `
      -AllowedFiles $productionAllowedFiles -AllowedDirectories $productionAllowedDirectories) -and
    (Assert-SaveAppSafeContent -RelativePath $noPreflightSkillPath -Content ([IO.File]::ReadAllText($noPreflightSkillFile)))) 'the no-Preflight skill is an exact required snapshot path and remains covered by the existing path and content scanners'

  $incompleteSnapshot = Join-Path $tempRoot 'incomplete-mirror-snapshot'
  $incompleteManifestPath = Join-Path $tempRoot 'incomplete-mirror-manifest.json'
  New-Item -ItemType Directory -Path $incompleteSnapshot -Force | Out-Null
  $incompleteEntries = foreach ($relative in $productionCandidates | Where-Object { $_ -ne 'scripts/verify-saveapp-simulator-build-settings.js' }) {
    $fullPath = Resolve-SaveAppMirrorPath -Base $repositoryRoot -RelativePath $relative -ExpectedType File
    [pscustomobject]@{ Path = $relative; Sha256 = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash }
  }
  $incompleteProvenance = @('source_repository=LuanRigatti/SaveApp','source_branch=main',('source_commit=' + ('b' * 40))) -join [Environment]::NewLine
  [IO.File]::WriteAllText($incompleteManifestPath,([pscustomobject]@{
    SourceCommit = ('b' * 40)
    Provenance = $incompleteProvenance
    Files = @($incompleteEntries)
  } | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
  $pwshForGate = Get-Command pwsh.exe -ErrorAction Stop
  $incompleteGateOutput = @(& $pwshForGate.Source -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `
    (Join-Path $repositoryRoot 'scripts\Test-SaveAppMirrorSnapshot.ps1') `
    -SnapshotRoot $incompleteSnapshot -ManifestPath $incompleteManifestPath -ManifestOnly 2>&1)
  $incompleteGateExit = $LASTEXITCODE
  $incompleteGateText = ($incompleteGateOutput | ForEach-Object { "$_" }) -join [Environment]::NewLine
  $normalizedIncompleteGateText = [regex]::Replace($incompleteGateText,'\s+',' ')
  Assert-True ($incompleteGateExit -ne 0 -and
    $normalizedIncompleteGateText -match 'Required mirror dependency is absent from.*scripts/verify-saveapp-simulator-build-settings\.js' -and
    $normalizedIncompleteGateText -notmatch 'Snapshot gate: npm ci') "an omitted mandatory build-settings helper blocks the local snapshot gate before npm or publication; output: $incompleteGateText"

  $incompleteQuickSaveManifestPath = Join-Path $tempRoot 'incomplete-quick-save-manifest.json'
  $missingQuickSaveDependency = 'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveIntent.swift'
  $incompleteQuickSaveEntries = foreach ($relative in $productionCandidates | Where-Object { $_ -ne $missingQuickSaveDependency }) {
    $fullPath = Resolve-SaveAppMirrorPath -Base $repositoryRoot -RelativePath $relative -ExpectedType File
    [pscustomobject]@{ Path = $relative; Sha256 = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash }
  }
  [IO.File]::WriteAllText($incompleteQuickSaveManifestPath,([pscustomobject]@{
    SourceCommit = ('b' * 40)
    Provenance = $incompleteProvenance
    Files = @($incompleteQuickSaveEntries)
  } | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
  $incompleteQuickSaveOutput = @(& $pwshForGate.Source -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `
    (Join-Path $repositoryRoot 'scripts\Test-SaveAppMirrorSnapshot.ps1') `
    -SnapshotRoot $incompleteSnapshot -ManifestPath $incompleteQuickSaveManifestPath -ManifestOnly 2>&1)
  $incompleteQuickSaveExit = $LASTEXITCODE
  $incompleteQuickSaveText = ($incompleteQuickSaveOutput | ForEach-Object { "$_" }) -join [Environment]::NewLine
  $normalizedQuickSaveGateText = [regex]::Replace($incompleteQuickSaveText,'\s+',' ')
  Assert-True ($incompleteQuickSaveExit -ne 0 -and
    $normalizedQuickSaveGateText -match 'Required mirror dependency is absent from.*modules/dynamic-island-quick-save/ios/SaveAppQuickSaveIntent\.swift' -and
    $normalizedQuickSaveGateText -notmatch 'Snapshot gate: npm ci') "a missing LiveActivityIntent source blocks the local mirror gate before npm or publication; output: $incompleteQuickSaveText"

  $incompleteQueueManifestPath = Join-Path $tempRoot 'incomplete-quick-save-queue-manifest.json'
  $missingQueueDependency = 'src/features/dynamic-island/quickSaveQueueImportPipeline.ts'
  $incompleteQueueEntries = foreach ($relative in $productionCandidates | Where-Object { $_ -ne $missingQueueDependency }) {
    $fullPath = Resolve-SaveAppMirrorPath -Base $repositoryRoot -RelativePath $relative -ExpectedType File
    [pscustomobject]@{ Path = $relative; Sha256 = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash }
  }
  [IO.File]::WriteAllText($incompleteQueueManifestPath,([pscustomobject]@{
    SourceCommit = ('b' * 40)
    Provenance = $incompleteProvenance
    Files = @($incompleteQueueEntries)
  } | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
  $incompleteQueueOutput = @(& $pwshForGate.Source -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `
    (Join-Path $repositoryRoot 'scripts\Test-SaveAppMirrorSnapshot.ps1') `
    -SnapshotRoot $incompleteSnapshot -ManifestPath $incompleteQueueManifestPath -ManifestOnly 2>&1)
  $incompleteQueueExit = $LASTEXITCODE
  $incompleteQueueText = ($incompleteQueueOutput | ForEach-Object { "$_" }) -join [Environment]::NewLine
  $normalizedQueueGateText = [regex]::Replace($incompleteQueueText,'\s+',' ')
  Assert-True ($incompleteQueueExit -ne 0 -and
    $normalizedQueueGateText -match 'Required mirror dependency is absent from.*src/features/dynamic-island/quickSaveQueueImportPipeline\.ts' -and
    $normalizedQueueGateText -notmatch 'Snapshot gate: npm ci') "a missing Quick Save import pipeline blocks before snapshot tests or public publication; output: $incompleteQueueText"

  $incompleteXcodeprojManifestPath = Join-Path $tempRoot 'incomplete-xcodeproj-test-manifest.json'
  $missingXcodeprojTest = 'tests/quick-save-xcodeproj-contract.rb'
  $incompleteXcodeprojEntries = foreach ($relative in $productionCandidates | Where-Object { $_ -ne $missingXcodeprojTest }) {
    $fullPath = Resolve-SaveAppMirrorPath -Base $repositoryRoot -RelativePath $relative -ExpectedType File
    [pscustomobject]@{ Path = $relative; Sha256 = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash }
  }
  [IO.File]::WriteAllText($incompleteXcodeprojManifestPath,([pscustomobject]@{
    SourceCommit = ('b' * 40)
    Provenance = $incompleteProvenance
    Files = @($incompleteXcodeprojEntries)
  } | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
  $incompleteXcodeprojOutput = @(& $pwshForGate.Source -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `
    (Join-Path $repositoryRoot 'scripts\Test-SaveAppMirrorSnapshot.ps1') `
    -SnapshotRoot $incompleteSnapshot -ManifestPath $incompleteXcodeprojManifestPath -ManifestOnly 2>&1)
  $incompleteXcodeprojExit = $LASTEXITCODE
  $incompleteXcodeprojText = ($incompleteXcodeprojOutput | ForEach-Object { "$_" }) -join [Environment]::NewLine
  $normalizedXcodeprojText = [regex]::Replace($incompleteXcodeprojText,'\s+',' ')
  Assert-True ($incompleteXcodeprojExit -ne 0 -and
    $normalizedXcodeprojText -match 'Required mirror dependency is absent from.*tests/quick-save-xcodeproj-contract\.rb' -and
    $normalizedXcodeprojText -notmatch 'Snapshot gate: npm ci') "a missing real Xcodeproj regression test blocks the local mirror gate before npm or publication; output: $incompleteXcodeprojText"

  $incompleteAppIntentsManifestPath = Join-Path $tempRoot 'incomplete-app-intents-manifest.json'
  $missingAppIntentsSource = 'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveAppIntentsPackage.swift'
  $incompleteAppIntentsEntries = foreach ($relative in $productionCandidates | Where-Object { $_ -ne $missingAppIntentsSource }) {
    $fullPath = Resolve-SaveAppMirrorPath -Base $repositoryRoot -RelativePath $relative -ExpectedType File
    [pscustomobject]@{ Path = $relative; Sha256 = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash }
  }
  [IO.File]::WriteAllText($incompleteAppIntentsManifestPath,([pscustomobject]@{
    SourceCommit = ('b' * 40)
    Provenance = $incompleteProvenance
    Files = @($incompleteAppIntentsEntries)
  } | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
  $incompleteAppIntentsOutput = @(& $pwshForGate.Source -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `
    (Join-Path $repositoryRoot 'scripts\Test-SaveAppMirrorSnapshot.ps1') `
    -SnapshotRoot $incompleteSnapshot -ManifestPath $incompleteAppIntentsManifestPath -ManifestOnly 2>&1)
  $incompleteAppIntentsExit = $LASTEXITCODE
  $incompleteAppIntentsText = ($incompleteAppIntentsOutput | ForEach-Object { "$_" }) -join [Environment]::NewLine
  $normalizedAppIntentsText = [regex]::Replace($incompleteAppIntentsText,'\s+',' ')
  Assert-True ($incompleteAppIntentsExit -ne 0 -and
    $normalizedAppIntentsText -match 'Required mirror dependency is absent from.*modules/dynamic-island-quick-save/ios/SaveAppQuickSaveAppIntentsPackage\.swift' -and
    $normalizedAppIntentsText -notmatch 'Snapshot gate: npm ci') "a missing AppIntentsPackage registry source blocks the local snapshot gate before npm or publication; output: $incompleteAppIntentsText"

  $snapshotGateIndex = $mirrorScript.IndexOf('Test-SaveAppMirrorSnapshot.ps1',[StringComparison]::Ordinal)
  $destinationCopyIndex = $mirrorScript.IndexOf('Copy-SaveAppMirrorFile -SourceRoot $sourceRoot -MirrorRoot $destinationRoot',[StringComparison]::Ordinal)
  $destinationStageIndex = $mirrorScript.IndexOf("git -C `$destinationRoot add",[StringComparison]::Ordinal)
  $destinationPushIndex = $mirrorScript.IndexOf('push --set-upstream origin main',[StringComparison]::Ordinal)
  Assert-True ($snapshotGateIndex -ge 0 -and $destinationCopyIndex -gt $snapshotGateIndex -and
    $destinationStageIndex -gt $snapshotGateIndex -and $destinationPushIndex -gt $snapshotGateIndex) 'incomplete snapshots are rejected before any public mirror copy, staging, commit, or push'
  foreach ($moduleRelativePath in $allAllowedLocalModuleFiles) {
    Assert-True ($productionAllowedFiles -contains $moduleRelativePath) "$moduleRelativePath is included as an exact mirror allowlist entry"
    Assert-True (Test-SaveAppMirrorAllowedRelativePath -RelativePath $moduleRelativePath `
      -AllowedFiles $productionAllowedFiles -AllowedDirectories $productionAllowedDirectories) "$moduleRelativePath passes the production snapshot path policy"
    $moduleFullPath = Resolve-SaveAppMirrorPath -Base $repositoryRoot -RelativePath $moduleRelativePath -ExpectedType File
    $moduleContent = [IO.File]::ReadAllText($moduleFullPath)
    Assert-True (Assert-SaveAppSafeContent -RelativePath $moduleRelativePath -Content $moduleContent) "$moduleRelativePath passes the existing content scanner"
  }
  $moduleSnapshot = Get-SaveAppMirrorStagedPathResult -GitOutput $allAllowedLocalModuleFiles `
    -AllowedFiles $productionAllowedFiles -AllowedDirectories $productionAllowedDirectories
  Assert-True ($moduleSnapshot.HasChanges -and $moduleSnapshot.Paths.Length -eq $allAllowedLocalModuleFiles.Length -and
    ($moduleSnapshot.Paths -join '|') -eq ($allAllowedLocalModuleFiles -join '|')) 'the simulated mirror snapshot contains every exact file from local modules and the quick-save config plugin'
  Assert-True ((Test-SaveAppMirrorBlockedName -RelativePath 'modules/document-thumbnailing/ios/SaveAppDocumentThumbnailing.podspec') -eq $false -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/document-thumbnailing/ios/SaveAppDocumentThumbnailingModule.swift') -eq $false -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/clipboard-url-detection/ios/SaveAppClipboardURLDetection.podspec') -eq $false -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/clipboard-url-detection/ios/SaveAppClipboardURLDetectionModule.swift') -eq $false -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/rich-note-keyboard-toolbar/ios/SaveAppRichNoteKeyboardToolbar.podspec') -eq $false -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/rich-note-keyboard-toolbar/ios/SaveAppRichNoteKeyboardToolbarModule.swift') -eq $false -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/dynamic-island-quick-save/ios/expo_widgets_quick_save.rb') -eq $false -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveIntent.swift') -eq $false -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveLiveActivityButton.swift') -eq $false -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveSQLite.swift') -eq $false -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveQueue.swift') -eq $false) 'only the eleven exact local module iOS sources bypass the generated ios-directory name block'
  Assert-True ((Test-SaveAppMirrorBlockedName -RelativePath 'modules/document-thumbnailing/ios/Unapproved.swift') -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/document-thumbnailing/ios/private-key.pem') -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/document-thumbnailing/.env.local') -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/clipboard-url-detection/ios/Unapproved.swift') -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/rich-note-keyboard-toolbar/ios/Unapproved.swift') -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/rich-note-keyboard-toolbar/ios/private-key.pem') -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/rich-note-keyboard-toolbar/.env.local') -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/clipboard-url-detection/ios/private-key.pem') -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/clipboard-url-detection/.env.local') -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/dynamic-island-quick-save/ios/Unapproved.swift') -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/dynamic-island-quick-save/ios/private-key.pem') -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/dynamic-island-quick-save/.env.local') -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'ios/Pods/SaveApp.xcodeproj')) 'unapproved iOS files, secrets, and generated native directories remain blocked'
  foreach ($unapprovedModulePath in @(
      'modules/document-thumbnailing/ios/Unapproved.swift',
      'modules/document-thumbnailing/private/credentials.pem',
      'modules/document-thumbnailing/.env.local',
      'modules/clipboard-url-detection/ios/Unapproved.swift',
      'modules/rich-note-keyboard-toolbar/ios/Unapproved.swift',
      'modules/rich-note-keyboard-toolbar/private/credentials.pem',
      'modules/rich-note-keyboard-toolbar/.env.local',
      'modules/clipboard-url-detection/private/credentials.pem',
      'modules/clipboard-url-detection/.env.local',
      'modules/dynamic-island-quick-save/ios/Unapproved.swift',
      'modules/dynamic-island-quick-save/private/credentials.pem',
      'modules/dynamic-island-quick-save/.env.local',
      'modules/other/Module.swift'
    )) {
    Assert-True (-not (Test-SaveAppMirrorAllowedRelativePath -RelativePath $unapprovedModulePath `
      -AllowedFiles $productionAllowedFiles -AllowedDirectories $productionAllowedDirectories)) "$unapprovedModulePath remains outside the exact module allowlist"
  }
  Assert-Refused {
    Assert-SaveAppSafeContent -RelativePath 'modules/document-thumbnailing/ios/SaveAppDocumentThumbnailingModule.swift' `
      -Content ('token=' + ('x' * 32))
  } 'the existing credential scanner still blocks secrets inside an allowlisted Swift source path'
  Assert-Refused {
    Assert-SaveAppSafeContent -RelativePath 'modules/clipboard-url-detection/ios/SaveAppClipboardURLDetectionModule.swift' `
      -Content ('token=' + ('x' * 32))
  } 'the existing credential scanner still blocks secrets inside the clipboard Swift source path'
  Assert-Refused {
    Assert-SaveAppSafeContent -RelativePath 'modules/rich-note-keyboard-toolbar/ios/SaveAppRichNoteKeyboardToolbarModule.swift' `
      -Content ('token=' + ('x' * 32))
  } 'the existing credential scanner still blocks secrets inside the rich-note toolbar Swift source path'
  Assert-Refused {
    Assert-SaveAppSafeContent -RelativePath 'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveIntent.swift' `
      -Content ('token=' + ('x' * 32))
  } 'the existing credential scanner still blocks secrets inside the quick-save Swift source path'

  $mirrorSimulation = Join-Path $tempRoot 'local-module-mirror'
  New-Item -ItemType Directory -Path $mirrorSimulation -Force | Out-Null
  $moduleImportChecks = @(
    [pscustomobject]@{
      Importer = 'src/app/links/compose.tsx'
      Specifier = '../../../modules/clipboard-url-detection/src'
      ModuleIndex = 'modules/clipboard-url-detection/src/index.ts'
    },
    [pscustomobject]@{
      Importer = 'src/features/home-content/useClipboardLinkOffer.ts'
      Specifier = '../../../modules/clipboard-url-detection/src'
      ModuleIndex = 'modules/clipboard-url-detection/src/index.ts'
    },
    [pscustomobject]@{
      Importer = 'src/features/documents/LocalDocumentLibraryProvider.tsx'
      Specifier = '../../../modules/document-thumbnailing/src'
      ModuleIndex = 'modules/document-thumbnailing/src/index.ts'
    }
  )
  $mirrorSimulationPaths = @($allAllowedLocalModuleFiles + @($moduleImportChecks | ForEach-Object { $_.Importer }))
  foreach ($relativePath in $mirrorSimulationPaths) {
    Assert-True (Test-SaveAppMirrorAllowedRelativePath -RelativePath $relativePath `
      -AllowedFiles $productionAllowedFiles -AllowedDirectories $productionAllowedDirectories) "$relativePath is permitted by the production mirror path policy"
    $sourceFile = Resolve-SaveAppMirrorPath -Base $repositoryRoot -RelativePath $relativePath -ExpectedType File
    Assert-True (Assert-SaveAppSafeContent -RelativePath $relativePath -Content ([IO.File]::ReadAllText($sourceFile))) "$relativePath passes content scanning before mirror copy"
    $copiedFile = Copy-SaveAppMirrorFile -SourceRoot $repositoryRoot -MirrorRoot $mirrorSimulation -RelativePath $relativePath
    $copiedHash = (Get-FileHash -LiteralPath $copiedFile -Algorithm SHA256).Hash
    $sourceHash = (Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash
    Assert-True ($copiedHash -ceq $sourceHash) "$relativePath is copied unchanged into the local mirror simulation"
  }
  foreach ($importCheck in $moduleImportChecks) {
    $mirroredImporter = Resolve-SaveAppMirrorPath -Base $mirrorSimulation -RelativePath $importCheck.Importer -ExpectedType File
    $importerText = [IO.File]::ReadAllText($mirroredImporter)
    $expectedImport = "from '$($importCheck.Specifier)'"
    Assert-True ($importerText.Contains($expectedImport)) "$($importCheck.Importer) retains its local module import in the mirrored source"
    $resolvedImportIndex = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $mirroredImporter) ($importCheck.Specifier + '\index.ts')))
    $expectedImportIndex = Resolve-SaveAppMirrorPath -Base $mirrorSimulation -RelativePath $importCheck.ModuleIndex -ExpectedType File
    Assert-True ($resolvedImportIndex -ceq $expectedImportIndex) "$($importCheck.Importer) resolves to $($importCheck.ModuleIndex) in the mirrored tree"
  }
  Assert-True ((Test-SaveAppMirrorAllowedRelativePath -RelativePath 'modules/clipboard-url-detection/.env' `
    -AllowedFiles $productionAllowedFiles -AllowedDirectories $productionAllowedDirectories) -eq $false -and
    (Test-SaveAppMirrorAllowedRelativePath -RelativePath 'modules/clipboard-url-detection/ios/Unapproved.swift' `
      -AllowedFiles $productionAllowedFiles -AllowedDirectories $productionAllowedDirectories) -eq $false) 'the local module mirror excludes environment files and unapproved native sources'

  $noChangeGateIndex = $mirrorScript.IndexOf('if (-not $stagedPathResult.HasChanges)',[StringComparison]::Ordinal)
  $noChangeReturnIndex = if ($noChangeGateIndex -ge 0) {
    $mirrorScript.IndexOf('return',$noChangeGateIndex,[StringComparison]::Ordinal)
  } else { -1 }
  $mirrorCommitIndex = $mirrorScript.IndexOf('& git -C $destinationRoot @commitArgs',[StringComparison]::Ordinal)
  $mirrorPushIndex = $mirrorScript.IndexOf('& git -C $destinationRoot push --set-upstream origin main',[StringComparison]::Ordinal)
  Assert-True ($noChangeGateIndex -ge 0 -and $noChangeReturnIndex -gt $noChangeGateIndex -and
    $mirrorCommitIndex -gt $noChangeReturnIndex -and $mirrorPushIndex -gt $noChangeReturnIndex) 'an up-to-date mirror returns before any commit or push command'

  $baseStatement = 'The ' + ('Star' + 'ter') + ' UI template was used only as the initial base for this independent SaveApp snapshot.'
  $baseStatementVariant = $baseStatement.TrimEnd('.') + '!'
  Assert-True (Assert-SaveAppSafeContent -RelativePath 'docs/current-state.md' -Content $baseStatement) 'the exact static provenance sentence is allowed only in its designated documentation path'
  Assert-Refused { Assert-SaveAppSafeContent -RelativePath 'README.md' -Content $baseStatement } 'the exact static provenance sentence is blocked outside its designated documentation path'
  Assert-Refused { Assert-SaveAppSafeContent -RelativePath 'README.md' -Content $baseStatementVariant } 'a punctuation variant of the previous-source sentence is blocked outside its designated documentation path'
  Assert-Refused { Assert-SaveAppSafeContent -RelativePath 'scripts/provenance.ps1' -Content $baseStatement } 'the exact static provenance sentence remains blocked in code'
  Assert-Refused { Assert-SaveAppSafeContent -RelativePath '.agents/skills/saveapp-nativesim/SKILL.md' -Content $baseStatement } 'the exact static provenance sentence remains blocked in an operational skill'
  Assert-True (Assert-SaveAppSafeContent -RelativePath 'docs/current-state.md' -Content (Get-Content -LiteralPath (Join-Path $repositoryRoot 'docs/current-state.md') -Raw)) 'the current-state documentation passes its exact provenance exception'
  $operationalFiles = @(
    Get-ChildItem (Join-Path $repositoryRoot 'scripts') -File -Recurse
    Get-ChildItem (Join-Path $repositoryRoot '.github\workflows') -File -Recurse
    Get-ChildItem (Join-Path $repositoryRoot '.agents\skills') -File -Recurse
  )
  foreach ($operationalFile in $operationalFiles) {
    $operationalText = [IO.File]::ReadAllText($operationalFile.FullName)
    $relativeOperationalPath = [IO.Path]::GetRelativePath($repositoryRoot,$operationalFile.FullName).Replace([char]92,[char]47)
    $null = Assert-SaveAppSafeContent -RelativePath $relativeOperationalPath -Content $operationalText
    foreach ($formerTarget in @($oldPrivateRoot,$oldPrivateRepository,$oldPublicRepository)) {
      if ($operationalText.IndexOf($formerTarget,[StringComparison]::OrdinalIgnoreCase) -ge 0) {
        throw "FAIL: operational target reference remains in $($operationalFile.FullName)"
      }
    }
  }
  Assert-True $true 'scripts, workflows, and operational skills contain no former Starter targets'
  $cleanupTimer = [System.Timers.Timer]::new(60000)
  $successEventName = 'SaveAppCleanupSuccess-' + [guid]::NewGuid().ToString('N')
  $successSubscription = Register-ObjectEvent -InputObject $cleanupTimer -EventName Elapsed -SourceIdentifier $successEventName -Action { }
  Assert-True ($successSubscription.GetType().Name -eq 'PSEventJob') 'launcher event registration returns a PSEventJob'
  Remove-SaveAppNativeSimEventSubscriptions -SourceIdentifiers @($successEventName) -Subscriptions @($successSubscription)
  Assert-True (@(Get-EventSubscriber -SourceIdentifier $successEventName -ErrorAction SilentlyContinue).Count -eq 0 -and
    $null -eq (Get-Job -Id $successSubscription.Id -ErrorAction SilentlyContinue)) 'event and job cleanup succeeds without dereferencing Action'
  Remove-SaveAppNativeSimEventSubscriptions
  Assert-True $true 'partial initialization cleanup accepts missing subscriptions and source identifiers'
  $failureEventName = 'SaveAppCleanupFailure-' + [guid]::NewGuid().ToString('N')
  $failureSubscription = Register-ObjectEvent -InputObject $cleanupTimer -EventName Elapsed -SourceIdentifier $failureEventName -Action { }
  $primaryFailure = 'simulated primary launcher failure'
  $observedFailure = $null
  $mockCleanupCalls = [Collections.Generic.List[string]]::new()
  $mockUnregister = { param($sourceIdentifier) $mockCleanupCalls.Add("unregister:$sourceIdentifier"); throw 'mock unregister failure' }.GetNewClosure()
  $mockRemoveEvent = { param($sourceIdentifier) $mockCleanupCalls.Add("event:$sourceIdentifier"); throw 'mock event failure' }.GetNewClosure()
  $mockRemoveJob = { param($subscription) $mockCleanupCalls.Add("job:$($subscription.GetType().Name)"); throw 'mock job failure' }.GetNewClosure()
  try {
    try { throw $primaryFailure }
    finally {
      Remove-SaveAppNativeSimEventSubscriptions -SourceIdentifiers @($failureEventName) -Subscriptions @($failureSubscription) `
        -UnregisterEventAction $mockUnregister -RemoveEventAction $mockRemoveEvent -RemoveJobAction $mockRemoveJob
    }
  } catch { $observedFailure = $_.Exception.Message }
  Assert-True ($observedFailure -ceq $primaryFailure -and $mockCleanupCalls.Count -eq 3 -and
    $mockCleanupCalls[0] -like 'unregister:*' -and $mockCleanupCalls[1] -like 'event:*' -and
    $mockCleanupCalls[2] -eq 'job:PSEventJob') 'mocked cleanup failures are all attempted, do not dereference Action, and preserve the primary launcher error'
  Remove-SaveAppNativeSimEventSubscriptions -SourceIdentifiers @($failureEventName) -Subscriptions @($failureSubscription)
  Remove-SaveAppNativeSimEventSubscriptions -SourceIdentifiers @('partial-initialization-missing-event') -Subscriptions @($null)
  Assert-True $true 'partial initialization cleanup tolerates absent event subscriptions and jobs'
  $cleanupTimer.Dispose()
  [IO.File]::WriteAllText((Join-Path $source 'src\safe.js'),'safe',[Text.UTF8Encoding]::new($false))
  Assert-True ((Resolve-SaveAppMirrorPath -Base $source -RelativePath 'src\safe.js' -ExpectedType File) -eq (Join-Path $source 'src\safe.js')) 'valid allowlisted source file resolves within root'
  Assert-True ((Resolve-SaveAppMirrorPath -Base $source -RelativePath 'src' -ExpectedType Directory) -eq (Join-Path $source 'src')) 'valid allowlisted source directory resolves within root'
  Assert-Refused { Resolve-SaveAppMirrorPath -Base $source -RelativePath '..\outside\safe.js' -ExpectedType File } 'path traversal outside mirror root is rejected'

  $mirrorSecurityModule = Get-Module SaveAppMirrorSecurity
  $syntheticFileSymlink = [pscustomobject]@{ Attributes = [IO.FileAttributes]::ReparsePoint; PSIsContainer = $false }
  $syntheticDirectorySymlink = [pscustomobject]@{ Attributes = [IO.FileAttributes]::Directory -bor [IO.FileAttributes]::ReparsePoint; PSIsContainer = $true }
  Assert-Refused { & $mirrorSecurityModule { param($item) Assert-SaveAppPathItem -Item $item -Path 'simulated-file-symlink' -ExpectedType File } $syntheticFileSymlink } 'simulated malicious source file symlink is rejected'
  Assert-Refused { & $mirrorSecurityModule { param($item) Assert-SaveAppPathItem -Item $item -Path 'simulated-directory-symlink' -ExpectedType Directory } $syntheticDirectorySymlink } 'simulated malicious source directory symlink is rejected'

  $outsideFile = Join-Path $outside 'sentinel.txt'
  [IO.File]::WriteAllText($outsideFile,'external-sentinel',[Text.UTF8Encoding]::new($false))
  $copiedFile = Copy-SaveAppMirrorFile -SourceRoot $source -MirrorRoot $mirror -RelativePath 'src\safe.js'
  Assert-True ([IO.File]::ReadAllText($copiedFile) -ceq 'safe') 'valid allowlisted file is copied through an in-root temporary file'
  $linkedCopy = Join-Path $mirror 'src\safe.js'
  [IO.File]::Delete($linkedCopy)
  New-Item -ItemType HardLink -Path $linkedCopy -Target $outsideFile -ErrorAction Stop | Out-Null
  $null = Copy-SaveAppMirrorFile -SourceRoot $source -MirrorRoot $mirror -RelativePath 'src\safe.js'
  Assert-True ([IO.File]::ReadAllText($linkedCopy) -ceq 'safe' -and [IO.File]::ReadAllText($outsideFile) -ceq 'external-sentinel') 'atomic mirror copy replaces a hard-linked destination without overwriting external content'

  $junction = Join-Path $source 'assets\external-junction'
  New-Item -ItemType Junction -Path $junction -Target $outside -ErrorAction Stop | Out-Null
  $linkPaths.Add($junction)
  Assert-Refused { Resolve-SaveAppMirrorPath -Base $source -RelativePath 'assets\external-junction' -ExpectedType Directory } 'malicious source junction is rejected before enumeration'

  $ancestorLink = Join-Path $tempRoot 'ancestor-junction'
  New-Item -ItemType Junction -Path $ancestorLink -Target $outside -ErrorAction Stop | Out-Null
  $linkPaths.Add($ancestorLink)
  Assert-Refused { Assert-SaveAppMirrorRoot -Root (Join-Path $ancestorLink 'nested-root') } 'reparse point in an ancestor component is rejected'

  $provenance = "source_repository=LuanRigatti/SaveApp`nsource_branch=main`nsource_commit=$('a' * 40)"
  $writtenPath = Write-SaveAppProvenance -MirrorRoot $mirror -Content $provenance
  Assert-True ([IO.File]::ReadAllText($writtenPath) -ceq $provenance) 'provenance writes atomically to a valid mirror root'

  $redirectedMirror = Join-Path $tempRoot 'redirected-mirror'
  New-Item -ItemType Directory -Path $redirectedMirror -Force | Out-Null
  $externalProvenance = Join-Path $outside 'provenance-target.txt'
  [IO.File]::WriteAllText($externalProvenance,'must-remain-unchanged',[Text.UTF8Encoding]::new($false))
  $provenanceLink = Join-Path $redirectedMirror '.nativesim-source'
  New-Item -ItemType HardLink -Path $provenanceLink -Target $externalProvenance -ErrorAction Stop | Out-Null
  $redirectWrite = Write-SaveAppProvenance -MirrorRoot $redirectedMirror -Content $provenance
  Assert-True ([IO.File]::ReadAllText($redirectWrite) -ceq $provenance -and [IO.File]::ReadAllText($externalProvenance) -ceq 'must-remain-unchanged') 'atomic provenance replacement detaches a linked target without overwriting its external file'

  $junctionMirror = Join-Path $tempRoot 'mirror-junction'
  New-Item -ItemType Junction -Path $junctionMirror -Target $outside -ErrorAction Stop | Out-Null
  $linkPaths.Add($junctionMirror)
  Assert-Refused { Write-SaveAppProvenance -MirrorRoot $junctionMirror -Content $provenance } 'junction redirected provenance root is rejected'
  Assert-True ([IO.File]::ReadAllText($outsideFile) -ceq 'external-sentinel') 'junction destination did not overwrite external content'

  $cli = Get-Command native-sim.ps1 -ErrorAction Stop
  $package = Join-Path (Split-Path -Parent $cli.Source) 'node_modules\native-sim'
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $templateWorkflow = Get-Content -LiteralPath (Join-Path $package 'templates\native-sim.yml') -Raw
  $templateGate = Get-Content -LiteralPath (Join-Path $package 'templates\gate.cjs') -Raw
  $approvedGate = [regex]::Replace($templateGate,'(?<![A-Z_])TOKEN(?![A-Z_])','GATE_VALUE')
  $fixture = Join-Path $tempRoot 'cli-valid'
  New-Item -ItemType Directory -Path $fixture -Force | Out-Null
  $fixtureSha = New-NativeSimGitFixture -Root $fixture -Workflow $templateWorkflow -Gate $approvedGate
  $preview = Invoke-SaveAppNativeSimScaffoldPreview -CliPackageRoot $package -CheckoutRoot $fixture -ExpectedSha $fixtureSha -NodeExecutable $node
  Assert-True (-not $preview.ScaffoldChanged -and $preview.CheckoutSha -eq $fixtureSha) 'actual NativeSim scaffold preserves the approved workflow and normalized gate at the audited SHA'

  $tamperedFixture = Join-Path $tempRoot 'cli-gate-tampered'
  New-Item -ItemType Directory -Path $tamperedFixture -Force | Out-Null
  $tamperedGate = $approvedGate + "`n// unexpected gate change`n"
  $tamperedSha = New-NativeSimGitFixture -Root $tamperedFixture -Workflow $templateWorkflow -Gate $tamperedGate
  Assert-Refused { Invoke-SaveAppNativeSimScaffoldPreview -CliPackageRoot $package -CheckoutRoot $tamperedFixture -ExpectedSha $tamperedSha -NodeExecutable $node } 'divergent gate.cjs content is rejected before CLI execution'

  $staleFixture = Join-Path $tempRoot 'cli-gate-stale'
  New-Item -ItemType Directory -Path $staleFixture -Force | Out-Null
  $templateGateVersion = [int]([regex]::Match($templateGate,'(?m)^//\s*native-sim-template-version:\s*(?<version>[0-9]+)').Groups['version'].Value)
  $staleGate = [regex]::new('(?m)^(//\s*native-sim-template-version:\s*)[0-9]+').Replace($templateGate,('${1}' + ($templateGateVersion - 1)),1)
  $staleSha = New-NativeSimGitFixture -Root $staleFixture -Workflow $templateWorkflow -Gate $staleGate
  Assert-Refused { Assert-SaveAppNativeSimCliCompatible -CliPackageRoot $package -WorkflowPath (Join-Path $staleFixture '.github\workflows\native-sim.yml') -GatePath (Join-Path $staleFixture '.github\native-sim\gate.cjs') } 'stale gate is blocked by the compatibility gate before session start'
  $cliChanged = Invoke-ScaffoldOnly -Node $node -InitFile (Join-Path $package 'src\commands\init.js') -Root $staleFixture
  Assert-True ($cliChanged.changed -eq $true -and (Get-FileHash -LiteralPath (Join-Path $staleFixture '.github\native-sim\gate.cjs') -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath (Join-Path $package 'templates\gate.cjs') -Algorithm SHA256).Hash) 'installed CLI simulation confirms a stale gate would be rewritten'

  $preflight = Get-Content -LiteralPath (Join-Path $repositoryRoot 'scripts\Invoke-SaveAppSwiftPreflight.ps1') -Raw
  $launcher = Get-Content -LiteralPath (Join-Path $repositoryRoot 'scripts\Start-SaveAppNativeSim.ps1') -Raw
  $mirrorScript = Get-Content -LiteralPath (Join-Path $repositoryRoot 'scripts\mirror-saveapp.ps1') -Raw
  $oslogCapturePath = '.github/native-sim/oslog-capture.sh'
  $oslogCaptureHelper = Get-Content -LiteralPath (Join-Path $repositoryRoot ($oslogCapturePath -replace '/', '\')) -Raw
  Assert-True ($productionAllowedFiles -contains $oslogCapturePath -and
    (Test-SaveAppMirrorAllowedRelativePath -RelativePath $oslogCapturePath `
      -AllowedFiles $productionAllowedFiles -AllowedDirectories $productionAllowedDirectories)) 'SaveApp OSLog capture helper is an exact allowlisted path'
  Assert-True (Assert-SaveAppSafeContent -RelativePath $oslogCapturePath -Content $oslogCaptureHelper) 'SaveApp OSLog capture helper passes the existing content scanner'
  Assert-Refused {
    Assert-SaveAppSafeContent -RelativePath $oslogCapturePath -Content ($oslogCaptureHelper + "`nAGE-SECRET-KEY-1" + ('A' * 58))
  } 'the existing credential scanner still blocks age private identities inside the allowlisted OSLog helper'

  $validAgeRecipient = 'age1' + ('a' * 40)
  $legacyGlobalFlagAndRecipient = @(
    [pscustomobject]@{ name='SAVEAPP_OSLOG_CAPTURE_ENABLED'; value='true' },
    [pscustomobject]@{ name='SAVEAPP_LOG_AGE_RECIPIENT'; value=$validAgeRecipient }
  )
  $disabledCaptureConfig = Assert-SaveAppOSLogCaptureConfiguration -CaptureRequested $false -Variables $legacyGlobalFlagAndRecipient
  Assert-True (-not $disabledCaptureConfig.CaptureEnabled -and $disabledCaptureConfig.RecipientConfigured) 'capture remains OFF when not requested even if the legacy global variable and a public recipient still exist'
  $validCaptureVariables = @([pscustomobject]@{ name='SAVEAPP_LOG_AGE_RECIPIENT'; value=$validAgeRecipient })
  $enabledCaptureConfig = Assert-SaveAppOSLogCaptureConfiguration -CaptureRequested $true -Variables $validCaptureVariables
  Assert-True ($enabledCaptureConfig.CaptureEnabled -and $enabledCaptureConfig.RecipientConfigured -and
    -not ($enabledCaptureConfig | ConvertTo-Json -Compress).Contains(('age1' + ('a' * 40))) -and
    -not ($enabledCaptureConfig.PSObject.Properties.Name -contains 'Recipient')) 'explicit per-session capture validates the public recipient without returning or printing its value'
  Assert-Refused { Assert-SaveAppOSLogCaptureConfiguration -CaptureRequested $true -Variables @() } 'explicit capture requires a public age recipient'
  Assert-Refused { Assert-SaveAppOSLogCaptureConfiguration -CaptureRequested $true -Variables @([pscustomobject]@{ name='SAVEAPP_LOG_AGE_RECIPIENT'; value='private-or-invalid' }) } 'capture rejects a malformed or private-key value without exposing it'
  Assert-Refused { Assert-SaveAppOSLogCaptureConfiguration -CaptureRequested $true -Variables @([pscustomobject]@{ name='SAVEAPP_LOG_AGE_RECIPIENT'; value=$validAgeRecipient },[pscustomobject]@{ name='SAVEAPP_LOG_AGE_RECIPIENT'; value=$validAgeRecipient }) } 'capture configuration rejects duplicate recipient variables'

  $choiceFixture = New-SaveAppCaptureReadinessFixture
  $choiceContract = New-SaveAppOSLogCaptureDecisionContract -ExpectedRunId $choiceFixture.Run.id `
    -ExpectedAttempt 1 -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true
  $choiceStatus = [pscustomobject]@{
    id=123456789
    context=$choiceContract.Context; state='success'; description=$choiceContract.Description
    creator=[pscustomobject]@{ login='saveapp-owner' }; target_url=$null
    created_at='2026-10-27T12:00:01Z'
  }
  $choiceResult = Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true `
    -Run $choiceFixture.Run -Statuses @($choiceStatus) -ExpectedStatusId '123456789'
  Assert-True ($choiceResult.State -eq 'ready' -and $choiceResult.CaptureEnabled) 'a real GitHub status object without a sha property accepts capture=true only through the exact SHA-bound run, context, actor, and status identity'

  $offChoice = New-SaveAppOSLogCaptureDecisionContract -ExpectedRunId $choiceFixture.Run.id `
    -ExpectedAttempt 1 -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $false
  $offStatus = $choiceStatus.PSObject.Copy()
  $offStatus.context = $offChoice.Context; $offStatus.description = $offChoice.Description
  $offResult = Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $false `
    -Run $choiceFixture.Run -Statuses @($offStatus) -ExpectedStatusId '123456789'
  Assert-True ($offResult.State -eq 'ready' -and -not $offResult.CaptureEnabled) 'a real GitHub status object without a sha property accepts explicit capture=false for this exact run'

  $oldChoice = $choiceStatus.PSObject.Copy(); $oldChoice.context = 'saveapp/oslog-choice/987654320/1/a1b2c3d4'
  $oldChoiceResult = Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true `
    -Run $choiceFixture.Run -Statuses @($oldChoice)
  Assert-True ($oldChoiceResult.State -eq 'waiting' -and $oldChoiceResult.Reason -eq 'choice_status_not_visible') 'a status from an older run on the same commit cannot select this run'

  $wrongAttemptChoice = $choiceStatus.PSObject.Copy(); $wrongAttemptChoice.context = 'saveapp/oslog-choice/987654321/2/a1b2c3d4'
  $wrongAttemptResult = Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true `
    -Run $choiceFixture.Run -Statuses @($wrongAttemptChoice)
  Assert-True ($wrongAttemptResult.State -eq 'waiting') 'a status for a different workflow attempt is ignored'

  $wrongSessionChoice = $choiceStatus.PSObject.Copy()
  $wrongSessionChoice.context = 'saveapp/oslog-choice/987654321/1/0a1b2c3d'
  $wrongSessionResult = Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true `
    -Run $choiceFixture.Run -Statuses @($wrongSessionChoice)
  Assert-True ($wrongSessionResult.State -eq 'waiting' -and $wrongSessionResult.Reason -eq 'choice_status_not_visible') 'a choice for another session on the same run, attempt, and SHA cannot enable capture'
  $missingChoiceResult = Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true `
    -Run $choiceFixture.Run -Statuses @()
  Assert-True ($missingChoiceResult.State -eq 'waiting' -and $missingChoiceResult.Reason -eq 'choice_status_not_visible') 'an absent status remains waiting for the bounded launcher timeout instead of releasing the session'

  Assert-True ((Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true `
    -Run $choiceFixture.Run -Statuses @($choiceStatus,$choiceStatus)).Reason -eq 'choice_status_ambiguous') 'duplicate per-run choices fail closed'
  $wrongActorChoice = $choiceStatus.PSObject.Copy(); $wrongActorChoice.creator = [pscustomobject]@{ login='other-user' }
  Assert-True ((Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true `
    -Run $choiceFixture.Run -Statuses @($wrongActorChoice)).Reason -eq 'choice_status_identity_mismatch') 'a status written by a different actor is rejected'
  $staleChoice = $choiceStatus.PSObject.Copy(); $staleChoice.created_at = '2026-10-26T12:00:00Z'
  Assert-True ((Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true `
    -Run $choiceFixture.Run -Statuses @($staleChoice)).Reason -eq 'choice_status_identity_mismatch') 'a choice timestamp older than its run is rejected'

  Assert-True ((Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true `
    -Run $choiceFixture.Run -Statuses @($choiceStatus) -ExpectedStatusId '987654321').Reason -eq 'choice_status_identity_mismatch') 'the read-back status must have the exact ID returned by the POST'
  Assert-True ((Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true `
    -Run $choiceFixture.Run -Statuses @($choiceStatus) -ExpectedStatusId '').Reason -eq 'choice_status_response_invalid') 'a missing POST status ID cannot skip read-back identity binding'
  $wrongStatusSha = $choiceStatus.PSObject.Copy(); $wrongStatusSha | Add-Member -NotePropertyName sha -NotePropertyValue ('b' * 40)
  Assert-True ((Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true `
    -Run $choiceFixture.Run -Statuses @($wrongStatusSha)).Reason -eq 'choice_status_identity_mismatch') 'an optional status SHA, if present, cannot contradict the requested commit'
  $wrongRunSha = $choiceFixture.Run.PSObject.Copy(); $wrongRunSha.head_sha = 'b' * 40
  Assert-True ((Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true `
    -Run $wrongRunSha -Statuses @($choiceStatus)).Reason -eq 'choice_run_identity_mismatch') 'the workflow run head SHA remains mandatory even though individual status objects omit sha'
  $wrongRunId = $choiceFixture.Run.PSObject.Copy(); $wrongRunId.id = '987654322'
  Assert-True ((Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true `
    -Run $wrongRunId -Statuses @($choiceStatus)).Reason -eq 'choice_run_identity_mismatch') 'a status cannot be accepted for a different workflow run ID'
  $wrongRunAttempt = $choiceFixture.Run.PSObject.Copy(); $wrongRunAttempt.run_attempt = 2
  Assert-True ((Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true `
    -Run $wrongRunAttempt -Statuses @($choiceStatus)).Reason -eq 'choice_run_identity_mismatch') 'a different workflow attempt is rejected'
  $wrongSessionRun = $choiceFixture.Run.PSObject.Copy(); $wrongSessionRun.display_title = 'native-sim 0a1b2c3d · release · 120m'
  Assert-True ((Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true `
    -Run $wrongSessionRun -Statuses @($choiceStatus)).Reason -eq 'choice_run_identity_mismatch') 'the run title must contain the exact expected session ID'
  $badDescription = $choiceStatus.PSObject.Copy(); $badDescription.description = "SaveApp OSLog choice capture=false sha=$($choiceFixture.Sha)"
  Assert-True ((Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true `
    -Run $choiceFixture.Run -Statuses @($badDescription)).Reason -eq 'choice_status_identity_mismatch') 'capture choice must match the requested value exactly'
  $captureOnWhileOffRequested = $offStatus.PSObject.Copy(); $captureOnWhileOffRequested.description = $choiceContract.Description
  Assert-True ((Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $false `
    -Run $choiceFixture.Run -Statuses @($captureOnWhileOffRequested)).Reason -eq 'choice_status_identity_mismatch') 'capture=true cannot replace an explicitly requested capture=false decision'
  $badState = $choiceStatus.PSObject.Copy(); $badState.state = 'pending'
  Assert-True ((Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true `
    -Run $choiceFixture.Run -Statuses @($badState)).Reason -eq 'choice_status_identity_mismatch') 'only a successful status can authorize the capture choice'
  $invalidTimestamp = $choiceStatus.PSObject.Copy(); $invalidTimestamp.created_at = 'not-an-iso-date'
  Assert-True ((Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true `
    -Run $choiceFixture.Run -Statuses @($invalidTimestamp)).Reason -eq 'choice_status_timestamp_invalid') 'an invalid GitHub status timestamp is rejected'
  $malformedStatus = $choiceStatus.PSObject.Copy(); $malformedStatus.PSObject.Properties.Remove('id')
  Assert-True ((Test-SaveAppOSLogCaptureDecision -ExpectedRunId $choiceFixture.Run.id -ExpectedAttempt 1 `
    -ExpectedSession 'a1b2c3d4' -ExpectedSha $choiceFixture.Sha -CaptureRequested $true `
    -Run $choiceFixture.Run -Statuses @($malformedStatus)).Reason -eq 'choice_status_response_invalid') 'an invalid status response fails closed'

  $captureFixture = New-SaveAppCaptureReadinessFixture
  $originalCulture = [Threading.Thread]::CurrentThread.CurrentCulture
  $originalUICulture = [Threading.Thread]::CurrentThread.CurrentUICulture
  try {
    foreach ($cultureName in @('pt-BR','en-US')) {
      $testCulture = [Globalization.CultureInfo]::GetCultureInfo($cultureName)
      [Threading.Thread]::CurrentThread.CurrentCulture = $testCulture
      [Threading.Thread]::CurrentThread.CurrentUICulture = $testCulture

      $jsonDate = ConvertFrom-Json -InputObject '{"created_at":"2026-10-28T02:04:45Z"}'
      Assert-True ($jsonDate.created_at -is [DateTime] -and $jsonDate.created_at.Kind -eq [DateTimeKind]::Utc) "GitHub JSON created_at remains a typed UTC DateTime under $cultureName"
      $parsedJsonDate = ConvertTo-SaveAppNativeSimDateTimeOffset -Value $jsonDate.created_at
      Assert-True ($parsedJsonDate -eq [DateTimeOffset]::Parse('2026-10-28T02:04:45Z',[Globalization.CultureInfo]::InvariantCulture)) "typed JSON date parses invariantly under $cultureName"

      $offsetDate = ConvertTo-SaveAppNativeSimDateTimeOffset -Value '2026-10-28T05:04:45+03:00'
      $zuluDate = ConvertTo-SaveAppNativeSimDateTimeOffset -Value '2026-10-28T02:04:45Z'
      $dateTimeOffset = ConvertTo-SaveAppNativeSimDateTimeOffset -Value ([DateTimeOffset]::Parse('2026-10-28T05:04:45+03:00',[Globalization.CultureInfo]::InvariantCulture))
      $offsetJsonDate = ConvertFrom-Json -InputObject '{"created_at":"2026-10-28T05:04:45+03:00"}'
      $parsedOffsetJsonDate = ConvertTo-SaveAppNativeSimDateTimeOffset -Value $offsetJsonDate.created_at
      Assert-True ($offsetDate -eq $zuluDate -and $dateTimeOffset -eq $zuluDate -and $parsedOffsetJsonDate -eq $zuluDate) "ISO Z, explicit offset, JSON DateTime, and DateTimeOffset identify the same instant under $cultureName"
      Assert-True ($null -eq (ConvertTo-SaveAppNativeSimDateTimeOffset -Value 'not-a-timestamp') -and
        $null -eq (ConvertTo-SaveAppNativeSimDateTimeOffset -Value $null)) "invalid and missing timestamps are rejected under $cultureName"

      $jsonFixture = ConvertFrom-Json -InputObject (ConvertTo-Json -InputObject $captureFixture -Depth 20 -Compress)
      Assert-True ($jsonFixture.Run.created_at -is [DateTime] -and
        $jsonFixture.Statuses[0].created_at -is [DateTime] -and
        $jsonFixture.Jobs[0].steps[1].completed_at -is [DateTime]) "run, status, and job step timestamps use real ConvertFrom-Json DateTime values under $cultureName"
      $typedReady = Test-SaveAppNativeSimCaptureReadiness -CaptureRequested $true `
        -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $jsonFixture.Sha `
        -ExpectedBareUrl $jsonFixture.BareUrl -Run $jsonFixture.Run `
        -Jobs $jsonFixture.Jobs -Statuses $jsonFixture.Statuses
      Assert-True ($typedReady.State -eq 'ready') "complete OSLog readiness accepts actual typed GitHub JSON dates under $cultureName"
      $testSimulatorUrl = 'https://saveapp-session.trycloudflare.com/?k=abcdefghijklmnopqrstuvwxyz0123456789&mode=stream'
      Assert-True ((Assert-SaveAppSimulatorUrl -Url $testSimulatorUrl) -ceq $testSimulatorUrl) "validated authenticated simulator URL remains unchanged after typed-date readiness under $cultureName"

      $jobStartJson = ConvertFrom-Json -InputObject '{"started_at":"2026-10-27T12:01:00Z"}'
      $jsonFixture.Jobs[0] | Add-Member -NotePropertyName started_at -NotePropertyValue $jobStartJson.started_at -Force
      $deadline = Get-SaveAppOSLogReadinessDeadline -Run $jsonFixture.Run -Jobs $jsonFixture.Jobs
      $expectedDeadline = ([DateTimeOffset]::new($jobStartJson.started_at)).AddMinutes(375)
      Assert-True ($deadline -eq $expectedDeadline) "bounded readiness deadline handles typed run/job dates under $cultureName"

      $invalidFixture = ConvertFrom-Json -InputObject (ConvertTo-Json -InputObject $captureFixture -Depth 20 -Compress)
      $invalidFixture.Run.created_at = 'invalid'
      $invalidReady = Test-SaveAppNativeSimCaptureReadiness -CaptureRequested $true `
        -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $invalidFixture.Sha `
        -ExpectedBareUrl $invalidFixture.BareUrl -Run $invalidFixture.Run `
        -Jobs $invalidFixture.Jobs -Statuses $invalidFixture.Statuses
      Assert-True ($invalidReady.State -eq 'failed') "invalid run timestamp fails closed under $cultureName"
      Assert-Refused { Get-SaveAppOSLogReadinessDeadline -Run ([pscustomobject]@{ created_at=$null }) } "missing run timestamp cannot produce a readiness deadline under $cultureName"

      $invalidStatusFixture = ConvertFrom-Json -InputObject (ConvertTo-Json -InputObject $captureFixture -Depth 20 -Compress)
      $invalidStatusFixture.Statuses[0].created_at = $null
      $invalidStatusReady = Test-SaveAppNativeSimCaptureReadiness -CaptureRequested $true `
        -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $invalidStatusFixture.Sha `
        -ExpectedBareUrl $invalidStatusFixture.BareUrl -Run $invalidStatusFixture.Run `
        -Jobs $invalidStatusFixture.Jobs -Statuses $invalidStatusFixture.Statuses
      Assert-True ($invalidStatusReady.State -eq 'failed') "missing transport status timestamp fails closed under $cultureName"

      $invalidProbeFixture = ConvertFrom-Json -InputObject (ConvertTo-Json -InputObject $captureFixture -Depth 20 -Compress)
      $invalidProbeFixture.Jobs[0].steps[1].completed_at = 'invalid'
      $invalidProbeReady = Test-SaveAppNativeSimCaptureReadiness -CaptureRequested $true `
        -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $invalidProbeFixture.Sha `
        -ExpectedBareUrl $invalidProbeFixture.BareUrl -Run $invalidProbeFixture.Run `
        -Jobs $invalidProbeFixture.Jobs -Statuses $invalidProbeFixture.Statuses
      Assert-True ($invalidProbeReady.State -ne 'ready') "invalid capture probe completion timestamp cannot release the session under $cultureName"
    }
  } finally {
    [Threading.Thread]::CurrentThread.CurrentCulture = $originalCulture
    [Threading.Thread]::CurrentThread.CurrentUICulture = $originalUICulture
  }

  $readyResult = Test-SaveAppNativeSimCaptureReadiness -CaptureRequested $true `
    -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $captureFixture.Sha `
    -ExpectedBareUrl $captureFixture.BareUrl -Run $captureFixture.Run `
    -Jobs $captureFixture.Jobs -Statuses $captureFixture.Statuses
  Assert-True ($readyResult.State -eq 'ready' -and $readyResult.Session -eq 'a1b2c3d4') 'capture becomes ready only with the exact active run, successful probe, status, and live stream'

  $earlyFixture = New-SaveAppCaptureReadinessFixture
  $earlyFixture.Statuses = @($earlyFixture.Statuses | Where-Object { $_.context -eq 'native-sim/a1b2c3d4' })
  $earlyResult = Test-SaveAppNativeSimCaptureReadiness -CaptureRequested $true `
    -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $earlyFixture.Sha `
    -ExpectedBareUrl $earlyFixture.BareUrl -Run $earlyFixture.Run `
    -Jobs $earlyFixture.Jobs -Statuses $earlyFixture.Statuses
  Assert-True ($earlyResult.State -eq 'waiting') 'the early CLI transport success cannot confirm OSLog capture readiness by itself'

  $unstartedFixture = New-SaveAppCaptureReadinessFixture
  $unstartedFixture.Jobs[0].steps[0].status = 'in_progress'
  $unstartedFixture.Jobs[0].steps[0].conclusion = $null
  $unstartedResult = Test-SaveAppNativeSimCaptureReadiness -CaptureRequested $true `
    -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $unstartedFixture.Sha `
    -ExpectedBareUrl $unstartedFixture.BareUrl -Run $unstartedFixture.Run `
    -Jobs $unstartedFixture.Jobs -Statuses $unstartedFixture.Statuses
  Assert-True ($unstartedResult.State -eq 'waiting') 'a running collector without a completed probe is not ready'

  $failedCaptureFixture = New-SaveAppCaptureReadinessFixture
  $failedCaptureFixture.Jobs[0].steps[1].conclusion = 'failure'
  $failedCaptureResult = Test-SaveAppNativeSimCaptureReadiness -CaptureRequested $true `
    -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $failedCaptureFixture.Sha `
    -ExpectedBareUrl $failedCaptureFixture.BareUrl -Run $failedCaptureFixture.Run `
    -Jobs $failedCaptureFixture.Jobs -Statuses $failedCaptureFixture.Statuses
  Assert-True ($failedCaptureResult.State -eq 'failed') 'a failed OSLog start/probe step blocks session readiness'

  $failedCaptureStatusFixture = New-SaveAppCaptureReadinessFixture
  $failedCaptureStatusFixture.Statuses[1].state = 'failure'
  $failedCaptureStatusResult = Test-SaveAppNativeSimCaptureReadiness -CaptureRequested $true `
    -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $failedCaptureStatusFixture.Sha `
    -ExpectedBareUrl $failedCaptureStatusFixture.BareUrl -Run $failedCaptureStatusFixture.Run `
    -Jobs $failedCaptureStatusFixture.Jobs -Statuses $failedCaptureStatusFixture.Statuses
  Assert-True ($failedCaptureStatusResult.State -eq 'failed') 'an explicit capture failure status blocks readiness'

  $wrongTransportFixture = New-SaveAppCaptureReadinessFixture
  $wrongTransportFixture.Statuses[0].description = 'SaveApp transport ready for another run'
  $wrongTransportResult = Test-SaveAppNativeSimCaptureReadiness -CaptureRequested $true `
    -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $wrongTransportFixture.Sha `
    -ExpectedBareUrl $wrongTransportFixture.BareUrl -Run $wrongTransportFixture.Run `
    -Jobs $wrongTransportFixture.Jobs -Statuses $wrongTransportFixture.Statuses
  Assert-True ($wrongTransportResult.State -eq 'waiting') 'capture readiness also requires the exact current-run transport handshake'

  $captureBeforeProbeFixture = New-SaveAppCaptureReadinessFixture
  $captureBeforeProbeFixture.Statuses[1].created_at = '2026-10-27T12:01:40Z'
  $captureBeforeProbeResult = Test-SaveAppNativeSimCaptureReadiness -CaptureRequested $true `
    -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $captureBeforeProbeFixture.Sha `
    -ExpectedBareUrl $captureBeforeProbeFixture.BareUrl -Run $captureBeforeProbeFixture.Run `
    -Jobs $captureBeforeProbeFixture.Jobs -Statuses $captureBeforeProbeFixture.Statuses
  Assert-True ($captureBeforeProbeResult.State -eq 'waiting') 'a readiness status timestamp preceding the completed OSLog probe cannot release links'

  $oldStatusFixture = New-SaveAppCaptureReadinessFixture
  $oldStatus = [pscustomobject]@{
    context = 'native-sim-capture/a1b2c3d4'; state='success';
    description = "SaveApp OSLog capture ready session=a1b2c3d4 run=$($oldStatusFixture.Run.id) attempt=1 sha=$($oldStatusFixture.Sha)";
    target_url = $oldStatusFixture.BareUrl; created_at = '2026-10-26T12:02:00Z'
  }
  $oldStatusFixture.Statuses = @($oldStatusFixture.Statuses[0],$oldStatus)
  $oldStatusResult = Test-SaveAppNativeSimCaptureReadiness -CaptureRequested $true `
    -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $oldStatusFixture.Sha `
    -ExpectedBareUrl $oldStatusFixture.BareUrl -Run $oldStatusFixture.Run `
    -Jobs $oldStatusFixture.Jobs -Statuses $oldStatusFixture.Statuses
  Assert-True ($oldStatusResult.State -ne 'ready') 'an old status for the same commit and session context is rejected'

  $staleTransportFixture = New-SaveAppCaptureReadinessFixture
  $staleTransportFixture.Statuses[0].created_at = '2026-10-26T12:01:00Z'
  $staleTransportResult = Test-SaveAppNativeSimCaptureReadiness -CaptureRequested $true `
    -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $staleTransportFixture.Sha `
    -ExpectedBareUrl $staleTransportFixture.BareUrl -Run $staleTransportFixture.Run `
    -Jobs $staleTransportFixture.Jobs -Statuses $staleTransportFixture.Statuses
  Assert-True ($staleTransportResult.State -ne 'ready') 'a previous transport status is rejected even when its SHA is unchanged'

  $wrongRunFixture = New-SaveAppCaptureReadinessFixture
  $wrongRunFixture.Run.id = '987654322'
  $wrongRunResult = Test-SaveAppNativeSimCaptureReadiness -CaptureRequested $true `
    -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $wrongRunFixture.Sha `
    -ExpectedBareUrl $wrongRunFixture.BareUrl -Run $wrongRunFixture.Run `
    -Jobs $wrongRunFixture.Jobs -Statuses $wrongRunFixture.Statuses
  Assert-True ($wrongRunResult.State -eq 'failed') 'readiness rejects the wrong Actions run ID'

  $wrongAttemptFixture = New-SaveAppCaptureReadinessFixture
  $wrongAttemptFixture.Run.run_attempt = 2
  $wrongAttemptResult = Test-SaveAppNativeSimCaptureReadiness -CaptureRequested $true `
    -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $wrongAttemptFixture.Sha `
    -ExpectedBareUrl $wrongAttemptFixture.BareUrl -Run $wrongAttemptFixture.Run `
    -Jobs $wrongAttemptFixture.Jobs -Statuses $wrongAttemptFixture.Statuses
  Assert-True ($wrongAttemptResult.State -eq 'failed') 'readiness rejects a run attempt different from the expected initial attempt'

  $wrongShaFixture = New-SaveAppCaptureReadinessFixture
  $wrongShaFixture.Run.head_sha = 'b' * 40
  $wrongShaResult = Test-SaveAppNativeSimCaptureReadiness -CaptureRequested $true `
    -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $wrongShaFixture.Sha `
    -ExpectedBareUrl $wrongShaFixture.BareUrl -Run $wrongShaFixture.Run `
    -Jobs $wrongShaFixture.Jobs -Statuses $wrongShaFixture.Statuses
  Assert-True ($wrongShaResult.State -eq 'failed') 'readiness rejects a workflow run built from another SHA'

  $normalReadiness = Test-SaveAppNativeSimCaptureReadiness -CaptureRequested $false `
    -ExpectedRunId 'not-used' -ExpectedAttempt 0 -ExpectedSha 'not-used' -ExpectedBareUrl 'not-used' -Run $null
  Assert-True ($normalReadiness.State -eq 'ready' -and $normalReadiness.Reason -eq 'capture_not_requested') 'ordinary NativeSim remains ready without OSLog-specific gates'

  $handoffKey = 'b' * 24
  $simulatorUrl = "https://capture-probe.trycloudflare.com/?k=$handoffKey"
  $actionsUrl = 'https://github.com/LuanRigatti/SaveApp-NativeSim-Public/actions/runs/987654321'
  $transportOnlyFixture = New-SaveAppCaptureReadinessFixture
  $transportOnlyFixture.Statuses = @($transportOnlyFixture.Statuses | Where-Object { $_.context -eq 'native-sim/a1b2c3d4' })
  $captureTransportHandoff = Assert-SaveAppNativeSimTransportHandoff `
    -ExpectedRepository 'LuanRigatti/SaveApp-NativeSim-Public' -ExpectedRunId '987654321' `
    -ExpectedAttempt 1 -ExpectedSha $transportOnlyFixture.Sha -CaptureRequested $true `
    -ActionsUrl $actionsUrl -SimulatorUrl $simulatorUrl -Run $transportOnlyFixture.Run `
    -Statuses $transportOnlyFixture.Statuses
  $handoffJson = ConvertTo-Json -InputObject $captureTransportHandoff -Compress
  Assert-True ($captureTransportHandoff.State -eq 'transport_ready' -and
    $captureTransportHandoff.Session -eq 'a1b2c3d4' -and
    $handoffJson -notmatch [regex]::Escape($simulatorUrl) -and
    $handoffJson -notmatch [regex]::Escape($handoffKey) -and
    -not ($captureTransportHandoff.PSObject.Properties.Name -contains 'SimulatorUrl')) 'exact authenticated link is validated and handed off as transport-ready while build and OSLog capture remain pending, without returning the key in metadata'

  $captureReadyHandoffFixture = New-SaveAppCaptureReadinessFixture
  $captureReadyHandoff = Assert-SaveAppNativeSimTransportHandoff `
    -ExpectedRepository 'LuanRigatti/SaveApp-NativeSim-Public' -ExpectedRunId '987654321' `
    -ExpectedAttempt 1 -ExpectedSha $captureReadyHandoffFixture.Sha -CaptureRequested $true `
    -ActionsUrl $actionsUrl -SimulatorUrl $simulatorUrl -Run $captureReadyHandoffFixture.Run `
    -Statuses $captureReadyHandoffFixture.Statuses
  Assert-True ($captureReadyHandoff.State -eq 'transport_ready' -and
    $captureReadyHandoff.Session -eq $captureTransportHandoff.Session) 'an already confirmed capture status does not change or delay the verified transport handoff'

  $cancelledAfterHandoffFixture = New-SaveAppCaptureReadinessFixture
  $cancelledAfterHandoffFixture.Statuses = @($cancelledAfterHandoffFixture.Statuses[0])
  $deliveredBeforeCancellation = Assert-SaveAppNativeSimTransportHandoff `
    -ExpectedRepository 'LuanRigatti/SaveApp-NativeSim-Public' -ExpectedRunId '987654321' `
    -ExpectedAttempt 1 -ExpectedSha $cancelledAfterHandoffFixture.Sha -CaptureRequested $true `
    -ActionsUrl $actionsUrl -SimulatorUrl $simulatorUrl -Run $cancelledAfterHandoffFixture.Run `
    -Statuses $cancelledAfterHandoffFixture.Statuses
  $cancelledAfterHandoffFixture.Run.status = 'completed'
  $cancelledAfterHandoffFixture.Run.conclusion = 'cancelled'
  $cancelledAfterHandoffFixture.Statuses += [pscustomobject]@{
    context='native-sim-capture/a1b2c3d4'; state='failure'
    description="SaveApp OSLog capture failed session=a1b2c3d4 run=987654321 attempt=1 sha=$($cancelledAfterHandoffFixture.Sha)"
    target_url=$cancelledAfterHandoffFixture.BareUrl; created_at='2026-10-27T12:03:00Z'
  }
  Assert-True ($deliveredBeforeCancellation.State -eq 'transport_ready' -and
    $deliveredBeforeCancellation.RunId -eq '987654321') 'a later build cancellation or capture failure does not retract the already handed-off transport result'

  $failedBuildFixture = New-SaveAppCaptureReadinessFixture
  $failedBuildFixture.Statuses = @($failedBuildFixture.Statuses[0])
  $deliveredBeforeBuildFailure = Assert-SaveAppNativeSimTransportHandoff `
    -ExpectedRepository 'LuanRigatti/SaveApp-NativeSim-Public' -ExpectedRunId '987654321' `
    -ExpectedAttempt 1 -ExpectedSha $failedBuildFixture.Sha -CaptureRequested $true `
    -ActionsUrl $actionsUrl -SimulatorUrl $simulatorUrl -Run $failedBuildFixture.Run `
    -Statuses $failedBuildFixture.Statuses
  $failedBuildFixture.Run.status = 'completed'
  $failedBuildFixture.Run.conclusion = 'failure'
  Assert-True ($deliveredBeforeBuildFailure.State -eq 'transport_ready') 'a subsequent build failure does not delay or rewrite a previously validated transport handoff'

  $failedCaptureAfterHandoffFixture = New-SaveAppCaptureReadinessFixture
  $failedCaptureAfterHandoffFixture.Statuses = @($failedCaptureAfterHandoffFixture.Statuses[0])
  $deliveredBeforeCaptureFailure = Assert-SaveAppNativeSimTransportHandoff `
    -ExpectedRepository 'LuanRigatti/SaveApp-NativeSim-Public' -ExpectedRunId '987654321' `
    -ExpectedAttempt 1 -ExpectedSha $failedCaptureAfterHandoffFixture.Sha -CaptureRequested $true `
    -ActionsUrl $actionsUrl -SimulatorUrl $simulatorUrl -Run $failedCaptureAfterHandoffFixture.Run `
    -Statuses $failedCaptureAfterHandoffFixture.Statuses
  $failedCaptureAfterHandoffFixture.Statuses += [pscustomobject]@{
    context='native-sim-capture/a1b2c3d4'; state='failure'
    description="SaveApp OSLog capture failed session=a1b2c3d4 run=987654321 attempt=1 sha=$($failedCaptureAfterHandoffFixture.Sha)"
    target_url=$failedCaptureAfterHandoffFixture.BareUrl; created_at='2026-10-27T12:03:00Z'
  }
  Assert-True ($deliveredBeforeCaptureFailure.State -eq 'transport_ready') 'a later OSLog capture failure does not cancel a valid Simulator transport handoff or claim capture success'

  Assert-Refused {
    Assert-SaveAppNativeSimTransportHandoff -ExpectedRepository 'LuanRigatti/SaveApp-NativeSim-Public' `
      -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $transportOnlyFixture.Sha `
      -CaptureRequested $true -ActionsUrl $actionsUrl -SimulatorUrl 'https://capture-probe.trycloudflare.com/' `
      -Run $transportOnlyFixture.Run -Statuses $transportOnlyFixture.Statuses
  } 'an incomplete authenticated Simulator URL cannot pass the handoff gate'
  Assert-Refused {
    Assert-SaveAppNativeSimTransportHandoff -ExpectedRepository 'LuanRigatti/Other-Public' `
      -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $transportOnlyFixture.Sha `
      -CaptureRequested $true -ActionsUrl $actionsUrl -SimulatorUrl $simulatorUrl `
      -Run $transportOnlyFixture.Run -Statuses $transportOnlyFixture.Statuses
  } 'a run from any repository other than the exact SaveApp public mirror cannot pass handoff'
  Assert-Refused {
    Assert-SaveAppNativeSimTransportHandoff -ExpectedRepository 'LuanRigatti/SaveApp-NativeSim-Public' `
      -ExpectedRunId '987654322' -ExpectedAttempt 1 -ExpectedSha $transportOnlyFixture.Sha `
      -CaptureRequested $true -ActionsUrl $actionsUrl -SimulatorUrl $simulatorUrl `
      -Run $transportOnlyFixture.Run -Statuses $transportOnlyFixture.Statuses
  } 'an Actions link and run ID mismatch cannot pass handoff'
  $mismatchError = ''
  try {
    Assert-SaveAppNativeSimTransportHandoff -ExpectedRepository 'LuanRigatti/SaveApp-NativeSim-Public' `
      -ExpectedRunId '987654322' -ExpectedAttempt 1 -ExpectedSha $transportOnlyFixture.Sha `
      -CaptureRequested $true -ActionsUrl $actionsUrl -SimulatorUrl $simulatorUrl `
      -Run $transportOnlyFixture.Run -Statuses $transportOnlyFixture.Statuses | Out-Null
  } catch { $mismatchError = $_.Exception.Message }
  Assert-True (-not $mismatchError.Contains($simulatorUrl) -and -not $mismatchError.Contains($handoffKey)) 'handoff refusal diagnostics do not include the authenticated URL or access key'

  $invalidShaExpected = $false
  try {
    Assert-SaveAppNativeSimTransportHandoff -ExpectedRepository 'LuanRigatti/SaveApp-NativeSim-Public' `
      -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha 'not-a-sha' `
      -CaptureRequested $true -ActionsUrl $actionsUrl -SimulatorUrl $simulatorUrl `
      -Run $transportOnlyFixture.Run -Statuses $transportOnlyFixture.Statuses | Out-Null
  } catch { $invalidShaExpected = $true }
  Assert-True $invalidShaExpected 'handoff rejects malformed expected SHA values before releasing a link'

  $badAttemptFixture = New-SaveAppCaptureReadinessFixture
  $badAttemptFixture.Run.run_attempt = 2
  Assert-Refused {
    Assert-SaveAppNativeSimTransportHandoff -ExpectedRepository 'LuanRigatti/SaveApp-NativeSim-Public' `
      -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $badAttemptFixture.Sha `
      -CaptureRequested $true -ActionsUrl $actionsUrl -SimulatorUrl $simulatorUrl `
      -Run $badAttemptFixture.Run -Statuses $badAttemptFixture.Statuses
  } 'a retry or different run attempt cannot pass handoff'

  $badShaFixture = New-SaveAppCaptureReadinessFixture
  $badShaFixture.Run.head_sha = 'b' * 40
  Assert-Refused {
    Assert-SaveAppNativeSimTransportHandoff -ExpectedRepository 'LuanRigatti/SaveApp-NativeSim-Public' `
      -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $badShaFixture.Sha `
      -CaptureRequested $true -ActionsUrl $actionsUrl -SimulatorUrl $simulatorUrl `
      -Run $badShaFixture.Run -Statuses $badShaFixture.Statuses
  } 'a transport status for a different public SHA cannot pass handoff'

  $staleHandoffFixture = New-SaveAppCaptureReadinessFixture
  $staleHandoffFixture.Statuses = @($staleHandoffFixture.Statuses[0])
  $staleHandoffFixture.Statuses[0].created_at = '2026-10-26T12:01:00Z'
  Assert-Refused {
    Assert-SaveAppNativeSimTransportHandoff -ExpectedRepository 'LuanRigatti/SaveApp-NativeSim-Public' `
      -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $staleHandoffFixture.Sha `
      -CaptureRequested $true -ActionsUrl $actionsUrl -SimulatorUrl $simulatorUrl `
      -Run $staleHandoffFixture.Run -Statuses $staleHandoffFixture.Statuses
  } 'a stale success status for the same commit cannot pass the transport handoff'
  $pendingHandoffFixture = New-SaveAppCaptureReadinessFixture
  $pendingHandoffFixture.Statuses = @($pendingHandoffFixture.Statuses[0])
  $pendingHandoffFixture.Statuses[0].state = 'pending'
  Assert-Refused {
    Assert-SaveAppNativeSimTransportHandoff -ExpectedRepository 'LuanRigatti/SaveApp-NativeSim-Public' `
      -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $pendingHandoffFixture.Sha `
      -CaptureRequested $true -ActionsUrl $actionsUrl -SimulatorUrl $simulatorUrl `
      -Run $pendingHandoffFixture.Run -Statuses $pendingHandoffFixture.Statuses
  } 'an unavailable or pending transport status cannot be mistaken for a ready link'
  $missingTransportFixture = New-SaveAppCaptureReadinessFixture
  $missingTransportFixture.Statuses = @()
  Assert-Refused {
    Assert-SaveAppNativeSimTransportHandoff -ExpectedRepository 'LuanRigatti/SaveApp-NativeSim-Public' `
      -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $missingTransportFixture.Sha `
      -CaptureRequested $true -ActionsUrl $actionsUrl -SimulatorUrl $simulatorUrl `
      -Run $missingTransportFixture.Run -Statuses $missingTransportFixture.Statuses
  } 'a not-yet-published transport status cannot release the authenticated link'

  $wrongOriginFixture = New-SaveAppCaptureReadinessFixture
  $wrongOriginFixture.Statuses = @($wrongOriginFixture.Statuses[0])
  $wrongOriginFixture.Statuses[0].target_url = 'https://another-tunnel.trycloudflare.com'
  Assert-Refused {
    Assert-SaveAppNativeSimTransportHandoff -ExpectedRepository 'LuanRigatti/SaveApp-NativeSim-Public' `
      -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $wrongOriginFixture.Sha `
      -CaptureRequested $true -ActionsUrl $actionsUrl -SimulatorUrl $simulatorUrl `
      -Run $wrongOriginFixture.Run -Statuses $wrongOriginFixture.Statuses
  } 'transport success for another tunnel origin cannot release this authenticated link'

  $normalSessionFixture = New-SaveAppCaptureReadinessFixture
  $normalSessionFixture.Statuses = @($normalSessionFixture.Statuses[0])
  $normalSessionFixture.Statuses[0].description = "SaveApp transport ready capture=false session=a1b2c3d4 run=$($normalSessionFixture.Run.id) attempt=1 sha=$($normalSessionFixture.Sha)"
  $normalHandoff = Assert-SaveAppNativeSimTransportHandoff `
    -ExpectedRepository 'LuanRigatti/SaveApp-NativeSim-Public' -ExpectedRunId '987654321' `
    -ExpectedAttempt 1 -ExpectedSha $normalSessionFixture.Sha -CaptureRequested $false `
    -ActionsUrl $actionsUrl -SimulatorUrl $simulatorUrl -Run $normalSessionFixture.Run `
    -Statuses $normalSessionFixture.Statuses
  Assert-True ($normalHandoff.State -eq 'transport_ready' -and -not $normalHandoff.CaptureRequested) 'normal no-capture sessions use the same early exact-run transport handoff without requiring OSLog statuses'
  $normalPendingFixture = New-SaveAppCaptureReadinessFixture
  $normalPendingFixture.Statuses = @($normalPendingFixture.Statuses[0])
  Assert-Refused {
    Assert-SaveAppNativeSimTransportHandoff -ExpectedRepository 'LuanRigatti/SaveApp-NativeSim-Public' `
      -ExpectedRunId '987654321' -ExpectedAttempt 1 -ExpectedSha $normalPendingFixture.Sha `
      -CaptureRequested $false -ActionsUrl $actionsUrl -SimulatorUrl $simulatorUrl `
      -Run $normalPendingFixture.Run -Statuses $normalPendingFixture.Statuses
  } 'normal sessions cannot hand off before the exact early transport status'

  $originalCulture = [Threading.Thread]::CurrentThread.CurrentCulture
  $originalUICulture = [Threading.Thread]::CurrentThread.CurrentUICulture
  try {
    foreach ($cultureName in @('pt-BR','en-US')) {
      $testCulture = [Globalization.CultureInfo]::GetCultureInfo($cultureName)
      [Threading.Thread]::CurrentThread.CurrentCulture = $testCulture
      [Threading.Thread]::CurrentThread.CurrentUICulture = $testCulture
      $cultureFixture = New-SaveAppCaptureReadinessFixture
      $cultureFixture.Statuses = @($cultureFixture.Statuses[0])
      $cultureHandoff = Assert-SaveAppNativeSimTransportHandoff `
        -ExpectedRepository 'LuanRigatti/SaveApp-NativeSim-Public' -ExpectedRunId '987654321' `
        -ExpectedAttempt 1 -ExpectedSha $cultureFixture.Sha -CaptureRequested $true `
        -ActionsUrl $actionsUrl -SimulatorUrl $simulatorUrl -Run $cultureFixture.Run `
        -Statuses $cultureFixture.Statuses
      Assert-True ($cultureHandoff.State -eq 'transport_ready') "exact transport timestamp validation is culture-independent under $cultureName"
    }
  } finally {
    [Threading.Thread]::CurrentThread.CurrentCulture = $originalCulture
    [Threading.Thread]::CurrentThread.CurrentUICulture = $originalUICulture
  }

  $missingConfigurationFailsClosed = $false
  try { Assert-SaveAppOSLogCaptureConfiguration -CaptureRequested $true -Variables @() | Out-Null }
  catch { $missingConfigurationFailsClosed = $true }
  Assert-True $missingConfigurationFailsClosed 'capture requested without a valid public age recipient fails before session readiness'

  Assert-True ($launcher.Contains('[switch]$CaptureOSLog') -and
    $launcher.Contains('Get-SaveAppOSLogCaptureConfiguration -CaptureRequested $CaptureOSLog.IsPresent') -and
    $launcher.Contains('no mirror, Preflight, or NativeSim session was started.')) 'official launcher validates the explicit capture request and age recipient before mirror publication or remote gates'
  $simulatorHandoffIndex = $launcher.IndexOf('Authenticated Simulator: $simulatorUrl',[StringComparison]::Ordinal)
  $launcherCleanupIndex = if ($simulatorHandoffIndex -ge 0) { $launcher.IndexOf('} finally {',$simulatorHandoffIndex,[StringComparison]::Ordinal) } else { -1 }
  $launcherCleanup = if ($launcherCleanupIndex -ge 0) { $launcher.Substring($launcherCleanupIndex) } else { '' }
  Assert-True ($simulatorHandoffIndex -ge 0 -and $launcherCleanupIndex -gt $simulatorHandoffIndex -and
    $launcherCleanup.Contains('$nativeProcess.Kill($true)') -and
    -not $launcherCleanup.Contains('Invoke-GhText') -and -not $launcherCleanup.Contains('Wait-Event') -and
    -not $launcherCleanup.Contains('Start-Sleep') -and -not $launcher.Contains('gh run cancel')) 'after handoff the launcher only stops its local CLI during cleanup and does not poll or cancel the remote run'
  $launcherMirrorIndex = $launcher.IndexOf('& pwsh.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $mirrorScript -Publish',[StringComparison]::Ordinal)
  $launcherMirrorFailureIndex = $launcher.IndexOf('Sanitized SaveApp mirror did not complete successfully; Preflight and NativeSim were not started.',[StringComparison]::Ordinal)
  $launcherPreflightIndex = $launcher.IndexOf('& $preflightScript -PassThru',[StringComparison]::Ordinal)
  $launcherNativeStartIndex = $launcher.IndexOf('$nativeProcess.Start()',[StringComparison]::Ordinal)
  Assert-True ($launcherMirrorIndex -ge 0 -and $launcherMirrorFailureIndex -gt $launcherMirrorIndex -and
    $launcherPreflightIndex -gt $launcherMirrorFailureIndex -and $launcherNativeStartIndex -gt $launcherPreflightIndex) 'a failed local snapshot/mirror gate stops before Swift Preflight dispatch or NativeSim launch'
  $preflightWorkflow = Get-Content -LiteralPath (Join-Path $repositoryRoot '.github\workflows\swift-preflight.yml') -Raw
  Assert-True ($launcher.Contains('Invoke-SaveAppSwiftPreflightGate') -and $launcher.Contains('-SkipPreflight:$SkipSwiftPreflight') -and
    $launcher.Contains('-ExpectedSha $mirrorSha') -and $preflight.Contains('$live.Split()[0] -ne $sha')) 'the default launcher path requires a successful Swift Preflight for the exact public mirror SHA, with only an explicit switch to skip it'
  $nativeVerificationIndex = $preflightWorkflow.IndexOf('node scripts/verify-saveapp-native.js',[StringComparison]::Ordinal)
  $prebuildIndex = $preflightWorkflow.IndexOf('npx expo prebuild --platform ios --no-install',[StringComparison]::Ordinal)
  Assert-True ($nativeVerificationIndex -ge 0 -and $prebuildIndex -gt $nativeVerificationIndex -and
    $preflightWorkflow.Contains('CODE_SIGNING_ALLOWED=NO')) 'Swift Preflight checks SDK 58 autolinking before generating and compiling the exact public snapshot'
  $generatedWidgetsIndex = $preflightWorkflow.IndexOf('Verify generated ExpoWidgets Live Activity target and App Group',[StringComparison]::Ordinal)
  $compileIndex = $preflightWorkflow.IndexOf('Compile the Simulator app without signing',[StringComparison]::Ordinal)
  $embeddedWidgetsIndex = $preflightWorkflow.IndexOf('Verify Simulator build embeds ExpoWidgets target',[StringComparison]::Ordinal)
  Assert-True ($generatedWidgetsIndex -gt $prebuildIndex -and $compileIndex -gt $generatedWidgetsIndex -and
    $embeddedWidgetsIndex -gt $compileIndex -and $preflightWorkflow.Contains('NSSupportsLiveActivities') -and
    $preflightWorkflow.Contains('com.apple.security.application-groups') -and
    $preflightWorkflow.Contains('WidgetLiveActivity()') -and
    $preflightWorkflow.Contains('ExpoWidgetsTarget.appex')) 'Swift Preflight verifies generated Live Activity configuration and Simulator extension packaging'
  Assert-True ($mirrorScript.Contains('origin/main is empty') -and $mirrorScript.Contains('empty root commit')) 'public mirror refuses empty main until the owner bootstraps a root commit'
  $workflow = Get-Content -LiteralPath (Join-Path $repositoryRoot '.github\workflows\native-sim.yml') -Raw
  $buildSettingsVerifier = Get-Content -LiteralPath (Join-Path $repositoryRoot 'scripts\verify-saveapp-simulator-build-settings.js') -Raw
  $simulatorSigningMatch = [regex]::Match($workflow,'(?ms)^\s*- name: Build ad hoc signed Simulator app\s+(?<step>.*?)(?=^\s*- name:|\z)')
  $simulatorSigningStep = if ($simulatorSigningMatch.Success) { $simulatorSigningMatch.Groups['step'].Value } else { '' }
  $widgetResignIndex = $simulatorSigningStep.IndexOf('codesign --force --sign - --entitlements "$WIDGET_ENTITLEMENTS" "$APPEX"',[StringComparison]::Ordinal)
  $appResignIndex = $simulatorSigningStep.IndexOf('codesign --force --sign - --entitlements "$APP_ENTITLEMENTS" "$APP"',[StringComparison]::Ordinal)
  $widgetVerifyIndex = $simulatorSigningStep.IndexOf('verify_app_group_signature "$APPEX" "ExpoWidgetsTarget"',[StringComparison]::Ordinal)
  $appVerifyIndex = $simulatorSigningStep.IndexOf('verify_app_group_signature "$APP" "SaveApp"',[StringComparison]::Ordinal)
  Assert-True ($workflow.Contains('native-sim-template-version: 20') -and
    $simulatorSigningStep.Contains('APP_XCODE_PROJECT="$PWD/ios/SaveApp.xcodeproj"') -and
    $simulatorSigningStep.Contains('-project "$APP_XCODE_PROJECT"') -and
    $simulatorSigningStep.Contains('-target SaveApp') -and
    $simulatorSigningStep.Contains('-target ExpoWidgetsTarget') -and
    $simulatorSigningStep.Contains('saveapp-simulator-app-build-settings.json') -and
    $simulatorSigningStep.Contains('saveapp-simulator-widget-build-settings.json') -and
    $simulatorSigningStep.Contains('node scripts/verify-saveapp-simulator-build-settings.js') -and
    $simulatorSigningStep.Contains('-showBuildSettings') -and $simulatorSigningStep.Contains('-json') -and
    $buildSettingsVerifier.Contains('settings.CODE_SIGN_ENTITLEMENTS') -and
    $buildSettingsVerifier.Contains("settings.CONFIGURATION !== 'Release'") -and
    $buildSettingsVerifier.Contains("targetName: 'SaveApp'") -and
    $buildSettingsVerifier.Contains("targetName: 'ExpoWidgetsTarget'") -and
    $buildSettingsVerifier.Contains('targetEntries.length !== 1') -and
    $simulatorSigningStep.Contains('SaveApp/SaveApp.entitlements') -and
    $simulatorSigningStep.Contains('ExpoWidgetsTarget/ExpoWidgetsTarget.entitlements') -and
    $widgetResignIndex -ge 0 -and $appResignIndex -gt $widgetResignIndex -and
    $widgetVerifyIndex -gt $appResignIndex -and $appVerifyIndex -gt $appResignIndex -and
    -not $simulatorSigningStep.Contains('codesign --deep') -and
    $simulatorSigningStep.Contains('CODE_SIGNING_ALLOWED=YES') -and
    $simulatorSigningStep.Contains('verify_app_group_signature "$APP" "SaveApp"') -and
    $simulatorSigningStep.Contains('verify_app_group_signature "$APPEX" "ExpoWidgetsTarget"')) 'NativeSim verifies effective target entitlements, re-signs the extension before the app, and retains both final App Group signature gates without deep signing'
  $transportStepMatch = [regex]::Match($workflow,'(?ms)^\s*- name: Open tunnel and publish protected status\s+(?<step>.*?)(?=^\s*- name:|\z)')
  $transportStep = if ($transportStepMatch.Success) { $transportStepMatch.Groups['step'].Value } else { '' }
  $captureReadyStepMatch = [regex]::Match($workflow,'(?ms)^\s*- name: Publish SaveApp capture ready status\s+(?<step>.*?)(?=^\s*- name:|\z)')
  $captureReadyStep = if ($captureReadyStepMatch.Success) { $captureReadyStepMatch.Groups['step'].Value } else { '' }
  $choiceStepMatch = [regex]::Match($workflow,'(?ms)^\s*- name: Resolve exact-run OSLog choice\s+(?<step>.*?)(?=^\s*- name:|\z)')
  $choiceStep = if ($choiceStepMatch.Success) { $choiceStepMatch.Groups['step'].Value } else { '' }
  Assert-True ($workflow.Contains('CAPTURE_STATUS_CONTEXT: native-sim-capture/${{ inputs.session }}') -and
    $workflow.Contains('cancel-in-progress: false') -and
    -not $workflow.Contains('SAVEAPP_OSLOG_CAPTURE_ENABLED') -and
    $choiceStep.Contains('saveapp_capture_resolve_session_choice') -and
    $transportStep.Contains('capture=$CAPTURE_ENABLED') -and
    $transportStep.Contains('-f state=success') -and
    $captureReadyStep.Contains('SaveApp OSLog capture ready session=$SESSION_ID run=$GITHUB_RUN_ID attempt=$GITHUB_RUN_ATTEMPT sha=$GITHUB_SHA') -and
    $workflow.IndexOf('Open tunnel and publish protected status',[StringComparison]::Ordinal) -gt $workflow.IndexOf('Resolve exact-run OSLog choice',[StringComparison]::Ordinal) -and
    $workflow.IndexOf('Publish SaveApp capture ready status',[StringComparison]::Ordinal) -gt $workflow.IndexOf('Verify SaveApp OSLog capture probe',[StringComparison]::Ordinal)) 'per-run choice is resolved before the build, early transport is independent from capture, and only instrumented sessions publish capture readiness'
  $maskStepStart = $workflow.IndexOf('- name: Mask stream access key',[StringComparison]::Ordinal)
  $maskStepEnd = $workflow.IndexOf('- name:', $maskStepStart + 1,[StringComparison]::Ordinal)
  $maskStep = if ($maskStepStart -ge 0 -and $maskStepEnd -gt $maskStepStart) { $workflow.Substring($maskStepStart,$maskStepEnd - $maskStepStart) } else { '' }
  $maskIndex = $maskStep.IndexOf('::add-mask::',[StringComparison]::Ordinal)
  $persistIndex = $maskStep.IndexOf('>> "$GITHUB_ENV"',[StringComparison]::Ordinal)
  Assert-True ($maskStep.Contains('GITHUB_EVENT_PATH') -and -not $maskStep.Contains('env:') -and $maskIndex -ge 0 -and $persistIndex -gt $maskIndex -and
    $workflow -notmatch '(?m)^\s*(?:NATIVE_SIM_GATE_TOKEN|GATE_TOKEN):\s*\$\{\{\s*inputs\.gate_token\s*\}\}') 'NativeSim reads the token from the event file, masks it before persistence, and does not expose it in the runner step environment'
  $archiveSkill = Get-Content -LiteralPath (Join-Path $repositoryRoot '.agents\skills\saveapp-simulator-archive\SKILL.md') -Raw
  $archiveScript = Get-Content -LiteralPath (Join-Path $repositoryRoot 'scripts\Download-SaveAppSimulatorArchive.ps1') -Raw
  $nativeSimUpText = Get-Content -LiteralPath (Join-Path $package 'src\commands\up.js') -Raw
  $captureChoiceCompatibility = Assert-SaveAppNativeSimCaptureChoiceCompatibility `
    -NativeSimUpText $nativeSimUpText -WorkflowText $workflow -CaptureHelperText $oslogCaptureHelper
  Assert-True $captureChoiceCompatibility 'the installed NativeSim CLI fixed-input dispatch is compatible with the per-run GitHub status handshake and requires no CLI modification'
  Assert-True ($launcher.Contains('SaveAppNativeSimLaunch') -and $launcher.Contains('Get-ActiveNativeSimRuns') -and $launcher.Contains('No duplicate was started')) 'duplicate-session mutex and active-run guard remain present'
  $mirrorPublishIndex = $launcher.IndexOf('& pwsh.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $mirrorScript -Publish',[StringComparison]::Ordinal)
  $preflightGateIndex = $launcher.IndexOf('Invoke-SaveAppSwiftPreflightGate',[StringComparison]::Ordinal)
  $postValidationShaIndex = $launcher.IndexOf('$postSourceSha = Assert-Repository',[StringComparison]::Ordinal)
  $nativeWorkflowCheckIndex = $launcher.IndexOf('$workflowJson = Invoke-GhText',[StringComparison]::Ordinal)
  $nativeDispatchIndex = $launcher.IndexOf('$nativeProcess.Start()',[StringComparison]::Ordinal)
  Assert-True ($preflight.Contains('$dispatchOutput = @(& gh workflow run') -and $preflight.Contains('2>&1)') -and
    $launcher.Contains('[switch]$SkipSwiftPreflight') -and $launcher.Contains('-SkipPreflight:$SkipSwiftPreflight') -and
    $mirrorPublishIndex -ge 0 -and $preflightGateIndex -gt $mirrorPublishIndex -and
    $postValidationShaIndex -gt $preflightGateIndex -and $nativeWorkflowCheckIndex -gt $postValidationShaIndex -and
    $nativeDispatchIndex -gt $nativeWorkflowCheckIndex -and
    $launcher.Contains('Swift Preflight: explicitly skipped by -SkipSwiftPreflight')) 'explicit Preflight selection occurs after mirror publication and both modes retain SHA/provenance, workflow, concurrency, and CLI gates before dispatch'
  $activeFixtures = @(
    [pscustomobject]@{ id='42'; path='.github/workflows/native-sim.yml'; event='workflow_dispatch'; head_branch='main'; status='in_progress' },
    [pscustomobject]@{ id='42'; path='.github/workflows/native-sim.yml'; event='workflow_dispatch'; head_branch='main'; status='in_progress' },
    [pscustomobject]@{ id='43'; path='.github/workflows/other.yml'; event='workflow_dispatch'; head_branch='main'; status='in_progress' },
    [pscustomobject]@{ id='44'; path='.github/workflows/native-sim.yml'; event='push'; head_branch='main'; status='in_progress' }
  )
  $activeSelected = @(Select-SaveAppNativeSimActiveRuns -Runs $activeFixtures)
  Assert-True ($activeSelected.Count -eq 1 -and [string]$activeSelected[0].id -eq '42') 'duplicate NativeSim runs are deduplicated and unrelated runs are ignored'

  $global:SaveAppTestPreflightMode = 'reused-success'
  $global:SaveAppTestPreflightSha = 'b' * 40
  $global:SaveAppTestPublicRoot = [IO.Path]::GetFullPath('C:\Projetos\SaveApp-NativeSim-Public')
  function global:Test-Path {
    param([string]$Path,[string]$LiteralPath,[ValidateSet('Any','Container','Leaf')][string]$PathType = 'Any')
    $candidate = if ($LiteralPath) { $LiteralPath } else { $Path }
    $workflowCandidate = Join-Path $global:SaveAppTestPublicRoot '.github\workflows\swift-preflight.yml'
    if ([IO.Path]::GetFullPath($candidate) -eq $global:SaveAppTestPublicRoot -or
        [IO.Path]::GetFullPath($candidate) -eq [IO.Path]::GetFullPath($workflowCandidate)) { return $true }
    return Microsoft.PowerShell.Management\Test-Path -LiteralPath $candidate -PathType $PathType
  }
  function global:git {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$GitArgs)
    $global:LASTEXITCODE = 0
    $arguments = @($GitArgs | Select-Object -Skip 2)
    $command = $arguments -join ' '
    if ($command -in @('remote get-url --all origin','remote get-url --push --all origin')) { return 'https://github.com/LuanRigatti/SaveApp-NativeSim-Public.git' }
    if ($command -eq 'rev-parse --show-toplevel') { return $global:SaveAppTestPublicRoot }
    if ($command -eq 'branch --show-current') { return 'main' }
    if ($command -like 'status --porcelain*') { return '' }
    if ($command -eq 'rev-parse HEAD') { return $global:SaveAppTestPreflightSha }
    if ($command -eq 'ls-remote origin refs/heads/main') { return "$($global:SaveAppTestPreflightSha) refs/heads/main" }
    $global:LASTEXITCODE = 1
    throw "Unexpected Git call in isolated Swift Preflight test mock: $command"
  }
  $global:SaveAppTestPreflightDispatchCount = 0
  $global:SaveAppTestPreflightApiCount = 0
  $global:SaveAppTestPreflightNativeSimStartCount = 0
  function global:gh {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$GhArgs)
    $global:LASTEXITCODE = 0
    if ($GhArgs[0] -eq 'repo') { return 'PUBLIC' }
    if ($GhArgs[0] -eq 'run' -and $GhArgs[1] -eq 'list') {
      $mode = $global:SaveAppTestPreflightMode
      if ($mode -in @('dispatch-normal','dispatch-extra','dispatch-failed','dispatch-cancelled') -and $global:SaveAppTestPreflightDispatchCount -eq 0) { return '[]' }
      $status = if ($mode -eq 'active-success') { 'in_progress' } else { 'completed' }
      $conclusion = if ($mode -eq 'dispatch-failed') { 'failure' } elseif ($mode -eq 'dispatch-cancelled') { 'cancelled' } elseif ($status -eq 'completed') { 'success' } else { '' }
      return ([pscustomobject]@{ databaseId=123456789; headSha=$global:SaveAppTestPreflightSha; headBranch='main'; status=$status; conclusion=$conclusion; url='https://github.com/LuanRigatti/SaveApp-NativeSim-Public/actions/runs/123456789'; event='workflow_dispatch' } | ConvertTo-Json -Compress)
    }
    if ($GhArgs[0] -eq 'api') {
      $global:SaveAppTestPreflightApiCount++
      $mode = $global:SaveAppTestPreflightMode
      $status = if ($mode -eq 'active-success' -and $global:SaveAppTestPreflightApiCount -eq 1) { 'in_progress' } else { 'completed' }
      $conclusion = if ($mode -eq 'dispatch-failed') { 'failure' } elseif ($mode -eq 'dispatch-cancelled') { 'cancelled' } elseif ($status -eq 'completed') { 'success' } else { '' }
      $runSha = if ($mode -eq 'sha-mismatch') { 'f' * 40 } else { $global:SaveAppTestPreflightSha }
      return ([pscustomobject]@{ id=123456789; path='.github/workflows/swift-preflight.yml'; event='workflow_dispatch'; head_branch='main'; head_sha=$runSha; status=$status; conclusion=$conclusion; html_url='https://github.com/LuanRigatti/SaveApp-NativeSim-Public/actions/runs/123456789' } | ConvertTo-Json -Compress)
    }
    if ($GhArgs[0] -eq 'workflow' -and $GhArgs[1] -eq 'run') {
      $global:SaveAppTestPreflightDispatchCount++
      if ($global:SaveAppTestPreflightMode -eq 'dispatch-extra') { return @('Created workflow_dispatch event for Swift Preflight.','unexpected extra CLI diagnostic') }
      return 'Created workflow_dispatch event for Swift Preflight.'
    }
    $global:LASTEXITCODE = 1
    throw "Unexpected GitHub CLI call in test mock: $($GhArgs -join ' ')"
  }
  function global:Start-Sleep { param([int]$Seconds) }
  $preflightScript = Join-Path $repositoryRoot 'scripts\Invoke-SaveAppSwiftPreflight.ps1'
  $expectedPreflightParameters = @{
    ExpectedRepository = 'LuanRigatti/SaveApp-NativeSim-Public'
    ExpectedWorkflowPath = '.github/workflows/swift-preflight.yml'
    ExpectedBranch = 'main'
    ExpectedSha = $global:SaveAppTestPreflightSha
  }
  $global:SaveAppTestPreflightGateInvocationCount = 0
  $global:SaveAppTestPreflightGateResult = [pscustomobject]@{
    Passed = $true
    Reused = $true
    Repository = $expectedPreflightParameters.ExpectedRepository
    WorkflowPath = $expectedPreflightParameters.ExpectedWorkflowPath
    Event = 'workflow_dispatch'
    RunId = '987654321'
    Branch = 'main'
    Sha = $expectedPreflightParameters.ExpectedSha
    Url = 'https://github.com/LuanRigatti/SaveApp-NativeSim-Public/actions/runs/987654321'
    Status = 'completed'
    Conclusion = 'success'
  }
  $preflightGateCallback = {
    $global:SaveAppTestPreflightGateInvocationCount++
    return $global:SaveAppTestPreflightGateResult
  }
  $skippedGate = Invoke-SaveAppSwiftPreflightGate -SkipPreflight -InvokePreflight $preflightGateCallback @expectedPreflightParameters
  Assert-True ($skippedGate.Skipped -and $skippedGate.Status -eq 'not_run' -and
    $skippedGate.Sha -eq $expectedPreflightParameters.ExpectedSha -and
    $global:SaveAppTestPreflightGateInvocationCount -eq 0) 'explicit no-Preflight mode records its omission and does not invoke, query, dispatch, or wait through the Preflight callback'

  $ordinaryGate = Invoke-SaveAppSwiftPreflightGate -InvokePreflight $preflightGateCallback @expectedPreflightParameters
  Assert-True (-not $ordinaryGate.Skipped -and $ordinaryGate.Passed -and $ordinaryGate.Reused -and
    $ordinaryGate.Sha -eq $expectedPreflightParameters.ExpectedSha -and
    $global:SaveAppTestPreflightGateInvocationCount -eq 1) 'default mode invokes and strictly validates one exact-SHA successful Preflight result'

  $global:SaveAppTestPreflightGateResult = [pscustomobject]@{
    Passed = $false
    Reused = $false
    Repository = $expectedPreflightParameters.ExpectedRepository
    WorkflowPath = $expectedPreflightParameters.ExpectedWorkflowPath
    Event = 'workflow_dispatch'
    RunId = '987654322'
    Branch = 'main'
    Sha = $expectedPreflightParameters.ExpectedSha
    Url = 'https://github.com/LuanRigatti/SaveApp-NativeSim-Public/actions/runs/987654322'
    Status = 'completed'
    Conclusion = 'failure'
  }
  Assert-Refused { Invoke-SaveAppSwiftPreflightGate -InvokePreflight $preflightGateCallback @expectedPreflightParameters } 'default mode blocks NativeSim when Preflight fails'
  Assert-True ($global:SaveAppTestPreflightGateInvocationCount -eq 2) 'failed default Preflight is invoked exactly once and cannot be treated as skipped'
  Assert-Refused { Invoke-SaveAppSwiftPreflightGate @expectedPreflightParameters } 'Swift Preflight cannot be omitted implicitly when no explicit skip switch is supplied'

  $global:SaveAppTestPreflightGateResult = [pscustomobject]@{
    Passed = $true
    Reused = $true
    Repository = $expectedPreflightParameters.ExpectedRepository
    WorkflowPath = $expectedPreflightParameters.ExpectedWorkflowPath
    Event = 'workflow_dispatch'
    RunId = '987654321'
    Branch = 'main'
    Sha = ('c' * 40)
    Url = 'https://github.com/LuanRigatti/SaveApp-NativeSim-Public/actions/runs/987654321'
    Status = 'completed'
    Conclusion = 'success'
  }
  Assert-Refused { Invoke-SaveAppSwiftPreflightGate -InvokePreflight $preflightGateCallback @expectedPreflightParameters } 'default mode rejects a successful Preflight result for a different public SHA'

  $global:SaveAppTestPreflightMode = 'reused-success'
  $reusedPreflight = @(& $preflightScript -PassThru)
  $validatedReusedPreflight = Assert-SaveAppSwiftPreflightResult -Results $reusedPreflight @expectedPreflightParameters
  Assert-True ($reusedPreflight.Count -eq 1 -and $reusedPreflight[0] -is [pscustomobject] -and $validatedReusedPreflight.Passed -and
    $validatedReusedPreflight.Reused -and $validatedReusedPreflight.Repository -eq $expectedPreflightParameters.ExpectedRepository -and
    $validatedReusedPreflight.WorkflowPath -eq $expectedPreflightParameters.ExpectedWorkflowPath -and
    $validatedReusedPreflight.Event -eq 'workflow_dispatch' -and $validatedReusedPreflight.Sha -eq $global:SaveAppTestPreflightSha -and
    $global:SaveAppTestPreflightDispatchCount -eq 0) 'successful exact-SHA Preflight reuse returns one fully verified object without dispatch'

  $global:SaveAppTestPreflightMode = 'active-success'
  $global:SaveAppTestPreflightApiCount = 0
  $global:SaveAppTestPreflightDispatchCount = 0
  $completedActivePreflight = @(& $preflightScript -PassThru)
  $validatedActivePreflight = Assert-SaveAppSwiftPreflightResult -Results $completedActivePreflight @expectedPreflightParameters
  Assert-True ($completedActivePreflight.Count -eq 1 -and $validatedActivePreflight.Passed -and $validatedActivePreflight.Reused -and
    $validatedActivePreflight.Status -eq 'completed' -and $validatedActivePreflight.Conclusion -eq 'success' -and
    $global:SaveAppTestPreflightDispatchCount -eq 0) 'active exact-SHA Preflight is reused, awaited, and returns one completed success object'

  $global:SaveAppTestPreflightMode = 'active-success'
  $global:SaveAppTestPreflightApiCount = 0
  $activePreflight = @(& $preflightScript -NoWait -PassThru)
  Assert-True ($activePreflight.Count -eq 1 -and $activePreflight[0] -is [pscustomobject] -and -not $activePreflight[0].Passed -and
    $activePreflight[0].Reused -and $activePreflight[0].Status -eq 'in_progress' -and $global:SaveAppTestPreflightDispatchCount -eq 0) 'active exact-SHA Preflight NoWait contract returns one structured in-progress result'
  Assert-Refused { Assert-SaveAppSwiftPreflightResult -Results $activePreflight @expectedPreflightParameters } 'NativeSim result gate refuses a Preflight that is still in progress'

  foreach ($dispatchMode in @('dispatch-normal','dispatch-extra')) {
    $global:SaveAppTestPreflightMode = $dispatchMode
    $global:SaveAppTestPreflightApiCount = 0
    $global:SaveAppTestPreflightDispatchCount = 0
    $dispatchResult = @(& $preflightScript -PassThru)
    $validatedDispatchResult = Assert-SaveAppSwiftPreflightResult -Results $dispatchResult @expectedPreflightParameters
    Assert-True ($dispatchResult.Count -eq 1 -and $dispatchResult[0] -is [pscustomobject] -and $validatedDispatchResult.Passed -and
      -not $validatedDispatchResult.Reused -and $validatedDispatchResult.Sha -eq $global:SaveAppTestPreflightSha -and
      $global:SaveAppTestPreflightDispatchCount -eq 1) "new Preflight dispatch '$dispatchMode' emits exactly one verified object despite CLI text"
  }

  $global:SaveAppTestPreflightMode = 'sha-mismatch'
  $global:SaveAppTestPreflightApiCount = 0
  $global:SaveAppTestPreflightDispatchCount = 0
  Assert-Refused { & $preflightScript -PassThru | Out-Null } 'Preflight API result with a divergent SHA is rejected before NativeSim'
  Assert-True ($global:SaveAppTestPreflightDispatchCount -eq 0) 'SHA mismatch cannot dispatch or reach the NativeSim launch point'

  foreach ($failureMode in @('dispatch-failed','dispatch-cancelled')) {
    $global:SaveAppTestPreflightMode = $failureMode
    $global:SaveAppTestPreflightApiCount = 0
    $global:SaveAppTestPreflightDispatchCount = 0
    $preflightFailed = $false
    try {
      $failedResult = @(& $preflightScript -PassThru)
      $null = Assert-SaveAppSwiftPreflightResult -Results $failedResult @expectedPreflightParameters
      $global:SaveAppTestPreflightNativeSimStartCount++
    } catch { $preflightFailed = $true }
    Assert-True ($preflightFailed -and $global:SaveAppTestPreflightNativeSimStartCount -eq 0 -and
      $global:SaveAppTestPreflightDispatchCount -eq 1) "Preflight '$failureMode' blocks NativeSim launch after one mocked dispatch"
  }

  $unexpectedOutput = @('dispatch confirmation',[pscustomobject]@{ Passed=$true })
  Assert-Refused { Assert-SaveAppSwiftPreflightResult -Results $unexpectedOutput @expectedPreflightParameters } 'strict Preflight gate rejects extra success-pipeline text instead of ignoring it'
  $invalidPreflightMetadata = @(
    [pscustomobject]@{ Property='Repository'; Value='LuanRigatti/other-repo' },
    [pscustomobject]@{ Property='WorkflowPath'; Value='.github/workflows/other.yml' },
    [pscustomobject]@{ Property='Event'; Value='push' },
    [pscustomobject]@{ Property='Branch'; Value='release' },
    [pscustomobject]@{ Property='Sha'; Value=('a' * 40) },
    [pscustomobject]@{ Property='Status'; Value='in_progress' },
    [pscustomobject]@{ Property='Conclusion'; Value='failure' }
  )
  foreach ($invalidMetadata in $invalidPreflightMetadata) {
    $invalidResult = $validatedReusedPreflight | Select-Object *
    $invalidResult.($invalidMetadata.Property) = $invalidMetadata.Value
    Assert-Refused { Assert-SaveAppSwiftPreflightResult -Results @($invalidResult) @expectedPreflightParameters } "strict Preflight gate rejects mismatched $($invalidMetadata.Property) metadata"
  }
  Remove-Item Function:\global:gh -Force
  Remove-Item Function:\global:git -Force
  Remove-Item Function:\global:Test-Path -Force
  Remove-Item Function:\global:Start-Sleep -Force

  Assert-True ($launcher.Contains('Authenticated Simulator:') -and $launcher.Contains('$json.Contains($SimulatorUrl)')) 'authenticated link is delivered only after metadata rejects URL persistence'
  $fullSimulatorUrl = 'https://saveapp.trycloudflare.com/?k=abcdefghijklmnopqrstuvwxyz0123456789&mode=stream'
  Assert-True ((Assert-SaveAppSimulatorUrl -Url $fullSimulatorUrl) -ceq $fullSimulatorUrl) 'complete authenticated URL with full k value is preserved exactly'
  Assert-Refused { Assert-SaveAppSimulatorUrl -Url 'https://saveapp.trycloudflare.com/?k=short' } 'truncated authenticated k value is rejected'
  Assert-Refused { Assert-SaveAppSimulatorUrl -Url 'https://saveapp.trycloudflare.com/?mode=stream' } 'URL without authenticated k value is rejected'

  Assert-True (Assert-SaveAppNativeSimExportBehavior -NativeSimUpText $nativeSimUpText -WorkflowText $workflow) 'installed CLI and workflow preserve export_app, early URL output, and seven-day retention'
  $badExportWorkflow = $workflow.Replace("retention-days: 7",'retention-days: 1')
  Assert-Refused { Assert-SaveAppNativeSimExportBehavior -NativeSimUpText $nativeSimUpText -WorkflowText $badExportWorkflow } 'archive retention drift is blocked by the export contract'
  Assert-True ($launcher.Contains("'--export'") -and $archiveSkill.Contains('seven days') -and $archiveScript.Contains('workflow_dispatch')) 'archive skills only retrieve an existing qualifying run'

  $eligibleActiveRun = [pscustomobject]@{ id='77'; path='.github/workflows/native-sim.yml'; event='workflow_dispatch'; head_branch='main'; status='in_progress'; head_sha=('b' * 40) }
  Assert-True ((Assert-SaveAppArchiveRun -Run $eligibleActiveRun -ExpectedId '77').status -eq 'in_progress') 'archive retrieval accepts an active run after its artifact upload'
  $invalidArchiveRun = [pscustomobject]@{ id='77'; path='.github/workflows/native-sim.yml'; event='workflow_dispatch'; head_branch='main'; status='completed'; head_sha='short' }
  Assert-Refused { Assert-SaveAppArchiveRun -Run $invalidArchiveRun -ExpectedId '77' } 'archive retrieval rejects a run without a full SHA'
  $expectedArtifact = [pscustomobject]@{ name='native-sim-app-1234abcd'; expired=$false; size_in_bytes=256 }
  Assert-True ((Select-SaveAppArchiveArtifact -Artifacts @($expectedArtifact) -ExpectedName 'native-sim-app-1234abcd').name -eq $expectedArtifact.name) 'archive selector accepts the exact available session artifact'
  $expiredArtifact = [pscustomobject]@{ name='native-sim-app-1234abcd'; expired=$true; size_in_bytes=256 }
  Assert-True ($null -eq (Select-SaveAppArchiveArtifact -Artifacts @($expiredArtifact) -ExpectedName 'native-sim-app-1234abcd')) 'expired archive artifacts are not selected'
  $successfulArchiveSteps = @(
    [pscustomobject]@{ name='Build ad hoc signed Simulator app'; status='completed'; conclusion='success' },
    [pscustomobject]@{ name='Export the .app archive'; status='completed'; conclusion='success' },
    [pscustomobject]@{ name='Upload Simulator archive'; status='completed'; conclusion='success' }
  )
  Assert-True (Test-SaveAppArchiveBuildSteps -Steps $successfulArchiveSteps) 'archive retrieval requires successful build, export and upload steps'
  $legacyUnsignedArchiveSteps = @(
    [pscustomobject]@{ name='Build unsigned Simulator app'; status='completed'; conclusion='success' },
    [pscustomobject]@{ name='Export the .app archive'; status='completed'; conclusion='success' },
    [pscustomobject]@{ name='Upload Simulator archive'; status='completed'; conclusion='success' }
  )
  Assert-True (Test-SaveAppArchiveBuildSteps -Steps $legacyUnsignedArchiveSteps) 'archive retrieval remains compatible with qualifying artifacts from the previous unsigned workflow'
  $failedArchiveSteps = @($successfulArchiveSteps[0],$successfulArchiveSteps[1],([pscustomobject]@{ name='Upload Simulator archive'; status='completed'; conclusion='failure' }))
  Assert-True (-not (Test-SaveAppArchiveBuildSteps -Steps $failedArchiveSteps)) 'archive retrieval blocks an unsuccessful upload step'

  $archiveFixtureRoot = Join-Path $tempRoot 'archive-fixture'
  $appBundle = Join-Path $archiveFixtureRoot 'SaveApp.app'
  New-Item -ItemType Directory -Path $appBundle -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $appBundle 'Payload'),'simulator-bundle',[Text.UTF8Encoding]::new($false))
  $validArchive = Join-Path $tempRoot 'SaveApp.app.tar.gz'
  & tar -czf $validArchive -C $archiveFixtureRoot 'SaveApp.app'
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the local .app.tar.gz test fixture.' }
  $archiveResult = Assert-SaveAppSimulatorArchive -Path $validArchive
  Assert-True ($archiveResult.EntryCount -gt 0) 'downloaded .app.tar.gz is readable and contains an app bundle'
  $invalidArchive = Join-Path $tempRoot 'broken.app.tar.gz'
  [IO.File]::WriteAllText($invalidArchive,'not-a-tar',[Text.UTF8Encoding]::new($false))
  Assert-Refused { Assert-SaveAppSimulatorArchive -Path $invalidArchive } 'corrupt .app.tar.gz is rejected'

  Write-Output 'SaveApp security simulations completed: Preflight was mocked; no GitHub workflow, NativeSim up, EAS, or mirror publication was invoked.'
} finally {
  foreach ($path in $linkPaths) {
    $link = Get-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    if ($link -and ($link.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      if ($link.PSIsContainer) { [IO.Directory]::Delete($path) } else { [IO.File]::Delete($path) }
    }
  }
  if (Test-Path -LiteralPath $tempRoot) {
    $tempItem = Get-Item -LiteralPath $tempRoot -Force -ErrorAction SilentlyContinue
    if ($tempItem -and ($tempItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}
