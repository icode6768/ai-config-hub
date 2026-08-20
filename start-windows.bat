@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "WEBUI_DIR=%ROOT_DIR%\webui"
set "USB_LOBSTER_ROOT=%ROOT_DIR%"
set "PORT=8787"
set "NO_OPEN_BROWSER=0"
set "DSH_HOME=%ROOT_DIR%\.dsh"
if not exist "%DSH_HOME%" mkdir "%DSH_HOME%"
set "HERMES_HOME=%ROOT_DIR%\.hermes"
if not exist "%HERMES_HOME%" mkdir "%HERMES_HOME%"
set DC_PANEL_START_COMMAND=call "%WEBUI_DIR%\launch-windows.cmd"

call "%ROOT_DIR%\runtime\windows\scripts\start-env.cmd"

endlocal
