---
name: claude-memory
description: Claude Code 长期记忆系统。使用 LangChain + 向量数据库存储对话，实现跨会话、跨网络、跨电脑的记忆持久化。使用 /save-memory 保存，/recall-memory 检索，/memory-status 查看状态。
version: 1.0.0
author: AI Digital Human Team
tags: [memory, langchain, vector-store, persistence, cross-session]
---

# Claude Code 长期记忆系统

将 Claude Code 对话存储到向量数据库，实现跨会话、跨网络、跨电脑的长期记忆。

## 功能

1. **保存记忆** - 将重要对话内容存储到向量数据库
2. **检索记忆** - 根据语义相似度检索历史对话
3. **自动上下文** - 新会话开始时自动加载相关上下文

## 使用方法

### 保存当前对话到记忆

```bash
# 在项目目录下运行
python .claude/skills/claude-memory/scripts/save_memory.py "要保存的内容" --tag "标签"

# 示例
python .claude/skills/claude-memory/scripts/save_memory.py "用户正在开发AI数字人系统，使用Vue3前端和FastAPI后端" --tag "项目信息"
```

### 检索相关记忆

```bash
# 根据查询检索相关记忆
python .claude/skills/claude-memory/scripts/recall_memory.py "查询内容"

# 示例
python .claude/skills/claude-memory/scripts/recall_memory.py "AI数字人系统架构"
```

### 查看记忆状态

```bash
python .claude/skills/claude-memory/scripts/memory_status.py
```

## 配置

在 `backend/.env` 中配置向量存储：

```env
# 使用 Chroma（本地，推荐开始使用）
VECTOR_STORE_TYPE=chroma
CHROMA_PERSIST_DIR=./data/chroma

# 或使用 PostgreSQL + pgvector（需要服务器安装 pgvector）
# VECTOR_STORE_TYPE=pgvector
# POSTGRES_URL=postgresql://user:pass@host:port/dbname

# Embedding 配置
EMBEDDING_TYPE=local  # 使用本地模型，免费
```

## 工作流程

### 1. 会话开始时自动加载上下文

当你开始新的 Claude Code 会话时，可以运行：

```bash
python .claude/skills/claude-memory/scripts/load_context.py "当前任务描述"
```

这会检索与任务相关的历史记忆并显示。

### 2. 会话结束时保存重要信息

```bash
python .claude/skills/claude-memory/scripts/save_memory.py "今天完成了xxx功能的开发" --tag "进度"
```

### 3. 跨电脑使用

只要配置相同的数据库连接（如使用远程 PostgreSQL + pgvector），记忆就可以跨电脑同步。

## 最佳实践

1. **定期保存** - 完成重要任务后保存到记忆
2. **使用标签** - 用 `--tag` 给记忆分类（项目信息、进度、问题、解决方案等）
3. **语义查询** - 检索时使用自然语言描述，系统会根据语义匹配
4. **定期清理** - 使用 `memory_status.py` 查看并清理过期记忆

## 与 Claude Code 内置 /memory 的区别

| 特性 | 内置 /memory | 本 Skill |
|------|-------------|----------|
| 存储位置 | 本地 ~/.claude/memory.md | 向量数据库（可远程） |
| 跨电脑 | ❌ 需手动同步 | ✅ 自动同步 |
| 语义检索 | ❌ 全文匹配 | ✅ 向量相似度 |
| 容量 | 有限制 | 无限制 |
| 结构化 | 纯文本 | 带元数据和标签 |

## 技术架构

```
┌─────────────────────────────────────────────────────┐
│                  Claude Code                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ save_memory │  │recall_memory│  │load_context │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
└─────────┼────────────────┼────────────────┼─────────┘
          │                │                │
          ▼                ▼                ▼
    ┌─────────────────────────────────────────────┐
    │           memory_service.py                  │
    │  ┌─────────────┐  ┌─────────────────────┐   │
    │  │ Embeddings  │  │    Vector Store     │   │
    │  │ (HuggingFace│  │ (Chroma/pgvector)   │   │
    │  └─────────────┘  └─────────────────────┘   │
    └─────────────────────────────────────────────┘
                         │
                         ▼
    ┌─────────────────────────────────────────────┐
    │            数据库存储                         │
    │  ┌─────────────┐  ┌─────────────────────┐   │
    │  │   Chroma    │  │    PostgreSQL       │   │
    │  │  (本地文件)  │  │    + pgvector       │   │
    │  └─────────────┘  └─────────────────────┘   │
    └─────────────────────────────────────────────┘
```
