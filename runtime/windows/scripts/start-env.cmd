@echo off
:: =============================================================================
:: 龙虾面板 · 便携环境启动器
::
:: 双击此文件 → 打开一个已激活环境的 CMD 窗口
:: 也可以右键创建桌面快捷方式，方便使用
:: =============================================================================
title 龙虾面板 - 便携运行环境
chcp 65001 >nul 2>&1

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
:: 运行时根目录在脚本目录的上一级
for %%I in ("%SCRIPT_DIR%\..") do set "RUNTIME_DIR=%%~fI"

:: 切换到运行时目录
cd /d "%RUNTIME_DIR%"

:: 激活环境并保持窗口打开
rem Continue with DC_PANEL_START_COMMAND when provided by the caller.
if not defined DC_PANEL_START_COMMAND goto :activate_only
call "%SCRIPT_DIR%\activate.cmd"
if errorlevel 1 goto :activation_failed
%DC_PANEL_START_COMMAND%
cmd /k
goto :eof

:activate_only
call "%SCRIPT_DIR%\activate.cmd"
if errorlevel 1 goto :activation_failed
cmd /k
goto :eof

:activation_failed
echo [启动失败] 无法激活便携运行环境。
cmd /k
