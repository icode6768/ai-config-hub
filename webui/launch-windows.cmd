@echo off
setlocal

cd /d "%~dp0"
node "%~dp0scripts\launch-portable.mjs"
set "LAUNCH_EXIT=%ERRORLEVEL%"
endlocal & exit /b %LAUNCH_EXIT%
