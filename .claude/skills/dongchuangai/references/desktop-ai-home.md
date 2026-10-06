# DesktopAIHome 模型调用对照

对照页面：`multi-frontend-ui/src/views/home/components/DesktopAIHome.vue`
本文件把首页（桌面 AI 首页）里所有图片、视频、音频模型调用映射到 skill 脚本命令。

## 1. 统一模型执行（图片 / 视频模型，主通道）

页面通过 `executeQuickCreateTool` → `POST /quick-create/execute`，按 `tool_slug` 自动路由到内部 API 或东创AI。

```bash
# 浏览全量模型目录（所有来源：internal / dongchuangai / lingkeai / lk666 ...）
python {baseDir}/scripts/dongchuangai.py --list-all --type image --search 关键词
python {baseDir}/scripts/dongchuangai.py --tool-info <tool_slug>

# 执行任意模型（文生图示例，lingkeai-93 是首页图像智能体的默认模型）
python {baseDir}/scripts/dongchuangai.py --run-tool lingkeai-93 --prompt "一只柯基在草地上奔跑" \
  --param imageSize=1:1 --param resolution=1024 --param quantity=1 --wait

# 带参考图执行（--file 会先上传拿到站内地址再填入 source_images）
python {baseDir}/scripts/dongchuangai.py --run-tool <tool_slug> --prompt "..." --file ./ref.png --wait
```

常用参数（首页实际传参）：`imageSize`（比例）、`resolution`、`quantity`、`duration`、`use_model`、`dispatch_strategy=quality_first`。

## 2. 东创AI通道模型（含音乐 / Suno / 声音克隆）

页面通过 `executeDongChuangAITool` → `POST /quick-create/dongchuangai/execute`。

```bash
# 海螺音乐
python {baseDir}/scripts/dongchuangai.py --endpoint rhart-audio/text-to-audio/music-2.6 \
  --prompt "描述" --param lyrics="歌词" --param sampleRate=44100 --param bitrate=256000

# Suno（v4.5 / v5 / v5.5 × custom / single）
python {baseDir}/scripts/dongchuangai.py --endpoint rhart-audio/suno-v5/custom \
  --prompt "风格描述" --param lyrics="歌词" --param title="歌名" --param tags="pop"

# 声音克隆（audio 传站内文件地址，text 是要念的文本）
python {baseDir}/scripts/dongchuangai.py --endpoint rhart-audio/text-to-audio/voice-clone \
  --prompt "要念的文本" --param audio=/uploads/user_voices/xxx.wav --param text="要念的文本"
```

## 3. 服务端视频流水线

页面函数 → 接口 → 脚本命令：

| 页面功能 | 接口 | 命令 |
|----------|------|------|
| 合并本站视频 `mergeVideos` | `POST /quick-create/merge-videos` | `dongchuangai_video.py --merge --video-url A --video-url B --resolution 720p` |
| 智能多帧长视频 `multiframeLongVideo` | `POST /quick-create/multiframe-long-video` | `dongchuangai_video.py --long-video --prompt "..." --model seedance2.0 --duration 30 --ratio 9:16 --file ./f1.png --wait` |
| 电商一键生视频 `commerceVideo` | `POST /quick-create/commerce-video` | `dongchuangai_video.py --commerce --prompt "商品卖点" --file ./product.png --duration 5 --wait` |

说明：

- 长视频/电商视频立即返回 `history_id`，加 `--wait` 会轮询 `/quick-create/history/{id}/refresh` 直到 done/failed。
- 首尾帧类模型（名称含 首尾帧/kf2v/keyframe）至少需要 2 张 `--file` 关键帧图。
- 电商流水线默认 `model=lingkeai-16`、`image_model=lingkeai-93`。

## 4. 音频功能（submitAudioFeatureTask / submitAudioModelTask）

| 页面功能 | 接口 | 命令 |
|----------|------|------|
| 文本转语音（fish/Gemini 原型） | `POST /audio/fish/tts` | `dongchuangai_audio.py --tts --text "..." [--reference-id ID] --wait` |
| 豆包语音合成（火山引擎） | `POST /audio/doubao/tts` | `dongchuangai_audio.py --doubao-tts --text "..." [--voice 音色] [--speed 1.0] [--emotion happy] [--format mp3]` |
| 豆包音色清单 | `GET /audio/doubao/voices` | `dongchuangai_audio.py --doubao-voices [--gender female]` |
| fish 音色模型列表 | `GET /audio/fish/models` | `dongchuangai_audio.py --voices [--title 关键词] [--language zh]` |
| 语音转文字 | `POST /audio/fish/asr` | `dongchuangai_audio.py --asr --audio ./in.mp3` |
| 变声 | `POST /audio/fish/voice-change` | `dongchuangai_audio.py --voice-change --audio ./src.mp3 --target-audio ./tgt.mp3`（或 `--reference-id`） |
| 声音克隆（提示词+音频） | `POST /audio/process` | `dongchuangai_audio.py --clone --prompt "..." --audio ./voice.wav --wait` |
| 视频提取音频 | `POST /audio/extract-audio` | `dongchuangai_audio.py --extract --video ./in.mp4` |
| 音频历史 / 刷新 | `GET /audio/history`、`POST /audio/history/{id}/refresh` | `dongchuangai_audio.py --history` / `--refresh-history <id>` |

## 5. 任务结果轮询（与页面 pollQuickCreateHistory 一致）

```bash
python {baseDir}/scripts/dongchuangai.py --history --type video --status processing
python {baseDir}/scripts/dongchuangai.py --history-id <id> --wait
python {baseDir}/scripts/dongchuangai.py --refresh-history <id>
```

## 6. 上传素材

页面 `uploadDongChuangAIMedia(file, target)` → `POST /quick-create/dongchuangai/upload`，target 支持 `standard` / `ai_app` / `native`。

```bash
python {baseDir}/scripts/dongchuangai.py --upload-only --file ./input.png --target standard
```

## 覆盖边界

- 首页的 AI 对话（chatApi）、支付充值、案例橱窗不属于媒体模型调用，不在本 skill 范围。
- 漫剧（ComicDrama 组件）走 `short_drama` 相关接口，若需要请直接读组件源码。
