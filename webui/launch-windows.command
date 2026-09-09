@echo off
setlocal

cd /d "%~dp0"
call "%~dp0launch-windows.cmd"
set "LAUNCH_EXIT=%ERRORLEVEL%"
endlocal & exit /b %LAUNCH_EXIT%
