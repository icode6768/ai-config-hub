---
name: browser-test-screenshot
description: 使用 MCP 浏览器工具(chrome-devtools / playwright-server / webapp-testing)进行功能测试或为操作手册取图时,必须按规范采集并归档截图。截图统一存放到项目根目录 `docs/screenshot/<项目名>/`,文件名按当前操作手册模板的 3 层图片占位符对齐:登录截图(顶层 `登录界面截图`)、模块首页(`<模块>-00-模块首页.png` ↔ `module.模块首页截图`)、功能首页(`<模块>-<功能>-功能首页.png` ↔ `feature.功能截图`),与 word-template-docx-generator 的 JSON 中模块名/功能名称严格一致,可被自动嵌入 docx。字段值也支持**绝对路径**(脚本会按"绝对路径 → 相对项目根 → 相对 images-dir → basename 模糊搜索"顺序解析)。当用户要求"测试页面/功能"、"自动化测试"、"打开浏览器测试"、"录制截图"、"取证截图"、"操作手册截图"、"功能截图"、"补图"、"出操作手册",或调用 chrome-devtools/playwright/browser_take_screenshot 等浏览器 MCP 工具时务必使用本技能。
---

# 浏览器测试截图归档规范(操作手册取图为主)

本技能定义"使用浏览器 MCP 取图"的命名/路径/采集节奏,核心目标是**让截图能够直接被 `word-template-docx-generator` skill 渲染进操作手册 docx**,同时兼顾自动化测试留痕。

## 触发场景

- **操作手册取图(主用途)**:为系统编写 `XXX-操作手册.docx`,需要补全每个"操作"的演示截图
- 用户说:"出操作手册截图""为软著补图""走一遍流程截图""测试 xxx 功能""自动化测试""UI 验收"
- 调用以下 MCP 工具进行交互验证时:
  - `mcp__chrome-devtools__*`(navigate_page / click / fill / take_screenshot)
  - `mcp__playwright-server__*`(browser_navigate / browser_click / browser_take_screenshot)
  - 通过 `webapp-testing` 技能或 Playwright 脚本驱动浏览器
- 编写/执行 `docs/auto-test/case` 下的自动化测试用例

## 关键事实(决定命名约定)

`word-template-docx-generator` 在渲染时通过
`scripts/render_word_templates.py` 的 `_preprocess_images` + `_find_image_by_name` 处理图片:

1. JSON 中 **key 名包含「图片」/「截图」/「image」/「img」** 的字段,会被当作图片字段(`_preprocess_images` 已扩展支持「截图」)
2. **字段值生成时直接写绝对路径**(本仓库的固定约定):
   - 模板:`<项目根绝对路径>/docs/screenshot/<JSON.系统名>/<basename>.png`,路径用正斜杠
   - 例如:`"E:/mywroks/软著专利项目/东创软著/源码模版/copyright-demo-vue1/docs/screenshot/基于源荷不确定性的水电源荷场景多阶段生成系统/01_login.png"`
   - 不要先写 basename 再事后用脚本改 — 用户已多次确认这种返工不可接受
3. 渲染脚本会按以下顺序解析:**绝对路径** → 相对 CWD → 相对 `--images-dir` → basename 模糊搜索。绝对路径写法**不需要传 `--images-dir`**,渲染命令也短
4. 找不到时输出占位文本 `[图片未找到: xxx]`,不会终止渲染
5. 字段值为空字符串(`""`)会渲染为空白(模板里该位置无图无报错)

**只有这三种情况才不用绝对路径**:用户明确说"图放在外部共享目录、写相对路径"、JSON 要在多台机器间移植、或修复历史 basename JSON(用 `scripts/test/convert_image_fields_to_absolute_path.py` 一次性改)。

## 目录与命名约定(强制)

### 1. 目录结构

```
<项目根>/
└── docs/
    └── screenshot/
        └── <项目名>/                                # = basename(项目根)
            ├── 通用-登录-登录界面.png                # 顶层(全局一张)
            ├── 课程与文化资源管理-00-模块首页.png      # 模块层
            ├── 课程与文化资源管理-课程管理-功能首页.png # 功能层
            ├── 课程与文化资源管理-课程管理-新增课程-步骤1.png   # 步骤层
            ├── 课程与文化资源管理-课程管理-新增课程-步骤2.png
            └── 课程与文化资源管理-课程管理-新增课程-步骤3.png
```

- 项目名 = 当前项目根目录名(本仓库即 `copyright-demo-vue1`),用 `path.basename`/`basename $(pwd)` 取
- 中文目录与文件名直接保留,**不要拼音化**
- 此目录就是后续 `--images-dir` 的指向

### 2. 三层命名(对齐当前模板的图片占位符)

当前 `操作手册内置模板2.docx` 启用了 **3 层**图片占位符(原本设计有 step 层,用户主动取消了步骤级,只保留功能级及以上,以避免每步一张图)。命名规范按层级展开:

| 占位符(模板里) | 数据层级 | JSON 字段名 | 文件名规范 | 示例 |
|---|---|---|---|---|
| `{{ 登录界面截图 }}` | 顶层 / 系统级 | `登录界面截图` | `通用-登录-登录界面.png` 或 `01_login.png` | `通用-登录-登录界面.png` |
| `{{ module.模块首页截图 }}` | 模块层 | `模块列表[i].模块首页截图` | `<模块名>-00-模块首页.png` | `课程与文化资源管理-00-模块首页.png` |
| `{{ feature.功能截图 }}` | 功能层 | `…功能点列表[k].功能截图` | `<模块名>-<功能名>-功能首页.png` | `课程与文化资源管理-课程管理-功能首页.png` |

> 如果哪天又想恢复"每步一张图",在模板里加回 `{{ step.操作截图 }}`(放在 `for step in op.步骤` 循环里),JSON 中再写 `操作列表[l].步骤[m].操作截图`,文件名段位为 `<模块名>-<功能名>-<操作名>-步骤<N>.png`。
> 已废弃但 JSON 里残留的 `step.操作截图` 字段不会报错 — 渲染脚本只读模板需要的变量,多余字段被忽略。如要清理可手动删,但保留也无副作用。

约定:
- 模块名 / 功能名 / 操作名段位**逐字等于** JSON 中的 `模块名` / `功能名称` / `操作名称`,不要简化
- 段间使用半角连字符 `-`,段内不要再用 `-`(可用空格、下划线)
- 不要使用时间戳、随机数、`screenshot1.png` 这类无语义命名
- 文件名在 `docs/screenshot/<项目名>/` 内**全局唯一**(脚本是模糊匹配,撞名必引错)
- 一次性补图工具:`scripts/test/augment_manual_json_with_images.py` 会读 JSON 自动按上述规范回填 4 层字段(并校验 basename 唯一),并打印完整文件名清单,据此去拍图即可

### 3. 命名取自既有定义,不要自创

按以下顺序就地查找模块/功能/操作命名,**和 JSON/路由保持一致**:
1. 操作手册 JSON(`.claude/skills/word-template-docx-generator/assets/json/<系统名>-操作手册.json`)— **首选**
2. 前端路由 meta(`frontend/src/router/`),如 `meta.title: '用户管理'`
3. 菜单/面包屑/H1/Tab 文案
4. 后端 API 分组(`backend/app/api/<name>.py`)
5. CLAUDE.md 中已定的中文模块名

如果三段名都拿不准,**先问用户确认**再开拍,不要先动手然后回头改名。

## 采集节奏(每个"操作"至少 1 张,推荐 2-3 张)

操作手册里**每条操作**对应一组步骤,摄影时:

1. **进入功能页**(初始/加载完成态)— `*-进入页面.png`(可选,通用页可一张代多)
2. **关键操作中**(已填好表单、选好条件)— `*-填写表单.png` / `*-选择条件.png`
3. **关键结果**(✅ 必拍)— `*-提交成功.png` / `*-保存成功.png` / `*-列表更新.png`
4. **异常路径**(校验失败、权限不足、接口错误)— `*-编码重复报错.png`、`*-接口错误.png`

> 操作手册里通常**每个操作展示 1 张关键结果图就够**,过多反而臃肿。
> 自动化测试报告则建议保留进入/操作前/操作后/异常四张,留痕更充分。

## MCP 工具落地用法

### chrome-devtools

```text
# 关键页用整页截图,适合手册留痕
mcp__chrome-devtools__take_screenshot
  filePath: <项目根>/docs/screenshot/<项目名>/用户管理-新增用户-提交成功.png
  fullPage: true
  format: png
```

### playwright-server

```text
mcp__playwright-server__browser_take_screenshot
  filename: <项目根>/docs/screenshot/<项目名>/用户管理-新增用户-提交成功.png
  fullPage: true
  type: png
```

### Playwright 脚本(webapp-testing)

```python
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]   # 视脚本位置调整
PROJECT_NAME = PROJECT_ROOT.name
SHOT_DIR = PROJECT_ROOT / "docs" / "screenshot" / PROJECT_NAME
SHOT_DIR.mkdir(parents=True, exist_ok=True)

await page.screenshot(path=str(SHOT_DIR / "用户管理-新增用户-提交成功.png"), full_page=True)
```

## 与 word-template-docx-generator 联动(主用途)

### 第一步:在操作手册 JSON 中按 4 层填图片字段

字段名**必须包含「图片」/「截图」/「image」/「img」**之一(脚本 `_preprocess_images` 据此识别),值**只写文件名**(脚本会自动在 `--images-dir` 搜索)。
当前 `操作手册内置模板2.docx` 已预置了下列 4 个占位符:

```json
{
  "登录界面截图": "通用-登录-登录界面.png",          // 顶层
  "模块列表": [
    {
      "模块名": "课程与文化资源管理",
      "模块首页截图": "课程与文化资源管理-00-模块首页.png",  // 模块层
      "章节列表": [{
        "功能点列表": [{
          "功能名称": "课程管理",
          "功能截图": "课程与文化资源管理-课程管理-功能首页.png", // 功能层
          "操作列表": [{
            "操作名称": "新增课程",
            "步骤": [
              { "序号": 1, "说明": "点击右上角【+ 新增】",
                "操作截图": "课程与文化资源管理-课程管理-新增课程-步骤1.png" },
              { "序号": 2, "说明": "填写课程编码、名称…",
                "操作截图": "课程与文化资源管理-课程管理-新增课程-步骤2.png" },
              { "序号": 3, "说明": "点击【保存】",
                "操作截图": "课程与文化资源管理-课程管理-新增课程-步骤3.png" }
            ]
          }]
        }]
      }]
    }
  ]
}
```

> 注意 `step.操作截图` 在 `for step in op.步骤` 循环里 — 字段名虽叫"操作截图",**实际是按步骤一张图**。
> **批量补字段工具**:`scripts/test/augment_manual_json_with_images.py` 会读完整操作手册 JSON,在 4 个层级自动填入符合规范的文件名,并校验 basename 全局唯一。

### 第二步:渲染时把 images-dir 指向截图目录

```bash
python ".claude/skills/word-template-docx-generator/scripts/render_word_templates.py" render \
  --template ".claude/skills/word-template-docx-generator/assets/templates/操作手册内置模板2.docx" \
  --json    ".claude/skills/word-template-docx-generator/assets/json/民族舞蹈文化传承辅助教学系统-操作手册.json" \
  --images-dir "docs/screenshot/copyright-demo-vue1" \
  --image-width 6.0 --image-height 3.6 \
  --output  ".claude/skills/word-template-docx-generator/output/民族舞蹈文化传承辅助教学系统-操作手册.docx"
```

`batch` / `batch-auto` 模式同样接受 `--images-dir`。如果省略 `--images-dir`,脚本将退回到 `<project-root>/images` 或 skill 内置 `assets/images`,本约定下都不对。

### 第三步:校验

- 渲染日志中不应出现 `[图片未找到: xxx]`(出现意味着 JSON 文件名与 docs/screenshot 下文件不一致)
- 命中"模糊包含"匹配时容易引错图,**保持文件名全局唯一**是关键防线
- 关键页推荐 `image-width 6.0 / height 3.6`(留页边距);全屏页面也可改成 `5.5 / 3.0` 防止压破排版

## 完整工作流(每次启动浏览器取图前执行)

1. **取项目名**:`basename` 当前项目根 → 作为 `docs/screenshot/<项目名>/` 子目录名
2. **建目录**:不存在就 `mkdir -p docs/screenshot/<项目名>/`
3. **读 JSON 抽清单**:打开 `<系统名>-操作手册.json`,把所有
   `模块名 / 功能名称 / 操作名称` 三元组拉成清单 → 形成本次拍图列表
4. **拿用户确认清单**(尤其首跑或 JSON 还在迭代时)再开拍
5. **逐"操作"取图**:每个操作至少抓 1 张关键结果图,文件名严格按"模块-功能-操作-状态.png"
6. **回填 JSON**:在每个 `操作` 节点加 `操作截图` 字段,值 = 文件名
7. **渲染验证**:跑 render 命令,搜索日志中是否含 `[图片未找到]`,有就排查命名
8. **小结**:在最终回复中给出截图清单、按模块分布、未覆盖的操作名、生成的 docx 路径

## 与现有规范的衔接

- 自动化测试用例:`docs/auto-test/case/`;测试报告:`docs/auto-test/result/`;**截图始终落 `docs/screenshot/<项目名>/`**
- 抓包日志(`docs/mitmproxy/logs/`、`docs/run-logs/`)用同一套"模块-功能"命名,便于"图 + 包"对照核查
- 测试报告中引图用相对路径:
  `![提交成功](../../screenshot/copyright-demo-vue1/用户管理-新增用户-提交成功.png)`
- 软著操作手册渲染产物默认在 `.claude/skills/word-template-docx-generator/output/`

## 反例(不要这么做)

- ❌ `screenshot1.png` / `Screenshot 2026-04-29 at 10.30.12.png` — 无法关联功能,JSON 也对不上
- ❌ JSON 写 `"图片": "docs/screenshot/.../xxx.png"` 完整路径 — 脚本只认 basename,反而匹配出错
- ❌ JSON 字段叫 `截图` / `图` — 不含「图片/image/img」,根本不会被识别为图片字段
- ❌ 同名文件分别放在两个子目录里 — `_find_image_by_name` 取首个命中,可能引错图
- ❌ 用拼音 `yonghuguanli-xinzeng-tijiao.png` 替代中文,与 JSON 中文操作名不对齐
- ❌ 把截图写到 `frontend/public/`、`backend/static/` 等业务目录
- ❌ 一个操作只截"成功页",看不出输入条件;或反过来截一堆中间态没有结果

## 自检清单(交付前过一遍)

- [ ] 子目录名 = 当前项目根目录名(`basename $(pwd)`)
- [ ] 每张图严格三段命名,段间 `-`,无时间戳/序号占位
- [ ] 操作名段**逐字等于** JSON 中的「操作名称」字段
- [ ] 文件名在 `docs/screenshot/<项目名>/` 内全局唯一
- [ ] 每个"操作"至少含一张关键结果图,关键异常路径已覆盖
- [ ] 关键页 `fullPage: true`,PNG 格式
- [ ] JSON 中图片字段名包含「图片/image/img」,值只写文件名
- [ ] `render` 命令传了 `--images-dir docs/screenshot/<项目名>`
- [ ] 渲染日志无 `[图片未找到: ...]`
- [ ] docx 模板里已有对应 Jinja 占位符(`操作截图` / `步骤截图`)
