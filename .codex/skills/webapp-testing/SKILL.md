---
name: webapp-testing
description: 用 Playwright 驱动本地 Web 应用进行测试、调试与取证截图。覆盖前端功能验证、UI 行为调试、浏览器日志查看,以及"操作手册截图 / 功能截图 / 模块首页截图 / 步骤截图 / 软著留痕图 / UI 验收图"等结构化截图采集。当用户要求"测试页面/功能"、"自动化测试"、"打开浏览器测试/演示"、"录制截图"、"取证截图"、"操作手册截图"、"功能截图"、"补图"、"出操作手册",或编写 Playwright 脚本驱动浏览器进行验收时务必使用本技能。**截图归档必须遵循 browser-test-screenshot skill 的命名/路径规范**(写入 `docs/screenshot/<项目名>/`,文件名按当前模板的 3 层占位符对齐:登录截图 / 模块首页 / 功能首页),不要再写 `/tmp/*.png` 这类一次性路径。
license: Complete terms in LICENSE.txt
---

# Web Application Testing

To test local web applications, write native Python Playwright scripts.

## 与 browser-test-screenshot 联用(取证/手册截图必读)

当用户的目标是"操作手册截图 / 功能截图 / 模块首页 / 步骤截图 / 软著留痕"等**结构化截图归档**(而不是临时勘察 DOM),按下面规范执行,不要图省事写 `/tmp/inspect.png`:

- 输出目录:`<项目根>/docs/screenshot/<项目名>/`(项目名 = 项目根目录名,本仓库即 `copyright-demo-vue1`)
- 文件命名按 **4 层** 对齐 word-template-docx-generator 模板的图片占位符:

  | 层级 | 模板占位符 | 文件名 |
  |---|---|---|
  | 系统 | `{{ 登录界面截图 }}` | `通用-登录-登录界面.png` |
  | 模块 | `{{ module.模块首页截图 }}` | `<模块名>-00-模块首页.png` |
  | 功能 | `{{ feature.功能截图 }}` | `<模块名>-<功能名>-功能首页.png` |
  | 步骤 | `{{ step.操作截图 }}` | `<模块名>-<功能名>-<操作名>-步骤<N>.png` |

- 模块名 / 功能名 / 操作名段位**逐字等于**操作手册 JSON 中的 `模块名` / `功能名称` / `操作名称`,中文不转拼音,文件名在该目录内**全局唯一**(脚本是模糊匹配,撞名会引错图)。
- 完整规范见 `browser-test-screenshot` skill;批量补字段/拍图清单工具:`scripts/test/augment_manual_json_with_images.py`。
- 临时勘察 DOM(找选择器、调试)用 `/tmp/*.png` 仍然可以,**只是不要把这种一次性截图当成手册图归档**。

Playwright 脚本里把目录定下来一次,后续直接拼文件名:

```python
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[2]    # 视脚本位置调整
SHOT_DIR = PROJECT_ROOT / "docs" / "screenshot" / PROJECT_ROOT.name
SHOT_DIR.mkdir(parents=True, exist_ok=True)

page.screenshot(path=str(SHOT_DIR / "课程与文化资源管理-课程管理-新增课程-步骤2.png"), full_page=True)
```


**Helper Scripts Available**:
- `scripts/with_server.py` - Manages server lifecycle (supports multiple servers)

**Always run scripts with `--help` first** to see usage. DO NOT read the source until you try running the script first and find that a customized solution is abslutely necessary. These scripts can be very large and thus pollute your context window. They exist to be called directly as black-box scripts rather than ingested into your context window.

## Decision Tree: Choosing Your Approach

```
User task → Is it static HTML?
    ├─ Yes → Read HTML file directly to identify selectors
    │         ├─ Success → Write Playwright script using selectors
    │         └─ Fails/Incomplete → Treat as dynamic (below)
    │
    └─ No (dynamic webapp) → Is the server already running?
        ├─ No → Run: python scripts/with_server.py --help
        │        Then use the helper + write simplified Playwright script
        │
        └─ Yes → Reconnaissance-then-action:
            1. Navigate and wait for networkidle
            2. Take screenshot or inspect DOM
            3. Identify selectors from rendered state
            4. Execute actions with discovered selectors
```

## Example: Using with_server.py

To start a server, run `--help` first, then use the helper:

**Single server:**
```bash
python scripts/with_server.py --server "npm run dev" --port 5173 -- python your_automation.py
```

**Multiple servers (e.g., backend + frontend):**
```bash
python scripts/with_server.py \
  --server "cd backend && python server.py" --port 3000 \
  --server "cd frontend && npm run dev" --port 5173 \
  -- python your_automation.py
```

To create an automation script, include only Playwright logic (servers are managed automatically):
```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True) # Always launch chromium in headless mode
    page = browser.new_page()
    page.goto('http://localhost:5173') # Server already running and ready
    page.wait_for_load_state('networkidle') # CRITICAL: Wait for JS to execute
    # ... your automation logic
    browser.close()
```

## Reconnaissance-Then-Action Pattern

1. **Inspect rendered DOM**(仅用于一次性勘察 / 找选择器,不要当作归档图):
   ```python
   page.screenshot(path='/tmp/inspect.png', full_page=True)   # 勘察用,临时文件
   content = page.content()
   page.locator('button').all()
   ```
   归档(操作手册图、功能图、留痕图)请用上面"与 browser-test-screenshot 联用"小节里的 `SHOT_DIR / "<模块>-<功能>-<操作>-步骤<N>.png"` 写法。

2. **Identify selectors** from inspection results

3. **Execute actions** using discovered selectors

## Common Pitfall

❌ **Don't** inspect the DOM before waiting for `networkidle` on dynamic apps
✅ **Do** wait for `page.wait_for_load_state('networkidle')` before inspection

## Best Practices

- **Use bundled scripts as black boxes** - To accomplish a task, consider whether one of the scripts available in `scripts/` can help. These scripts handle common, complex workflows reliably without cluttering the context window. Use `--help` to see usage, then invoke directly. 
- Use `sync_playwright()` for synchronous scripts
- Always close the browser when done
- Use descriptive selectors: `text=`, `role=`, CSS selectors, or IDs
- Add appropriate waits: `page.wait_for_selector()` or `page.wait_for_timeout()`

## Reference Files

- **examples/** - Examples showing common patterns:
  - `element_discovery.py` - Discovering buttons, links, and inputs on a page
  - `static_html_automation.py` - Using file:// URLs for local HTML
  - `console_logging.py` - Capturing console logs during automation