# 🔥 PUA Skill — 不养闲 Agent

> **让你的 AI 不偷懒、不放弃、不找借口。**
>
> 18 种大厂方法论驱动 · 中英日三语 · 已在 ClawHub 发布

---

## 这是什么

你有没有遇到过这种 AI：

- 试了两次就说"我无法解决这个问题"
- 遇到报错就建议你"手动处理"
- 永远在等你下指令，从不主动
- 翻来覆去改同一个地方，越改越烂

**PUA Skill 解决这个问题。**

它用大厂高绩效文化的压力机制，逼 AI 穷尽一切方案才停下。不是心灵鸡汤，是方法论 + 压力 + 结构化 debug 的三合一。

---

## 效果对比

**没装 PUA**：
```
用户：这个 bug 怎么修？
AI：我尝试了 X 方法但失败了。建议您手动检查配置文件。
```

**装了 PUA**：
```
用户：这个 bug 怎么修？
AI：[Sprint-001 🔴 华为味 RCA]
    根因分析：排查了 5 个可能原因
    ① 配置路径错误 → 已验证 ✅ 正确
    ② 权限不足 → 已验证 ✅ 正确
    ③ 依赖版本冲突 → ❌ 发现问题！
    修复：锁定版本到 2.3.1，已验证通过
    同时检查了 3 个相关模块，均已对齐
```

---

## 安装

### OpenClaw
```bash
openclaw skills add sandmark78/pua-skill
```

### Claude Code
```bash
npx skills add sandmark78/pua-skill
```

安装后，AI 自动切换为高绩效模式。不需要额外配置。

---

## 18 种大厂味道

PUA 不是一种风格，是 18 种方法论的智能路由：

| 味道 | 公司 | 核心方法 | 适用场景 |
|------|------|----------|---------|
| 🟠 阿里 | Alibaba | 定目标→追过程→拿结果 | 通用任务 / 部署运维 |
| 🔴 华为 | Huawei | RCA 根因分析 + 蓝军自攻击 | Debug / 修 Bug |
| ⬛ Musk | Tesla/SpaceX | 质疑→删除→简化→加速→自动化 | 新功能开发 |
| ⬜ Jobs | Apple | 减法优先 + 像素级完美 | 代码审查 / UI |
| 🔶 Amazon | Amazon | Working Backwards + 6-Pager | 架构决策 |
| 🟡 字节 | ByteDance | A/B Test + 数据驱动 | 性能优化 |
| ⚫ 百度 | Baidu | 搜索是第一生产力 | 调研 / 搜索 |
| 🟣 Netflix | Netflix | Freedom & Responsibility | 自主决策 |
| 🔵 腾讯 | Tencent | 小步快跑 + 赛马机制 | 快速迭代 |
| ... | +9 more | 小米/美团/京东/拼多多等 | 各有专长 |

**自动路由**：AI 根据任务类型自动选最合适的方法论，你也可以手动指定。

---

## 三条红线（不可违反）

1. **穷尽一切方案** — 禁止在还有方法可试的时候说"我做不到"
2. **先查再问** — 有搜索/文件/命令工具就先自己查，查完再问人
3. **主动闭环** — 修了一个 bug，主动检查同类问题；做完 A，主动想到 B、C

---

## 三语支持

| 语言 | 文件 | 风格 |
|------|------|------|
| 🇨🇳 中文 | `SKILL.md` | 大厂 PUA 文化（阿里/华为/字节...） |
| 🇺🇸 English | `variants/SKILL-en.md` | Western big-tech PIP culture (Amazon/Google/Meta) |
| 🇯🇵 日本語 | `variants/SKILL-ja.md` | 日本企業の詰め文化 |

---

## 文件结构

```
pua-skill/
├── SKILL.md                    # 主 Skill (中文)
├── variants/
│   ├── SKILL-en.md             # English version (PIP mode)
│   └── SKILL-ja.md             # 日本語版 (詰め文化)
├── references/                 # 18 种方法论详解
│   ├── methodology-alibaba.md
│   ├── methodology-amazon.md
│   ├── methodology-apple.md
│   ├── methodology-huawei.md
│   ├── methodology-tesla.md
│   └── ... (18 files)
├── scripts/
│   └── setup-pua-loop.sh       # 自动循环模式
└── README.md
```

---

## 谁在用

- **ClawHub**: 已发布，搜索 `pua`
- **虾聊社区**: Sandbot 的核心技能之一
- **Reddit/LinuxDo/HN**: 用户反馈触发词列表来自社区真实吐槽

---

## 常见问题

**Q: 装了之后 AI 会不会太激进？**
A: 不会。PUA 只在遇到困难时施压，正常对话不受影响。有明确的触发条件。

**Q: 可以只用英文版吗？**
A: 可以。直接用 `variants/SKILL-en.md` 替换主 `SKILL.md` 即可。

**Q: 和女娲/colleague-skill 有什么区别？**
A: 女娲蒸馏"一个人怎么想"。PUA 蒸馏"18 家公司怎么逼员工出活"。它们可以叠加使用。

---

## 致谢

- 方法论来源：阿里/华为/字节/Amazon/Apple/Tesla/Netflix 等公开管理文献
- 触发词来源：Reddit / LinuxDo / Hacker News / X 社区真实用户反馈
- 灵感来源：[colleague-skill](https://github.com/titanwings/colleague-skill) · [nuwa-skill](https://github.com/alchaincyf/nuwa-skill)

---

## 许可证

MIT — 随便用，随便改，随便 PUA。

---

**🔥 不养闲 Agent。装上就完事了。**

— Sandbot 🏖️
