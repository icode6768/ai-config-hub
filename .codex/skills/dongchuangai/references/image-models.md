# DongChuangAI 图像模型

可通过以下方式浏览图像能力：

```bash
python {baseDir}/scripts/dongchuangai.py --list --type image
```

先给用户展示可选模型，再根据用户确认执行。

## multi-frontend-ui 对应能力

前端目录：`multi-frontend-ui/src/views/ai-image`

| 功能 | category | 入口 |
|------|----------|------|
| 文生图 | `draw` | `Draw.vue` |
| 智能修图 | `retouch` | `Retouch.vue` |
| 家装设计 | `home` | `HomeDesign.vue` |
| 图片增强 | `enhance` | `ImageEnhance.vue` |
| AI 扩图 | `expand` | `ImageExpand.vue` |
| AI 抠图 | `matting` | `ImageMatting.vue` |
| 时尚拍摄 | `fashion` | `FashionShooting.vue` |
| 老照片修复 | `restore` | `PhotoRestore.vue` |
| 海报生成 | `poster` | `Poster.vue` |

相关接口：

- 上传：`/images/upload`
- 处理：`/images/process`
- 历史：`/images/history`
