@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
:: =============================================================================
:: 运行时环境检查脚本
:: 用法: check.cmd
:: =============================================================================

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
:: 运行时根目录在脚本目录的上一级
for %%I in ("%SCRIPT_DIR%\..") do set "RUNTIME_DIR=%%~fI"

set "PASS=0"
set "FAIL=0"

echo.
echo ======================================================
echo      龙虾面板 · Windows 运行时环境检查
echo ======================================================
echo.
echo    运行时目录: %RUNTIME_DIR%
echo.

:: --- 先激活环境 ---
call "%SCRIPT_DIR%\activate.cmd" >nul 2>&1

:: ─── 1. 目录结构 ───
echo 【目录结构】
for %%d in (node python bin npm-global) do (
    if exist "%RUNTIME_DIR%\%%d" (
        echo    ✅ %%d\		(存在^)
        set /a PASS+=1
    ) else (
        echo    ❌ %%d\		(目录不存在，尚未安装^)
        set /a FAIL+=1
    )
)
echo.

:: ─── 2. Node.js ───
echo 【Node.js】

:: 检查 node
set "_node_ver="
for /f "delims=" %%v in ('node --version 2^>nul') do set "_node_ver=%%v"
if defined _node_ver (
    echo    ✅ node		%_node_ver%
    set /a PASS+=1
) else (
    echo    ❌ node		未找到，运行 install-node.cmd
    set /a FAIL+=1
)

:: 检查 npm
set "_npm_ver="
for /f "delims=" %%v in ('npm --version 2^>nul') do set "_npm_ver=%%v"
if defined _npm_ver (
    echo    ✅ npm		%_npm_ver%
    set /a PASS+=1
) else (
    echo    ❌ npm		未找到
    set /a FAIL+=1
)

:: 检查 pnpm
set "_pnpm_ver="
for /f "delims=" %%v in ('pnpm --version 2^>nul') do set "_pnpm_ver=%%v"
if defined _pnpm_ver (
    echo    ✅ pnpm		%_pnpm_ver%
    set /a PASS+=1
) else (
    echo    ❌ pnpm		未找到，运行: npm install -g pnpm
    set /a FAIL+=1
)

:: 路径隔离检查
set "_node_path="
for /f "delims=" %%p in ('where node 2^>nul') do (
    if not defined _node_path set "_node_path=%%p"
)
if defined _node_path (
    echo !_node_path! | findstr /i "%RUNTIME_DIR:\=/%" >nul 2>&1
    if not errorlevel 1 (
        echo    ✅ node 路径隔离	%_node_path%
        set /a PASS+=1
    ) else (
        echo !_node_path! | findstr /i "%RUNTIME_DIR%" >nul 2>&1
        if not errorlevel 1 (
            echo    ✅ node 路径隔离	%_node_path%
            set /a PASS+=1
        ) else (
            echo    ⚠️  node 来自系统	%_node_path%
        )
    )
)
echo.

:: ─── 3. Python ───
echo 【Python】

:: 检查 python
set "_py_ver="
for /f "delims=" %%v in ('python --version 2^>nul') do set "_py_ver=%%v"
if defined _py_ver (
    echo    ✅ python		%_py_ver%
    set /a PASS+=1
) else (
    echo    ❌ python		未找到，运行 install-python.cmd
    set /a FAIL+=1
)

:: 检查 pip
set "_pip_ver="
for /f "delims=" %%v in ('pip --version 2^>nul') do set "_pip_ver=%%v"
if defined _pip_ver (
    echo    ✅ pip		(可用^)
    set /a PASS+=1
) else (
    echo    ❌ pip		未找到
    set /a FAIL+=1
)

:: 路径隔离检查
set "_py_path="
for /f "delims=" %%p in ('where python 2^>nul') do (
    if not defined _py_path set "_py_path=%%p"
)
if defined _py_path (
    echo !_py_path! | findstr /i "%RUNTIME_DIR:\=/%" >nul 2>&1
    if not errorlevel 1 (
        echo    ✅ python 路径隔离	%_py_path%
        set /a PASS+=1
    ) else (
        echo !_py_path! | findstr /i "%RUNTIME_DIR%" >nul 2>&1
        if not errorlevel 1 (
            echo    ✅ python 路径隔离	%_py_path%
            set /a PASS+=1
        ) else (
            echo    ⚠️  python 来自系统	%_py_path%
        )
    )
)

:: 列出已安装的 Python 版本
if exist "%RUNTIME_DIR%\python\versions" (
    echo.
    echo    已安装 Python 版本:
    for /d %%d in ("%RUNTIME_DIR%\python\versions\*") do (
        echo       %%~nxd
    )
)
echo.

:: ─── 4. 功能验证 ───
echo 【功能验证】

:: Node.js 运行测试
set "_node_test="
for /f "delims=" %%r in ('node -e "console.log('Node OK: ' + process.version + ' ' + process.arch)" 2^>nul') do set "_node_test=%%r"
if defined _node_test (
    echo    ✅ node 执行测试	%_node_test%
    set /a PASS+=1
) else (
    echo    ❌ node 执行测试	node -e 执行失败
    set /a FAIL+=1
)

:: Python 运行测试
set "_py_test="
for /f "delims=" %%r in ('python -c "import sys; print(f'Python OK: {sys.version.split()[0]} {sys.platform}')" 2^>nul') do set "_py_test=%%r"
if defined _py_test (
    echo    ✅ python 执行测试	%_py_test%
    set /a PASS+=1
) else (
    echo    ❌ python 执行测试	python -c 执行失败
    set /a FAIL+=1
)

:: pip 模块测试
set "_pip_test="
for /f "delims=" %%r in ('python -m pip --version 2^>nul') do set "_pip_test=%%r"
if defined _pip_test (
    echo    ✅ pip 模块测试	(可用^)
    set /a PASS+=1
) else (
    echo    ❌ pip 模块测试	python -m pip 不可用
    set /a FAIL+=1
)

:: npm 模块测试
set "_npm_test="
for /f "delims=" %%r in ('node -e "require('path'); console.log('node modules: OK')" 2^>nul') do set "_npm_test=%%r"
if defined _npm_test (
    echo    ✅ npm 模块测试	%_npm_test%
    set /a PASS+=1
) else (
    echo    ❌ npm 模块测试	node require 失败
    set /a FAIL+=1
)
echo.

:: ─── 5. 路径总览 ───
echo 【路径总览】
for %%c in (node npm pnpm python pip python3 pip3) do (
    set "_wp="
    for /f "delims=" %%p in ('where %%c 2^>nul') do (
        if not defined _wp set "_wp=%%p"
    )
    if defined _wp (
        echo    %%c	→ !_wp!
    ) else (
        echo    %%c	→ (未找到^)
    )
    set "_wp="
)
echo.

:: ─── 总结 ───
set /a TOTAL=PASS+FAIL
echo ======================================================
if !FAIL! EQU 0 (
    echo   ✅ 全部通过！!PASS!/!TOTAL! 项检查OK
) else (
    echo   ❌ !FAIL! 项失败，!PASS!/!TOTAL! 项通过
)
echo ======================================================

if !FAIL! GTR 0 (
    echo.
    echo 修复建议:
    echo   1. 确认已运行对应安装脚本 (install-node.cmd / install-python.cmd^)
    echo   2. 如果路径不在 runtime 目录，先激活环境: call activate.cmd
    echo   3. 重新运行 check.cmd 验证
)
echo.

endlocal
