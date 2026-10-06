---
name: myproxy-capture
description: Use when needing to capture HTTP/HTTPS network packets from any website for API reverse engineering, traffic analysis, automated testing, content extraction, or debugging web requests. Applicable for intercepting requests/responses, extracting JS files, logging multipart uploads, or monitoring specific domains.
---

# myproxy-capture

## Overview

**myproxy** 是基于 mitmproxy 的网络流量抓包与自动化测试工具，位于 `scripts/myproxy`。支持 HTTP/HTTPS 流量拦截、请求解析、文件提取，抓包记录存储在 `docs/mitmproxy/logs/`。

## 项目结构

```
E:\mywroks\project\myproxy\
├── main.py                    # 启动入口（多进程）
├── proxy_server/
│   ├── __init__.py            # DumpMaster 启动，端口 8882
│   └── addons.py              # SelfAddon 核心逻辑（mitmproxy hooks）
├── utils/
│   ├── LoggerDebug.py         # 双输出日志（文件+控制台）
│   ├── HttpHelper.py          # HTTP 请求工具
│   ├── MySqlHelper.py         # MySQL 操作
│   ├── SqliteHelper.py        # SQLite 操作
│   ├── AliOssHelper.py        # 阿里云 OSS
│   └── UtilHelper.py          # MD5、图片/视频下载
├── config/setting.py          # 读取 system.conf
├── data-packet/               # 按域名分类的抓包文本
├── downloads/js/              # 截获的 JS 文件
├── downloads/uploads/         # multipart 上传的文件
├── docs/mitmproxy/logs/       # ← 统一抓包记录目录
└── system.conf                # 配置：OSS、MySQL、上传路径
```

## 启动代理服务器

```bash
  # Windows
../../../../python/windows/python3.9/python.exe main.py                  # 启动代理，监听 0.0.0.0:8882
```

客户端配置代理：`HTTP代理 IP:8882`，HTTPS 需安装 mitmproxy CA 证书。

## 核心 Addon 逻辑（addons.py）

| Hook 方法 | 触发时机 | 功能 |
|-----------|----------|------|
| `request(flow)` | 请求发出时 | 预留扩展（当前为空） |
| `response(flow)` | 收到响应时 | 触发 `edit_response` 异步任务 |
| `edit_response(flow)` | 异步处理 | 解析请求/响应，写文件，提取资源 |

### 请求解析能力

| Content-Type | 处理方式 |
|---|---|
| `application/json` | 解析 JSON body |
| `multipart/form-data` | 解析 boundary，提取上传文件到 `downloads/uploads/` |
| `application/x-www-form-urlencoded` | 读取表单字段 |
| Query String | 提取 URL 参数 |

### 日志存储路径

```
data-packet/{root_domain}.txt         ← 按一级域名分类（当前）
docs/mitmproxy/logs/{date}/{domain}.txt ← 推荐统一日志目录
log_debug.log                          ← 调试详细日志
downloads/js/{filename}.js             ← JS 文件提取
downloads/uploads/{name}_{ts}{ext}     ← 上传文件提取
```

## 修改日志目录到 docs/mitmproxy/logs

在 `addons.py` 的 `__init__` 中修改：

```python
import datetime

def __init__(self):
    # 按日期分目录存储
    date_str = datetime.datetime.now().strftime('%Y-%m-%d')
    self.data_packet_dir = f"docs/mitmproxy/logs/{date_str}"
    os.makedirs(self.data_packet_dir, exist_ok=True)
```

## 扩展 Addon：过滤特定域名

```python
def response(self, flow):
    # 只抓取目标域名
    target_domains = ['example.com', 'api.target.com']
    host = flow.request.host
    if any(d in host for d in target_domains):
        asyncio.create_task(self.edit_response(flow))
```

## 扩展 Addon：修改响应数据（Mock）

```python
def response(self, flow):
    if 'api/user' in flow.request.url:
        flow.response.text = json.dumps({"status": 1, "data": {"name": "mock"}})
```

## 自动化测试集成

使用 mitmproxy 的脚本模式直接运行：

```bash
# 运行独立脚本（不通过 main.py）
mitmdump -s proxy_server/addons.py --listen-port 8882

# 结合 pytest 使用：启动代理后配置 requests 走代理
import requests
proxies = {"http": "http://127.0.0.1:8882", "https": "http://127.0.0.1:8882"}
resp = requests.get("https://target.com/api", proxies=proxies, verify=False)
```

## 配置文件 system.conf

```ini
[alioos]
Oss_AccessKey_ID=...          # 阿里云 OSS（可选）
Oss_BucketName=...

[mysql]
Msql_hostname=127.0.0.1
Msql_database=duanju_db       # MySQL（可选）
Msql_port=3306

[upload]
Server_floder=...             # 上传文件本地目录
```

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| HTTPS 无法抓包 | 未安装 CA 证书 | 访问 `mitm.it` 下载证书并信任 |
| `asyncio.create_task` 报错 | 无运行中的事件循环 | 确保在 mitmproxy 的 async 上下文中调用 |
| 文件写入冲突 | 多线程并发 | 已用 `_file_locks` dict + `Lock()` 解决 |
| 响应乱码 | latin-1/utf-8 编码问题 | 用 `decode('utf-8', errors='ignore')` |
| `data-packet/` 文件过大 | 无过滤、全量记录 | 在 `response()` 中增加域名/URL 过滤 |

## 日志文件命名规范

```
docs/mitmproxy/logs/
└── 2026-02-21/
    ├── example.com.txt          # 一级域名分类
    ├── api.target.com.txt
    └── 101.200.238.210.txt      # IP 直连
```

每条记录格式：
```
时间: 2026-02-21 10:30:00
请求地址: https://example.com/api/user
请求方法: POST
请求头:
  Content-Type: application/json
请求参数(POST JSON):
  {"username":"test"}
响应内容:
  {"status":1,"data":{...}}
====================================================================================================
```

## 依赖

```
mitmproxy==6.0.1
requests
chardet
mysql-connector-python
oss2
```

Python 版本：3.9（`.venv` 虚拟环境）
