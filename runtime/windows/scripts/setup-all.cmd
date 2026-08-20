@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
:: =============================================================================
:: 一键安装所有运行时组件 (Windows 便携版)
:: 用法: setup-all.cmd
:: =============================================================================

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
:: 运行时根目录在脚本目录的上一级
for %%I in ("%SCRIPT_DIR%\..") do set "RUNTIME_DIR=%%~fI"

echo ╔══════════════════════════════════════════════════╗
echo ║     龙虾面板 · Windows 便携运行时 一键安装       ║
echo ║     目标目录: %RUNTIME_DIR%
echo ╚══════════════════════════════════════════════════╝
echo.
echo 将安装以下组件:
echo   1. Node.js v24 (LTS)
echo   2. Python 3.11.9 + 3.12.3
echo   3. 全局包 (pnpm, yarn)
echo   4. 可移植 wrapper 脚本
echo.

:: 确认
set /p "confirm=确认安装到上述目录？[y/N] "
if /i not "%confirm%"=="y" (
    echo 已取消
    exit /b 0
)

echo.

:: --- 检查 PowerShell ---
where powershell >nul 2>&1
if errorlevel 1 (
    echo ❌ 未找到 PowerShell，此脚本需要 PowerShell 来下载文件。
    echo    Windows 10/11 自带 PowerShell，请检查系统环境。
    exit /b 1
)

:: 创建目录结构
mkdir "%RUNTIME_DIR%\node" 2>nul
mkdir "%RUNTIME_DIR%\python" 2>nul
mkdir "%RUNTIME_DIR%\bin" 2>nul
mkdir "%RUNTIME_DIR%\npm-global" 2>nul

:: Step 1: Node.js
echo ━━━ Step 1/3: 安装 Node.js (v24 LTS) ━━━
call "%SCRIPT_DIR%\install-node.cmd" 24
if errorlevel 1 (
    echo ⚠️  Node.js 安装可能不完整，继续安装其他组件...
)
echo.

:: Step 2: Python
echo ━━━ Step 2/3: 安装 Python 3.11.9  ━━━
call "%SCRIPT_DIR%\install-python.cmd" 3.11.9
if errorlevel 1 (
    echo ⚠️  Python 安装可能不完整，继续...
)
echo.

:: Step 3: 创建 wrapper 脚本
echo ━━━ Step 3/3: 创建 runtime\windows\bin\ 可移植 wrapper ━━━
call "%SCRIPT_DIR%\link-node.cmd"
echo.

echo ╔══════════════════════════════════════════════════╗
echo ║     ✅ 所有组件安装完成！                        ║
echo ╚══════════════════════════════════════════════════╝
echo.
echo 验证安装:
echo   "%SCRIPT_DIR%\check.cmd"
echo.
echo 使用方法:
echo   call "%SCRIPT_DIR%\activate.cmd"
echo.
echo 之后每次打开 CMD，运行上述命令激活环境即可。
echo 也可以创建一个快捷方式来自动激活环境。
echo.

:: 自动运行检查
echo ━━━ 运行安装检查 ━━━
call "%SCRIPT_DIR%\check.cmd"

endlocal
