Set-StrictMode -Version Latest

function Assert-SaveAppSafeContent {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$RelativePath,
    [Parameter(Mandatory)][AllowEmptyString()][string]$Content
  )

  $secretPatterns = @(
    '-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
    '(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}',
    '\bAKIA[0-9A-Z]{16}\b','\bAIza[0-9A-Za-z_-]{35}\b','\bsk-[A-Za-z0-9_-]{24,}\b',
    '(?i)(?:password|token|secret|api[_-]?key)\s*[:=]\s*([A-Za-z0-9_./+=-]{24,})'
  )
  $blockedReferences = @(
    (-join @('ef8d9f2e','7d9e','4333','8295','3ecd545db347')),
    ('GoogleService' + '-Info'),('firestore' + '.rules'),
    ('LuanRigatti/' + 'em' + 'po' + 'rio' + 'ri' + 'gatti'),
    ('LuanRigatti/' + 'pwa' + '-ios' + '-2026'),
    ('LuanRigatti/' + 'Em' + 'po' + 'rio' + '-' + 'Rig' + 'atti' + '-' + 'NativeSim' + '-' + 'Public'),
    ('Emp' + 'orio' + '-' + 'Rigatti'),('Emp' + 'ório Rigatti'),('com.' + 'pareact' + '.mobile'),
    ('com.luanrigatti.' + 'starter'),('STARTER_' + 'EAS_PROJECT_ID'),
    ('C:\Projetos\' + 'Starter'),('C:\Projetos\' + 'Starter' + '-NativeSim-Public'),
    ('LuanRigatti/' + 'Starter'),('LuanRigatti/' + 'Starter' + '-NativeSim-Public')
  )

  foreach ($pattern in $secretPatterns) {
    if ([regex]::IsMatch($Content,$pattern)) {
      throw "Credential-like content found in $RelativePath; publication is blocked."
    }
  }
  foreach ($reference in $blockedReferences) {
    if ($Content.IndexOf($reference,[StringComparison]::OrdinalIgnoreCase) -ge 0) {
      throw "Reference to a prohibited source or previous application found in $RelativePath; publication is blocked."
    }
  }
  $legacyUiName = -join @('Star','ter')
  $staticBaseStatement = "The $legacyUiName UI template was used only as the initial base for this independent SaveApp snapshot."
  $staticBaseStatementPattern = '^' + [regex]::Escape($staticBaseStatement.TrimEnd('.')) + '[.!]?$'
  $matchingBaseLines = @($Content -split "`r?`n" | Where-Object { $_ -match $staticBaseStatementPattern })
  if ($matchingBaseLines.Count -gt 0) {
    $normalizedPath = $RelativePath.Replace([char]92,[char]47)
    $exactLineCount = @($Content -split "`r?`n" | Where-Object { $_ -ceq $staticBaseStatement }).Count
    $occurrenceCount = ([regex]::Matches($Content,[regex]::Escape($staticBaseStatement))).Count
    if ($normalizedPath -cne 'docs/current-state.md' -or $exactLineCount -ne 1 -or $occurrenceCount -ne 1 -or $matchingBaseLines.Count -ne 1) {
      throw "Static source-provenance text is allowed only as one exact line in docs/current-state.md."
    }
  }
  return $true
}

function Test-SaveAppGitHubRemote {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][AllowEmptyCollection()][string[]]$RemoteUrls,
    [Parameter(Mandatory)][ValidatePattern('^LuanRigatti/[A-Za-z0-9-]+$')][string]$ExpectedRepository
  )

  if ($RemoteUrls.Count -ne 1) { return $false }
  $repositoryPath = $ExpectedRepository.Trim()
  $allowedUrls = @(
    "https://github.com/$repositoryPath.git",
    "https://github.com/$repositoryPath",
    "git@github.com:$repositoryPath.git",
    "git@github.com:$repositoryPath",
    "ssh://git@github.com/$repositoryPath.git",
    "ssh://git@github.com/$repositoryPath"
  )
  return $allowedUrls -contains $RemoteUrls[0].Trim()
}

function Test-SaveAppMirrorAllowedRelativePath {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$RelativePath,
    [Parameter(Mandatory)][AllowEmptyCollection()][string[]]$AllowedFiles,
    [Parameter(Mandatory)][AllowEmptyCollection()][string[]]$AllowedDirectories
  )

  $path = $RelativePath.Replace('\','/')
  if ($AllowedFiles -contains $path) { return $true }
  foreach ($directory in $AllowedDirectories) {
    if ($path.StartsWith($directory + '/',[StringComparison]::OrdinalIgnoreCase)) { return $true }
  }
  return $false
}

function Test-SaveAppMirrorBlockedName {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$RelativePath)

  $path = $RelativePath.Replace('\','/')
  $approvedModuleIosFiles = @(
    'modules/document-thumbnailing/ios/SaveAppDocumentThumbnailing.podspec',
    'modules/document-thumbnailing/ios/SaveAppDocumentThumbnailingModule.swift',
    'modules/clipboard-url-detection/ios/SaveAppClipboardURLDetection.podspec',
    'modules/clipboard-url-detection/ios/SaveAppClipboardURLDetectionModule.swift'
  )
  if ($approvedModuleIosFiles -contains $path) { return $false }

  $blockedNamePattern = '(?i)(^|/)\.env($|\.)|(^|/)(node_modules|\.expo|\.git|ios|android|build|dist|artifacts)(/|$)|(^|/)(GoogleService-[^/]*|.*\.(p8|p12|pfx|pem|key|jks|keystore|mobileprovision|provisionprofile))$|(^|/).*(secret|credential|private-key).*$'
  return $path -match $blockedNamePattern
}

function Get-SaveAppMirrorAllowlist {
  $allowedFiles = @(
    'README.md','AI_CONTEXT.md','AGENTS.md','.gitignore',
    'app.config.js','babel.config.js','eas.json','eslint.config.js','expo-env.d.ts',
    'index.ts','jest.config.js','metro.config.js','package.json','package-lock.json','tsconfig.json',
    'modules/document-thumbnailing/package.json','modules/document-thumbnailing/expo-module.config.json',
    'modules/document-thumbnailing/ios/SaveAppDocumentThumbnailing.podspec',
    'modules/document-thumbnailing/ios/SaveAppDocumentThumbnailingModule.swift',
    'modules/document-thumbnailing/src/index.ts',
    'modules/clipboard-url-detection/package.json','modules/clipboard-url-detection/expo-module.config.json',
    'modules/clipboard-url-detection/ios/SaveAppClipboardURLDetection.podspec',
    'modules/clipboard-url-detection/ios/SaveAppClipboardURLDetectionModule.swift',
    'modules/clipboard-url-detection/src/index.ts',
    'plugins/withStarterToolbarSync.js',
    'scripts/patch-expo-ui-bottom-sheet.js','scripts/patch-expo-module-scan-timeout.js',
    'scripts/verify-saveapp-native.js','scripts/verify-saveapp-simulator-build-settings.js',
    'scripts/Test-SaveAppMirrorSnapshot.ps1',
    'scripts/create-saveapp-provisional-icon.ps1',
    'scripts/mirror-saveapp.ps1','scripts/Invoke-SaveAppSwiftPreflight.ps1',
    'scripts/Start-SaveAppNativeSim.ps1','scripts/Download-SaveAppSimulatorArchive.ps1',
    'scripts/SaveAppMirrorSecurity.psm1','scripts/SaveAppNativeSimCliGuard.psm1',
    '.github/workflows/native-sim.yml','.github/workflows/swift-preflight.yml',
    '.github/workflows/eas-build.yml','.github/native-sim/gate.cjs'
  )
  $allowedDirectories = @('assets','src','docs','.agents/skills','tests')
  $requiredFiles = @(
    'scripts/SaveAppMirrorSecurity.psm1',
    'scripts/Test-SaveAppMirrorSnapshot.ps1',
    'scripts/verify-saveapp-simulator-build-settings.js'
  )
  foreach ($required in $requiredFiles) {
    if ($allowedFiles -notcontains $required) {
      throw "Required NativeSim mirror dependency is missing from the exact allowlist: $required"
    }
  }
  foreach ($broadDirectory in @('scripts','modules','ios','android')) {
    if ($allowedDirectories -contains $broadDirectory) {
      throw "The NativeSim mirror allowlist must not recursively include $broadDirectory."
    }
  }
  return [pscustomobject]@{
    AllowedFiles = [string[]]$allowedFiles
    AllowedDirectories = [string[]]$allowedDirectories
  }
}

function Get-SaveAppMirrorCandidateFiles {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$SourceRoot,
    [Parameter(Mandatory)][AllowEmptyCollection()][string[]]$AllowedFiles,
    [Parameter(Mandatory)][AllowEmptyCollection()][string[]]$AllowedDirectories
  )

  $result = [Collections.Generic.List[string]]::new()
  foreach ($relative in $AllowedFiles) {
    if ($relative -eq '.nativesim-source') { continue }
    $path = Resolve-SaveAppMirrorPath -Base $SourceRoot -RelativePath $relative -ExpectedType File -AllowMissingLeaf
    if ($null -ne $path) { $result.Add($relative) }
  }
  foreach ($relativeDirectory in $AllowedDirectories) {
    $path = Resolve-SaveAppMirrorPath -Base $SourceRoot -RelativePath $relativeDirectory -ExpectedType Directory -AllowMissingLeaf
    if ($null -eq $path) { continue }
    $pending = [Collections.Generic.Stack[string]]::new()
    $pending.Push($relativeDirectory)
    while ($pending.Count -gt 0) {
      $currentRelative = $pending.Pop()
      $currentPath = Resolve-SaveAppMirrorPath -Base $SourceRoot -RelativePath $currentRelative -ExpectedType Directory
      foreach ($item in Get-ChildItem -LiteralPath $currentPath -Force -ErrorAction Stop) {
        $itemRelative = [IO.Path]::GetRelativePath($SourceRoot,$item.FullName).Replace('\','/')
        $expectedType = if ($item.PSIsContainer) { 'Directory' } else { 'File' }
        $null = Resolve-SaveAppMirrorPath -Base $SourceRoot -RelativePath $itemRelative -ExpectedType $expectedType
        if ($item.PSIsContainer) {
          $pending.Push($itemRelative)
        } else {
          $result.Add($itemRelative)
        }
      }
    }
  }
  foreach ($relative in $result) {
    if (-not (Test-SaveAppMirrorAllowedRelativePath -RelativePath $relative `
      -AllowedFiles $AllowedFiles -AllowedDirectories $AllowedDirectories)) {
      throw "Mirror candidate escaped the exact allowlist: $relative"
    }
    if (Test-SaveAppMirrorBlockedName -RelativePath $relative) { throw "Blocked mirror candidate: $relative" }
  }
  return @($result | Sort-Object -Unique)
}

function Get-SaveAppMirrorStagedPathResult {
  [CmdletBinding()]
  param(
    [AllowNull()][AllowEmptyCollection()][object[]]$GitOutput,
    [Parameter(Mandatory)][AllowEmptyCollection()][string[]]$AllowedFiles,
    [Parameter(Mandatory)][AllowEmptyCollection()][string[]]$AllowedDirectories,
    [AllowEmptyCollection()][string[]]$AdditionalAllowedPaths = @()
  )

  $paths = [Collections.Generic.List[string]]::new()
  if ($null -ne $GitOutput) {
    foreach ($entry in $GitOutput) {
      if ($null -eq $entry) { throw 'Git returned a null staged path.' }
      $relativePath = ([string]$entry).Replace('\','/')
      if ([string]::IsNullOrWhiteSpace($relativePath)) { throw 'Git returned an empty staged path.' }
      $isAllowed = Test-SaveAppMirrorAllowedRelativePath -RelativePath $relativePath `
        -AllowedFiles $AllowedFiles -AllowedDirectories $AllowedDirectories
      if (-not $isAllowed -and $AdditionalAllowedPaths -notcontains $relativePath) {
        throw "Staged path is outside the mirror allowlist: $relativePath"
      }
      $paths.Add($relativePath)
    }
  }

  $pathArray = [string[]]$paths.ToArray()
  return [pscustomobject]@{
    Paths = $pathArray
    HasChanges = ($pathArray.Length -gt 0)
  }
}

function Get-SaveAppRelativeSegments {
  param([Parameter(Mandatory)][string]$RelativePath)

  if ([string]::IsNullOrWhiteSpace($RelativePath) -or [IO.Path]::IsPathRooted($RelativePath)) {
    throw 'Mirror paths must be non-empty and relative to the authorized repository root.'
  }

  $normalized = $RelativePath.Replace('\','/')
  $segments = @($normalized.Split('/'))
  foreach ($segment in $segments) {
    if ([string]::IsNullOrWhiteSpace($segment) -or $segment -in @('.','..') -or
        $segment -match '[<>:"|?*\x00]' -or $segment.EndsWith('.') -or $segment.EndsWith(' ')) {
      throw "Invalid or unresolved mirror path component: $segment"
    }
  }
  return ,$segments
}

function Get-SaveAppPathItem {
  param(
    [Parameter(Mandatory)][string]$Path,
    [switch]$AllowMissing
  )

  try {
    return Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  } catch {
    if ($AllowMissing -and $_.CategoryInfo.Category -eq [Management.Automation.ErrorCategory]::ObjectNotFound) {
      return $null
    }
    throw "Could not resolve mirror path safely: $Path. $($_.Exception.Message)"
  }
}

function Assert-SaveAppPathItem {
  param(
    [Parameter(Mandatory)]$Item,
    [Parameter(Mandatory)][string]$Path,
    [ValidateSet('Any','File','Directory')][string]$ExpectedType = 'Any'
  )

  if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Refusing a symlink, junction, or other reparse point in a mirror path: $Path"
  }
  if ($ExpectedType -eq 'File' -and $Item.PSIsContainer) {
    throw "Expected a file but resolved a directory: $Path"
  }
  if ($ExpectedType -eq 'Directory' -and -not $Item.PSIsContainer) {
    throw "Expected a directory but resolved a file: $Path"
  }
}

function Assert-SaveAppMirrorRoot {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$Root)

  $fullRoot = [IO.Path]::GetFullPath($Root)
  $pathRoot = [IO.Path]::GetPathRoot($fullRoot)
  if (-not $pathRoot -or $fullRoot.Length -lt $pathRoot.Length) {
    throw "Mirror root is invalid or unresolved: $Root"
  }
  if ($fullRoot.Length -gt $pathRoot.Length) {
    $fullRoot = $fullRoot.TrimEnd([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar)
  }

  $tail = $fullRoot.Substring($pathRoot.Length)
  $segments = @($tail.Split([char[]]@([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar),[StringSplitOptions]::RemoveEmptyEntries))
  $current = $pathRoot
  $item = Get-SaveAppPathItem -Path $current
  Assert-SaveAppPathItem -Item $item -Path $current -ExpectedType Directory
  foreach ($segment in $segments) {
    $current = [IO.Path]::Combine($current,$segment)
    $item = Get-SaveAppPathItem -Path $current
    Assert-SaveAppPathItem -Item $item -Path $current -ExpectedType Directory
  }
  return $fullRoot
}

function Resolve-SaveAppMirrorPath {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$Base,
    [Parameter(Mandatory)][string]$RelativePath,
    [ValidateSet('Any','File','Directory')][string]$ExpectedType = 'Any',
    [switch]$AllowMissingLeaf
  )

  $segments = Get-SaveAppRelativeSegments -RelativePath $RelativePath
  $baseFull = Assert-SaveAppMirrorRoot -Root $Base
  $candidate = [IO.Path]::GetFullPath([IO.Path]::Combine($baseFull,($segments -join [IO.Path]::DirectorySeparatorChar)))
  $basePrefix = $baseFull.TrimEnd([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if (-not $candidate.StartsWith($basePrefix,[StringComparison]::OrdinalIgnoreCase)) {
    throw "Resolved mirror path escapes the authorized root: $RelativePath"
  }

  $current = $baseFull
  for ($index = 0; $index -lt $segments.Count; $index++) {
    $current = [IO.Path]::Combine($current,$segments[$index])
    $isLeaf = $index -eq ($segments.Count - 1)
    $item = Get-SaveAppPathItem -Path $current -AllowMissing:($AllowMissingLeaf -and $isLeaf)
    if ($null -eq $item) {
      if ($isLeaf -and $AllowMissingLeaf) { return $null }
      throw "Mirror path component is missing or unresolved: $current"
    }
    $componentType = if ($isLeaf) { $ExpectedType } else { 'Directory' }
    Assert-SaveAppPathItem -Item $item -Path $current -ExpectedType $componentType
  }
  return $candidate
}

function Ensure-SaveAppMirrorDirectory {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$Base,
    [Parameter(Mandatory)][string]$RelativePath
  )

  $segments = Get-SaveAppRelativeSegments -RelativePath $RelativePath
  $built = [Collections.Generic.List[string]]::new()
  foreach ($segment in $segments) {
    $built.Add($segment)
    $relative = $built -join [IO.Path]::DirectorySeparatorChar
    $resolved = Resolve-SaveAppMirrorPath -Base $Base -RelativePath $relative -ExpectedType Directory -AllowMissingLeaf
    if ($null -eq $resolved) {
      $parentRelative = if ($built.Count -gt 1) { (@($built | Select-Object -SkipLast 1) -join [IO.Path]::DirectorySeparatorChar) } else { $null }
      $parent = if ($parentRelative) { Resolve-SaveAppMirrorPath -Base $Base -RelativePath $parentRelative -ExpectedType Directory } else { [IO.Path]::GetFullPath($Base) }
      $newDirectory = [IO.Path]::Combine($parent,$segment)
      New-Item -ItemType Directory -Path $newDirectory -ErrorAction Stop | Out-Null
      $null = Resolve-SaveAppMirrorPath -Base $Base -RelativePath $relative -ExpectedType Directory
    }
  }
  return Resolve-SaveAppMirrorPath -Base $Base -RelativePath $RelativePath -ExpectedType Directory
}

function Copy-SaveAppMirrorFile {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$SourceRoot,
    [Parameter(Mandatory)][string]$MirrorRoot,
    [Parameter(Mandatory)][string]$RelativePath
  )

  $source = Resolve-SaveAppMirrorPath -Base $SourceRoot -RelativePath $RelativePath -ExpectedType File
  $parentRelative = Split-Path -Path $RelativePath.Replace('/','\') -Parent
  if ($parentRelative) { $null = Ensure-SaveAppMirrorDirectory -Base $MirrorRoot -RelativePath $parentRelative }
  $target = Resolve-SaveAppMirrorPath -Base $MirrorRoot -RelativePath $RelativePath -ExpectedType File -AllowMissingLeaf
  $leaf = Split-Path -Path $RelativePath.Replace('/','\') -Leaf
  $temporaryRelative = if ($parentRelative) {
    Join-Path $parentRelative ('.' + $leaf + '.' + [guid]::NewGuid().ToString('N') + '.mirror-tmp')
  } else {
    '.' + $leaf + '.' + [guid]::NewGuid().ToString('N') + '.mirror-tmp'
  }
  $temporary = Resolve-SaveAppMirrorPath -Base $MirrorRoot -RelativePath $temporaryRelative -ExpectedType File -AllowMissingLeaf
  if ($null -ne $temporary) { throw 'A mirror copy temporary path unexpectedly already exists.' }

  try {
    $source = Resolve-SaveAppMirrorPath -Base $SourceRoot -RelativePath $RelativePath -ExpectedType File
    $temporaryFullPath = [IO.Path]::Combine([IO.Path]::GetFullPath($MirrorRoot),$temporaryRelative.Replace('\',[IO.Path]::DirectorySeparatorChar))
    $stream = [IO.File]::Open($temporaryFullPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {
      $bytes = [IO.File]::ReadAllBytes($source)
      $stream.Write($bytes,0,$bytes.Length)
    } finally { $stream.Dispose() }
    $temporary = Resolve-SaveAppMirrorPath -Base $MirrorRoot -RelativePath $temporaryRelative -ExpectedType File
    $target = Resolve-SaveAppMirrorPath -Base $MirrorRoot -RelativePath $RelativePath -ExpectedType File -AllowMissingLeaf
    if ($null -eq $target) {
      $target = [IO.Path]::Combine([IO.Path]::GetFullPath($MirrorRoot),$RelativePath.Replace('\',[IO.Path]::DirectorySeparatorChar).Replace('/',[IO.Path]::DirectorySeparatorChar))
      [IO.File]::Move($temporary,$target)
    } else {
      [IO.File]::Move($temporary,$target,$true)
    }
    $verified = Resolve-SaveAppMirrorPath -Base $MirrorRoot -RelativePath $RelativePath -ExpectedType File
    return $verified
  } finally {
    $remaining = Resolve-SaveAppMirrorPath -Base $MirrorRoot -RelativePath $temporaryRelative -ExpectedType File -AllowMissingLeaf
    if ($null -ne $remaining) { [IO.File]::Delete($remaining) }
  }
}

function Write-SaveAppProvenance {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$MirrorRoot,
    [Parameter(Mandatory)][string]$Content
  )

  $relativePath = '.nativesim-source'
  $target = Resolve-SaveAppMirrorPath -Base $MirrorRoot -RelativePath $relativePath -ExpectedType File -AllowMissingLeaf
  $temporaryRelative = '.nativesim-source.' + [guid]::NewGuid().ToString('N') + '.tmp'
  $temporary = Resolve-SaveAppMirrorPath -Base $MirrorRoot -RelativePath $temporaryRelative -ExpectedType File -AllowMissingLeaf
  if ($null -ne $temporary) { throw 'A provenance temporary path unexpectedly already exists.' }

  try {
    $temporaryFullPath = [IO.Path]::Combine([IO.Path]::GetFullPath($MirrorRoot),$temporaryRelative)
    $stream = [IO.File]::Open($temporaryFullPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {
      $bytes = [Text.UTF8Encoding]::new($false).GetBytes($Content)
      $stream.Write($bytes,0,$bytes.Length)
    } finally { $stream.Dispose() }
    $temporary = Resolve-SaveAppMirrorPath -Base $MirrorRoot -RelativePath $temporaryRelative -ExpectedType File
    $target = Resolve-SaveAppMirrorPath -Base $MirrorRoot -RelativePath $relativePath -ExpectedType File -AllowMissingLeaf
    if ($null -eq $target) {
      $target = [IO.Path]::Combine([IO.Path]::GetFullPath($MirrorRoot),$relativePath)
      [IO.File]::Move($temporary,$target)
    } else {
      [IO.File]::Move($temporary,$target,$true)
    }
    $verified = Resolve-SaveAppMirrorPath -Base $MirrorRoot -RelativePath $relativePath -ExpectedType File
    if ([IO.File]::ReadAllText($verified) -cne $Content) {
      throw 'The written mirror provenance did not match the expected content.'
    }
    return $verified
  } finally {
    $remaining = Resolve-SaveAppMirrorPath -Base $MirrorRoot -RelativePath $temporaryRelative -ExpectedType File -AllowMissingLeaf
    if ($null -ne $remaining) { [IO.File]::Delete($remaining) }
  }
}

Export-ModuleMember -Function Assert-SaveAppSafeContent,Test-SaveAppGitHubRemote,Test-SaveAppMirrorAllowedRelativePath,Test-SaveAppMirrorBlockedName,Get-SaveAppMirrorAllowlist,Get-SaveAppMirrorCandidateFiles,Get-SaveAppMirrorStagedPathResult,Assert-SaveAppMirrorRoot,Resolve-SaveAppMirrorPath,Ensure-SaveAppMirrorDirectory,Copy-SaveAppMirrorFile,Write-SaveAppProvenance
