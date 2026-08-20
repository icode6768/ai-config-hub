@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
rem =============================================================================
rem Patch OpenClaw ESM path issues on Windows.
rem
rem Problem: jiti may call import with Windows absolute paths, but Node.js
rem ESM requires file:// URLs and raises ERR_UNSUPPORTED_ESM_URL_SCHEME.
rem
rem This script patches five compatibility issues:
rem   1. jiti/lib/jiti.mjs - nativeImport
rem   2. jiti/lib/jiti-native.mjs - import(resolved)
rem   3. @mariozechner/jiti - same two imports
rem   4. openclaw/dist/loader-*.js - createJiti wrapper
rem   5. openclaw/dist/*.js - invalid https-proxy-agent/index.js deep import
rem =============================================================================

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
rem Runtime root is one level above this scripts directory.
for %%I in ("%SCRIPT_DIR%\..") do set "RUNTIME_DIR=%%~fI"
set "OC_BASE=%RUNTIME_DIR%\npm-global\node_modules\openclaw"

echo.
echo === Patching OpenClaw ESM Windows path issues ===
echo.

if not exist "%OC_BASE%" (
    echo [SKIP] OpenClaw is not installed yet
    exit /b 0
)

set "PATCHED=0"

rem --- 1. Patch jiti/lib/jiti.mjs ---
call :patch_jiti_mjs "%OC_BASE%\node_modules\jiti\lib\jiti.mjs"

rem --- 2. Patch jiti/lib/jiti-native.mjs ---
call :patch_jiti_native "%OC_BASE%\node_modules\jiti\lib\jiti-native.mjs"

rem --- 3. Patch @mariozechner/jiti ---
call :patch_jiti_mjs "%OC_BASE%\node_modules\@mariozechner\jiti\lib\jiti.mjs"
call :patch_jiti_native "%OC_BASE%\node_modules\@mariozechner\jiti\lib\jiti-native.mjs"

rem --- 4. Patch loader ---
call :patch_loader

rem --- 5. Patch https-proxy-agent deep import ---
call :patch_https_proxy_agent

echo.
if !PATCHED! GTR 0 (
    echo [OK] Patched !PATCHED! item(s)
) else (
    echo [OK] All files are already compatible
)
echo.

endlocal
exit /b 0

rem =============================================================================
rem Subroutine: patch nativeImport in jiti.mjs.
rem =============================================================================
:patch_jiti_mjs
set "_file=%~1"
if not exist "%_file%" (
    echo [SKIP] %_file% does not exist
    exit /b 0
)
findstr /c:"pathToFileURL" "%_file%" >nul 2>&1
if not errorlevel 1 (
    echo [OK] %_file% is already patched
    exit /b 0
)
echo [PATCH] %_file%

powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=[IO.File]::ReadAllText('%_file%'); $f=$f.Replace('const nativeImport = (id) => import(id);', 'import { pathToFileURL } from \"node:url\";' + [char]10 + 'const nativeImport = (id) => { if (process.platform===\"win32\" && typeof id===\"string\" && /^[a-zA-Z]:[\\\\\/]/.test(id)) { return import(pathToFileURL(id).href); } return import(id); };'); [IO.File]::WriteAllText('%_file%', $f, [Text.UTF8Encoding]::new($false))"

if not errorlevel 1 set /a PATCHED+=1
exit /b 0

rem =============================================================================
rem Subroutine: patch invalid https-proxy-agent/index.js deep imports.
rem =============================================================================
:patch_https_proxy_agent
if not exist "%OC_BASE%\dist" (
    echo [SKIP] OpenClaw dist directory was not found
    exit /b 0
)
findstr /m /c:"https-proxy-agent/index.js" "%OC_BASE%\dist\*.js" >nul 2>&1
if errorlevel 1 (
    echo [OK] https-proxy-agent imports are already compatible
    exit /b 0
)
echo [PATCH] OpenClaw dist https-proxy-agent imports

powershell -NoProfile -ExecutionPolicy Bypass -Command "$root='%OC_BASE%\dist'; Get-ChildItem -LiteralPath $root -Filter '*.js' -File | ForEach-Object { $f=$_.FullName; $c=[IO.File]::ReadAllText($f); $n=$c.Replace('https-proxy-agent/index.js','https-proxy-agent'); if($n -ne $c){ [IO.File]::WriteAllText($f, $n, [Text.UTF8Encoding]::new($false)) } }"

if errorlevel 1 (
    echo [ERROR] Failed to patch https-proxy-agent deep imports
    exit /b 1
)

findstr /m /c:"https-proxy-agent/index.js" "%OC_BASE%\dist\*.js" >nul 2>&1
if not errorlevel 1 (
    echo [ERROR] https-proxy-agent deep imports still exist
    exit /b 1
)

set /a PATCHED+=1
exit /b 0

rem =============================================================================
rem Subroutine: patch import(resolved) in jiti-native.mjs.
rem =============================================================================
:patch_jiti_native
set "_file=%~1"
if not exist "%_file%" (
    echo [SKIP] %_file% does not exist
    exit /b 0
)
findstr /c:"pathToFileURL" "%_file%" >nul 2>&1
if not errorlevel 1 (
    echo [OK] %_file% is already patched
    exit /b 0
)
echo [PATCH] %_file%

powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=[IO.File]::ReadAllText('%_file%'); $old1='const isDeno = \"Deno\" in globalThis;'; $new1='import { pathToFileURL } from \"node:url\";' + [char]10 + $old1; $f=$f.Replace($old1, $new1); $old2='return await import(resolved, importAttrs);'; $new2='const safeResolved = (process.platform===\"win32\" && typeof resolved===\"string\" && /^[a-zA-Z]:[\\\\\/]/.test(resolved)) ? pathToFileURL(resolved).href : resolved; return await import(safeResolved, importAttrs);'; $f=$f.Replace($old2, $new2); [IO.File]::WriteAllText('%_file%', $f, [Text.UTF8Encoding]::new($false))"

if not errorlevel 1 set /a PATCHED+=1
exit /b 0

rem =============================================================================
rem Subroutine: patch OpenClaw loader files.
rem =============================================================================
:patch_loader
set "_file="
for %%f in ("%OC_BASE%\dist\loader-*.js") do set "_file=%%f"
if not defined _file (
    echo [SKIP] Loader file was not found
    exit /b 0
)
findstr /c:"jitiWinPatched" "%_file%" >nul 2>&1
if not errorlevel 1 (
    echo [OK] %_file% is already patched
    exit /b 0
)
findstr /c:"import { createJiti } from \"jiti\"" "%_file%" >nul 2>&1
if errorlevel 1 (
    echo [SKIP] Loader file format did not match
    exit /b 0
)
echo [PATCH] %_file%

powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=[IO.File]::ReadAllText('%_file%'); $old='import { createJiti } from \"jiti\";'; $new=$old.Replace('import { createJiti }','import { createJiti as _origCreateJiti }') + [char]10 + 'import { pathToFileURL } from \"node:url\";' + [char]10 + 'function createJiti(p,o){const l=_origCreateJiti(p,o);if(process.platform!==\"win32\")return l;return function jitiWinPatched(m){if(typeof m===\"string\"&&/^[a-zA-Z]:[\\\\\/]/.test(m))return l(pathToFileURL(m).href);return l(m)};}'; $f=$f.Replace($old, $new); [IO.File]::WriteAllText('%_file%', $f, [Text.UTF8Encoding]::new($false))"

if not errorlevel 1 set /a PATCHED+=1
exit /b 0
