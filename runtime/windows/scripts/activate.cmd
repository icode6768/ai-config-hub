@echo off
chcp 65001 >nul 2>&1
:: =============================================================================
:: 龙虾面板 · Windows 运行环境激活脚本
:: 用法: call activate.cmd
::
:: 特点: 自定位 — 无论此目录在哪个盘符/路径（本地/U盘/移动硬盘），
::       脚本都能找到自身位置并正确设置所有环境变量。
::
:: 注意: 必须用 call 而不是直接运行，否则环境变量不会保留到调用者。
:: =============================================================================

:: --- 获取脚本自身所在目录（自定位核心）---
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
:: 运行时根目录在脚本目录的上一级（scripts/ 是子目录）
for %%I in ("%SCRIPT_DIR%\..") do set "PORTABLE_RUNTIME_DIR=%%~fI"

:: --- 路径定义 ---
set "NODE_BASE=%PORTABLE_RUNTIME_DIR%\node"
set "PYTHON_BASE=%PORTABLE_RUNTIME_DIR%\python"
set "NPM_GLOBAL_DIR=%PORTABLE_RUNTIME_DIR%\npm-global"
set "BIN_DIR=%PORTABLE_RUNTIME_DIR%\bin"

:: --- npm 全局安装目录重定向到 runtime ---
set "NPM_CONFIG_PREFIX=%NPM_GLOBAL_DIR%"
if not exist "%NPM_GLOBAL_DIR%" mkdir "%NPM_GLOBAL_DIR%" 2>nul

:: --- 查找 Node.js 版本 ---
set "NODE_VER="
set "NODE_DIR="
if exist "%NODE_BASE%\versions" (
    for /f "delims=" %%d in ('dir /b /ad /o:n "%NODE_BASE%\versions" 2^>nul') do set "NODE_VER=%%d"
)
if defined NODE_VER set "NODE_DIR=%NODE_BASE%\versions\%NODE_VER%"

:: --- 查找 Python 默认版本 ---
set "PY_VER="
set "PY_DIR="
if exist "%PYTHON_BASE%\default.txt" (
    for /f "usebackq tokens=* delims= " %%a in ("%PYTHON_BASE%\default.txt") do set "PY_VER=%%a"
)
if defined PY_VER (
    if exist "%PYTHON_BASE%\versions\%PY_VER%" set "PY_DIR=%PYTHON_BASE%\versions\%PY_VER%"
)

:: --- 构建 PATH ---
:: 优先级: node.exe真实目录 > npm-global > bin wrappers > python.exe > Scripts > 原PATH
::   - node.exe 必须排最前，pnpm/yarn 等需直接找到 node.exe（不能经过 wrapper）
::   - bin/ 排在 Scripts/ 前面，因为 bin/pip.cmd 用 python -m pip（可移植），
::     而 Scripts/pip.exe 内有安装时硬编码的绝对路径，复制到U盘后会失效
set "NEW_PATH="

if defined NODE_DIR set "NEW_PATH=%NODE_DIR%"

if defined NEW_PATH (set "NEW_PATH=%NEW_PATH%;%NPM_GLOBAL_DIR%") else (set "NEW_PATH=%NPM_GLOBAL_DIR%")

if defined PY_DIR set "NEW_PATH=%NEW_PATH%;%PY_DIR%"

set "NEW_PATH=%NEW_PATH%;%BIN_DIR%"

if defined PY_DIR set "NEW_PATH=%NEW_PATH%;%PY_DIR%\Scripts"

set "PATH=%NEW_PATH%;%PATH%"

:: Read the portable project's API key after Node is available. The key is kept
:: in the process environment only and is never printed by this script.
set "DONGCHUANGAI_KEY="
set "DONGCHUANGAI_API_KEY="
for %%I in ("%PORTABLE_RUNTIME_DIR%\..\..") do set "USB_LOBSTER_ROOT=%%~fI"
if defined NODE_DIR if exist "%USB_LOBSTER_ROOT%\config.yaml" if exist "%USB_LOBSTER_ROOT%\webui\node_modules\yaml" (
  for /f "delims=" %%K in ('node -e "const fs=require('fs');const YAML=require(process.argv[1]);const c=YAML.parse(fs.readFileSync(process.argv[2],'utf8'));process.stdout.write(String(c.global?.api?.apiKey??''))" "%USB_LOBSTER_ROOT%\webui\node_modules\yaml" "%USB_LOBSTER_ROOT%\config.yaml"') do set "DONGCHUANGAI_API_KEY=%%K"
)

:: --- 状态报告 ---
echo.
echo ======================================================
echo   龙虾面板运行环境已激活
echo ======================================================
echo.
echo    运行时根目录: %PORTABLE_RUNTIME_DIR%
echo.

:: 打印版本信息
call :print_ver "node"
call :print_ver "npm"
call :print_ver "pnpm"
call :print_ver "python"
call :print_ver "pip"

echo.
goto :eof

:: --- 子程序: 打印版本 ---
:: 注意: 不使用 if (...) 块包裹 echo，避免输出中的 ) 字符破坏 CMD 语法
:print_ver
set "_pv_cmd=%~1"
set "_pv_result="
for /f "delims=" %%v in ('%_pv_cmd% --version 2^>nul') do if not defined _pv_result set "_pv_result=%%v"
if not defined _pv_result goto :_pv_na
echo    %_pv_cmd%:	%_pv_result%
goto :eof
:_pv_na
echo    %_pv_cmd%:	(未安装)
goto :eof
