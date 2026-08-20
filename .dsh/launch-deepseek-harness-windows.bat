@echo off
setlocal
title DeepSeek Harness Web

set "DSH_HOME=%~dp0"
set "DSH_WEB_PORT=3080"
set "PROJECT_DIR=%~dp0deepseek-harness"
set "LAUNCHER=%PROJECT_DIR%\scripts\launch-dsh-web.ps1"

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

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%LAUNCHER%" %*
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if "%EXIT_CODE%"=="0" (
  echo DeepSeek Harness Web stopped.
) else (
  echo [ERROR] DeepSeek Harness Web exited with code %EXIT_CODE%.
  if not defined DC_PANEL_AUTOSTART pause
)
endlocal & exit /b %EXIT_CODE%
