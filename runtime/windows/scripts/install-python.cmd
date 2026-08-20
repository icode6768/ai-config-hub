@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
:: =============================================================================
:: 安装 Python (便携版/嵌入式) 到当前 runtime 目录
:: 用法: install-python.cmd [python版本，默认 3.11.9]
::       install-python.cmd 3.12.3
::       install-python.cmd 3.11.9 3.12.3   （同时安装多个版本）
:: =============================================================================

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
:: 运行时根目录在脚本目录的上一级
for %%I in ("%SCRIPT_DIR%\..") do set "RUNTIME_DIR=%%~fI"
set "PYTHON_BASE=%RUNTIME_DIR%\python"
set "VERSIONS_DIR=%PYTHON_BASE%\versions"
set "TEMP_DIR=%RUNTIME_DIR%\temp"

:: 收集版本参数
set "PY_COUNT=0"
set "FIRST_VERSION="

if "%~1"=="" (
    set "PY_VERSIONS[0]=3.11.9"
    set "FIRST_VERSION=3.11.9"
    set "PY_COUNT=1"
) else (
    :parse_args
    if "%~1"=="" goto :args_done
    set "PY_VERSIONS[!PY_COUNT!]=%~1"
    if "!FIRST_VERSION!"=="" set "FIRST_VERSION=%~1"
    set /a PY_COUNT+=1
    shift
    goto :parse_args
)
:args_done

echo.
echo === 安装 Python 到: %PYTHON_BASE% ===
echo.

:: --- 检查 PowerShell ---
where powershell >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 未找到 PowerShell，无法下载文件。
    exit /b 1
)

mkdir "%VERSIONS_DIR%" 2>nul
mkdir "%TEMP_DIR%" 2>nul

:: --- 下载 get-pip.py （只下一次）---
if not exist "%TEMP_DIR%\get-pip.py" (
    echo [INFO] 下载 get-pip.py...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile '%TEMP_DIR%\get-pip.py' -UseBasicParsing"
    if errorlevel 1 (
        echo [ERROR] 下载 get-pip.py 失败
        exit /b 1
    )
    echo [OK] get-pip.py 下载完成
    echo.
)

:: --- 逐个安装 Python 版本 ---
set "IDX=0"
:install_loop
if !IDX! GEQ !PY_COUNT! goto :install_done

set "PY_VERSION=!PY_VERSIONS[%IDX%]!"
set "PY_DIR=%VERSIONS_DIR%\!PY_VERSION!"

echo --- 安装 Python !PY_VERSION! ---
echo.

:: 检查是否已安装
if exist "!PY_DIR!\python.exe" (
    echo    [OK] Python !PY_VERSION! 已安装，跳过
    echo.
    set /a IDX+=1
    goto :install_loop
)

:: 计算 ._pth 文件前缀（如 3.11.9 -> python311）
for /f "tokens=1,2 delims=." %%a in ("!PY_VERSION!") do (
    set "PTH_PREFIX=python%%a%%b"
)

:: 下载
set "ZIP_NAME=python-!PY_VERSION!-embed-amd64.zip"
set "DOWNLOAD_URL=https://www.python.org/ftp/python/!PY_VERSION!/!ZIP_NAME!"

echo    [INFO] 下载 !ZIP_NAME!...
echo           URL: !DOWNLOAD_URL!

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '!DOWNLOAD_URL!' -OutFile '%TEMP_DIR%\!ZIP_NAME!' -UseBasicParsing"

if errorlevel 1 (
    echo    [ERROR] 下载失败: !ZIP_NAME!
    set /a IDX+=1
    goto :install_loop
)

echo    [OK] 下载完成
echo.

:: 解压
echo    [INFO] 解压中...
mkdir "!PY_DIR!" 2>nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%TEMP_DIR%\!ZIP_NAME!' -DestinationPath '!PY_DIR!' -Force"

if errorlevel 1 (
    echo    [ERROR] 解压失败
    set /a IDX+=1
    goto :install_loop
)

del /q "%TEMP_DIR%\!ZIP_NAME!" 2>nul
echo    [OK] 解压完成
echo.

:: --- 修改 ._pth 文件以启用 pip 和 site-packages ---
echo    [INFO] 配置 Python 模块搜索路径...

set "PTH_FILE=!PY_DIR!\!PTH_PREFIX!._pth"
if exist "!PTH_FILE!" (
    (
        echo !PTH_PREFIX!.zip
        echo .
        echo Lib\site-packages
        echo.
        echo import site
    ) > "!PTH_FILE!"
    echo    [OK] 已启用 site-packages 和 import site
) else (
    echo    [WARN] 未找到 !PTH_FILE!
)

:: 创建 site-packages 目录
mkdir "!PY_DIR!\Lib\site-packages" 2>nul
echo.

:: --- 安装 pip ---
echo    [INFO] 安装 pip...

"!PY_DIR!\python.exe" "%TEMP_DIR%\get-pip.py" --no-warn-script-location 2>nul
if errorlevel 1 (
    echo    [WARN] pip 安装可能不完整
) else (
    echo    [OK] pip 安装完成
)
echo.

:: --- 安装常用包 ---
if /i "%RUNTIME_LITE%"=="1" (
    echo    [INFO] 轻量模式：保留 pip，跳过 virtualenv。
) else (
    echo    [INFO] 升级 pip 并安装 virtualenv...
    "!PY_DIR!\python.exe" -m pip install --upgrade pip --quiet --no-warn-script-location 2>nul
    "!PY_DIR!\python.exe" -m pip install virtualenv --quiet --no-warn-script-location 2>nul
    echo    [OK] 常用包安装完成
)
echo.

set /a IDX+=1
goto :install_loop

:install_done

:: --- 设置默认版本 ---
echo %FIRST_VERSION%> "%PYTHON_BASE%\default.txt"
echo [OK] 默认 Python 版本: %FIRST_VERSION%
echo.

:: --- 创建 bin wrapper ---
echo [INFO] 创建 Python wrapper 脚本...
call :create_python_wrappers
echo.

:: --- 清理 ---
del /q "%TEMP_DIR%\get-pip.py" 2>nul
rd /s /q "%TEMP_DIR%" 2>nul

:: --- 结果汇总 ---
echo === Python 安装完成！ ===
echo.
echo 已安装的 Python 版本:
for /d %%d in ("%VERSIONS_DIR%\*") do (
    if exist "%%d\python.exe" (
        for /f "delims=" %%v in ('"%%d\python.exe" --version 2^>^&1') do echo    %%v
    )
)
echo.
echo 激活环境: call "%SCRIPT_DIR%\activate.cmd"

endlocal
exit /b 0

:: =============================================================================
:: 子程序: 创建 Python wrapper 脚本
:: =============================================================================
:create_python_wrappers
set "BIN_DIR=%RUNTIME_DIR%\bin"
mkdir "%BIN_DIR%" 2>nul

:: python.cmd wrapper — 使用 %%~dp0 自定位
(
    echo @echo off
    echo set "_R=%%~dp0.."
    echo set /p _PY_VER=^<"%%_R%%\python\default.txt"
    echo for /f "tokens=* delims= " %%%%a in ^("%%_PY_VER%%"^) do set "_PY_VER=%%%%a"
    echo "%%_R%%\python\versions\%%_PY_VER%%\python.exe" %%*
    echo exit /b %%errorlevel%%
) > "%BIN_DIR%\python.cmd"

:: python3.cmd
copy /y "%BIN_DIR%\python.cmd" "%BIN_DIR%\python3.cmd" >nul

:: pip.cmd wrapper
(
    echo @echo off
    echo set "_R=%%~dp0.."
    echo set /p _PY_VER=^<"%%_R%%\python\default.txt"
    echo for /f "tokens=* delims= " %%%%a in ^("%%_PY_VER%%"^) do set "_PY_VER=%%%%a"
    echo "%%_R%%\python\versions\%%_PY_VER%%\python.exe" -m pip %%*
    echo exit /b %%errorlevel%%
) > "%BIN_DIR%\pip.cmd"

:: pip3.cmd
copy /y "%BIN_DIR%\pip.cmd" "%BIN_DIR%\pip3.cmd" >nul

echo    [OK] python.cmd / python3.cmd / pip.cmd / pip3.cmd

exit /b 0
