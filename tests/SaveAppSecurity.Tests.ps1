Describe 'SaveApp security and NativeSim safety simulations' {
  It 'passes the complete offline security simulation suite' {
    $simulationPath = Join-Path $PSScriptRoot 'SaveAppSecurity.Simulations.ps1'
    $pwsh = Get-Command pwsh.exe -ErrorAction Stop
    $simulationOutput = @(& $pwsh.Source -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $simulationPath 2>&1)
    $simulationExitCode = $LASTEXITCODE
    $simulationText = ($simulationOutput | ForEach-Object { "$_" }) -join "`n"
    if ($simulationExitCode -ne 0) {
      throw "SaveApp offline security simulations failed with exit code $simulationExitCode.`n$simulationText"
    }
    if ($simulationText -notmatch 'SaveApp security simulations completed: Preflight was mocked') {
      throw 'SaveApp offline security simulation completion marker is missing.'
    }
  }
}