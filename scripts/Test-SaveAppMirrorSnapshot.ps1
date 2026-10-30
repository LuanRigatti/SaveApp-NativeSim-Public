[CmdletBinding(DefaultParameterSetName='Build')]
param(
  [Parameter(Mandatory,ParameterSetName='Build')][string]$SourceRoot,
  [Parameter(Mandatory,ParameterSetName='Build')][ValidatePattern('^[0-9a-f]{40}$')][string]$SourceCommit,
  [Parameter(Mandatory,ParameterSetName='Snapshot')][string]$SnapshotRoot,
  [Parameter(Mandatory,ParameterSetName='Snapshot')][string]$ManifestPath,
  [Parameter(ParameterSetName='Snapshot')][switch]$ManifestOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 or newer is required for the SaveApp mirror snapshot gate.' }

$requiredSnapshotFiles = @(
  'README.md','AI_CONTEXT.md','AGENTS.md','.gitignore',
  'app.config.js','babel.config.js','eas.json','eslint.config.js','expo-env.d.ts',
  'jest.config.js','metro.config.js','package.json','package-lock.json','tsconfig.json',
  'plugins/withSaveLinkQuickSave.js','plugins/withStarterToolbarSync.js',
  'scripts/patch-expo-ui-bottom-sheet.js','scripts/patch-expo-module-scan-timeout.js',
  'scripts/verify-saveapp-native.js','scripts/verify-saveapp-simulator-build-settings.js',
  'scripts/Test-SaveAppMirrorSnapshot.ps1','scripts/mirror-saveapp.ps1',
  'scripts/Invoke-SaveAppSwiftPreflight.ps1','scripts/Start-SaveAppNativeSim.ps1',
  'scripts/Download-SaveAppSimulatorArchive.ps1','scripts/SaveAppMirrorSecurity.psm1',
  'scripts/SaveAppNativeSimCliGuard.psm1',
  'modules/document-thumbnailing/package.json','modules/document-thumbnailing/expo-module.config.json',
  'modules/document-thumbnailing/ios/SaveAppDocumentThumbnailing.podspec',
  'modules/document-thumbnailing/ios/SaveAppDocumentThumbnailingModule.swift',
  'modules/document-thumbnailing/src/index.ts',
  'modules/clipboard-url-detection/package.json','modules/clipboard-url-detection/expo-module.config.json',
  'modules/clipboard-url-detection/ios/SaveAppClipboardURLDetection.podspec',
  'modules/clipboard-url-detection/ios/SaveAppClipboardURLDetectionModule.swift',
  'modules/clipboard-url-detection/src/index.ts',
  'modules/rich-note-keyboard-toolbar/package.json','modules/rich-note-keyboard-toolbar/expo-module.config.json',
  'modules/rich-note-keyboard-toolbar/ios/SaveAppRichNoteKeyboardToolbar.podspec',
  'modules/rich-note-keyboard-toolbar/ios/SaveAppRichNoteKeyboardToolbarModule.swift',
  'modules/rich-note-keyboard-toolbar/src/index.ts',
  'modules/dynamic-island-quick-save/ios/expo_widgets_quick_save.rb',
  'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveIntent.swift',
  'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveAppIntentsPackage.swift',
  'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveLiveActivityButton.swift',
  'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveSQLite.swift',
  'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveQueue.swift',
  'src/features/dynamic-island/quickSaveQueue.ts',
  'src/features/dynamic-island/quickSaveQueueImportPipeline.ts',
  'src/features/home-content/quickSaveLinkPreviewEnrichment.ts',
  'src/features/home-content/quickSavePreviewEnrichmentSchemaMigration.ts',
  '.github/workflows/native-sim.yml','.github/workflows/swift-preflight.yml',
  '.github/workflows/eas-build.yml','.github/native-sim/gate.cjs',
  '.github/native-sim/oslog-capture.sh',
  'tests/SaveAppSecurity.Tests.ps1','tests/SaveAppSecurity.Simulations.ps1',
  'tests/dynamic-island-contract.test.js','tests/dynamic-island-quick-save-contract.test.js',
  'tests/quick-save-xcodeproj-contract.rb',
  'scripts/verify-saveapp-quick-save-app-intents.js',
  'tests/native-sim-build-settings.test.js',
  '.agents/skills/saveapp-nativesim/SKILL.md','.agents/skills/saveapp-nativesim-nopreflight/SKILL.md',
  'docs/current-state.md','docs/design-system.md',
  'assets/icon.png','assets/splash.png','assets/adaptive-icon.png',
  'assets/live-activity-icon.png','assets/live-activity-icon-dark.png'
)

function Get-MirrorModule {
  param([Parameter(Mandatory)][string]$Root)
  $modulePath = Join-Path $Root 'scripts\SaveAppMirrorSecurity.psm1'
  if (-not (Test-Path -LiteralPath $modulePath -PathType Leaf)) {
    throw 'Snapshot security module is missing: scripts/SaveAppMirrorSecurity.psm1'
  }
  Import-Module $modulePath -Force -DisableNameChecking -Global -ErrorAction Stop
}

function Assert-SnapshotManifest {
  param(
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][string]$ManifestFile
  )

  $rootFull = Assert-SaveAppMirrorRoot -Root $Root
  $manifestItem = Get-Item -LiteralPath $ManifestFile -Force -ErrorAction Stop
  if ($manifestItem.PSIsContainer -or ($manifestItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Snapshot validation manifest must be a regular file.'
  }
  $manifestFull = [IO.Path]::GetFullPath($manifestItem.FullName)
  $rootPrefix = $rootFull.TrimEnd([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if ($manifestFull.StartsWith($rootPrefix,[StringComparison]::OrdinalIgnoreCase)) {
    throw 'Snapshot manifest must remain outside the published-file snapshot.'
  }

  $manifest = Get-Content -LiteralPath $manifestFull -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
  $propertyNames = @($manifest.PSObject.Properties.Name | Sort-Object)
  if (($propertyNames -join '|') -cne 'Files|Provenance|SourceCommit' -or
      [string]$manifest.SourceCommit -notmatch '^[0-9a-f]{40}$' -or
      $manifest.Files -isnot [System.Array] -or $manifest.Files.Count -lt 1 -or
      [string]::IsNullOrWhiteSpace([string]$manifest.Provenance)) {
    throw 'Snapshot manifest has an invalid schema or missing source provenance.'
  }

  $allowlist = Get-SaveAppMirrorAllowlist
  $entries = [Collections.Generic.Dictionary[string,string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($entry in $manifest.Files) {
    if ($null -eq $entry -or $null -eq $entry.PSObject.Properties['Path'] -or $null -eq $entry.PSObject.Properties['Sha256']) {
      throw 'Snapshot manifest contains a file entry without path or SHA-256.'
    }
    $relative = ([string]$entry.Path).Replace('\','/')
    if ([string]$entry.Sha256 -notmatch '^[A-Fa-f0-9]{64}$' -or
        -not (Test-SaveAppMirrorAllowedRelativePath -RelativePath $relative -AllowedFiles $allowlist.AllowedFiles -AllowedDirectories $allowlist.AllowedDirectories) -or
        (Test-SaveAppMirrorBlockedName -RelativePath $relative)) {
      throw "Snapshot manifest contains a path or digest outside the publication contract: $relative"
    }
    if ($entries.ContainsKey($relative)) { throw "Snapshot manifest repeats a path: $relative" }
    $entries.Add($relative,[string]$entry.Sha256)
  }

  foreach ($required in $requiredSnapshotFiles) {
    if (-not $entries.ContainsKey($required)) {
      throw "Required mirror dependency is absent from the validated snapshot: $required"
    }
  }
  foreach ($required in $requiredSnapshotFiles) {
    $isCovered = $allowlist.AllowedFiles -contains $required
    foreach ($directory in $allowlist.AllowedDirectories) {
      if ($required.StartsWith($directory + '/',[StringComparison]::OrdinalIgnoreCase)) { $isCovered = $true }
    }
    if (-not $isCovered) { throw "Required dependency is not covered by the explicit mirror allowlist: $required" }
  }

  $actualCandidates = @(Get-SaveAppMirrorCandidateFiles -SourceRoot $rootFull -AllowedFiles $allowlist.AllowedFiles -AllowedDirectories $allowlist.AllowedDirectories)
  $declaredCandidates = @($entries.Keys | Sort-Object)
  $actualSorted = @($actualCandidates | Sort-Object)
  if (($actualSorted -join [Environment]::NewLine) -cne ($declaredCandidates -join [Environment]::NewLine)) {
    throw 'Snapshot manifest file list does not exactly match the allowlisted files present in the snapshot.'
  }

  foreach ($relative in $declaredCandidates) {
    $resolved = Resolve-SaveAppMirrorPath -Base $rootFull -RelativePath $relative -ExpectedType File
    $actualHash = (Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash
    if ($actualHash -ine $entries[$relative]) { throw "Snapshot content hash differs from its source manifest: $relative" }
  }

  $provenancePath = Resolve-SaveAppMirrorPath -Base $rootFull -RelativePath '.nativesim-source' -ExpectedType File
  $actualProvenance = Get-Content -LiteralPath $provenancePath -Raw -ErrorAction Stop
  if ($actualProvenance.TrimEnd([char[]]@([char]13,[char]10)) -cne ([string]$manifest.Provenance).TrimEnd([char[]]@([char]13,[char]10))) {
    throw 'Snapshot source provenance does not match the validation manifest.'
  }
  $expectedSourceLine = 'source_commit=' + [string]$manifest.SourceCommit
  if (@($actualProvenance -split '\r?\n' | Where-Object { $_ -ceq $expectedSourceLine }).Count -ne 1) {
    throw 'Snapshot provenance does not identify the expected full private source SHA.'
  }

  $expectedFiles = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($relative in $declaredCandidates) { [void]$expectedFiles.Add($relative) }
  [void]$expectedFiles.Add('.nativesim-source')
  $actualFiles = [Collections.Generic.List[string]]::new()
  foreach ($item in Get-ChildItem -LiteralPath $rootFull -File -Recurse -Force -ErrorAction Stop) {
    $relative = [IO.Path]::GetRelativePath($rootFull,$item.FullName).Replace('\','/')
    $null = Resolve-SaveAppMirrorPath -Base $rootFull -RelativePath $relative -ExpectedType File
    $actualFiles.Add($relative)
  }
  foreach ($item in Get-ChildItem -LiteralPath $rootFull -Directory -Recurse -Force -ErrorAction Stop) {
    $null = Resolve-SaveAppMirrorPath -Base $rootFull -RelativePath ([IO.Path]::GetRelativePath($rootFull,$item.FullName).Replace('\','/')) -ExpectedType Directory
  }
  if ($actualFiles.Count -ne $expectedFiles.Count) { throw 'Snapshot contains missing or additional files outside the exact published file set.' }
  foreach ($relative in $actualFiles) {
    if (-not $expectedFiles.Contains($relative)) { throw "Unexpected file in mirror snapshot: $relative" }
  }

  return [pscustomobject]@{ Root = $rootFull; Manifest = $manifest; CandidateCount = $declaredCandidates.Count }
}

if ($PSCmdlet.ParameterSetName -eq 'Snapshot') {
  Get-MirrorModule -Root (Split-Path -Parent $PSScriptRoot)
  $validated = Assert-SnapshotManifest -Root $SnapshotRoot -ManifestFile $ManifestPath
  Write-Output "Snapshot manifest and provenance: passed ($($validated.CandidateCount) allowlisted files, source $($validated.Manifest.SourceCommit))."
  if ($ManifestOnly) { return }

  $snapshotFull = $validated.Root
  $gitOutput = & git -C $snapshotFull init --quiet --initial-branch=main 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Could not initialize isolated snapshot validation Git metadata: $gitOutput" }
  & git -C $snapshotFull config core.safecrlf false
  if ($LASTEXITCODE -ne 0) { throw 'Could not isolate safe-CRLF warning configuration for the snapshot Git check.' }
  & git -C $snapshotFull add --force --all -- .
  if ($LASTEXITCODE -ne 0) { throw 'Could not stage the isolated snapshot for whitespace validation.' }
  $whitespaceOutput = @(& git -C $snapshotFull diff --cached --check 2>&1)
  $whitespaceExitCode = $LASTEXITCODE
  if ($whitespaceExitCode -ne 0) {
    $whitespaceDetails = @($whitespaceOutput | Select-Object -First 20 | ForEach-Object { "$_" }) -join [Environment]::NewLine
    throw "The exact mirror snapshot failed git diff --cached --check (exit $whitespaceExitCode). First diagnostics:`n$whitespaceDetails"
  }
  Write-Output 'Snapshot git diff --check: passed.'

  Push-Location $snapshotFull
  try {
    $npm = Get-Command npm.cmd -ErrorAction Stop
    $node = Get-Command node.exe -ErrorAction Stop
    $pwsh = Get-Command pwsh.exe -ErrorAction Stop

    function Invoke-SnapshotCommand {
      param([Parameter(Mandatory)][string]$Executable,[Parameter(Mandatory)][string[]]$Arguments,[Parameter(Mandatory)][string]$Label)
      Write-Output "Snapshot gate: $Label"
      & $Executable @Arguments
      $code = $LASTEXITCODE
      if ($code -ne 0) { throw "Mirror snapshot command failed ($code): $Label" }
    }

    Invoke-SnapshotCommand -Executable $npm.Source -Arguments @('ci') -Label 'npm ci'
    Invoke-SnapshotCommand -Executable $npm.Source -Arguments @('run','typecheck') -Label 'typecheck'
    Invoke-SnapshotCommand -Executable $npm.Source -Arguments @('run','lint') -Label 'lint'
    Invoke-SnapshotCommand -Executable $npm.Source -Arguments @('test','--','--runInBand') -Label 'full Jest suite'
    Invoke-SnapshotCommand -Executable $node.Source -Arguments @('scripts/verify-saveapp-native.js') -Label 'native contracts'
    Invoke-SnapshotCommand -Executable $npm.Source -Arguments @('run','expo:check') -Label 'Expo dependency compatibility'
    Invoke-SnapshotCommand -Executable $npm.Source -Arguments @('run','doctor') -Label 'Expo Doctor'

    Write-Output 'Snapshot gate: NativeSim security simulations'
    Import-Module Pester -ErrorAction Stop
    $securityResult = Invoke-Pester -Path (Join-Path $snapshotFull 'tests\SaveAppSecurity.Tests.ps1') -PassThru
    if ($null -eq $securityResult -or [int]$securityResult.FailedCount -ne 0 -or [int]$securityResult.PassedCount -lt 1) {
      throw 'The mirrored NativeSim security simulations failed or reported no passing tests.'
    }
    Write-Output "Mirrored NativeSim security simulations: $($securityResult.PassedCount) passed, $($securityResult.FailedCount) failed."
    Write-Output 'Local prebuild, CocoaPods, and Xcode compilation were not run by this gate; those checks remain in the macOS Swift Preflight/NativeSim workflows.'
  } finally {
    Pop-Location
  }
  Write-Output 'Sanitized local mirror snapshot validation: passed.'
  return
}

Get-MirrorModule -Root $SourceRoot
$sourceFull = Assert-SaveAppMirrorRoot -Root $SourceRoot
$expectedPublicRoot = [IO.Path]::GetFullPath((Join-Path $sourceFull '..\SaveApp-NativeSim-Public'))
$allowlist = Get-SaveAppMirrorAllowlist
$candidates = @(Get-SaveAppMirrorCandidateFiles -SourceRoot $sourceFull -AllowedFiles $allowlist.AllowedFiles -AllowedDirectories $allowlist.AllowedDirectories)
foreach ($required in $requiredSnapshotFiles) {
  if ($candidates -notcontains $required) { throw "Required mirror dependency is absent before snapshot creation: $required" }
}
if ($candidates.Count -lt 1) { throw 'The exact mirror allowlist produced no candidate files.' }

foreach ($relative in $candidates) {
  if (Test-SaveAppMirrorBlockedName -RelativePath $relative) { throw "Blocked snapshot file: $relative" }
  $sourcePath = Resolve-SaveAppMirrorPath -Base $sourceFull -RelativePath $relative -ExpectedType File
  if ([IO.Path]::GetExtension($sourcePath) -notin @('.png','.jpg','.jpeg','.webp','.pdf','.zip','.tar','.gz')) {
    $null = Assert-SaveAppSafeContent -RelativePath $relative -Content (Get-Content -LiteralPath $sourcePath -Raw -ErrorAction Stop)
  }
}

$tempBase = [IO.Path]::GetFullPath((Join-Path $sourceFull '..')).TrimEnd([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar)
if ($sourceFull -ne [IO.Path]::GetFullPath('C:\Projetos\SaveApp') -or
    $tempBase -ne [IO.Path]::GetFullPath('C:\Projetos')) {
  throw 'The isolated snapshot must be a unique direct child of the authorized SaveApp workspace parent.'
}
$tempRoot = Join-Path $tempBase ('SaveAppMirrorValidation-' + [guid]::NewGuid().ToString('N'))
$snapshotPath = $tempRoot
$snapshotManifestPath = $tempRoot + '.manifest.json'
$provenance = @(
  'source_repository=LuanRigatti/SaveApp'
  'source_branch=main'
  "source_commit=$SourceCommit"
) -join [Environment]::NewLine
$ownsTempRoot = $false
$ownsManifest = $false
try {
  if ((Test-Path -LiteralPath $tempRoot) -or (Test-Path -LiteralPath $snapshotManifestPath)) {
    throw 'The unique mirror-validation paths already exist; refusing to overwrite them.'
  }
  New-Item -ItemType Directory -Path $snapshotPath -ErrorAction Stop | Out-Null
  $ownsTempRoot = $true
  $null = Assert-SaveAppMirrorRoot -Root $snapshotPath
  foreach ($relative in $candidates) {
    $null = Copy-SaveAppMirrorFile -SourceRoot $sourceFull -MirrorRoot $snapshotPath -RelativePath $relative
  }
  $null = Write-SaveAppProvenance -MirrorRoot $snapshotPath -Content $provenance
  $fileEntries = foreach ($relative in $candidates) {
    $copiedFile = Resolve-SaveAppMirrorPath -Base $snapshotPath -RelativePath $relative -ExpectedType File
    [pscustomobject]@{ Path = $relative; Sha256 = (Get-FileHash -LiteralPath $copiedFile -Algorithm SHA256).Hash }
  }
  $manifestObject = [pscustomobject]@{
    SourceCommit = $SourceCommit
    Provenance = $provenance
    Files = @($fileEntries)
  }
  $manifestJson = $manifestObject | ConvertTo-Json -Depth 5
  $manifestBytes = [Text.UTF8Encoding]::new($false).GetBytes($manifestJson)
  $manifestStream = [IO.File]::Open($snapshotManifestPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  $ownsManifest = $true
  try {
    $manifestStream.Write($manifestBytes,0,$manifestBytes.Length)
    $manifestStream.Flush($true)
  } finally { $manifestStream.Dispose() }

  $snapshotValidator = Resolve-SaveAppMirrorPath -Base $snapshotPath -RelativePath 'scripts/Test-SaveAppMirrorSnapshot.ps1' -ExpectedType File
  $pwsh = Get-Command pwsh.exe -ErrorAction Stop
  Write-Output "Validating isolated mirror snapshot ($($candidates.Count) files) from private source SHA $SourceCommit."
  & $pwsh.Source -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $snapshotValidator -SnapshotRoot $snapshotPath -ManifestPath $snapshotManifestPath
  $validationExitCode = $LASTEXITCODE
  if ($validationExitCode -ne 0) { throw "Isolated mirror snapshot gate failed with exit code $validationExitCode." }
} finally {
  $tempFull = [IO.Path]::GetFullPath($tempRoot)
  $tempPrefix = $tempBase + [IO.Path]::DirectorySeparatorChar
  $tempItem = Get-Item -LiteralPath $tempFull -Force -ErrorAction SilentlyContinue
  $manifestFull = [IO.Path]::GetFullPath($snapshotManifestPath)
  $manifestItem = Get-Item -LiteralPath $manifestFull -Force -ErrorAction SilentlyContinue
  if ($ownsTempRoot -and $tempItem) {
    if (-not $tempFull.StartsWith($tempPrefix,[StringComparison]::OrdinalIgnoreCase) -or
        $tempItem.Name -notmatch '^SaveAppMirrorValidation-[0-9a-f]{32}$' -or
        ($tempItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
        $tempFull -eq $sourceFull -or $tempFull -eq $expectedPublicRoot) {
      throw 'Refusing to remove an unverified mirror-validation temporary directory.'
    }
  }
  if ($ownsManifest -and $manifestItem) {
    if ($manifestItem.PSIsContainer -or
        ($manifestItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
        [IO.Path]::GetDirectoryName($manifestFull) -ne $tempBase -or
        -not $tempItem -or $manifestItem.Name -cne ($tempItem.Name + '.manifest.json')) {
      throw 'Refusing to remove an unverified mirror-validation manifest.'
    }
    Remove-Item -LiteralPath $manifestFull -Force -ErrorAction Stop
  }
  if ($ownsTempRoot -and $tempItem) {
    Remove-Item -LiteralPath $tempFull -Recurse -Force -ErrorAction Stop
  }
}
