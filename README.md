# 东创AI-聚合龙虾 / DongchuangAI Claw Hub

> **Portable AI Agent Harness** — a self-contained, USB-drive-ready control
> panel that orchestrates five AI agent frameworks behind a single local web UI.

![Version](https://img.shields.io/badge/version-1.0.2-blue)
![License](https://img.shields.io/badge/license-LGPL--3.0-green)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2B%20%7C%20macOS%2012%2B-lightgrey)

[English](README.md) · [简体中文](README_zh.md)

---

## ✨ Features

- **Five AI agents, one panel** — OpenClaw · Hermes · Claude Code · Codex ·
  DeepSeek-Harness, switchable from a single React UI.
- **Portable runtime** — Node.js 24 + Python 3.11 ship inside the project; works
  from any drive letter or `/Volumes/<usb>/...` mount, no system install required.
- **Self-healing launchers** — first run auto-installs webui dependencies and
  runs `vite build` if artifacts are missing.
- **WeChat iLink bridge** — out-of-the-box C2C / group messaging for OpenClaw
  (other agents can be enabled in [`config.yaml`](config.yaml)).
- **Single config file** — [`config.yaml`](config.yaml) is the source of truth
  for the API key, model, ports, and per-agent WeChat bridges.
- **Update channel** — the panel checks the DongchuangAI update service
  (`app_id: 28`, `user_id: 50`) for new releases.

## 📋 System Requirements

| Platform | Minimum | Disk | Notes |
| --- | --- | --- | --- |
| **Windows** | Windows 10 21H2 (x64) | ~1.5 GB free | No admin needed; portable install |
| **macOS** | macOS 12 Monterey (Intel / Apple Silicon) | ~1.5 GB free | No admin needed; portable install |

You do **not** need a system-wide Node.js or Python install — the project ships
its own runtimes under [`runtime/`](runtime/). External Node / Python on your
`PATH` will be shadowed by the portable runtime, which is intentional.

## 🚀 Quick Start

### Windows

1. Copy this folder to a USB drive (or any local directory).
2. Double-click [`start-windows.bat`](start-windows.bat).
3. Your browser opens to **http://127.0.0.1:8787** — the panel.

### macOS

1. Copy this folder to a USB drive (or any local directory).
2. **First run only**: right-click [`start-macos.command`](start-macos.command) → **Open** → confirm the Gatekeeper prompt.
3. Subsequent runs: just double-click `start-macos.command`.
4. Your browser opens to **http://127.0.0.1:8787** — the panel.

> **Why the Gatekeeper dance?** `start-macos.command` is an unsigned shell
> script. macOS quarantines anything that arrives from the internet. The
> **Open** action adds the script to your local whitelist.

### What happens on first launch

The launcher does this, in order:

1. Sources the portable runtime ([`runtime/macos/scripts/activate.sh`](runtime/macos/scripts/activate.sh)
   on macOS, [`runtime/windows/scripts/start-env.cmd`](runtime/windows/scripts/start-env.cmd)
   on Windows) so `node`, `npm`, `pnpm`, `python`, `pip` all resolve to the
   bundled copies.
2. Ensures `.dsh/` and `.hermes/` exist (creates them if missing).
3. Self-heals webui deps: `npm install` if `webui/node_modules/.bin/tsx` is
   missing.
4. Self-heals webui build: `vite build` if `webui/dist/index.html` is missing.
5. Foreground-runs `npm --prefix webui run dev` (the panel HTTP server on
   port 8787).

First launch typically takes 1–3 minutes; subsequent launches are seconds.

## ⚙️ Configuration

[`config.yaml`](config.yaml) at the project root is the single source of truth.

### Global

| Key | Purpose | Default |
| --- | --- | --- |
| `global.api.provider` | API gateway provider | `dongchuangai` |
| `global.api.baseUrl` | OpenAI-compatible gateway base URL | `http://localhost:5000/v1` |
| `global.api.apiKey` | 东创AI gateway key (auto-exported as `DONGCHUANGAI_API_KEY`) | _(set at install)_ |
| `global.api.model` | Default chat model | `gpt-5.5` |
| `global.api.authSource` | OAuth source for login flow | `dongchuangai-oauth` |
| `global.api.authAccountName` | Display name for OAuth login | `李春锃` |
| `global.launch.openclawConfigPath` | OpenClaw state file path | `.openclaw/state/openclaw.json` |
| `global.launch.openclawStateDir` | OpenClaw state dir | `.openclaw/state` |
| `global.launch.webUrls.<agent>` | Per-agent local web URL | see below |
| `global.update.app_id` / `user_id` | DongchuangAI update service identifiers | `28` / `50` |

### Per-agent WeChat bridge (`apps.<agent>.wechat.*`)

| Key | Purpose |
| --- | --- |
| `enabled` | Toggle the iLink bridge for this agent |
| `accountId` | iLink bot account id |
| `token` | iLink bot token (`accountId:secret`) |
| `baseUrl` | iLink API base (`https://ilinkai.weixin.qq.com`) |
| `cdnBaseUrl` | WeChat CDN (`https://novac2c.cdn.weixin.qq.com/c2c`) |
| `dmPolicy` | DM policy: `open` / `closed` / `allowlist` |
| `groupPolicy` | Group policy: `open` / `disabled` / `allowlist` |
| `allowFrom` / `groupAllowFrom` | Per-policy allowlists |
| `splitMultilineMessages` | Whether to split multi-line bot replies |

Out of the box, only `apps.openclaw.wechat.enabled` is `true`; flip the others
when you are ready.

### Web URL table (panel → agent)

| Service | URL |
| --- | --- |
| **Panel (webui)** | http://127.0.0.1:8787 |
| OpenClaw | http://127.0.0.1:18789 |
| Claude Code | http://127.0.0.1:8081 |
| Codex | http://127.0.0.1:8082 |
| DeepSeek-Harness | http://127.0.0.1:3080 |
| Hermes | _(see `.hermes/config.yaml`)_ |

> **Tip**: change the panel port by editing `PORT=8787` in both
> [`start-windows.bat`](start-windows.bat) and
> [`start-macos.command`](start-macos.command). The Vite dev port (`3033`) is
> only used when running `webui` standalone.

## 🗂️ Architecture

```
便携式u盘/
├── start-windows.bat          ← Windows entry point
├── start-macos.command         ← macOS entry point
├── config.yaml                 ← single source of truth (tracked)
├── LICENSE                     ← LGPL-3.0 (this file)
├── README.md / README_zh.md    ← you are here
│
├── webui/                      ← panel source (tracked)
│   ├── src/client/             ← React UI
│   ├── src/shared/             ← shared TS modules (config loader, paths)
│   ├── server/                 ← tsx HTTP server, agent process manager
│   ├── package.json            ← name: 东创AI-聚合龙虾, version: 1.0.2
│   └── vite.config.ts
│
├── runtime/                    ← portable runtime (scripts tracked; binaries gitignored)
│   ├── windows/
│   │   ├── bin/                ← self-locating .cmd wrappers (node, npm, python, pip)
│   │   ├── node/versions/      ← Node.js 24.14.1 / 24.18.0
│   │   ├── npm-global/         ← global CLIs: claude, codex, openclaw, clawdhub, dws, …
│   │   ├── python/versions/    ← Python 3.11.9 / 3.12.3 (embeddable)
│   │   └── scripts/            ← activate.cmd, start-env.cmd, setup-all.cmd, install-*.cmd, …
│   └── macos/
│       ├── homebrew/, nvm/, pyenv/   ← created on demand by setup-all.sh
│       └── scripts/            ← activate.sh, setup-all.sh, install-*.sh, mount-helper.sh
│
├── .dsh/                       ← DeepSeek-Harness state (settings.yaml + launcher tracked)
│   ├── settings.yaml           ← user-editable deepseek-harness config
│   ├── launch-deepseek-harness-windows.bat
│   ├── launch-deepseek-harness-macos.command
│   └── deepseek-harness/       ← vendored upstream (MIT)
│
├── .openclaw/                  ← OpenClaw state (skills + openclaw.json tracked)
│   ├── state/openclaw.json
│   └── skills/                 ← per-agent skills
│
├── .claude/                    ← Claude Code state (settings.json + skills tracked)
│   ├── settings.json
│   └── skills/
│
├── .codex/                     ← Codex state (config.toml + skills tracked)
│   ├── config.toml
│   └── skills/
│
├── .hermes/                    ← Hermes Agent state (config.yaml + skills + hermes-agent tracked)
│   ├── config.yaml
│   ├── hermes-agent/           ← vendored upstream Hermes
│   └── skills/
│
├── docs/                       ← screenshots, kept local (gitignored)
└── .gitignore                  ← extensive; see file for tracked-vs-ignored rules
```

### Tracked vs. gitignored at a glance

- **Tracked**: `config.yaml`, `*.bat`/`*.command`, `webui/`, `runtime/*/scripts/`,
  `LICENSE`, top-level README, plus per-agent `settings.json` / `config.toml` /
  `config.yaml` / `settings.yaml` / `skills/`.
- **Gitignored (runtime data)**: everything inside
  `runtime/windows/{bin,node,npm-global,python,temp}` and
  `runtime/macos/{homebrew,nvm,pyenv,bin,npm-global,temp}`, plus session /
  storage data under `.dsh/`, `.openclaw/`, `.claude/`, `.codex/`, `.hermes/`.

See [`.gitignore`](.gitignore) for the exact rules.

## 🔧 Advanced Setup

### First-time runtime bootstrap

If you cloned the repo and `runtime/windows/{bin,node,python}` is empty (or
`runtime/macos/{homebrew,nvm,pyenv}` does not exist yet), you need to populate
the portable runtime before the panel can launch.

#### Windows

```cmd
runtime\windows\scripts\setup-all.cmd
```

Interactive installer. Downloads Node 24 (LTS), Python 3.11.9 (embeddable), and
links the `bin/` wrappers.

Want just Node + Python with no global CLIs?

```cmd
runtime\windows\scripts\setup-lite.cmd
```

#### macOS

```bash
runtime/macos/scripts/setup-all.sh
```

Interactive installer. Clones Homebrew into `runtime/macos/homebrew/`, installs
NVM + pyenv into `runtime/macos/{nvm,pyenv}/`, then installs Node LTS + Python
3.11.9.

### Install Hermes Agent

Hermes is installed on demand from upstream NousResearch:

```cmd
runtime\windows\scripts\install-hermes.cmd
```

This downloads `install.ps1` from `https://hermes-agent.nousresearch.com/` and
forces the install path to `<root>\.hermes\hermes-agent`. It rejects any
`-HermesHome` / `-InstallDir` overrides that would point at `LOCALAPPDATA`.

### OpenClaw Windows ESM patch

There is a known Windows ESM bug in `@mariozechner/jiti` and OpenClaw's loader
that prevents it from booting on Windows. The patch is idempotent and re-runnable:

```cmd
runtime\windows\scripts\patch-openclaw-esm.cmd
```

The launchers already call this on demand, but you can re-run it if you replace
`.openclaw/` or `node_modules/`.

### Use the runtime from an arbitrary drive letter

If you have moved the project to a different drive letter and the wrappers
cannot self-locate, run the mount helper:

```cmd
runtime\windows\scripts\mount-helper.cmd
# or on macOS:
runtime/macos/scripts/mount-helper.sh
```

On macOS the helper also strips Gatekeeper quarantine xattrs
(`xattr -dr com.apple.quarantine "$ROOT"`).

## 🩹 Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Panel does not open, "port 8787 in use" | Another panel instance is running | Close the other terminal; or change `PORT=` in the launcher |
| macOS: "start-macos.command can't be opened because it is from an unidentified developer" | Gatekeeper quarantine | Right-click the file → **Open** → confirm; or run `runtime/macos/scripts/mount-helper.sh` |
| macOS: still blocked after right-click → Open | Old quarantine xattrs | `xattr -dr com.apple.quarantine "$ROOT"` (the mount helper does this) |
| Windows: "Node.js not found" at launch | A system-installed `node` is earlier on `PATH` than `runtime\windows\bin` | The portable runtime must shadow system Node. Verify with `where node` — it must resolve under `runtime\windows\bin`. Re-source `runtime\windows\scripts\activate.cmd`. |
| Windows: OpenClaw hangs or throws "Cannot find module 'openclaw/...'" on startup | `@mariozechner/jiti` Windows ESM bug | `runtime\windows\scripts\patch-openclaw-esm.cmd` (idempotent) |
| `npm install` fails inside the launcher | Network or proxy issue | Run `runtime/windows/scripts/check.cmd` (or `runtime/macos/scripts/check.sh`) to validate the runtime, then retry |
| Panel loads but the agents show "Connection refused" | The agent subprocess did not start | Open the panel's **Apps** tab and click **Restart**; check `webui/webui-stderr.log` for the underlying error |
| Hermes says "Python not found" | pyenv not initialized in this shell | `source runtime/macos/scripts/activate.sh` (or re-run `runtime\macos\scripts\setup-all.sh`) |

> **Heads-up on Windows PATH ordering**: portable runtime `bin/` is prepended
> to `PATH` in `activate.cmd`. If your system has a separate `node` install, it
> will be shadowed only inside the activated shell. Run `where node` after
> activation to confirm — the line under `runtime\windows\bin\` must come first.

## 📜 License & Commercial Use

This project is dual-licensed:

1. **GNU Lesser General Public License v3.0** (`SPDX-License-Identifier:
   LGPL-3.0-only`) — see [`LICENSE`](LICENSE) for the full text.
2. A separate **commercial license** for organizations that want to bypass
   LGPL-3.0 obligations — see [Commercial license](#commercial-license)
   below.

### Free use under LGPL-3.0

LGPL-3.0 already permits free use, copying, modification, and
redistribution of this software. The standard LGPL-3.0 obligations you
must follow when you distribute this software (or a Combined Work that
links against it):

- **Preserve copyright & license notices** on every copy and on each
  source file header (LGPL-3.0 §1, §4(a)).
- **Modifications to the Library itself** must be released under LGPL-3.0
  (LGPL-3.0 §2, §5; weak copyleft applies only to the Library portions,
  not to your Application).
- **Static linking** — if you link the Library statically into your
  Application, you must provide the Minimal Corresponding Source plus the
  Corresponding Application Code, and a clear relinking procedure
  (LGPL-3.0 §4(d)).
- **Dynamic linking** — the recommended path for proprietary Applications.
  You may link against the unmodified Library at run time with no
  relinking obligations beyond preserving notices (LGPL-3.0 §4(d)(1)).
- **No anti-circumvention** — do not apply technical measures that
  restrict the LGPL §3 rights of end users (e.g. DRM that blocks
  replacement of the Library).
- **No sublicensing** — you may not impose further restrictions on the
  LGPL-licensed portions.
- **Pure SaaS / internal use** (no distribution of the Library or
  Combined Work) — no LGPL obligations beyond preserving notices in any
  source you keep.

### Commercial license

If your product, procurement policy, or IP posture makes the LGPL-3.0
weak-copyleft obligations unworkable — for example:

- You need to ship a **proprietary / closed-source derivative work**
  without releasing the Library's modifications.
- You need to **statically link** without providing relinking capability
  or the Minimal Corresponding Source.
- You need an **IP indemnification** or commercial warranty that LGPL-3.0
  disclaims (LGPL-3.0 §15, §16).
- Your legal team requires a **paperwork-only** license on top of the
  open-source terms.

…then the commercial license is the alternative path. It grants the
above freedoms (and usually technical support, custom development, and
on-premise / private deployment assistance) without the LGPL-3.0
copyleft obligations. Contact the maintainers via the address in
[`config.yaml`](config.yaml) → `global.api.authAccountName`.

## 🙏 Acknowledgments / Third-party Notices

This project vendors several upstream projects and connects to third-party
services. Their original licenses and notices are preserved in their respective
subdirectories.

- **DeepSeek-Harness** — vendored at
  [`.dsh/deepseek-harness/`](.dsh/deepseek-harness/). Copyright © DeepSeek AI.
  Licensed under the **MIT License**. Upstream:
  <https://github.com/deepseek-ai/deepseek-harness>. Original `LICENSE` retained.
- **Hermes Agent** — vendored at
  [`.hermes/hermes-agent/`](.hermes/hermes-agent/). Copyright © NousResearch.
  License per upstream `LICENSE` file.
- **OpenClaw WeChat bridge plugin** — located under
  `.openclaw/plugin-cache/openclaw-weixin/`. License per its `README.md`.
- **DongchuangAI (东创AI)** — the API provider at `api.dongchuangai.com`. Their
  Terms of Service govern model usage; this project is just a client.
- **Runtime dependencies**: Node.js (MIT), Python (PSF), React (MIT), Vite (MIT),
  TypeScript (Apache-2.0), tsx (MIT), `@iarna/toml`, `yaml`, `qrcode`,
  `lucide-react` — each carries its own license.

Per **LGPL-3.0 §1 & §4(a)**, all upstream MIT-licensed subprojects retain
their original copyright and license notice; the LGPL-3.0 weak-copyleft
(per §2 & §5) applies only to modifications of this project's own source
that is part of the Library, not to those upstream MIT-licensed portions,
which remain under their original MIT terms.

---

Copyright © 2026 DongchuangAI Claw Hub contributors.
