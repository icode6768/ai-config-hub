@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
:: =============================================================================
:: 在 runtime\windows\bin\ 创建自定位 wrapper 脚本（替代绝对路径快捷方式）
::
:: 核心优势：wrapper 用 %%~dp0 相对路径定位 → 无论复制到哪个盘符都能工作
::   快捷方式: 指向 C:\xxx\node.exe         ❌ 换盘符就断
::   wrapper:  运行时自己找 node 目录        ✅ 永远有效
::
:: 用法: link-node.cmd [指定版本号，如 v24.14.1]
::       不指定版本则自动选最新已安装版本
:: =============================================================================

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
:: 运行时根目录在脚本目录的上一级
for %%I in ("%SCRIPT_DIR%\..") do set "RUNTIME_DIR=%%~fI"
set "VERSIONS_DIR=%RUNTIME_DIR%\node\versions"
set "BIN_DIR=%RUNTIME_DIR%\bin"

if not exist "%VERSIONS_DIR%" (
    echo ❌ Node.js 未安装，请先运行: install-node.cmd
    exit /b 1
)

:: --- 确定目标版本 ---
set "NODE_VERSION=%~1"

if "%NODE_VERSION%"=="" (
    :: 自动选最新版本（按目录名排序取最后一个）
    for /f "delims=" %%d in ('dir /b /ad /o:n "%VERSIONS_DIR%" 2^>nul') do (
        set "NODE_VERSION=%%d"
    )
)

:: 确保以 v 开头
echo %NODE_VERSION% | findstr /b "v" >nul 2>&1
if errorlevel 1 set "NODE_VERSION=v%NODE_VERSION%"

if not exist "%VERSIONS_DIR%\%NODE_VERSION%\node.exe" (
    echo ❌ 找不到版本: %NODE_VERSION%
    echo    已安装:
    for /d %%d in ("%VERSIONS_DIR%\*") do echo       %%~nxd
    exit /b 1
)

mkdir "%BIN_DIR%" 2>nul

echo 🔧 创建自定位 wrapper 脚本（可移植，无绝对路径）
echo    目标版本: %NODE_VERSION%
echo.

:: --- 生成 node.cmd ---
(
    echo @echo off
    echo :: 自定位 wrapper - 无绝对路径，换盘符也能用
    echo set "_R=%%~dp0.."
    echo :: 查找最新 Node 版本
    echo set "_VER="
    echo for /f "delims=" %%%%d in ^('dir /b /ad /o:n "%%_R%%\node\versions" 2^^^>nul'^) do set "_VER=%%%%d"
    echo if not defined _VER ^(echo Node.js not found ^& exit /b 1^)
    echo "%%_R%%\node\versions\%%_VER%%\node.exe" %%*
    echo exit /b %%errorlevel%%
) > "%BIN_DIR%\node.cmd"
echo    ✅ node.cmd

:: --- 生成 npm.cmd ---
(
    echo @echo off
    echo set "_R=%%~dp0.."
    echo set "_VER="
    echo for /f "delims=" %%%%d in ^('dir /b /ad /o:n "%%_R%%\node\versions" 2^^^>nul'^) do set "_VER=%%%%d"
    echo if not defined _VER ^(echo Node.js not found ^& exit /b 1^)
    echo "%%_R%%\node\versions\%%_VER%%\npm.cmd" %%*
    echo exit /b %%errorlevel%%
) > "%BIN_DIR%\npm.cmd"
echo    ✅ npm.cmd

:: --- 生成 npx.cmd ---
(
    echo @echo off
    echo set "_R=%%~dp0.."
    echo set "_VER="
    echo for /f "delims=" %%%%d in ^('dir /b /ad /o:n "%%_R%%\node\versions" 2^^^>nul'^) do set "_VER=%%%%d"
    echo if not defined _VER ^(echo Node.js not found ^& exit /b 1^)
    echo "%%_R%%\node\versions\%%_VER%%\npx.cmd" %%*
    echo exit /b %%errorlevel%%
) > "%BIN_DIR%\npx.cmd"
echo    ✅ npx.cmd

:: --- 生成 corepack.cmd ---
(
    echo @echo off
    echo set "_R=%%~dp0.."
    echo set "_VER="
    echo for /f "delims=" %%%%d in ^('dir /b /ad /o:n "%%_R%%\node\versions" 2^^^>nul'^) do set "_VER=%%%%d"
    echo if not defined _VER ^(echo Node.js not found ^& exit /b 1^)
    echo "%%_R%%\node\versions\%%_VER%%\corepack.cmd" %%*
    echo exit /b %%errorlevel%%
) > "%BIN_DIR%\corepack.cmd"
echo    ✅ corepack.cmd

echo.
echo ✅ 完成！wrapper 脚本使用相对路径，U盘移动后仍然有效。
echo.
echo 验证:
echo   set "PATH=%BIN_DIR%;%%PATH%%"
echo   node -v

endlocal
