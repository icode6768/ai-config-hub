# =============================================================================
# 龙虾面板 · Windows 运行环境激活脚本 (PowerShell 版)
# 用法: . .\activate.ps1     （注意前面有个点和空格）
#   或: . E:\path\to\activate.ps1
#
# 特点: 自定位 — 无论此目录在哪个盘符/路径（本地/U盘/移动硬盘），
#       脚本都能找到自身位置并正确设置所有环境变量。
#
# 重要: 必须用 ". .\activate.ps1"（dot-source），不能直接运行 ".\activate.ps1"
#       否则环境变量不会保留到当前会话。
# =============================================================================

# 脚本所在目录的上一级是运行时根目录
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PORTABLE_RUNTIME_DIR = Split-Path -Parent $SCRIPT_DIR

# --- 路径定义 ---
$NODE_BASE = Join-Path $PORTABLE_RUNTIME_DIR "node"
$PYTHON_BASE = Join-Path $PORTABLE_RUNTIME_DIR "python"
$NPM_GLOBAL_DIR = Join-Path $PORTABLE_RUNTIME_DIR "npm-global"
$BIN_DIR = Join-Path $PORTABLE_RUNTIME_DIR "bin"

# --- 环境变量 ---
$env:PORTABLE_RUNTIME_DIR = $PORTABLE_RUNTIME_DIR
$env:NPM_CONFIG_PREFIX = $NPM_GLOBAL_DIR

# --- 查找 Node.js 版本 ---
$NODE_DIR = $null
$versionsPath = Join-Path $NODE_BASE "versions"
if (Test-Path $versionsPath) {
    $latestVer = Get-ChildItem -Path $versionsPath -Directory | Sort-Object Name | Select-Object -Last 1
    if ($latestVer) {
        $NODE_DIR = $latestVer.FullName
    }
}

# --- 查找 Python 默认版本 ---
$PY_DIR = $null
$defaultFile = Join-Path $PYTHON_BASE "default.txt"
if (Test-Path $defaultFile) {
    $pyVer = (Get-Content $defaultFile -Raw).Trim()
    $pyPath = Join-Path $PYTHON_BASE "versions\$pyVer"
    if (Test-Path $pyPath) {
        $PY_DIR = $pyPath
    }
}

# --- 构建 PATH ---
# 优先级: 真实二进制目录 > npm-global > bin wrappers > 原始 PATH
$newPaths = @()

if ($NODE_DIR)      { $newPaths += $NODE_DIR }
if (Test-Path $NPM_GLOBAL_DIR) { $newPaths += $NPM_GLOBAL_DIR }
if ($PY_DIR) {
    $newPaths += $PY_DIR
    $newPaths += Join-Path $PY_DIR "Scripts"
}
$newPaths += $BIN_DIR

$env:PATH = ($newPaths -join ";") + ";" + $env:PATH

# Load the portable project's API key only into the current process environment.
$env:DONGCHUANGAI_KEY = ''
$env:DONGCHUANGAI_API_KEY = ''
$projectRoot = Split-Path -Parent (Split-Path -Parent $PORTABLE_RUNTIME_DIR)
$configPath = Join-Path $projectRoot 'config.yaml'
$yamlModule = Join-Path $projectRoot 'webui\node_modules\yaml'
if ($NODE_DIR -and (Test-Path $configPath) -and (Test-Path $yamlModule)) {
    $key = & (Join-Path $NODE_DIR 'node.exe') -e "const fs=require('fs');const YAML=require(process.argv[1]);const c=YAML.parse(fs.readFileSync(process.argv[2],'utf8'));process.stdout.write(String(c&&c.global&&c.global.api&&c.global.api.apiKey||''))" $yamlModule $configPath
    $env:DONGCHUANGAI_API_KEY = [string]$key
}

# --- 状态报告 ---
Write-Host ""
Write-Host "======================================================"
Write-Host "  龙虾面板运行环境已激活"
Write-Host "======================================================"
Write-Host ""
Write-Host "   运行时根目录: $PORTABLE_RUNTIME_DIR"
Write-Host ""

function Show-Version($name, $cmd) {
    try {
        $ver = & $cmd --version 2>$null | Select-Object -First 1
        if ($ver) {
            Write-Host "   ${name}:`t$ver"
        } else {
            Write-Host "   ${name}:`t(未安装)"
        }
    } catch {
        Write-Host "   ${name}:`t(未安装)"
    }
}

Show-Version "node"   "node"
Show-Version "npm"    "npm"
Show-Version "pnpm"   "pnpm"
Show-Version "python" "python"
Show-Version "pip"    "pip"

Write-Host ""
