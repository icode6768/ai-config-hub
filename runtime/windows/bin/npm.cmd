@echo off
set "_R=%~dp0.."
set "_VER="
for /f "delims=" %%d in ('dir /b /ad /o:n "%_R%\node\versions" 2^>nul') do set "_VER=%%d"
if not defined _VER (echo Node.js not found & exit /b 1)
"%_R%\node\versions\%_VER%\npm.cmd" %*
exit /b %errorlevel%
