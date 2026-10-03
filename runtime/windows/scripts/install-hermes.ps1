# Install Hermes Agent into the portable USB workspace.
# This wrapper intentionally avoids the interactive `iex (irm ...)` form.

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = [System.IO.Path]::GetFullPath((Join-Path $scriptDir '..\..\..'))
$hermesHome = Join-Path $root '.hermes'
$hermesInstallDir = Join-Path $hermesHome 'hermes-agent'
$runtimeRoot = Join-Path $root 'runtime\windows'
$pythonRoot = Join-Path $runtimeRoot 'python'
$nodeRoot = Join-Path $runtimeRoot 'node'
$npmGlobal = Join-Path $runtimeRoot 'npm-global'
$binRoot = Join-Path $runtimeRoot 'bin'

# This wrapper owns the install location.  Reject path overrides rather than
# allowing a caller to accidentally send Hermes back to LOCALAPPDATA.
for ($i = 0; $i -lt $args.Count; $i++) {
  if ($args[$i] -in @('-HermesHome', '-InstallDir')) {
    throw "Do not override $($args[$i]); Hermes must be installed under $hermesHome."
  }
}

New-Item -ItemType Directory -Path $hermesHome -Force | Out-Null
$env:HERMES_HOME = $hermesHome
$env:PORTABLE_RUNTIME_DIR = $runtimeRoot
$env:NPM_CONFIG_PREFIX = $npmGlobal

$pathEntries = @($binRoot, $npmGlobal)
$nodeVersions = Join-Path $nodeRoot 'versions'
$nodeDir = Get-ChildItem -LiteralPath $nodeVersions -Directory -ErrorAction SilentlyContinue |
  Sort-Object Name | Select-Object -Last 1
if ($nodeDir) { $pathEntries += $nodeDir.FullName }
$pythonDefault = Join-Path $pythonRoot 'default.txt'
if (Test-Path -LiteralPath $pythonDefault) {
  $pythonVersion = (Get-Content -LiteralPath $pythonDefault -Raw).Trim()
  $portablePython = Join-Path $pythonRoot "versions\$pythonVersion"
  if (Test-Path -LiteralPath (Join-Path $portablePython 'python.exe')) {
    $pathEntries += $portablePython
    $pathEntries += (Join-Path $portablePython 'Scripts')
  }
}
$env:Path = (($pathEntries + @($env:Path)) -join ';')

Write-Host "Portable runtime: $runtimeRoot"
Write-Host "Hermes home: $hermesHome"

# Portable distributions may ship a complete Hermes source tree inside the
# outer USB workspace repository. It is functional, but intentionally has no
# nested .git directory, so the official installer would reject it as a
# non-Hermes checkout. Reuse that bundled installation instead of treating it
# as a failed install.
$bundledSource = Test-Path -LiteralPath (Join-Path $hermesInstallDir 'pyproject.toml') -PathType Leaf
$bundledCli = Test-Path -LiteralPath (Join-Path $hermesInstallDir 'hermes_cli') -PathType Container
$bundledVenv = Test-Path -LiteralPath (Join-Path $hermesInstallDir 'venv\Scripts\hermes.exe') -PathType Leaf
if ($bundledSource -and $bundledCli -and $bundledVenv -and -not (Test-Path -LiteralPath (Join-Path $hermesInstallDir '.git'))) {
  Write-Host 'Hermes Agent bundled checkout detected; reusing the portable installation.' -ForegroundColor Green
  Write-Host "Verified Hermes home: $hermesHome"
  Write-Host "Verified Hermes install: $hermesInstallDir"
  Write-Host ''
  Write-Host 'Hermes Agent portable installation finished.' -ForegroundColor Green
  Write-Host "HERMES_HOME=$hermesHome"
  exit 0
}

$download = Join-Path ([System.IO.Path]::GetTempPath()) ("hermes-install-{0}.ps1" -f ([guid]::NewGuid()))
try {
  Write-Host 'Downloading the official Hermes Agent installer...'
  Invoke-WebRequest -UseBasicParsing -Uri 'https://hermes-agent.nousresearch.com/install.ps1' -OutFile $download

  # Execute the downloaded script as a PowerShell file so its param() block is
  # honored and no `iex` alias is required in the caller's shell.
  # Keep pass-through options, but append the wrapper-owned paths last and only
  # once so the official installer cannot resolve its LOCALAPPDATA defaults.
  $installerArgs = @($args) + @(
    '-HermesHome', $hermesHome,
    '-InstallDir', $hermesInstallDir
  )
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $download @installerArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Official Hermes installer exited with code $LASTEXITCODE."
  }

  $resolvedHome = [System.IO.Path]::GetFullPath($hermesHome).TrimEnd('\', '/')
  $resolvedInstallDir = [System.IO.Path]::GetFullPath($hermesInstallDir).TrimEnd('\', '/')
  if (-not (Test-Path -LiteralPath $resolvedHome -PathType Container)) {
    throw "Hermes installer did not create the portable home: $resolvedHome"
  }
  if (-not (Test-Path -LiteralPath $resolvedInstallDir -PathType Container)) {
    throw "Hermes installer did not create the portable install directory: $resolvedInstallDir"
  }
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $repoState = (& git.exe -C $resolvedInstallDir rev-parse --is-inside-work-tree 2>&1 | Select-Object -Last 1).ToString().Trim()
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($repoState -ne 'true') {
    throw "Hermes installer did not create a valid Git checkout: $resolvedInstallDir"
  }

  Write-Host "Verified Hermes home: $resolvedHome"
  Write-Host "Verified Hermes install: $resolvedInstallDir"
} finally {
  Remove-Item -LiteralPath $download -Force -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host 'Hermes Agent portable installation finished.' -ForegroundColor Green
Write-Host "HERMES_HOME=$hermesHome"
