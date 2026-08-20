---
name: word-template-docx-generator
description: 基于 JSON 和固定 DOCX 模板批量生成 Word 文档（操作手册、系统说明、代码文档）。当用户提到“按模板生成Word”“根据JSON渲染docx”“固定格式文档自动生成”“操作手册/系统说明批量生成”时必须使用此 skill。
---

# Word 模板 DOCX 生成器

## 用途

使用此技能，基于 JSON 数据和固定 DOCX 模板，确定性地生成 `.docx` 文档。

本技能完全内嵌于当前项目，核心资源存放于：

- `.claude/skills/word-template-docx-generator/assets/templates`
- `.claude/skills/word-template-docx-generator/assets/json`
- `.claude/skills/word-template-docx-generator/assets/source`

原始逻辑来自 `E:/mywroks/project/copyrights-auto-codes/demo3/格式工具`，已迁移至本技能。

## 触发条件

当用户意图为以下任意一种时，使用本技能：

- 按固定模板格式生成 Word 文件
- 使用 JSON 数据渲染 DOCX
- 批量生成操作手册 / 系统说明 / 代码文档
- 保持所有生成文档的命名规范一致

## 前提假设

- JSON 的键名与 DOCX 模板中的占位符一一对应。
- 已安装 Python 依赖（`docxtpl`、`python-docx`）。

## 操作手册 JSON 图片字段约定(强制)

第一次生成 `<系统名>-操作手册.json` 时,**所有图片字段(key 含「图片/截图/image/img」)的值必须直接写为绝对路径**,不要先写 basename 再事后用脚本批量改。

**字段值模板**:`<项目根绝对路径>/docs/screenshot/<JSON.系统名>/<basename>.png`(正斜杠)。

**示例**:
```json
{
  "登录界面截图": "E:/mywroks/.../copyright-demo-vue1/docs/screenshot/基于源荷不确定性的水电源荷场景多阶段生成系统/01_login.png",
  "模块列表": [{
    "模块名": "数据采集中心",
    "模块首页截图": "E:/mywroks/.../docs/screenshot/基于源荷不确定性的水电源荷场景多阶段生成系统/02_dashboard.png",
    "章节列表": [{
      "功能点列表": [{
        "功能名称": "实时数据管理",
        "功能截图": "E:/mywroks/.../docs/screenshot/基于源荷不确定性的水电源荷场景多阶段生成系统/03_data_collection.png"
      }]
    }]
  }]
}
```

当前模板(`操作手册内置模板2.docx`)启用 **3 层**图片占位符:`登录界面截图` / `module.模块首页截图` / `feature.功能截图`。`step.操作截图` 已被取消,JSON 里 step 层图字段允许保留但模板不读。

`render_word_templates.py:_resolve_image_value` 解析顺序:**绝对路径** → 相对 CWD → 相对 `--images-dir` → basename 模糊搜索。用绝对路径时**不需要传 `--images-dir`**。

历史 JSON 修复(从 basename 转绝对路径):`scripts/test/convert_image_fields_to_absolute_path.py <json>...`。不要把这个脚本当常规流程。

## 执行步骤

1. 验证内置资源中所需文件均存在。
2. 运行确定性生成脚本：
   - 脚本路径：`scripts/render_word_templates.py`
3. 验证目标输出目录中所有预期输出文件均已生成。

## 命令

### 批量模式（推荐，无外部依赖）

```bash
python ".claude/skills/word-template-docx-generator/scripts/render_word_templates.py" batch \
  --output-dir ".claude/skills/word-template-docx-generator/output"
```

### 批量自动模式（新增，自动匹配 JSON）

```bash
python ".claude/skills/word-template-docx-generator/scripts/render_word_templates.py" batch-auto \
  --system-name "智能病历分析与质控系统" \
  --output-dir ".claude/skills/word-template-docx-generator/output"
```

若省略 `--system-name` 且目录中只有一对有效 JSON 文件，则自动选择该对。

### 单模板渲染

**推荐(默认输出到 `docs/文档输出/<系统名>/`)**:
```bash
python ".claude/skills/word-template-docx-generator/scripts/render_word_templates.py" render \
  --project-root "." \
  --template ".claude/skills/word-template-docx-generator/assets/templates/操作手册内置模板2.docx" \
  --json    ".claude/skills/word-template-docx-generator/assets/json/<系统名>-操作手册.json" \
  --image-width 6.0 --image-height 3.6
# 不传 --output;脚本自动输出到 <project-root>/docs/文档输出/<JSON.系统名>/<JSON-stem>.docx
```

**显式指定输出路径**(向后兼容):
```bash
python ".claude/skills/word-template-docx-generator/scripts/render_word_templates.py" render \
  --template ".claude/skills/word-template-docx-generator/assets/templates/操作手册内置模板2.docx" \
  --json    ".claude/skills/word-template-docx-generator/assets/json/<系统名>-操作手册.json" \
  --output  "path/to/output.docx"
```

### 可选：外部项目覆盖

若需要渲染其他项目布局，传入 `--project-root` 及可选的 JSON 路径参数。

## 输出约定

**默认输出目录**:`<项目根>/docs/文档输出/<JSON.系统名>/`(对齐 `docs/screenshot/<系统名>/` 的项目级结构)。
- 触发条件:render/batch 命令传了 `--project-root` 但**没有**显式 `--output` / `--output-dir`
- `render` 自动文件名:`<JSON-stem>.docx`(例:`<系统名>-操作手册.docx`)
- `batch` 输出三件套:同目录下 `<系统名>-说明书.docx`、`<系统名>说明.docx`、`<系统名>-代码文档.docx`
- 用户显式传 `--output` / `--output-dir` 时按用户给的路径(向后兼容)
- 没传 `--project-root` 时回退到 skill 内置 `output/`(向后兼容)

**目录结构样例**(与 screenshot 对称):
```
<项目根>/
└── docs/
    ├── screenshot/<系统名>/        # 截图归档(browser-test-screenshot 写入)
    │   ├── 01_login.png
    │   └── ...
    └── 文档输出/<系统名>/          # 渲染产物 docx(本 skill 写入)
        ├── <系统名>-操作手册.docx
        ├── <系统名>系统说明.docx
        └── <系统名>-代码文档.docx
```

## 代码文档生成规则(强制)

**1. 必须使用模板渲染** —— 代码文档(`<系统名>-代码文档.docx`)**必须**通过
`assets/templates/代码文档模版.docx` 渲染,**不得**直接用 `python-docx` 拼接生成。

模板内置:
- 页眉占位符 `{{系统名}}` —— 渲染时会被替换为当前系统名
- 主体占位符 `{{contents}}` —— 用 `DocxTemplate.new_subdoc()` 注入源码内容
- 已设置好的页边距与分页样式 —— 不得修改

脚本入口 `_generate_source_doc(system_name, project_root, output_path, manual_json_path=...)`
会自动加载该模板并渲染,无需手动处理。

**2. 源码顺序必须按操作手册的功能模块顺序排列**

- 调用 `_scan_source_files(project_root, manual_json_path=...)`,**必须传 `manual_json_path`**
  (操作手册 JSON 路径);`_run_batch` 已默认转发,batch 命令开箱即用
- 排序算法:
  1. 从操作手册 JSON 的 `模块列表 → 章节列表 → 功能点列表` 顺序提取所有 feature 的 stem
     (取自 `feature.功能截图` 的 basename → 去后缀 → `_norm_stem`,例:`03_hydro_meteo.png` → `hydro_meteo`)
  2. 基础设施文件(`backend/app/main.py`、`frontend/src/main.ts`、`App.vue`、`router/*`)
     永远排在最前(优先级 100/200 区间)
  3. 每个 feature 的源码聚到一起,优先级 = `1000 + feature_index*100 + 子优先级`
     - 子优先级:`api(0) < models(1) < services(2) < middleware(3) < utils(4) < views(5) < frontend api(6)`
  4. 没匹配到任何 feature 的文件归到末尾(`9000+`)
- 结果:同一功能(如 `hydro_meteo`)的 `backend/app/api/hydro_meteo.py`、`backend/app/models/hydro_meteo.py`、
  `frontend/src/views/hydro-meteo/index.vue`、`frontend/src/api/hydroMeteo.ts` 会**聚集在一起**,
  且该功能在文档中出现的位置与操作手册中的章节顺序一致

**3. 跨命名风格的 stem 匹配**

`_norm_stem` 把 `kebab-case` / `camelCase` / `snake_case` / `PascalCase` 统一归一化为小写下划线,
并剥离开头的数字前缀(如 `01_`、`03-`)。所以以下都被视为同一个 feature:
- `03_hydro_meteo.png`
- `hydro_meteo.py`
- `hydroMeteo.ts`
- `hydro-meteo/index.vue`(取父目录名)

> ⚠️ 不能再用 `python-docx Document()` 直接写代码文档(原始实现已废弃),否则会丢失页眉的系统名。

## 校验清单

- 三个输出文件均已存在。
- 无模板缺失或 JSON 缺失的报错。
- 若 JSON 中引用了图片字段但文件不存在，保留占位文本 `[图片未找到: xxx]`，不直接报错终止。
- 代码文档:
  - 页眉显示 `{{系统名}}` 已被实际系统名替换(打开 docx → 视图 → 页眉)
  - 文件顺序符合操作手册功能模块顺序(同一功能的 backend / frontend 文件聚到一起)
  - 包含 `app.py` 和 `templates/*.html`(Flask 项目)或 `backend/app/**` + `frontend/src/**`(FastAPI+Vue 项目)

## 禁止事项

- 生成过程中不得修改模板文件。
- 不得静默跳过必需的 JSON 文件。
- 不得覆盖输出目录以外的无关项目文件。
- **代码文档生成不得绕过 `代码文档模版.docx`**(直接 `Document()` 会丢失页眉/页码/分页设置)。
- **代码文档生成不得忽略 `manual_json_path`**(否则源码顺序混乱,无法对齐操作手册章节)。
