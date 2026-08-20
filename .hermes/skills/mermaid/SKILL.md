---
name: mermaid
description: 使用 Mermaid 语法生成各类图表（流程图、时序图、架构图、ER图、甘特图、状态图、饼图等）。当用户需要绘制系统架构、业务流程、数据关系、项目计划等可视化图表时使用。
---

# Mermaid 图表技能

用 Mermaid 文本语法生成图表，输出可直接渲染的 mermaid 代码块。

## 使用方式

根据用户需求选择合适的图表类型，输出标准的 ```mermaid 代码块。语法必须严格正确，避免渲染失败。

## 图表类型与语法要点

### 1. 流程图 (flowchart)
```mermaid
flowchart TD
    A[开始] --> B{条件判断}
    B -->|是| C[处理1]
    B -->|否| D[处理2]
    C --> E[结束]
    D --> E
```
- 方向：`TD`(上到下) `LR`(左到右) `BT` `RL`
- 节点：`[矩形]` `(圆角)` `{菱形}` `((圆形))`
- 连线：`-->` `---` `-.->` `==>`，可带标签 `-->|文字|`

### 2. 时序图 (sequenceDiagram)
```mermaid
sequenceDiagram
    participant U as 用户
    participant S as 系统
    U->>S: 发起请求
    S-->>U: 返回结果
```
- `->>` 实线箭头，`-->>` 虚线返回
- 支持 `activate/deactivate`、`Note`、`loop`、`alt/else`

### 3. 架构图
用 flowchart + subgraph 分层：
```mermaid
flowchart TB
    subgraph 前端
        A[Vue3]
    end
    subgraph 后端
        B[Flask]
    end
    A --> B
```

### 4. ER图 (erDiagram)
```mermaid
erDiagram
    PATIENT ||--o{ MEDICATION : "拥有"
    PATIENT {
        int id PK
        string name
    }
```

### 5. 甘特图 (gantt)
```mermaid
gantt
    title 项目计划
    dateFormat YYYY-MM-DD
    section 阶段一
    任务A :a1, 2026-07-01, 7d
```

### 6. 状态图 (stateDiagram-v2)
```mermaid
stateDiagram-v2
    [*] --> 待执行
    待执行 --> 进行中
    进行中 --> 已完成
```

### 7. 饼图 (pie)
```mermaid
pie title 标题
    "分类A" : 40
    "分类B" : 60
```

## 输出要求

1. 只输出可渲染的 mermaid 代码块，语法严格校验。
2. 节点文字含特殊字符（括号、引号、冒号）时用引号包裹：`A["文字(含括号)"]`。
3. 中文标签正常使用，无需转义。
4. 复杂图表适当拆分，避免单图过于密集。
5. 默认给出简短说明 + 代码块，不要冗余解释。
