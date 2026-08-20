@echo off
chcp 65001 >nul 2>&1
setlocal

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
for %%I in ("%SCRIPT_DIR%\..") do set "CURRENT_RUNTIME_DIR=%%~fI"

set "DRY_RUN=0"
if /i "%~1"=="--dry-run" (
    set "DRY_RUN=1"
    shift
)

if not "%~1"=="" (
    echo Usage: setup-lite.cmd [--dry-run]
    exit /b 2
)

set "TARGET_DIR=%CURRENT_RUNTIME_DIR%"

echo Target: %TARGET_DIR%
echo Includes: Node.js 24, npm, Python 3.11.9, pip
echo Excluded: pnpm, yarn, virtualenv, OpenClaw, Codex, Claude Code

if "%DRY_RUN%"=="1" exit /b 0

if exist "%TARGET_DIR%\npm-global\node_modules" (
    echo [ERROR] Target already contains global npm packages. Choose an empty or existing lite-runtime directory.
    exit /b 4
)

where powershell >nul 2>&1
if errorlevel 1 (
    echo [ERROR] PowerShell is required to download Node.js and Python.
    exit /b 5
)

mkdir "%TARGET_DIR%\bin" 2>nul
mkdir "%TARGET_DIR%\npm-global" 2>nul

set "RUNTIME_LITE=1"
call "%TARGET_DIR%\scripts\install-node.cmd" 24
if errorlevel 1 exit /b 7

call "%TARGET_DIR%\scripts\install-python.cmd" 3.11.9
if errorlevel 1 exit /b 8

call "%TARGET_DIR%\scripts\activate.cmd" >nul 2>&1
node --version >nul 2>&1 || exit /b 9
npm --version >nul 2>&1 || exit /b 10
python --version >nul 2>&1 || exit /b 11
python -m pip --version >nul 2>&1 || exit /b 12

for %%C in (pnpm yarn openclaw codex claude) do (
    if exist "%TARGET_DIR%\npm-global\%%C.cmd" (
        echo [ERROR] Unexpected command found in lite runtime: %%C
        exit /b 13
    )
)

echo.
echo Lite runtime created successfully.
echo Activate with: call "%TARGET_DIR%\scripts\activate.cmd"
exit /b 0
