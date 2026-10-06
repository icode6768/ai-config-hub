# DongChuangAI 音频模型

查看音频能力：

```bash
python {baseDir}/scripts/dongchuangai.py --list --type audio
```

适用场景：
- 文本转语音
- 声音克隆
- 音乐生成
- 音频增强

交付时优先给用户清晰说明：音色、语言、语速、时长。

## multi-frontend-ui 对应能力

前端页面：`multi-frontend-ui/src/views/ai-audio/AIAudio.vue`
音色选择器：`multi-frontend-ui/src/views/ai-audio/components/FishVoicePicker.vue`
API 封装：`multi-frontend-ui/src/api/aiAudio.ts`

| 功能 | 接口 | 脚本命令（dongchuangai_audio.py） |
|------|------|------|
| 通用音频处理 / 声音克隆 | `/audio/process` | `--clone --prompt "..." --audio ./voice.wav` |
| 文本转语音（fish） | `/audio/fish/tts` | `--tts --text "..." [--reference-id ID]` |
| 豆包语音合成（火山引擎） | `/audio/doubao/tts` | `--doubao-tts --text "..." [--voice 音色] [--speed 1.0] [--emotion happy] [--format mp3]` |
| 豆包音色清单 | `/audio/doubao/voices` | `--doubao-voices [--gender female]` |
| 音色模型列表（fish） | `/audio/fish/models` | `--voices [--title 关键词] [--language zh]` |
| 语音转文字 | `/audio/fish/asr` | `--asr --audio ./in.mp3` |
| 变声 | `/audio/fish/voice-change` | `--voice-change --audio ./src.mp3 --target-audio ./tgt.mp3`（或 `--reference-id`） |
| 视频提取音频 | `/audio/extract-audio` | `--extract --video ./in.mp4` |
| 音频历史 / 刷新 | `/audio/history`、`/audio/history/{id}/refresh` | `--history` / `--refresh-history <id>` |

异步任务加 `--wait` 会轮询音频历史直到 done/failed。

## 东创AI通道音乐 / Suno / 克隆（DesktopAIHome 音频选项卡）

走 `dongchuangai.py --endpoint`：

- 海螺音乐：`rhart-audio/text-to-audio/music-2.6`（params：`lyrics`、`sampleRate`、`bitrate`）
- 声音克隆：`rhart-audio/text-to-audio/voice-clone`（params：`audio` 站内文件地址、`text`、`custom_voice_id`）
- Suno：`rhart-audio/suno-{v4.5|v5|v5.5}/{custom|single}`（custom 需 `lyrics`、`title`、`tags`）

上传文件支持：`audio/mpeg`、`audio/wav`、`audio/flac`、`audio/mp3`。从视频提取音频时使用视频文件上传。
