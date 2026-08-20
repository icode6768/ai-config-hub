@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
:: 检查 npm 全局包是否都在 runtime 目录内

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
:: 运行时根目录在脚本目录的上一级
for %%I in ("%SCRIPT_DIR%\..") do set "RUNTIME_DIR=%%~fI"
set "NPM_GLOBAL_DIR=%RUNTIME_DIR%\npm-global"
set "BIN_DIR=%RUNTIME_DIR%\bin"

:: 激活环境
call "%SCRIPT_DIR%\activate.cmd" >nul 2>&1

echo.
echo === npm 全局前缀 ===
for /f "delims=" %%p in ('npm config get prefix 2^>nul') do echo   %%p
echo.

echo === npm-global 里的所有命令 ===
if exist "%NPM_GLOBAL_DIR%" (
    dir /b "%NPM_GLOBAL_DIR%\*.cmd" 2>nul | findstr /v "^$" >nul 2>&1
    if not errorlevel 1 (
        for %%f in ("%NPM_GLOBAL_DIR%\*.cmd") do echo   %%~nxf
    ) else (
        echo   (无 .cmd 文件^)
    )
) else (
    echo   (目录不存在^)
)
echo.

echo === 全局已安装的包 ===
npm list -g --depth=0 2>nul
echo.

echo === 关键命令路径检查 ===
for %%c in (openclaw clawdhub claude node npm) do (
    set "_path="
    for /f "delims=" %%p in ('where %%c 2^>nul') do (
        if not defined _path set "_path=%%p"
    )
    if defined _path (
        echo !_path! | findstr /i "%RUNTIME_DIR%" >nul 2>&1
        if not errorlevel 1 (
            echo   ✅ %%c	→ !_path!
        ) else (
            echo   ⚠️  %%c	→ !_path! (不在 runtime 目录^)
        )
    ) else (
        echo   ❌ %%c	(未找到^)
    )
    set "_path="
)
echo.

endlocal
