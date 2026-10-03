@echo off
set "_R=%~dp0.."
set /p _PY_VER=<"%_R%\python\default.txt"
for /f "tokens=* delims= " %%a in ("%_PY_VER%") do set "_PY_VER=%%a"
"%_R%\python\versions\%_PY_VER%\python.exe" %*
exit /b %errorlevel%
