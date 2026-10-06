# AI Config Hub / AI 配置助手

> **便携式 AI Agent 聚合面板** —— 一个开箱即用、可装进 U 盘的本地 Web 控制台,
> 在统一界面下调度五个 AI Agent 框架。

![Version](https://img.shields.io/badge/version-1.0.2-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2B%20%7C%20macOS%2012%2B-lightgrey)

[English](README.md) · [简体中文](README_zh.md)

---

## ✨ 功能特性

- **五个 AI Agent,一个面板** — OpenClaw · Hermes · Claude Code · Codex ·
  DeepSeek-Harness,可在同一 React 界面中切换。
- **完全可移植的运行时** — Node.js 24 + Python 3.11 内置于项目中,从任意盘符
  或 `/Volumes/<U盘>/...` 挂载点启动,无需系统级安装。
- **自带自愈的启动器** — 首次运行会自动 `npm install` 并执行 `vite build`,
  若产物缺失则即时补齐。
- **微信 iLink 桥接** — 为 OpenClaw 开箱即用地打通 C2C / 群消息
  (其他 Agent 可在 [`config.yaml`](config.yaml) 中按需启用)。
- **单一配置文件** — [`config.yaml`](config.yaml) 是 API Key、模型、端口、
  各 Agent 微信桥接的唯一来源。
- **更新通道** — 面板对接东创AI 更新服务(`app_id: 28`,`user_id: 50`),
  自动检测新版本。

## 📋 系统要求

| 平台 | 最低版本 | 磁盘空间 | 说明 |
| --- | --- | --- | --- |
| **Windows** | Windows 10 21H2 (x64) | 约 1.5 GB | 无需管理员权限,便携安装 |
| **macOS** | macOS 12 Monterey (Intel / Apple Silicon) | 约 1.5 GB | 无需管理员权限,便携安装 |

**无需**事先在系统中安装 Node.js 或 Python —— 项目自带运行时,位于
[`runtime/`](runtime/) 目录下。系统 `PATH` 中的外部 Node / Python 会被内置
运行时覆盖,这是有意为之。

## 🚀 快速开始

### Windows

1. 将本目录拷贝到 U 盘(或任意本地目录)。
2. 双击 [`start-windows.bat`](start-windows.bat)。
3. 浏览器自动打开 **http://127.0.0.1:8787** —— 即为面板。

### macOS

1. 将本目录拷贝到 U 盘(或任意本地目录)。
2. **首次运行**:右键 [`start-macos.command`](start-macos.command) → **打开**
   → 在弹窗中确认 Gatekeeper 提示。
3. 后续运行:直接双击 `start-macos.command` 即可。
4. 浏览器自动打开 **http://127.0.0.1:8787** —— 即为面板。

> **为何要走 Gatekeeper 这一步?** `start-macos.command` 是未签名的 shell
> 脚本,macOS 会将任何从互联网下载的内容隔离。右键「打开」相当于把它加入
> 本机白名单。

### 首次启动会发生什么

启动器按以下顺序执行:

1. 加载便携运行时(macOS 上
   [`runtime/macos/scripts/activate.sh`](runtime/macos/scripts/activate.sh),
   Windows 上 [`runtime/windows/scripts/start-env.cmd`](runtime/windows/scripts/start-env.cmd)),
   使 `node`、`npm`、`pnpm`、`python`、`pip` 全部解析到内置版本。
2. 确保 `.dsh/` 与 `.hermes/` 存在(若不存在则创建)。
3. 自愈 webui 依赖:`webui/node_modules/.bin/tsx` 不存在则执行 `npm install`。
4. 自愈 webui 构建:`webui/dist/index.html` 不存在则执行 `vite build`。
5. 前台运行 `npm --prefix webui run dev`(在 8787 端口启动面板 HTTP 服务)。

首次启动通常需要 1–3 分钟;之后只需数秒。

## ⚙️ 配置说明

[`config.yaml`](config.yaml) 是项目的唯一配置入口。

### 全局段 (global.*)

| 字段 | 用途 | 默认值 |
| --- | --- | --- |
| `global.api.provider` | API 网关供应方 | `dongchuangai` |
| `global.api.baseUrl` | OpenAI 兼容网关 baseURL | `http://localhost:5000/v1` |
| `global.api.apiKey` | 东创AI 网关密钥(自动导出为 `DONGCHUANGAI_API_KEY`) | _(安装时设置)_ |
| `global.api.model` | 默认对话模型 | `gpt-5.5` |
| `global.api.authSource` | OAuth 登录源 | `dongchuangai-oauth` |
| `global.api.authAccountName` | OAuth 登录显示名 | `李春锃` |
| `global.launch.openclawConfigPath` | OpenClaw 状态文件路径 | `.openclaw/state/openclaw.json` |
| `global.launch.openclawStateDir` | OpenClaw 状态目录 | `.openclaw/state` |
| `global.launch.webUrls.<agent>` | 各 Agent 本地 Web URL | 见下表 |
| `global.update.app_id` / `user_id` | 东创AI 更新服务 ID | `28` / `50` |

### 各 Agent 微信桥接 (`apps.<agent>.wechat.*`)

| 字段 | 用途 |
| --- | --- |
| `enabled` | 是否启用该 Agent 的 iLink 桥接 |
| `accountId` | iLink 机器人账号 ID |
| `token` | iLink 机器人 Token(`accountId:secret` 形式) |
| `baseUrl` | iLink API 地址(`https://ilinkai.weixin.qq.com`) |
| `cdnBaseUrl` | 微信 CDN(`https://novac2c.cdn.weixin.qq.com/c2c`) |
| `dmPolicy` | 私聊策略:`open` / `closed` / `allowlist` |
| `groupPolicy` | 群聊策略:`open` / `disabled` / `allowlist` |
| `allowFrom` / `groupAllowFrom` | 策略对应的白名单 |
| `splitMultilineMessages` | 是否按行拆分多行消息 |

出厂只有 `apps.openclaw.wechat.enabled` 为 `true`,其余需要在配置好后手动开启。

### Web URL 对应表(面板 → Agent)

| 服务 | URL |
| --- | --- |
| **面板 (webui)** | http://127.0.0.1:8787 |
| OpenClaw | http://127.0.0.1:18789 |
| Claude Code | http://127.0.0.1:8081 |
| Codex | http://127.0.0.1:8082 |
| DeepSeek-Harness | http://127.0.0.1:3080 |
| Hermes | _(见 `.hermes/config.yaml`)_ |

> **小贴士**:改面板端口,需要同时编辑
> [`start-windows.bat`](start-windows.bat) 和
> [`start-macos.command`](start-macos.command) 中的 `PORT=8787`。`3033` 是
> 单独跑 `webui` 时 Vite 的开发端口,正常运行面板不会用到。

## 🗂️ 项目结构

```
便携式u盘/
├── start-windows.bat          ← Windows 启动入口
├── start-macos.command         ← macOS 启动入口
├── config.yaml                 ← 唯一配置源(已纳入版本控制)
├── LICENSE                     ← MIT 协议全文
├── README.md / README_zh.md    ← 你正在看这里
│
├── webui/                      ← 面板源码(已纳入版本控制)
│   ├── src/client/             ← React 前端
│   ├── src/shared/             ← 共享 TS 模块(配置加载、路径等)
│   ├── server/                 ← tsx HTTP 服务,Agent 进程管理
│   ├── package.json            ← name: ai-config-hub, version: 1.0.3
│   └── vite.config.ts
│
├── runtime/                    ← 便携运行时(脚本纳入版本控制;二进制被 .gitignore 排除)
│   ├── windows/
│   │   ├── bin/                ← 自定位 .cmd 包装(node、npm、python、pip)
│   │   ├── node/versions/      ← Node.js 24.14.1 / 24.18.0
│   │   ├── npm-global/         ← 全局 CLI:claude、codex、openclaw、clawdhub、dws 等
│   │   ├── python/versions/    ← Python 3.11.9 / 3.12.3(嵌入式)
│   │   └── scripts/            ← activate.cmd、start-env.cmd、setup-all.cmd、install-*.cmd
│   └── macos/
│       ├── homebrew/, nvm/, pyenv/   ← 由 setup-all.sh 按需创建
│       └── scripts/            ← activate.sh、setup-all.sh、install-*.sh、mount-helper.sh
│
├── .dsh/                       ← DeepSeek-Harness 状态(settings.yaml + 启动器已纳入版本控制)
│   ├── settings.yaml           ← 用户可编辑的 deepseek-harness 配置
│   ├── launch-deepseek-harness-windows.bat
│   ├── launch-deepseek-harness-macos.command
│   └── deepseek-harness/       ← 上游 vendored 项目(MIT)
│
├── .openclaw/                  ← OpenClaw 状态(skills + openclaw.json 已纳入版本控制)
│   ├── state/openclaw.json
│   └── skills/
│
├── .claude/                    ← Claude Code 状态(settings.json + skills 已纳入版本控制)
│   ├── settings.json
│   └── skills/
│
├── .codex/                     ← Codex 状态(config.toml + skills 已纳入版本控制)
│   ├── config.toml
│   └── skills/
│
├── .hermes/                    ← Hermes Agent 状态(config.yaml + skills + hermes-agent 已纳入版本控制)
│   ├── config.yaml
│   ├── hermes-agent/           ← 上游 vendored 项目
│   └── skills/
│
├── docs/                       ← 截图目录,本地保留(.gitignore 排除)
└── .gitignore                  ← 详细规则见文件
```

### 已纳入版本控制 vs 被忽略 一览

- **纳入版本控制**:`config.yaml`、`*.bat` / `*.command`、`webui/`、
  `runtime/*/scripts/`、`LICENSE`、根 README、各 Agent 的 `settings.json` /
  `config.toml` / `config.yaml` / `settings.yaml` / `skills/`。
- **被 .gitignore 排除(运行时数据)**:`runtime/windows/{bin,node,npm-global,
  python,temp}` 与 `runtime/macos/{homebrew,nvm,pyenv,bin,npm-global,temp}` 内部
  的所有内容,以及 `.dsh/`、`.openclaw/`、`.claude/`、`.codex/`、`.hermes/` 下
  的会话 / 存储数据。

详细规则参见 [`.gitignore`](.gitignore)。

## 🔧 进阶安装

### 首次填充便携运行时

如果你是刚 `git clone` 下来的,`runtime/windows/{bin,node,python}` 为空(或
`runtime/macos/{homebrew,nvm,pyenv}` 还不存在),需要先初始化便携运行时,面板
才能正常启动。

#### Windows

```cmd
runtime\windows\scripts\setup-all.cmd
```

交互式安装器。会下载 Node 24(LTS)、Python 3.11.9(嵌入式)并链接 `bin/`
包装脚本。

只需要 Node + Python,不要全局 CLI?

```cmd
runtime\windows\scripts\setup-lite.cmd
```

#### macOS

```bash
runtime/macos/scripts/setup-all.sh
```

交互式安装器。会把 Homebrew 克隆到 `runtime/macos/homebrew/`,把 NVM、pyenv
安装到 `runtime/macos/{nvm,pyenv}/`,再安装 Node LTS + Python 3.11.9。

### 安装 Hermes Agent

Hermes 需要从 NousResearch 上游按需安装:

```cmd
runtime\windows\scripts\install-hermes.cmd
```

脚本从 `https://hermes-agent.nousresearch.com/` 拉取 `install.ps1`,并强制把
安装路径固定到 `<root>\.hermes\hermes-agent`。它会拒绝任何把 `-HermesHome` /
`-InstallDir` 指向 `LOCALAPPDATA` 的覆盖参数。

### 修复 OpenClaw 在 Windows 的 ESM 报错

`@mariozechner/jiti` 与 OpenClaw loader 在 Windows 上有已知的 ESM 路径 BUG。
补丁脚本是幂等的、可重跑:

```cmd
runtime\windows\scripts\patch-openclaw-esm.cmd
```

启动器内部已经会在必要时自动调用,如果你重装了 `.openclaw/` 或 `node_modules/`,
可以手动重跑。

### 在任意盘符下重新激活运行时

如果把项目移动到了别的盘符,包装脚本无法自定位时,可执行 mount helper:

```cmd
runtime\windows\scripts\mount-helper.cmd
# macOS:
runtime/macos/scripts/mount-helper.sh
```

macOS 上的 helper 还会一并清除 Gatekeeper 隔离属性
(`xattr -dr com.apple.quarantine "$ROOT"`)。

## 🩹 常见问题

| 症状 | 可能原因 | 处理方式 |
| --- | --- | --- |
| 面板打不开,提示 8787 端口被占用 | 已有其他面板进程在运行 | 关闭其他终端窗口;或者在启动器里改 `PORT=` |
| macOS:「无法打开 start-macos.command,因为它来自未识别的开发者」 | Gatekeeper 隔离属性 | 右键该文件 → **打开** → 在弹窗中确认;或执行 `runtime/macos/scripts/mount-helper.sh` |
| macOS:右键「打开」之后仍然被拒 | 旧 quarantine 属性残留 | `xattr -dr com.apple.quarantine "$ROOT"`(mount helper 已包含这一步) |
| Windows:启动时提示「Node.js not found」 | 系统里安装的 `node` 在 `PATH` 中排在 `runtime\windows\bin` 之前 | 便携运行时必须盖住系统 Node。`where node` 应当返回 `runtime\windows\bin` 下的路径,否则重新 `activate.cmd` |
| Windows:OpenClaw 启动卡住或报「Cannot find module 'openclaw/...'」 | `@mariozechner/jiti` Windows ESM BUG | 执行 `runtime\windows\scripts\patch-openclaw-esm.cmd`(幂等) |
| 启动器里 `npm install` 失败 | 网络或代理问题 | 先跑 `runtime/windows/scripts/check.cmd`(macOS 上 `runtime/macos/scripts/check.sh`)校验运行时,再重试 |
| 面板能加载,但 Agent 显示「Connection refused」 | Agent 子进程未启动 | 打开面板的 **Apps** 标签,点 **Restart**;并查看 `webui/webui-stderr.log` 找根因 |
| Hermes 提示「Python not found」 | 当前 shell 中 pyenv 未初始化 | `source runtime/macos/scripts/activate.sh`(Windows 上重新跑 `setup-all.cmd`) |

> **Windows PATH 顺序提醒**:`activate.cmd` 会把便携运行时 `bin/` 插到 `PATH`
> 前面。若系统另装有 `node`,只会在已激活的 shell 里被遮蔽。激活后跑
> `where node`,`runtime\windows\bin\` 下那行必须排在第一位。

## 📜 开源协议与商业使用

本项目采用 **MIT License**，完整协议见 [`LICENSE`](LICENSE)。源码完全免费，任何个人、组织和企业都可以自由使用、复制、修改、合并、发布、分发、再许可和销售本项目及其衍生作品，允许任何商业用途，无需另行购买商业授权。

使用或再分发本项目时，请保留原始版权声明和 MIT License 文本。第三方依赖和 vendored 上游项目仍遵循其各自目录中的原始协议。

## 🙏 致谢与第三方声明

本项目 vendored 了若干上游项目,并对接了第三方服务,各自的原始协议与声明保留
在相应子目录中。

- **DeepSeek-Harness** — vendored 在
  [`.dsh/deepseek-harness/`](.dsh/deepseek-harness/)。Copyright © DeepSeek AI,
  **MIT License**。上游:<https://github.com/deepseek-ai/deepseek-harness>。
  原始 `LICENSE` 已保留。
- **Hermes Agent** — vendored 在
  [`.hermes/hermes-agent/`](.hermes/hermes-agent/)。Copyright © NousResearch。
  协议参见上游 `LICENSE` 文件。
- **OpenClaw 微信桥接插件** — 位于 `.openclaw/plugin-cache/openclaw-weixin/`,
  协议见其 `README.md`。
- **东创AI (DongchuangAI)** — 模型 API 供应商,域名 `api.dongchuangai.com`。
  其服务条款约束 API 用法,本项目只是其客户端。
- **运行时依赖**:Node.js (MIT)、Python (PSF)、React (MIT)、Vite (MIT)、
  TypeScript (Apache-2.0)、tsx (MIT),以及 `@iarna/toml`、`yaml`、`qrcode`、
  `lucide-react` 等,均按各自协议授权。

---

Copyright © 2026 DongchuangAI Claw Hub contributors.
