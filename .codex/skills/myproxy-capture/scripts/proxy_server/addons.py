# -*- coding: utf-8 -*-
"""
自定义mimproxy脚本 详细见 https://docs.mitmproxy.org/stable/addons-overview/
由于使用anyproxy的历史原因 这里会解析mitmproxy代理数据为anyproxy同样的格式
"""
import json
import sys
import re
import requests
import random
import threading
import  html
import traceback
import time
import os
import sqlite3
import queue
import chardet
import certifi
import datetime
import fnmatch
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from threading import Thread, Lock
from config import setting
from utils.HttpHelper import HttpHelper
from utils.SqliteHelper import SqliteHelper
from utils.LoggerDebug import LoggerDebug
from utils.MySqlHelper import MySqlHelper
from utils.AliOssHelper import AliOssHelper
from utils.UtilHelper import UtilHelper
import ssl
import asyncio


# 设置 SSL/TLS 上下文为不验证服务器证书
ssl._create_default_https_context = ssl._create_unverified_context

class SelfAddon:
    # lock1 = threading.RLock()
    # 文件写入锁，确保多线程安全
    _file_locks = {}
    _locks_lock = Lock()

    userId=''
    folder_path = ''

    def get_root_domain(self, url):
        """
        Extract log file key from URL.
        - Non-standard port is appended with underscore: 192.168.1.58:3006 -> 192.168.1.58_3006
        - Standard ports (80/443) are omitted: example.com:80 -> example.com
        - Sub-domains are stripped: demons.dianxiaomi.com -> dianxiaomi.com
        """
        try:
            parsed = urlparse(url)
            # parsed.hostname strips port and lowercases; parsed.port is int or None
            host = parsed.hostname or ''
            port = parsed.port          # None when not specified in URL
            scheme = (parsed.scheme or 'http').lower()

            # Fallback for bare "host:port/path" strings (no scheme)
            if not host:
                netloc = (parsed.netloc or parsed.path).split('/')[0]
                if ':' in netloc:
                    h, p = netloc.rsplit(':', 1)
                    host = h
                    try:
                        port = int(p)
                    except ValueError:
                        port = None
                else:
                    host = netloc

            # Build root domain (strip sub-domains for named hosts)
            if re.match(r'^\d+\.\d+\.\d+\.\d+$', host):
                root = host                         # IP: use as-is
            elif host in ('localhost', ''):
                root = host or 'unknown'
            else:
                parts = host.split('.')
                root = '.'.join(parts[-2:]) if len(parts) >= 2 else host

            # Append port only when non-standard
            _default = {'http': 80, 'https': 443, 'ftp': 21}
            if port is not None and port != _default.get(scheme):
                return f"{root}_{port}"

            return root
        except Exception:
            return 'unknown'
    
    def get_file_lock(self, domain):
        """
        获取指定域名的文件写入锁
        """
        with self._locks_lock:
            if domain not in self._file_locks:
                self._file_locks[domain] = Lock()
            return self._file_locks[domain]
    
    def save_packet_to_file(self, domain, packet_data):
        """
        将数据包保存到指定域名的文件中
        """
        try:
            filename = os.path.join(self.data_packet_dir, f"{domain}.txt")
            lock = self.get_file_lock(domain)
            
            with lock:
                with open(filename, 'a', encoding='utf-8', errors='ignore') as f:
                    f.write(packet_data)
                    f.write('\n' + '='*100 + '\n')
        except Exception as e:
            print(f"保存数据包到文件失败: {e}")

    async def start_loop(self):
        print('start async task')

    def __init__(self):
        # 项目根目录
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", ".."))
        # 按日期分目录存储抓包记录到 项目根目录/docs/mitmproxy/logs
        date_str = datetime.datetime.now().strftime('%Y-%m-%d')
        self.data_packet_dir = os.path.join(project_root, "docs", "mitmproxy", "logs", date_str)
        os.makedirs(self.data_packet_dir, exist_ok=True)
        # 兼容旧目录
        os.makedirs("data-packet", exist_ok=True)

        # 读取 bypass hosts 配置（绕过外部代理的域名列表）
        self._bypass_hosts = []
        try:
            config = setting.load_config()
            if config.has_section('external_proxy'):
                enabled = config.get('external_proxy', 'enabled', fallback='false').strip().lower()
                if enabled in ('true', '1', 'yes'):
                    bypass_str = config.get('external_proxy', 'bypass_hosts', fallback='').strip()
                    self._bypass_hosts = [h.strip() for h in bypass_str.split(',') if h.strip()]
                    always_bypass_localhost = config.get(
                        'external_proxy', 'always_bypass_localhost', fallback='true'
                    ).strip().lower() in ('true', '1', 'yes')
                    if always_bypass_localhost:
                        for h in ('localhost', '127.0.0.1', '::1'):
                            if h not in self._bypass_hosts:
                                self._bypass_hosts.append(h)
        except Exception as e:
            print(f'[External Proxy] 读取 bypass_hosts 配置异常: {e}')

    def _is_bypass_host(self, hostname):
        """
        检查指定域名是否在绕过代理列表中。
        支持通配符匹配，如 *.local, *.example.com
        """
        if not self._bypass_hosts or not hostname:
            return False
        for pattern in self._bypass_hosts:
            if fnmatch.fnmatch(hostname, pattern):
                return True
        return False

    def request(self, flow):
        # 如果当前请求的域名在 bypass 列表中，切换为直连模式（不走上游代理）
        if self._bypass_hosts:
            hostname = flow.request.pretty_host
            if self._is_bypass_host(hostname):
                flow.live = False  # 断开当前连接，mitmproxy 将以直连方式重新连接
                pass

    async def edit_response(self,flow):
        try:
            # system_config=setting.load_config()
            # sqliteHelper = SqliteHelper()
            # aliOssHelper = AliOssHelper()
            # mySqlHelper = MySqlHelper()
            utilHelper=UtilHelper()
            system_config = setting.load_config()

            # sys.stdout=LoggerDebug("log_debug.log")
            loggerDebug = LoggerDebug("log_debug.log")
            # print('============================')
            # print('发包>>>>')
            loggerDebug.write("「===================================================================================================================\r\n")
            loggerDebug.write("发包>>>>\r\n")

            req_url = flow.request.url
            req_headers = flow.request.headers
            req_method = flow.request.method
            req_scheme = flow.request.scheme
            req_path = flow.request.path
            req_text = flow.response.text
            req_qurey = flow.request.query
            req_from = flow.request.urlencoded_form


            print('请求地址:', req_url)
            print('请求方法:', req_method)
            # print('请求头>')
            # print(req_headers)


            encoded_data = req_url.encode('latin-1')
            try:
                decoded_data = encoded_data.decode("utf-8")
                req_url=decoded_data
            except UnicodeDecodeError as e:
                loggerDebug.write(f"解码错误：{e}")


            loggerDebug.write(f"请求地址:{req_url}\r\n")
            loggerDebug.write(f"请求方法:{req_method}\r\n")
            loggerDebug.write("请求头>\r\n")
            
            # 提取一级域名并保存数据包
            root_domain = self.get_root_domain(req_url)
            
            # 构建数据包内容
            packet_content = []
            packet_content.append(f"时间: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())}")
            packet_content.append(f"请求地址: {req_url}")
            packet_content.append(f"请求方法: {req_method}")
            packet_content.append(f"请求协议: {req_scheme}")
            packet_content.append(f"请求路径: {req_path}")
            
            # 请求头
            packet_content.append("请求头:")
            for key, value in req_headers.items():
                packet_content.append(f"  {key}: {value}")
                loggerDebug.write(f"{key}: {value}\r\n")

            # 请求参数(Query)
            if req_qurey:
                packet_content.append("请求参数(Query):")
                for key, value in req_qurey.items():
                    packet_content.append(f"  {key}: {value}")
                    loggerDebug.write(f"  Query-{key}: {value}\r\n")

            # POST参数处理
            if req_method.upper() == 'POST':
                # 处理表单数据
                if req_from:
                    packet_content.append("请求参数(POST Form):")
                    for key, value in req_from.items():
                        packet_content.append(f"  {key}: {value}")
                        loggerDebug.write(f"  Form-{key}: {value}\r\n")

                # 处理不同Content-Type
                if 'Content-Type' in req_headers:
                    content_type = req_headers['Content-Type']

                    # 处理JSON数据
                    if 'application/json' in content_type:
                        try:
                            req_body = flow.request.content.decode('utf-8', errors='ignore')
                            packet_content.append("请求参数(POST JSON):")
                            packet_content.append(f"  {req_body}")
                            loggerDebug.write(f"请求参数(POST JSON): {req_body}\r\n")
                        except Exception as e:
                            loggerDebug.write(f"解析JSON请求体失败: {e}\r\n")

                    # 处理文件上传 multipart/form-data
                    elif 'multipart/form-data' in content_type:
                        try:
                            packet_content.append("请求类型: 文件上传(multipart/form-data)")
                            loggerDebug.write("请求类型: 文件上传(multipart/form-data)\r\n")
                            
                            # 1. 获取 boundary
                            boundary = ''
                            for part in content_type.split(';'):
                                if 'boundary=' in part:
                                    boundary = part.split('boundary=')[1].strip().strip('"').strip("'")
                                    break
                            
                            if not boundary:
                                loggerDebug.write("无法获取 boundary，无法手动解析，尝试兜底逻辑。\r\n")
                                # 兜底：如果拿不到boundary，记录一下
                                packet_content.append("  错误: 无法获取Boundary")
                            else:
                                # boundary 在 body 中通常以 --boundary 开始
                                # 注意：Python 的 split 如果用 bytes 分割，得到的也是 bytes
                                boundary_bytes = ('--' + boundary).encode('utf-8')
                                
                                # 获取原始 body
                                raw_body = flow.request.content
                                
                                # 2. 分割 parts
                                # split 会把 boundary 及其前缀去掉
                                parts = raw_body.split(boundary_bytes)
                                
                                upload_dir = "downloads/uploads"
                                os.makedirs(upload_dir, exist_ok=True)
                                
                                for part in parts:
                                    # 跳过无效部分 (空，或者只是结尾的 --\r\n)
                                    if not part or part == b'--\r\n' or part == b'--': 
                                        continue
                                    
                                    # multipart 协议中，boundary 后面紧接着是 \r\n (即 part 的开头)
                                    # 而 part 的结尾也是 \r\n (即下一个 boundary 的前面)
                                    
                                    # 去掉开头的 \r\n 或 \n
                                    if part.startswith(b'\r\n'):
                                        part = part[2:]
                                    elif part.startswith(b'\n'):
                                        part = part[1:]
                                        
                                    # 去掉结尾的 \r\n 或 \n (这是属于 boundary 分隔符的一部分)
                                    if part.endswith(b'\r\n'):
                                        part = part[:-2]
                                    elif part.endswith(b'\n'):
                                        part = part[:-1]
                                    
                                    # 3. 分离 Header 和 Body
                                    # Header 和 Body 之间由 \r\n\r\n 分隔
                                    head_sep = b'\r\n\r\n'
                                    if head_sep not in part:
                                        # 尝试兼容 \n\n
                                        head_sep = b'\n\n'
                                        if head_sep not in part:
                                            continue
                                    
                                    part_head_bytes, part_body_bytes = part.split(head_sep, 1)
                                    
                                    # 解析 Header
                                    try:
                                        part_head_str = part_head_bytes.decode('utf-8', 'ignore')
                                    except:
                                        part_head_str = ""
                                        
                                    # 4. 提取信息
                                    filename = None
                                    field_name = "unknown"
                                    
                                    # 简单的正则提取
                                    for line in part_head_str.splitlines():
                                        if 'content-disposition' in line.lower():
                                            # 提取 name
                                            name_match = re.search(r'name="([^"]+)"', line)
                                            if name_match:
                                                field_name = name_match.group(1)
                                            
                                            # 提取 filename
                                            filename_match = re.search(r'filename="([^"]+)"', line)
                                            if filename_match:
                                                filename = filename_match.group(1)
                                    
                                    # 5. 保存逻辑
                                    if filename:
                                        timestamp = int(time.time() * 1000)
                                        # 构建文件名
                                        base, ext = os.path.splitext(filename)
                                        safe_base = re.sub(r'[\\/*?:"<>|]', "", base)
                                        safe_filename = f"{safe_base}_{timestamp}{ext}"
                                        filepath = os.path.join(upload_dir, safe_filename)
                                        
                                        try:
                                            with open(filepath, 'wb') as f:
                                                f.write(part_body_bytes)
                                            
                                            packet_content.append(f"  文件字段: {field_name}")
                                            packet_content.append(f"  原始文件名: {filename}")
                                            packet_content.append(f"  保存文件名: {safe_filename}")
                                            packet_content.append(f"  文件大小: {len(part_body_bytes)} bytes")
                                            packet_content.append(f"  保存路径: {filepath}")
                                            loggerDebug.write(f"  上传文件(Raw解析) - 字段: {field_name}, 文件名: {safe_filename}, 大小: {len(part_body_bytes)} bytes, 保存路径: {filepath}\r\n")
                                        except IOError as e:
                                            loggerDebug.write(f"  保存文件 '{filepath}' 失败: {e}\r\n")
                                            
                                    elif field_name != "unknown":
                                        # 普通表单字段
                                        try:
                                            val_str = part_body_bytes.decode('utf-8', 'ignore')
                                            packet_content.append(f"  表单字段-{field_name}: {val_str}")
                                            loggerDebug.write(f"  表单字段-{field_name}: {val_str}\r\n")
                                        except:
                                            pass

                        except Exception as e:
                            loggerDebug.write(f"处理文件上传失败: {e}\r\n")
                            import traceback
                            loggerDebug.write(traceback.format_exc() + "\r\n")

                        except Exception as e:
                            loggerDebug.write(f"处理文件上传失败: {e}\r\n")
                            import traceback
                            loggerDebug.write(traceback.format_exc() + "\r\n")

                    # 其他类型的POST数据
                    elif 'application/x-www-form-urlencoded' not in content_type:
                        try:
                            req_body = flow.request.content.decode('utf-8', errors='ignore')
                            if req_body:
                                packet_content.append(f"请求Body({content_type}):")
                                packet_content.append(f"  {req_body}")
                                loggerDebug.write(f"请求Body({content_type}): {req_body}\r\n")
                        except Exception as e:
                            loggerDebug.write(f"解析请求体失败: {e}\r\n")

            # Cookie
            cur_cookie = {}
            if 'Cookie' in flow.request.headers:
                cur_cookie = flow.request.headers['Cookie']
                # packet_content.append(f"Cookie: {cur_cookie}")
                # loggerDebug.write(f"Cookie: {cur_cookie}\r\n")
             
            
            # 响应内容
            packet_content.append("响应内容:")
            if isinstance(req_text, str):
                packet_content.append(req_text)
            else:
                packet_content.append("非字符串数据")
            
            # 保存到文件
            packet_data = '\n'.join(packet_content)
            self.save_packet_to_file(root_domain, packet_data)
            
            js_filename = os.path.basename(req_url)
            if '.js'  in js_filename:
                _content = flow.response.text
                filename =f"downloads/js/{js_filename}.js"
                # 确保目录存在
                os.makedirs(os.path.dirname(filename), exist_ok=True)
                with open(filename, "w", encoding='utf-8', errors='ignore') as f:
                    f.write(_content)
                    loggerDebug.write(f"文件已保存: {filename}")

            loggerDebug.write('收包>>>>'+ "\r\n")

            if isinstance(req_text, str):
                loggerDebug.write(req_text + "\r\n")
            else:
                loggerDebug.write("非字符串数据\r\n")

            loggerDebug.write('====================================================================================================================」\r\n')
        except Exception as ex:
            print(ex)
            loggerDebug.write('发生异常：'+ repr(ex) + "\r\n")
            return

    def response(self, flow):
        print('response...')
        # mitmproxy 9.x+ 事件循环由框架管理，用 ensure_future 提交异步任务
        asyncio.ensure_future(self.edit_response(flow))








