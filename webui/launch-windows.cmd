@echo off
setlocal

cd /d "%~dp0"
if not exist "node_modules" npm install --no-audit --no-fund
if errorlevel 1 exit /b 1
if not exist "dist\index.html" npm run build
if errorlevel 1 exit /b 1
npm run dev

endlocal
