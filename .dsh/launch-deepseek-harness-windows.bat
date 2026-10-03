@echo off
setlocal
title DeepSeek Harness Web

set "DSH_HOME=%~dp0"
set "DSH_WEB_PORT=3080"
set "PROJECT_DIR=%~dp0deepseek-harness"
set "LAUNCHER=%PROJECT_DIR%\apps\cli\lib\bin.js"
set "NODE_EXE="
for /d %%D in ("%~dp0..\runtime\windows\node\versions\*") do if exist "%%~fD\node.exe" set "NODE_EXE=%%~fD\node.exe"
if not defined NODE_EXE (
  echo [ERROR] Portable Windows Node.js not found.
  exit /b 1
)
for %%N in ("%NODE_EXE%") do set "PATH=%%~dpN;%~dp0..\runtime\windows\npm-global;%PATH%"

echo.
echo Starting DeepSeek Harness Web...
echo Project: "%PROJECT_DIR%"
echo Waiting for the Web URL. The browser will open automatically.
echo.

if not exist "%LAUNCHER%" (
  echo [ERROR] DeepSeek Harness launcher not found:
  echo         "%LAUNCHER%"
  echo Place this file beside the deepseek-harness folder.
  pause
  exit /b 1
)

cd /d "%PROJECT_DIR%"
if not exist "%PROJECT_DIR%\node_modules\@deepseek-ai\dsh-app-boot\package.json" (
  echo [DeepSeek Harness] Dependencies missing; installing...
  where pnpm >nul 2>&1
  if not errorlevel 1 (
    pnpm install
  ) else (
    "%NODE_EXE%" "%~dp0..\runtime\windows\node\node_modules\npm\bin\npm-cli.js" install
  )
  if errorlevel 1 (
    echo [ERROR] Failed to install DeepSeek Harness dependencies.
    pause
    exit /b 1
  )
)
"%NODE_EXE%" "%LAUNCHER%" web --port "%DSH_WEB_PORT%" %*
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if "%EXIT_CODE%"=="0" (
  echo DeepSeek Harness Web stopped.
) else (
  echo [ERROR] DeepSeek Harness Web exited with code %EXIT_CODE%.
  if not defined DC_PANEL_AUTOSTART pause
)
endlocal & exit /b %EXIT_CODE%
