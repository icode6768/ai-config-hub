@echo off
setlocal
title USB Lobster - Install Hermes Agent

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

where powershell.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Windows PowerShell is required to install Hermes Agent.
  pause
  exit /b 1
)

call "%SCRIPT_DIR%\activate.cmd"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%\install-hermes.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] Hermes Agent installation failed with code %EXIT_CODE%.
  pause
)
endlocal & exit /b %EXIT_CODE%
