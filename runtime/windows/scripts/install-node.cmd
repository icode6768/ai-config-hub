@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
:: =============================================================================
:: 安装 Node.js (便携版) 到当前 runtime 目录
:: 用法: install-node.cmd [node主版本号，默认 24]
::       install-node.cmd 24
::       install-node.cmd 22
::       install-node.cmd 24.14.1   （指定完整版本号）
:: =============================================================================

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
:: 运行时根目录在脚本目录的上一级
for %%I in ("%SCRIPT_DIR%\..") do set "RUNTIME_DIR=%%~fI"
set "NODE_BASE=%RUNTIME_DIR%\node"
set "VERSIONS_DIR=%NODE_BASE%\versions"
set "TEMP_DIR=%RUNTIME_DIR%\temp"

set "REQUESTED=%~1"
if "%REQUESTED%"=="" set "REQUESTED=24"

echo.
echo === 安装 Node.js v%REQUESTED% 到: %NODE_BASE% ===
echo.

:: --- 检查 PowerShell ---
where powershell >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 未找到 PowerShell，无法下载文件。
    exit /b 1
)

mkdir "%TEMP_DIR%" 2>nul
mkdir "%VERSIONS_DIR%" 2>nul

:: --- 解析版本号 ---
echo [INFO] 查询 Node.js 最新版本...

:: 判断是否为完整版本号（如 24.14.1 包含两个点）
set "IS_FULL=0"
for /f "tokens=1,2,3 delims=." %%a in ("%REQUESTED%") do (
    if not "%%c"=="" set "IS_FULL=1"
)

if "%IS_FULL%"=="1" (
    set "NODE_VERSION=v%REQUESTED%"
    goto :version_resolved
)

:: 只有主版本号，查询 nodejs.org
set "PS_QUERY=$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $j=Invoke-RestMethod 'https://nodejs.org/dist/index.json'; $m=$j|Where-Object{$_.version -match '^v%REQUESTED%\.'}|Select-Object -First 1; if($m){$m.version}else{exit 1}"

for /f "delims=" %%v in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "%PS_QUERY%" 2^>nul') do set "NODE_VERSION=%%v"

if not defined NODE_VERSION (
    echo [ERROR] 无法找到 Node.js v%REQUESTED% 系列版本
    echo         请检查网络连接或指定有效版本号
    exit /b 1
)

:version_resolved
echo [INFO] 找到版本: %NODE_VERSION%
echo.

:: --- 检查是否已安装 ---
if exist "%VERSIONS_DIR%\%NODE_VERSION%\node.exe" (
    echo [OK] Node.js %NODE_VERSION% 已安装，跳过下载
    goto :install_globals
)

:: --- 下载 ---
set "ZIP_NAME=node-%NODE_VERSION%-win-x64.zip"
set "DOWNLOAD_URL=https://nodejs.org/dist/%NODE_VERSION%/%ZIP_NAME%"

echo [INFO] 正在下载 %ZIP_NAME%...
echo        URL: %DOWNLOAD_URL%

set "PS_DL=$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%DOWNLOAD_URL%' -OutFile '%TEMP_DIR%\%ZIP_NAME%' -UseBasicParsing"
powershell -NoProfile -ExecutionPolicy Bypass -Command "%PS_DL%"

if errorlevel 1 (
    echo [ERROR] 下载失败，请检查网络连接
    exit /b 1
)

echo [OK] 下载完成
echo.

:: --- 解压 ---
echo [INFO] 正在解压...

powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%TEMP_DIR%\%ZIP_NAME%' -DestinationPath '%TEMP_DIR%' -Force"

if errorlevel 1 (
    echo [ERROR] 解压失败
    exit /b 1
)

:: 移动到 versions 目录
set "EXTRACTED_DIR=%TEMP_DIR%\node-%NODE_VERSION%-win-x64"
if not exist "%EXTRACTED_DIR%" (
    echo [ERROR] 解压后未找到预期目录: %EXTRACTED_DIR%
    exit /b 1
)

if exist "%VERSIONS_DIR%\%NODE_VERSION%" rd /s /q "%VERSIONS_DIR%\%NODE_VERSION%"
move "%EXTRACTED_DIR%" "%VERSIONS_DIR%\%NODE_VERSION%" >nul

:: 清理临时文件
del /q "%TEMP_DIR%\%ZIP_NAME%" 2>nul

echo [OK] 解压完成: %VERSIONS_DIR%\%NODE_VERSION%
echo.

:install_globals
:: --- 生成 wrapper 脚本 ---
echo [INFO] 生成 bin\ wrapper 脚本...
call "%SCRIPT_DIR%\link-node.cmd" "%NODE_VERSION%"
echo.

if /i "%RUNTIME_LITE%"=="1" (
    echo [INFO] 轻量模式：跳过 pnpm 和 yarn。
    goto :install_done
)

:: --- 安装常用全局包 ---
echo [INFO] 安装全局包 (pnpm, yarn)...

set "NODE_BIN=%VERSIONS_DIR%\%NODE_VERSION%"
set "NPM_GLOBAL=%RUNTIME_DIR%\npm-global"
mkdir "%NPM_GLOBAL%" 2>nul

set "PATH=%NPM_GLOBAL%;%NODE_BIN%;%PATH%"
set "NPM_CONFIG_PREFIX=%NPM_GLOBAL%"

"%NODE_BIN%\npm.cmd" install -g pnpm yarn --silent 2>nul
if errorlevel 1 (
    echo [WARN] 全局包安装可能不完整，可稍后手动安装
) else (
    echo [OK] pnpm, yarn 已安装
)
echo.

:install_done

echo === Node.js %NODE_VERSION% 安装完成！ ===
echo     激活环境: call "%SCRIPT_DIR%\activate.cmd"
echo     运行时目录: %RUNTIME_DIR%

:: 清理临时目录
rd /s /q "%TEMP_DIR%" 2>nul

endlocal
