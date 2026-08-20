@echo off
chcp 65001 >nul 2>&1
:: =============================================================================
:: U盘/移动硬盘 挂载助手
:: 插入设备后，无论挂载到哪个盘符，此脚本都能自动定位并激活环境。
::
:: 使用方法:
::   方法1: 双击此文件
::   方法2: 在 CMD 中运行: call X:\龙虾面板\runtime\mount-helper.cmd
::   方法3: 创建桌面快捷方式指向此文件
:: =============================================================================

:: 自动定位此文件所在目录
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
:: 运行时根目录在脚本目录的上一级
for %%I in ("%SCRIPT_DIR%\..") do set "RUNTIME_DIR=%%~fI"

echo.
echo 📍 找到运行时目录: %RUNTIME_DIR%
echo.

:: 激活环境
call "%SCRIPT_DIR%\activate.cmd"

:: 保持窗口打开（如果是双击启动的）
echo.
echo 环境已激活，可以开始使用。输入 exit 退出。
echo.
cmd /k
