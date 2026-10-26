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
  $allowedFilesMatch = [regex]::Match($mirrorScript,'(?ms)\$allowedFiles\s*=\s*@\((?<entries>.*?)\)')
  $allowedDirectoriesMatch = [regex]::Match($mirrorScript,'(?ms)\$allowedDirectories\s*=\s*@\((?<entries>.*?)\)')
  Assert-True ($allowedFilesMatch.Success -and $allowedDirectoriesMatch.Success) 'mirror snapshot file and directory allowlists remain explicit'
  $productionAllowedFiles = @([regex]::Matches($allowedFilesMatch.Groups['entries'].Value,'\x27([^\x27]+)\x27') | ForEach-Object { $_.Groups[1].Value })
  $productionAllowedDirectories = @([regex]::Matches($allowedDirectoriesMatch.Groups['entries'].Value,'\x27([^\x27]+)\x27') | ForEach-Object { $_.Groups[1].Value })
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
  $allAllowedLocalModuleFiles = @($documentThumbnailModuleFiles + $clipboardDetectionModuleFiles)
  Assert-True ($productionAllowedDirectories -notcontains 'modules' -and
    $productionAllowedDirectories -notcontains 'modules/document-thumbnailing' -and
    $productionAllowedDirectories -notcontains 'modules/clipboard-url-detection') 'the mirror does not recursively allow modules or either local module directory'
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
    ($moduleSnapshot.Paths -join '|') -eq ($allAllowedLocalModuleFiles -join '|')) 'the simulated mirror snapshot contains all ten exact files from both local modules'
  Assert-True ((Test-SaveAppMirrorBlockedName -RelativePath 'modules/document-thumbnailing/ios/SaveAppDocumentThumbnailing.podspec') -eq $false -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/document-thumbnailing/ios/SaveAppDocumentThumbnailingModule.swift') -eq $false -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/clipboard-url-detection/ios/SaveAppClipboardURLDetection.podspec') -eq $false -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/clipboard-url-detection/ios/SaveAppClipboardURLDetectionModule.swift') -eq $false) 'only the four exact local module iOS sources bypass the generated ios-directory name block'
  Assert-True ((Test-SaveAppMirrorBlockedName -RelativePath 'modules/document-thumbnailing/ios/Unapproved.swift') -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/document-thumbnailing/ios/private-key.pem') -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/document-thumbnailing/.env.local') -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/clipboard-url-detection/ios/Unapproved.swift') -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/clipboard-url-detection/ios/private-key.pem') -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'modules/clipboard-url-detection/.env.local') -and
    (Test-SaveAppMirrorBlockedName -RelativePath 'ios/Pods/SaveApp.xcodeproj')) 'unapproved iOS files, secrets, and generated native directories remain blocked'
  foreach ($unapprovedModulePath in @(
      'modules/document-thumbnailing/ios/Unapproved.swift',
      'modules/document-thumbnailing/private/credentials.pem',
      'modules/document-thumbnailing/.env.local',
      'modules/clipboard-url-detection/ios/Unapproved.swift',
      'modules/clipboard-url-detection/private/credentials.pem',
      'modules/clipboard-url-detection/.env.local',
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
  $preflightWorkflow = Get-Content -LiteralPath (Join-Path $repositoryRoot '.github\workflows\swift-preflight.yml') -Raw
  Assert-True ($launcher.Contains('-ExpectedSha $mirrorSha') -and
    $preflight.Contains('$live.Split()[0] -ne $sha')) 'NativeSim requires Swift Preflight success for the exact public mirror SHA'
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
  Assert-True ($launcher.Contains('SaveAppNativeSimLaunch') -and $launcher.Contains('Get-ActiveNativeSimRuns') -and $launcher.Contains('No duplicate was started')) 'duplicate-session mutex and active-run guard remain present'
  Assert-True ($preflight.Contains('$dispatchOutput = @(& gh workflow run') -and $preflight.Contains('2>&1)') -and
    $launcher.Contains('Assert-SaveAppSwiftPreflightResult') -and
    $launcher.IndexOf('Assert-SaveAppSwiftPreflightResult',[StringComparison]::Ordinal) -lt $launcher.IndexOf('$nativeProcess.Start()',[StringComparison]::Ordinal)) 'dispatch output is captured and strict Preflight result validation runs before NativeSim can start'
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
