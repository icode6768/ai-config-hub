---
name: project-web-security
description: 面向本仓库的 Web 安全审计与修复工作流（Flask + Vue + 移动混合端）。当需要排查、加固或修复 API、安全认证、令牌处理、文件上传、CORS、权限控制、前端渲染与存储风险时使用此 skill。
---

# 项目 Web 安全

## 目标

在本仓库执行可复用、基于证据的安全工作流。
同时覆盖“问题发现”和“问题修复”，并与 OWASP Web Top 10（2021）、OWASP API Top 10（2023）及 ASVS 控制项对齐。

## 适用场景

当需求包含以下内容时使用：
- 安全审计、渗透检查清单或加固方案
- “检查并修复” API 安全/认证漏洞
- JWT/Token/会话/CORS/上传/IDOR/批量赋值风险
- 前端 XSS/浏览器存储/客户端安全审查
- 命令注入、文件包含、点击劫持、敏感文件暴露等传统 Web 高风险问题

## 仓库上下文

重点代码位置：
- 后端：`backend/app`（Flask + SQLAlchemy + JWT）
- 前端：`frontend/src`
- 移动端 Web UI：`mobileui/src`
- 可能存在其他 UI 应用（`manageui`、`dcknowledge*`、`cms-*`、`vpn-*`、`multi-*`）

修复时需要保持的项目约束：
- 除非明确要求前后端联动重构，否则保持 API 返回约定（`status`、`message`、`data`）
- 保持前后端字段命名一致
- 新增可见文案时补齐 i18n

## 必须执行的工作流

1) 范围与攻击面梳理
- 枚举认证端点、受保护端点、上传端点、管理功能与第三方集成点。
- 按模块建立“路径可追踪”的检查清单（如 `auth`、`content`、`knowledge`、`material` 等）。

2) 证据收集（禁止猜测）
- 使用代码搜索定位已实现能力与缺口：
  - 认证/鉴权（`jwt_required`、角色/模块权限校验）
  - Token 签发/刷新/吊销逻辑
  - 对象级访问的归属校验
  - 输入白名单与属性级权限控制
  - CORS/CSRF/限流/安全响应头
  - 文件上传校验与落盘路径
  - 客户端 Token 存储与高风险 HTML 渲染（`v-html`、`innerHTML`）
- 每个发现都必须记录“精确文件路径 + 行号证据”。

3) 风险分级（Critical/High/Medium）
- 优先级建议：
  - Critical：BOLA/IDOR、认证/会话失效、批量赋值、CORS 凭证滥用、密钥泄露
  - High：上传链路缺陷、缺少滥用/限流控制、JWT 校验薄弱
  - Medium：安全头/方法/内容类型加固不足、资产清单与文档缺口

4) 修复落地
- 采用最小化、根因导向的修复，并保持现有代码风格。
- 优先使用白名单模型：
  - 在 create/update API 中明确可写字段白名单
  - 在每个对象访问路径强制 owner/tenant 作用域
  - 显式限制 CORS 的 origin/method/header
  - 对上传文件进行扩展名与内容签名校验（适用时）
- Token 处理策略：
  - 若架构允许，优先从浏览器本地存储迁移到加固 Cookie/会话模型。
  - 若历史包袱导致短期仍需本地存储，则缩短 TTL、启用轮换、加强 XSS 防护，并制定迁移计划。

5) 验证
- 重新执行静态搜索模式，确认不安全模式已被移除或纳入控制。
- 对变更模块执行项目检查（测试/构建/类型检查）。
- 对 API 执行可复现安全探针：
  - IDOR 篡改尝试必须失败
  - 禁止的批量赋值字段必须被忽略/拒绝
  - 登出或轮换后的 Token 重放必须失败
  - 未批准的 CORS Origin 不得被信任
  - 非法上传必须返回可控的 `4xx`

6) OWASP 双基线对照
- 将每个发现至少映射到一个 OWASP 分类：
  - Web Top 10（2021）：A01~A10
  - API Top 10（2023）：API1~API10
- 输出时必须标注映射标签，例如：`A03 Injection`、`API3 BOPLA`。

## OWASP Web Top 10（2021）检查项

1. A01 Broken Access Control（访问控制失效）
2. A02 Cryptographic Failures（加密机制失效）
3. A03 Injection（注入）
4. A04 Insecure Design（不安全设计）
5. A05 Security Misconfiguration（安全配置错误）
6. A06 Vulnerable and Outdated Components（脆弱和过期组件）
7. A07 Identification and Authentication Failures（身份认证失效）
8. A08 Software and Data Integrity Failures（软件与数据完整性失效）
9. A09 Security Logging and Monitoring Failures（日志和监控失效）
10. A10 SSRF（服务端请求伪造）

## 你的笔记重点（并入必查）

- 命令执行/命令注入：重点检查拼接命令、系统调用参数注入风险（对应 A03）。
- CSRF：检查状态变更接口是否具备 CSRF 防护或等效机制（对应 A01/A05）。
- 文件包含：检查本地/远程文件包含、路径穿越、动态 include/import 风险（对应 A03/A05）。
- XSS：检查富文本/模板渲染、`v-html`/`innerHTML` 与 Cookie 安全属性（对应 A03/A07）。
- 点击劫持：检查 `X-Frame-Options` / CSP `frame-ancestors`（对应 A05）。
- 上传漏洞：检查双扩展名、伪装内容、可执行落盘与权限（对应 A05）。
- SQL 注入：检查参数化查询与异常处理，拒绝拼接 SQL（对应 A03）。
- 敏感文件暴露：检查 `.env`、备份文件、配置泄露、目录索引（对应 A05/A09）。
- SDL：在修复后补充安全测试和回归流程（对应 A04/A09）。

## 安全基线（按此顺序执行）

1. A01/API1/API5（对象级与函数级访问控制）
2. A07/API2（认证与会话完整性）
3. A03/API3（注入与属性级授权/批量赋值）
4. A05/API8（安全配置错误：CORS、响应头、调试暴露）
5. A10/API7（SSRF 与出网访问约束）
6. A06（依赖漏洞与过期组件）
7. A09/API10（日志监控、第三方 API 消费风险）
8. 上传、文件包含、点击劫持等笔记专项

详细检查项与修复要点见：
`references/security-baseline.md`

可直接执行的命令清单见：
`references/executable-checklist.md`

## 安全执行输出格式

返回结果时采用以下格式：
- 先给发现项，按严重级别排序
- 每条发现包含：`risk`、`evidence`、`impact`、`fix`、`verification`、`owasp_mapping`
- 然后提供：
  - 按文件维度的补丁摘要
  - 已执行验证命令与结果
  - 残余风险与下一步加固建议

## 必做事项

- 所有发现必须有证据（路径级）
- 修复根因，而非只修表现
- 除非安全修复确需行为变更，否则保持现有业务行为
- 在项目约束要求下保持 API 返回结构兼容

## 禁止事项

- 禁止用忽略指令压制类型/安全问题
- 禁止通过删除失败测试来“通过校验”
- 禁止在带凭证 API 上引入通配符 CORS
- 禁止仅依赖前端权限判断
- 禁止在日志中暴露敏感密钥/Token

## 外部标准参考

- OWASP Web Top 10（2021）
- OWASP API Security Top 10（2023）
- OWASP ASVS
- OWASP REST Security / JWT / File Upload 速查表
