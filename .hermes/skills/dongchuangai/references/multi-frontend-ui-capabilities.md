# multi-frontend-ui 媒体能力对照

本文件用于把 `multi-frontend-ui` 已有的图片、视频、音频、3D 创作能力映射到 `dongchuangai` skill。生成方案、排查功能或调用脚本前，先按这里确认能力边界。

## 统一创作入口

- 页面：`multi-frontend-ui/src/views/quick-create/QuickCreate.vue`
- API：`multi-frontend-ui/src/api/quickCreate.ts`
- 类型：图片、视频、音频、3D、文档
- 上传：`uploadDongChuangAIMedia(file, target)` -> `/quick-create/dongchuangai/upload`
- 执行：`executeDongChuangAITool(payload)` -> `/quick-create/dongchuangai/execute`
- 任务：`getDongChuangAITask(taskId)` -> `/quick-create/dongchuangai/tasks/{taskId}`
- 历史：`getQuickCreateHistory()`、`refreshQuickCreateHistory()`、`deleteQuickCreateHistory()`

上传格式：

- 图片：`image/jpeg,image/png`
- 视频：`video/mp4,video/webm,image/jpeg,image/png`
- 音频：`audio/mpeg,audio/wav,audio/flac,audio/mp3`
- 3D：`.glb,.obj,.fbx,image/jpeg,image/png`

## 图片能力

- 页面目录：`multi-frontend-ui/src/views/ai-image`
- API：`multi-frontend-ui/src/api/aiImage.ts`
- 上传接口：`/images/upload`
- 执行接口：`/images/process`
- 历史接口：`/images/history`

功能覆盖：

- `draw`：文生图
- `retouch`：智能修图、局部重绘、参考图修图
- `home`：家装设计，支持毛坯房图和风格参考图
- `enhance`：图片增强
- `expand`：AI 扩图
- `matting`：AI 抠图
- `fashion`：时尚拍摄，支持服装图和模特参考图
- `restore`：老照片修复
- `poster`：海报生成

## 视频能力

- 页面目录：`multi-frontend-ui/src/views/ai-video`
- API：`multi-frontend-ui/src/api/aiVideo.ts`
- 图片上传接口：`/videos/upload`
- 视频上传接口：`/videos/upload_video`
- 执行接口：`/videos/process`
- 历史接口：`/videos/history`

功能覆盖：

- `txt2video`：文生视频
- `img2video`：图生视频
- `oneClickVideo`：一键成片
- `dance`：舞蹈视频，支持视频/图片素材
- `changemotion`：换动作
- `changeman`：换人
- `VideoHistory`：视频历史与复用

## 音频能力

- 页面：`multi-frontend-ui/src/views/ai-audio/AIAudio.vue`
- 声音选择器：`multi-frontend-ui/src/views/ai-audio/components/FishVoicePicker.vue`
- API：`multi-frontend-ui/src/api/aiAudio.ts`

功能覆盖：

- `/audio/process`：通用音频处理，支持提示词和音频文件
- `/audio/fish/tts`：文本转语音
- `/audio/fish/models`：音色模型列表
- `/audio/fish/asr`：语音转文字
- `/audio/fish/voice-change`：变声，支持源音频、目标音频或参考音色
- `/audio/extract-audio`：从视频提取音频
- `/audio/history`：音频历史

## 调用原则

1. 用户给了本地文件时，先用 `dongchuangai.py --file` 上传，避免直接把本地路径传给生成接口。
2. 标准模型优先用 `dongchuangai.py --list --type image|video|audio|3d` 查询，创作应用用 `dongchuangai_app.py --list`。
3. 多媒体长任务使用 `--wait` 或返回任务 ID 后轮询。
4. 面向用户只说“东创AI能力/模型/应用”，不要暴露底层供应商或中转细节。
