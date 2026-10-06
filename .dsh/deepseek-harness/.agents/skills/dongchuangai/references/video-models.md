# DongChuangAI 视频模型

可通过以下方式浏览视频能力：

```bash
python {baseDir}/scripts/dongchuangai.py --list --type video
```

长任务开始前先通知用户需要等待几分钟。

## multi-frontend-ui 对应能力

前端目录：`multi-frontend-ui/src/views/ai-video`

| 功能 | category | 入口 |
|------|----------|------|
| 文生视频 | `txt2video` | `Txt2Video.vue` |
| 图生视频 | `img2video` | `Img2Video.vue` |
| 一键成片 | `oneClickVideo` | `OneClickVideo.vue` |
| 舞蹈视频 | `dance` | `Dance.vue` |
| 换动作 | `changemotion` | `ChangeMotion.vue` |
| 换人 | `changeman` | `ChangeMan.vue` |
| 视频历史 | - | `VideoHistory.vue` |

相关接口：

- 图片上传：`/videos/upload`
- 视频上传：`/videos/upload_video`
- 处理：`/videos/process`
- 历史：`/videos/history`

## DesktopAIHome 视频通道

首页视频模型统一走 `/quick-create/execute`（`dongchuangai.py --run-tool <tool_slug>`），另有三条服务端流水线（`dongchuangai_video.py`）：

| 功能 | 接口 | 命令 |
|------|------|------|
| 合并本站视频（2-20 个） | `/quick-create/merge-videos` | `--merge --video-url A --video-url B --resolution 720p` |
| 智能多帧长视频（分段生成+承接帧+合并，5-600 秒） | `/quick-create/multiframe-long-video` | `--long-video --prompt "..." --model seedance2.0 --duration 30 --ratio 9:16 [--file ./f.png] --wait` |
| 电商一键生视频（分析→脚本→参考图/首帧→图生视频） | `/quick-create/commerce-video` | `--commerce --prompt "商品卖点" --file ./product.png --duration 5 --wait` |

详见 `{baseDir}/references/desktop-ai-home.md`。
