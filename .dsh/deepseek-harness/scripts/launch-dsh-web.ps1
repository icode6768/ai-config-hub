$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$dshHome = Split-Path -Parent $root
$env:DSH_HOME = $dshHome
$runtimeRoot = [System.IO.Path]::GetFullPath((Join-Path $root '..\..\runtime'))
$cliEntry = Join-Path $root 'apps/cli/lib/bin.js'
$webDist = Join-Path $root 'apps/web/dist'
$modulesMarker = Join-Path $root 'node_modules/.modules.yaml'
$pnpmStore = Join-Path $root 'node_modules/.pnpm'
$tsxBin = Join-Path $root 'node_modules/.bin/tsx.cmd'
$logPath = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-web-{0}.log" -f ([guid]::NewGuid()))
$errPath = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-web-{0}.err.log" -f ([guid]::NewGuid()))
$process = $null

function Invoke-Pnpm {
  param([string[]]$Arguments)

  Write-Host ("> pnpm {0}" -f ($Arguments -join ' '))
  & $script:pnpm @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "pnpm $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
  }
}

function Test-FileIsNewer {
  param([string]$Source, [string]$Target)

  return (Test-Path $Source) -and (Test-Path $Target) -and
    ((Get-Item $Source).LastWriteTimeUtc -gt (Get-Item $Target).LastWriteTimeUtc)
}

function Repair-ManagedProfileFallback {
  $fallbackRoot = Join-Path $dshHome 'profiles/node_modules'
  $dshFallback = Join-Path $fallbackRoot '@deepseek-ai/dsh'
  if (-not (Test-Path $dshFallback)) { return }

  $item = Get-Item -Force $dshFallback
  $isReparsePoint = ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
  if (-not $isReparsePoint) {
    Write-Host 'Repairing the extracted profile fallback directory...'
    Remove-Item -LiteralPath $fallbackRoot -Recurse -Force
  }
}

try {
  # A shortcut can be launched without first running runtime/scripts/activate.cmd.
  # Add the newest portable Node installation to this process before resolving pnpm.
  $portableNodeRoot = Join-Path $runtimeRoot 'node/versions'
  if (Test-Path $portableNodeRoot) {
    $portableNode = Get-ChildItem $portableNodeRoot -Directory |
      Where-Object { Test-Path (Join-Path $_.FullName 'node.exe') } |
      Sort-Object Name | Select-Object -Last 1
    if ($portableNode) {
      $portablePaths = @(
        $portableNode.FullName,
        (Join-Path $runtimeRoot 'npm-global'),
        (Join-Path $runtimeRoot 'bin')
      )
      $env:PATH = (($portablePaths + $env:PATH) -join ';')
    }
  }

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is not installed or is not on PATH.' }
  $pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  if (-not $pnpmCommand) { $pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue }
  if (-not $pnpmCommand) { throw 'pnpm is not installed or is not on PATH.' }
  $script:pnpm = $pnpmCommand.Source

  $needsInstall =
    -not (Test-Path $modulesMarker) -or
    -not (Test-Path $pnpmStore) -or
    -not (Test-Path $tsxBin) -or
    (Test-FileIsNewer (Join-Path $root 'package.json') $modulesMarker) -or
    (Test-FileIsNewer (Join-Path $root 'pnpm-lock.yaml') $modulesMarker)
  if ($needsInstall) {
    Write-Host 'Dependencies are missing or stale. Installing them now...'
    Invoke-Pnpm @('install', '--frozen-lockfile')
  } else {
    Write-Host 'Dependencies are already installed.'
  }

  $needsBuild = -not (Test-Path $cliEntry) -or -not (Test-Path (Join-Path $webDist 'index.html'))
  if ($needsBuild) {
    Write-Host 'Build artifacts are missing. Building DeepSeek Harness now...'
    Invoke-Pnpm @('run', 'build')
  } else {
    Write-Host 'Build artifacts are already present.'
  }

  Repair-ManagedProfileFallback

  $arguments = 'dsh web'
  if ($env:DSH_WEB_PORT) { $arguments += " --port $env:DSH_WEB_PORT" }
  $process = Start-Process -FilePath $script:pnpm -ArgumentList $arguments -WorkingDirectory $root -RedirectStandardOutput $logPath -RedirectStandardError $errPath -PassThru -NoNewWindow

  $url = $null
  for ($i = 0; $i -lt 120 -and -not $process.HasExited; $i++) {
    Start-Sleep -Milliseconds 250
    if (Test-Path $logPath) {
      $match = Select-String -Path $logPath -Pattern 'dsh web: (http://[^\s]+)' | Select-Object -Last 1
      if ($match) { $url = $match.Matches[0].Groups[1].Value; break }
    }
  }
  if ($url) { Start-Process $url; Write-Host "DeepSeek Harness Web: $url" }
  if (-not $process.HasExited) {
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
  $process.Refresh()
  Get-Content $logPath -ErrorAction SilentlyContinue
  if (Test-Path $errPath) { Get-Content $errPath }
  if ($process.ExitCode -ne 0) { throw "dsh web exited with code $($process.ExitCode)." }
}
finally {
  if ($process -and -not $process.HasExited) { & taskkill.exe /PID $process.Id /T /F | Out-Null }
  Remove-Item $logPath, $errPath -Force -ErrorAction SilentlyContinue
}
