---
name: pii-masking
description: "用可逆令牌对数据脱敏后再交给大模型，处理完成后在本地精确还原。当用户要把含隐私（姓名、手机号、身份证、银行卡、邮箱、公司名、工资金额）的文件或文本交给大模型分析/统计，又要求结果能还原成真实信息时使用。典型场景：员工工资表脱敏统计。"
---

# PII 数据脱敏（可逆令牌）

## 用途

在把数据交给大模型前，先把隐私字段替换为稳定唯一的令牌（如 `【脱敏_姓名_001】`），
大模型只看到令牌；处理（统计/分析/改写）完成后，用本地映射表把结果里的令牌
**精确还原**为真实值。

**为什么用令牌而不是星号**：纯星号（`张**`）不可逆——同姓会冲突、大模型改写后无法匹配。
每个唯一真实值映射到唯一令牌，且同一值全篇复用同一令牌，大模型才能正确聚合统计。

## 支持字段

- 强正则（自动识别）：手机号、身份证、银行卡、邮箱
- 词表 / 按列（需指定）：姓名、公司·组织名、工资金额

## 支持的文件类型

- 纯文本：.txt/.md/.json/.log/.html/.xml/.yaml/.sql 等
- 表格：.csv（按列脱敏最可靠；.xlsx 请先另存为 .csv）
- **Word 文档：.docx**（自动解开 zip，只对正文/页眉/页脚 `<w:t>` 文本脱敏，
  保留排版、表格、图片，输出仍是可正常打开的 .docx；还原同理）

> 注意：.docx / .xlsx 是 **二进制 zip 压缩包，不是纯文本**。直接把它当文本读会得到乱码、
> 脱不了敏且会损坏文件——必须用本脚本的 .docx 专门通道（独立脚本 `scripts/pii_mask.py`
> 已内置）。浏览器体验页当前只处理纯文本/CSV，**Word 文档请走 CLI**。

## 核心工具

- **独立脚本（推荐）：`scripts/pii_mask.py`**（技能目录内，单文件、纯标准库、零外部依赖）。
  把它单独拷到任何机器/任何目录，装个 Python 3.7+ 就能直接跑，不依赖本仓库任何模块。
- 体验页：`templates/playground.html`（自包含网页，双击即可在浏览器本地体验脱敏→还原全流程，数据不外传）
- 仓库集成版（可选）：`backend/app/utils/pii_masker.py`（`PIIMasker` 类）、
  `backend/app/api/v1/pii_masker_api.py`（HTTP API）、`scripts/test/pii_mask_cli.py`（仓库内 CLI）。
  这些用于把脱敏能力接进后端服务；独立使用时只需上面的 `scripts/pii_mask.py`。

## 独立运行（无需后端、无需本仓库）

技能自带的 `scripts/pii_mask.py` 是单文件自包含脚本，命令格式与下文 CLI 完全一致，
只是把 `scripts/test/pii_mask_cli.py` 换成技能目录里的 `scripts/pii_mask.py`：

```bash
# 进入技能 scripts 目录，或用脚本的绝对/相对路径都可以
python .claude/skills/pii-masking/scripts/pii_mask.py mask \
  --in salary.csv --out salary.masked.csv \
  --columns "姓名:姓名,公司:公司,手机号:手机,工资:金额"

# 不带子命令直接运行 = 跑一遍 round-trip 自检，验证脚本可独立工作
python .claude/skills/pii-masking/scripts/pii_mask.py
```

后面所有 `python scripts/test/pii_mask_cli.py ...` 的例子，都可以原样把命令里的脚本路径
替换成 `.claude/skills/pii-masking/scripts/pii_mask.py`，参数和行为一致。

## 快速体验（无需后端）

直接用浏览器打开 `templates/playground.html`：
1. 选「文本模式」或「表格模式（CSV）」，点「载入示例」。
2. 点「🔒 脱敏」查看只含令牌的结果与本地映射表。
3. 把脱敏内容交大模型处理后，把含令牌的返回结果粘到第 3 步，点「🔓 还原」得到真实信息。

该页脱敏逻辑（令牌格式、正则、按列脱敏、容错还原）与后端 `pii_masker.py` 完全一致。

**批量上传（页面底部「上传文件/文件夹脱敏」卡片）**：
- 「选择文件」可多选；「选择文件夹」上传整个目录（保留子目录结构）。
- 点「🔒 脱敏并打包下载 ZIP」→ 浏览器本地脱敏后打包为 `masked.zip`（含 `_maskmap.json`），非文本文件原样打包。
- 「批量还原」上传含令牌的结果文件/文件夹 + `_maskmap.json` → 下载 `restored.zip`。
- 全程不上传服务器；ZIP 为自包含纯 JS 实现，无需联网。

## 工作流程

### 1. 读取并理解数据
- 表格（xlsx/csv）：用 `xlsx` skill 读取；非 csv 先另存为 csv。
- 自由文本：直接读取。
- 确认哪些是隐私字段。表格优先**按列脱敏**（最可靠）；文本用正则 + 姓名/公司词表。

### 2. 脱敏（生成脱敏文件 + 映射表）

表格按列脱敏（列名:类型，类型取 姓名/公司/手机/身份证/银行卡/邮箱/金额）：
```bash
python scripts/test/pii_mask_cli.py mask \
  --in salary.csv --out salary.masked.csv \
  --columns "姓名:姓名,公司:公司,手机号:手机,工资:金额"
```

自由文本脱敏（正则字段自动识别，姓名/公司用词表精确替换）：
```bash
python scripts/test/pii_mask_cli.py mask \
  --in note.txt --out note.masked.txt \
  --names "张三,李四" --orgs "北京华信科技有限公司"
```

命令会生成 `<输出文件>.maskmap.json` 映射表。
**重要：映射表只留在本地，绝不能发给大模型。**

#### 批量：脱敏整个文件夹

`--in` 传目录即递归脱敏其中所有文本文件，另存为新目录（保持子目录结构），
**整批共用一份映射表**（同一真实值跨文件用同一令牌，便于统一还原和跨文件统计）：
```bash
python scripts/test/pii_mask_cli.py mask \
  --in ./hr_data --out ./hr_data_masked \
  --columns "姓名:姓名,公司:公司,工资:金额" \
  --names "张三,李四" --orgs "北京华信科技有限公司"
```
- 默认处理常见文本类型（.txt/.csv/.json/.md/.log/.html/.sql/.yaml 等），可用 `--ext "txt,csv,json"` 自定义。
- 非文本文件（图片、压缩包等）**原样复制**到新目录，保证目录完整。
- `--columns` 对目录内所有 CSV 生效（只脱敏存在的列）；`--names/--orgs` 对所有文本生效。
- 映射表默认写到 `<输出目录>/_maskmap.json`。

### 3. 交大模型处理
把**脱敏后的文件/文本**（只含令牌）交给大模型做统计、分析或改写。
要求大模型在结果中**原样保留令牌**（不要翻译或改写 `【脱敏_..._001】`）。

### 4. 还原
把大模型返回的结果存成文件，用映射表还原：
```bash
python scripts/test/pii_mask_cli.py restore \
  --in llm_result.txt --out final.txt \
  --map salary.masked.csv.maskmap.json
```
还原支持文本与 csv，且对方括号被改写（`【】`→`[]`）有容错。
`--in` 同样可传**目录**，递归还原整个文件夹（非文本文件原样复制）：
```bash
python scripts/test/pii_mask_cli.py restore \
  --in ./llm_results --out ./final --map ./hr_data_masked/_maskmap.json
```

## 在 Python 中直接调用

```python
from app.utils.pii_masker import PIIMasker, FIELD_NAME, FIELD_ORG, FIELD_SALARY, FIELD_PHONE

masker = PIIMasker()
# 表格按列
masked_rows, mp = masker.mask_records(rows, {"姓名": FIELD_NAME, "公司": FIELD_ORG, "工资": FIELD_SALARY})
# 文本
masked_text, mp = masker.mask_text(text, name_list=["张三"], org_list=["华信科技"])
# 还原（支持 str/dict/list 递归）
real = masker.restore(llm_output)          # 用同一实例的映射表
real = PIIMasker.from_map(mp).restore(out) # 用外部映射表
```

## 注意事项
- 映射表是还原的唯一依据，妥善保管、勿外泄、勿提交给大模型。
- 大模型若改写了令牌的数字序号则无法还原——提示它保留令牌原文。
- 公司名/姓名在自由文本中靠词表精确匹配；没有词表时可用 `--org-heuristic`（精度有限）。
