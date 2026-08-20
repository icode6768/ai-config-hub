# 可执行安全检查清单（backend / frontend / mobileui）

本清单用于在本项目中快速执行“可复现”的安全检查。

## 0) 准备

- 使用项目虚拟环境 Python：`E:\mywroks\project\ai-digital-human-system\.venv\Scripts\python.exe`
- 后端默认地址：`http://127.0.0.1:5000`
- 如需鉴权接口，先登录获取 `token` 或 `admin_token`

## 1) Backend（API 与服务端）

### 1.1 静态风险扫描（代码侧）

在项目根目录执行：

```bash
rg "os\.system\(|subprocess\.(run|Popen)\(" backend/app
rg "SELECT .*\+|f\"SELECT|execute\(f\"" backend/app
rg "include|importlib|open\(" backend/app
rg "jwt_required\(|get_jwt_identity|create_access_token" backend/app
rg "CORS|flask_cors|cross_origin" backend/app
```

### 1.2 运行后端测试

```bash
E:\mywroks\project\ai-digital-human-system\.venv\Scripts\python.exe scripts/test/run_backend_tests.py
```

### 1.3 安全烟雾测试（脚本化）

```bash
E:\mywroks\project\ai-digital-human-system\.venv\Scripts\python.exe scripts/test/run_security_smoke.py --base-url http://127.0.0.1:5000
```

若需要鉴权场景：

```bash
E:\mywroks\project\ai-digital-human-system\.venv\Scripts\python.exe scripts/test/run_security_smoke.py --base-url http://127.0.0.1:5000 --token "<your_token>"
```

## 2) Frontend（Web）

### 2.1 高风险点静态扫描

```bash
rg "v-html|innerHTML|dangerouslySetInnerHTML" frontend/src
rg "localStorage\.|sessionStorage\." frontend/src
rg "token|admin_token" frontend/src
```

### 2.2 依赖安全与构建检查

```bash
cd frontend
npm audit --omit=dev
npm run build
```

## 3) MobileUI（混合端）

### 3.1 存储与渲染风险扫描

```bash
rg "v-html|innerHTML" mobileui/src
rg "localStorage\.|sessionStorage\." mobileui/src
rg "token|admin_token" mobileui/src
```

### 3.2 构建检查

```bash
cd mobileui
npm run build
```

## 4) 结果输出要求（建议）

每条问题输出：

- `risk`：风险名称
- `evidence`：文件路径/接口证据
- `impact`：业务影响
- `fix`：修复建议（最小变更）
- `verification`：复测方式
- `owasp_mapping`：如 `A03` / `API1`

## 5) 最低通过标准

- 不出现 Critical 未修复项
- 命令注入/SQL 注入/文件包含/上传绕过/IDOR 关键路径均已复测
- CORS 不信任恶意来源
- 关键鉴权接口通过 token 失效/重放检查
