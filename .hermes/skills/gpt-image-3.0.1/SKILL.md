---
name: gpt-image-3.0.1
description: AI图片生成与编辑技能，通过 OpenAI 兼容接口根据文字描述生成高质量图片，或对已有图片进行编辑/以图改图/局部重绘。使用前需配置 OPENAI_BASE_URL 和 OPENAI_API_KEY 环境变量，可用 IMAGE_MODE 指定模型，默认 gpt-image-2。适用于：用户要求生成图片、画图、AI绘图、文生图、生成一张图，或要求修改图片、改背景、以图改图、局部重绘、扩图、参考图生成等场景。
---

# gpt-image-3.0.1 图片生成技能

## 使用前配置

使用此 Skill 前，先在当前会话或系统环境变量中配置：

```bash
OPENAI_BASE_URL=https://api.dongchuangai.com/v1
# 如果你的环境使用 OPENAI_API_BASE，也可以用它替代 OPENAI_BASE_URL
OPENAI_API_KEY=<你的 OpenAI 兼容接口密钥>
IMAGE_MODE=gpt-image-2
```

Windows PowerShell 示例：

```powershell
$env:OPENAI_BASE_URL = "https://api.dongchuangai.com/v1"
$env:OPENAI_API_KEY = "<你的 OpenAI 兼容接口密钥>"
$env:IMAGE_MODE = "gpt-image-2"
```

不要将 `OPENAI_API_KEY` 写入仓库文件或提交到 git。

---

## 生图流程

用户发送任何图片描述时，执行本 Skill 目录下的脚本 `scripts/generate_image.py`。

脚本路径相对于**当前 Skill 所在目录**（即本 `SKILL.md` 文件所在目录），请勿写死任何用户名或绝对路径。

macOS / Linux：

```bash
python3 "$(dirname "$0")/scripts/generate_image.py" \
  --prompt "<用户描述>" \
  --quality low
```

> 注：执行时请将脚本路径替换为本 Skill 目录下的实际路径，例如在本仓库中为
> `.claude/skills/gpt-image-3.0.1/scripts/generate_image.py`。

Windows PowerShell（若 `python3` 不可用请改用 `python`）：

```powershell
python ".claude\skills\gpt-image-3.0.1\scripts\generate_image.py" --prompt "<用户描述>" --quality low
```

脚本会自动将图片保存到系统临时目录（macOS/Linux 为 `/tmp/`，Windows 为 `%TEMP%\`），并打印实际保存路径。

- 成功后将生成的 PNG 图片作为附件发送给用户
- 若 `OPENAI_BASE_URL` 或 `OPENAI_API_KEY` 未配置，提示用户先配置环境变量
- 若接口返回 401，提示用户检查 `OPENAI_API_KEY`
- 若接口返回 429，提示用户请求频率或额度受限
- 若上游超时，告知用户「正在生成，请稍候（约 60 秒）...」

---

## 改图流程（图像编辑 / 以图改图 / 局部重绘）

当用户提供了一张（或多张）图片并要求**修改图片、改背景、以图改图、局部重绘、扩图、按参考图生成**时，使用同一个脚本，**加上 `--image` 参数即进入编辑模式**，脚本会改为调用 `/images/edits` 接口（multipart 上传）。

Windows PowerShell：

```powershell
# 整图编辑 / 以图改图
python ".claude\skills\gpt-image-3.0.1\scripts\generate_image.py" --prompt "<编辑描述>" --image "<输入图路径>" --quality low

# 局部重绘 (inpainting): 额外提供蒙版图, 蒙版透明区域为待重绘区域
python ".claude\skills\gpt-image-3.0.1\scripts\generate_image.py" --prompt "<编辑描述>" --image "<输入图路径>" --mask "<蒙版图路径>" --quality low

# 多张参考图 (重复 --image)
python ".claude\skills\gpt-image-3.0.1\scripts\generate_image.py" --prompt "<合成描述>" --image "<图1>" --image "<图2>"
```

macOS / Linux 同理，将 `python` 换成 `python3`、脚本路径换成本 Skill 目录下的实际路径。

参数说明：

- `--image`：输入图片路径，**传入即进入编辑模式**；可重复指定以传入多张参考图
- `--mask`：可选蒙版图，用于局部重绘（仅编辑模式有效，单独使用会报错）
- `--prompt / --output / --quality / --n`：含义与文生图相同
- 编辑接口耗时通常长于文生图（脚本超时设为 600 秒），可告知用户「正在编辑图片，请稍候…」

---

## 注意事项

- 提供图片生成与图片编辑两种能力，不提供文字对话或其他功能
- 编辑模式由是否传入 `--image` 自动判断：有 `--image` 走 `/images/edits`，否则走 `/images/generations`
- 默认模型由 `IMAGE_MODE` 控制，未配置时使用 `gpt-image-2`
- 图片尺寸固定为 1024×1024
- 脚本依赖 Python 3 及 `requests` 库，OpenClaw 运行环境通常已内置
