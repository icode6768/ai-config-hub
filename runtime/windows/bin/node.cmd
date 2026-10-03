@echo off
:: 自定位 wrapper - 无绝对路径，换盘符也能用
set "_R=%~dp0.."
:: 查找最新 Node 版本
set "_VER="
for /f "delims=" %%d in ('dir /b /ad /o:n "%_R%\node\versions" 2^>nul') do set "_VER=%%d"
if not defined _VER (echo Node.js not found & exit /b 1)
"%_R%\node\versions\%_VER%\node.exe" %*
exit /b %errorlevel%
