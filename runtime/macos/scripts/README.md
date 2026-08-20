# 龙虾面板 · 便携运行时 (macOS)

## 目录结构

```
macos/
├── nvm/                # NVM + Node.js
│   └── npm-global/     # npm 全局包隔离目录（必须在 nvm/ 下，NVM 才不报警）
├── pyenv/              # pyenv + 所有 Python 版本
├── bin/                # 自定位 wrapper 脚本（优先级最高）
│
└── scripts/            # 安装与维护脚本
    ├── activate.sh         # 激活脚本（每次使用前 source）
    ├── setup-all.sh        # 一键安装所有组件
    ├── install-node.sh
    ├── install-python.sh
    ├── link-node.sh        # 生成 bin/ wrapper
    ├── check.sh            # 环境检查
    ├── check-npm-global.sh
    └── mount-helper.sh     # U盘挂载后使用
```

## 首次安装

```bash
cd macos/scripts
bash setup-all.sh
```

或分步安装：

```bash
bash install-node.sh 20          # 安装 Node.js 20
bash install-python.sh 3.11.9    # 安装 Python 3.11.9
```

> 只需 Xcode Command Line Tools，无需安装 Homebrew。

## 日常使用

每次打开终端，运行：

```bash
source /path/to/macos/scripts/activate.sh
```

## U盘/外置硬盘使用

插入设备后，设备路径类似 `/Volumes/MyDisk/.../macos/scripts/`

```bash
# 方法1: 直接 source（路径随设备变化）
source /Volumes/MyDisk/龙虾面板/macos/scripts/activate.sh

# 方法2: 加入 ~/.zshrc 的快捷别名（自动查找设备）
alias lobster='source "$(ls -d /Volumes/*/macos/scripts/activate.sh 2>/dev/null | head -1)"'

# 方法3: 运行 mount-helper.sh 自动解除 Gatekeeper 隔离并激活
bash /Volumes/MyDisk/龙虾面板/macos/scripts/mount-helper.sh
```

## 注意事项

| 问题 | 说明 |
|------|------|
| macOS 提示"无法打开" | 运行 `xattr -rd com.apple.quarantine <macos目录>` |
| 换了新 Mac 无法用 | Intel/Apple Silicon 二进制不通用，需重新安装 Python/Node |
| Python 缺 SSL/Tk 模块 | 不再依赖 Homebrew，自行安装 Homebrew 后用 `brew install openssl tcl-tk` 即可补齐 |
| 可移植性最强的方案 | Node.js（nvm 下载的是预编译二进制，同架构可直接用） |

## 已安装版本查看

```bash
source scripts/activate.sh    # 激活后会自动打印版本信息
nvm ls                        # 查看所有 Node.js 版本
pyenv versions                # 查看所有 Python 版本
```