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

| 功能 | 接口 |
|------|------|
| 通用音频处理 | `/audio/process` |
| 文本转语音 | `/audio/fish/tts` |
| 音色模型列表 | `/audio/fish/models` |
| 语音转文字 | `/audio/fish/asr` |
| 变声 | `/audio/fish/voice-change` |
| 视频提取音频 | `/audio/extract-audio` |
| 音频历史 | `/audio/history` |

上传文件支持：`audio/mpeg`、`audio/wav`、`audio/flac`、`audio/mp3`。从视频提取音频时使用视频文件上传。
