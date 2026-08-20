from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
import os
import uuid
import json
import shutil
import atexit
import signal
import sys
import re
import time
import threading
from datetime import datetime
from PIL import Image
from docx import Document
from docx.shared import Inches, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from selenium import webdriver
from selenium.webdriver.edge.service import Service
from selenium.webdriver.edge.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# 配置CORS
CORS(app, resources={
    r"/*": {
        "origins": ["http://localhost:5001", "http://127.0.0.1:5001"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# 文件夹配置
UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'output'
TEMPLATES_FOLDER = 'templates'  # 内置模板文件夹
IMAGES_FOLDER = 'images'  # 默认图片文件夹
ALLOWED_EXTENSIONS = {'docx', 'doc', 'json', 'txt'}
IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'webp'}

# 确保目录存在
for folder in [UPLOAD_FOLDER, OUTPUT_FOLDER, TEMPLATES_FOLDER, IMAGES_FOLDER]:
    if not os.path.exists(folder):
        os.makedirs(folder)

# Selenium截图相关全局变量
selenium_driver = None
selenium_screenshot_dir = None
selenium_thread = None

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['OUTPUT_FOLDER'] = OUTPUT_FOLDER
app.config['TEMPLATES_FOLDER'] = TEMPLATES_FOLDER
app.config['IMAGES_FOLDER'] = IMAGES_FOLDER

def cleanup_temp_files():
    """清理临时文件"""
    try:
        print("正在清理临时文件...")
        
        # 清理uploads文件夹
        if os.path.exists(UPLOAD_FOLDER):
            for filename in os.listdir(UPLOAD_FOLDER):
                file_path = os.path.join(UPLOAD_FOLDER, filename)
                try:
                    if os.path.isfile(file_path):
                        os.unlink(file_path)
                    elif os.path.isdir(file_path):
                        shutil.rmtree(file_path)
                except Exception as e:
                    print(f"删除文件失败 {file_path}: {e}")
        
        # 清理output文件夹
        if os.path.exists(OUTPUT_FOLDER):
            for filename in os.listdir(OUTPUT_FOLDER):
                file_path = os.path.join(OUTPUT_FOLDER, filename)
                try:
                    if os.path.isfile(file_path):
                        os.unlink(file_path)
                    elif os.path.isdir(file_path):
                        shutil.rmtree(file_path)
                except Exception as e:
                    print(f"删除文件失败 {file_path}: {e}")
        
        print("临时文件清理完成")
    except Exception as e:
        print(f"清理文件时出错: {e}")

def signal_handler(sig, frame):
    """信号处理器"""
    print(f"\n收到信号 {sig}，正在清理并退出...")
    cleanup_temp_files()
    sys.exit(0)

# 注册清理函数
atexit.register(cleanup_temp_files)
signal.signal(signal.SIGINT, signal_handler)  # Ctrl+C
signal.signal(signal.SIGTERM, signal_handler)  # 终止信号

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def is_image_file(filename):
    """检查是否为图片文件"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in IMAGE_EXTENSIONS

def setup_selenium_driver():
    """设置Selenium Edge浏览器驱动"""
    global selenium_driver
    
    try:
        # 尝试使用爬虫工具中的驱动
        crawler_driver_path = "../爬虫工具/msedgedriver.exe"
        if os.path.exists(crawler_driver_path):
            print(f"使用爬虫工具中的驱动: {crawler_driver_path}")
            service = Service(crawler_driver_path)
        else:
            print("使用系统PATH中的Edge驱动")
            service = Service()
        
        # 配置Edge选项（优化性能）
        edge_options = Options()
        edge_options.add_argument("--disable-blink-features=AutomationControlled")
        edge_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        edge_options.add_experimental_option('useAutomationExtension', False)
        edge_options.add_argument("--disable-extensions")
        edge_options.add_argument("--no-sandbox")
        edge_options.add_argument("--disable-dev-shm-usage")
        edge_options.add_argument("--disable-gpu")
        edge_options.add_argument("--disable-web-security")
        edge_options.add_argument("--allow-running-insecure-content")
        edge_options.add_argument("--ignore-certificate-errors")
        edge_options.add_argument("--ignore-ssl-errors")
        edge_options.add_argument("--window-size=1200,800")
        # 性能优化选项
        edge_options.add_argument("--disable-background-timer-throttling")
        edge_options.add_argument("--disable-backgrounding-occluded-windows")
        edge_options.add_argument("--disable-renderer-backgrounding")
        edge_options.add_argument("--disable-features=TranslateUI")
        edge_options.add_argument("--disable-ipc-flooding-protection")
        edge_options.add_argument("--disable-default-apps")
        edge_options.add_argument("--disable-sync")
        edge_options.add_argument("--disable-translate")
        edge_options.add_argument("--disable-plugins-discovery")
        edge_options.add_argument("--disable-preconnect")
        edge_options.add_argument("--disable-background-networking")
        
        # 初始化驱动
        selenium_driver = webdriver.Edge(service=service, options=edge_options)
        
        # 隐藏webdriver特征
        selenium_driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        # 设置隐式等待时间（减少等待时间）
        selenium_driver.implicitly_wait(5)
        
        print("✓ Selenium Edge驱动初始化成功")
        return True
        
    except Exception as e:
        print(f"✗ Selenium Edge驱动初始化失败: {e}")
        return False

def selenium_screenshot_worker(url, save_dir):
    """Selenium截图工作线程"""
    global selenium_driver, selenium_screenshot_dir
    
    try:
        print(f"开始Selenium截图任务: {url}")
        
        # 设置截图目录
        if save_dir and os.path.exists(save_dir):
            selenium_screenshot_dir = save_dir
        else:
            selenium_screenshot_dir = "images"
        
        if not os.path.exists(selenium_screenshot_dir):
            os.makedirs(selenium_screenshot_dir)
        
        # 初始化驱动
        if not setup_selenium_driver():
            return
        
        # 打开网页
        selenium_driver.get(url)
        print(f"已打开网页: {url}")
        
        # 等待页面加载
        time.sleep(3)
        
        # 注入键盘监听脚本
        keyboard_script = """
        (function() {
            // 防止重复加载
            if (window.screenshotLoaded) {
                console.log('截图功能已存在，跳过重复加载');
                return;
            }
            window.screenshotLoaded = true;
            
            function takeScreenshot() {
                fetch('http://localhost:5001/selenium_take_screenshot', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({url: window.location.href})
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        console.log('截图成功:', data.filename);
                        showNotification('截图成功！', data.filename, 'success');
                    } else {
                        console.error('截图失败:', data.error);
                        showNotification('截图失败', data.error, 'error');
                    }
                })
                .catch(error => {
                    console.error('截图请求失败:', error);
                    showNotification('截图失败', '网络错误', 'error');
                });
            }
            
            function showNotification(title, message, type) {
                const notification = document.createElement('div');
                notification.style.cssText = `
                    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                    background: ${type === 'success' ? '#28a745' : '#dc3545'};
                    color: white; padding: 15px 20px; border-radius: 5px;
                    font-size: 14px; z-index: 10001; box-shadow: 0 3px 15px rgba(0,0,0,0.3);
                    max-width: 400px; text-align: center;
                `;
                notification.innerHTML = `<div style="font-weight: bold;">${title}</div><div>${message}</div>`;
                document.body.appendChild(notification);
                setTimeout(() => notification.remove(), 3000);
            }
            
            function handleKeyPress(e) {
                if (e.code === 'Digit0' || e.key === '0') {
                    e.preventDefault();
                    e.stopPropagation();
                    takeScreenshot();
                }
            }
            
            // 设置截图功能
            function setupScreenshot() {
                // 移除旧的事件监听器
                document.removeEventListener('keydown', handleKeyPress);
                // 添加新的事件监听器
                document.addEventListener('keydown', handleKeyPress);
                console.log('0键截图功能已启用');
            }
            
            // 初始设置
            setupScreenshot();
            
            // 监听页面变化（如登录后的页面跳转）
            let lastUrl = location.href;
            const urlObserver = new MutationObserver(() => {
                const url = location.href;
                if (url !== lastUrl) {
                    lastUrl = url;
                    console.log('页面URL变化，重新设置截图功能');
                    setTimeout(setupScreenshot, 1000); // 等待页面加载
                }
            });
            urlObserver.observe(document, {subtree: true, childList: true});
            
            // 监听页面加载完成事件
            window.addEventListener('load', function() {
                console.log('页面加载完成，重新设置截图功能');
                setTimeout(setupScreenshot, 500);
            });
            
            // 监听DOM变化（处理SPA应用）- 优化性能
            let domCheckTimeout;
            const domObserver = new MutationObserver(function(mutations) {
                // 使用防抖，避免频繁触发
                clearTimeout(domCheckTimeout);
                domCheckTimeout = setTimeout(function() {
                    let hasSignificantChange = false;
                    mutations.forEach(function(mutation) {
                        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                            // 只检查重要的DOM变化
                            for (let node of mutation.addedNodes) {
                                if (node.nodeType === 1 && (node.tagName === 'BODY' || node.tagName === 'DIV')) {
                                    hasSignificantChange = true;
                                    break;
                                }
                            }
                        }
                    });
                    if (hasSignificantChange) {
                        setupScreenshot();
                    }
                }, 200); // 200ms防抖
            });
            
            domObserver.observe(document.body, {
                childList: true,
                subtree: false // 只监听直接子元素变化，减少性能开销
            });
            
            // 监听页面卸载事件，清理观察器
            window.addEventListener('beforeunload', function() {
                urlObserver.disconnect();
                domObserver.disconnect();
            });
            
        })();
        """
        
        # 定期重新注入脚本，确保页面切换后功能不丢失
        def reinject_script():
            try:
                if selenium_driver:
                    # 检查脚本是否还存在
                    script_exists = selenium_driver.execute_script("return window.screenshotLoaded === true;")
                    if not script_exists:
                        print("检测到脚本丢失，重新注入...")
                        selenium_driver.execute_script(keyboard_script)
                        print("✓ 脚本重新注入成功")
            except Exception as e:
                print(f"重新注入脚本失败: {e}")
        
        # 启动定期检查线程
        def periodic_check():
            while selenium_driver:
                try:
                    time.sleep(5)  # 每5秒检查一次
                    reinject_script()
                except:
                    break
        
        check_thread = threading.Thread(target=periodic_check, daemon=True)
        check_thread.start()
        
        selenium_driver.execute_script(keyboard_script)
        print("✓ 键盘监听脚本已注入")
        
        # 保持浏览器窗口打开，但添加更好的错误处理
        try:
            while selenium_driver:
                try:
                    # 检查浏览器是否还活着
                    current_url = selenium_driver.current_url
                    if not current_url:
                        break
                    time.sleep(1)
                except Exception as e:
                    print(f"浏览器检查出错: {e}")
                    break
        except KeyboardInterrupt:
            print("用户中断截图任务")
        
    except Exception as e:
        print(f"✗ Selenium截图工作线程出错: {e}")
    finally:
        if selenium_driver:
            try:
                selenium_driver.quit()
            except:
                pass
            selenium_driver = None

def generate_unique_filename(original_filename):
    ext = ''
    if '.' in original_filename:
        ext = '.' + original_filename.rsplit('.', 1)[1].lower()
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    unique_id = str(uuid.uuid4())[:8]
    
    return f"{timestamp}_{unique_id}{ext}"

def get_builtin_templates():
    """获取内置模板列表"""
    templates = []
    if os.path.exists(TEMPLATES_FOLDER):
        for filename in os.listdir(TEMPLATES_FOLDER):
            if filename.lower().endswith('.docx'):
                templates.append({
                    'filename': filename,
                    'name': os.path.splitext(filename)[0],
                    'path': os.path.join(TEMPLATES_FOLDER, filename)
                })
    return templates

def scan_project_source_code(project_dir=None):
    """
    扫描指定目录下的项目源码文件
    只导出templates下的HTML文件和app.py文件
    排除指定的HTML文件，优先导出login.html
    """
    source_files = []
    if project_dir is None:
        # 如果没有指定目录，使用父目录（向后兼容）
        project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    else:
        # 验证目录是否存在
        if not os.path.exists(project_dir):
            raise ValueError(f"指定的项目目录不存在: {project_dir}")
        if not os.path.isdir(project_dir):
            raise ValueError(f"指定的路径不是目录: {project_dir}")
    
    parent_dir = project_dir
    
    # 要排除的HTML文件
    excluded_files = {
        'user_management.html',
        'system_logs.html', 
        'system_monitoring.html',
        'dashboard.html',
        'base.html'
    }
    
    # 优先导出的文件
    priority_files = ['login.html']
    
    # 扫描app.py文件
    app_py_path = os.path.join(parent_dir, 'app.py')
    if os.path.exists(app_py_path):
        try:
            with open(app_py_path, 'r', encoding='utf-8') as f:
                content = f.read()
            source_files.append({
                'path': 'app.py',
                'content': content,
                'type': 'file',
                'priority': 10  # HTML文件优先级更高
            })
        except Exception as e:
            print(f"读取app.py失败: {e}")
    
    # 扫描templates目录下的HTML文件
    templates_dir = os.path.join(parent_dir, 'templates')
    if os.path.exists(templates_dir) and os.path.isdir(templates_dir):
        html_files = []
        
        for file in os.listdir(templates_dir):
            if file.lower().endswith('.html'):
                # 检查是否在排除列表中
                if file not in excluded_files:
                    file_path = os.path.join(templates_dir, file)
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                        
                        # 设置优先级：login.html最高，其他按字母顺序，HTML都高于app.py
                        if file in priority_files:
                            priority = 0  # login.html最高优先级
                        else:
                            priority = 1  # 其他HTML文件次优先级
                        
                        html_files.append({
                            'path': f'templates/{file}',
                            'content': content,
                            'type': 'file',
                            'priority': priority,
                            'filename': file
                        })
                    except Exception as e:
                        print(f"读取HTML文件失败 {file_path}: {e}")
        
        # 按优先级和文件名排序
        html_files.sort(key=lambda x: (x['priority'], x['filename']))
        source_files.extend(html_files)
    
    return source_files

def export_source_code_to_docx(project_dir=None):
    """
    只导出源码内容到docx文件（无目录、无统计、无说明）
    不同文件之间不需要标题和留空，直接连接
    """
    try:
        # 扫描源码文件
        source_files = scan_project_source_code(project_dir)
        if not source_files:
            return None, "未找到任何源码文件"
        
        from docx import Document
        from docx.shared import Pt
        
        # 创建Word文档
        doc = Document()
        
        # 按优先级排序文件
        source_files.sort(key=lambda x: x.get('priority', 999))
        
        # 只保留源码内容，不同文件之间直接连接
        for i, file_info in enumerate(source_files):
            # 源码内容直接添加，不添加标题
            code_paragraph = doc.add_paragraph(file_info['content'])
            for run in code_paragraph.runs:
                run.font.name = 'Courier New'
                run.font.size = Pt(9)
            
            # 如果不是最后一个文件，添加换行符分隔
            if i < len(source_files) - 1:
                doc.add_paragraph('\n')
        
        # 生成文件名
        from datetime import datetime
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'VTE系统源码_{timestamp}.docx'
        filepath = os.path.join(OUTPUT_FOLDER, filename)
        doc.save(filepath)
        return filename, f"成功导出 {len(source_files)} 个文件"
    except Exception as e:
        return None, f"导出失败: {str(e)}"

def find_image_by_name(image_name, image_directory):
    """
    根据图片名称在指定目录中查找图片文件
    支持多种匹配方式：
    1. 完全匹配文件名
    2. 忽略扩展名匹配
    3. 模糊匹配（包含关键词）
    """
    if not os.path.exists(image_directory):
        return None
    
    # 清理图片名称（去除可能的路径分隔符和特殊字符）
    clean_name = re.sub(r'[<>:"/\\|?*]', '', image_name)
    
    # 获取目录中的所有图片文件
    image_files = []
    for root, dirs, files in os.walk(image_directory):
        for file in files:
            if is_image_file(file):
                image_files.append({
                    'name': file,
                    'path': os.path.join(root, file),
                    'name_without_ext': os.path.splitext(file)[0]
                })
    
    # 1. 完全匹配文件名
    for img in image_files:
        if img['name'].lower() == clean_name.lower():
            return img['path']
    
    # 2. 忽略扩展名匹配
    for img in image_files:
        if img['name_without_ext'].lower() == clean_name.lower():
            return img['path']
    
    # 3. 模糊匹配（文件名包含关键词）
    for img in image_files:
        if clean_name.lower() in img['name_without_ext'].lower():
            return img['path']
    
    # 4. 反向模糊匹配（关键词包含在文件名中）
    for img in image_files:
        if img['name_without_ext'].lower() in clean_name.lower():
            return img['path']
    
    return None

def process_images_in_data(data, image_directory, image_settings=None):
    """
    递归处理JSON数据中的图片字段，将图片名称替换为InlineImage对象
    """
    try:
        from docxtpl import InlineImage
        from docx.shared import Inches
    except ImportError:
        print("警告：未安装docxtpl库，无法处理图片")
        return data
    
    # 默认图片设置
    default_width = 6.5  # A4纸张90%宽度
    default_height = 4.9  # 等比例高度
    center_image = True
    
    # 如果提供了图片设置，使用用户设置
    if image_settings:
        default_width = image_settings.get('width', default_width)
        default_height = image_settings.get('height', default_height)
        center_image = image_settings.get('center', center_image)
    
    def process_item(item):
        if isinstance(item, dict):
            new_item = {}
            for key, value in item.items():
                if isinstance(value, str) and ('图片' in key or 'image' in key.lower() or 'img' in key.lower()):
                    # 这是一个图片字段
                    image_path = find_image_by_name(value, image_directory)
                    if image_path and os.path.exists(image_path):
                        try:
                            # 创建InlineImage对象
                            new_item[key] = InlineImage(
                                tpl=None,  # 这里会在渲染时设置
                                image_descriptor=image_path,
                                width=Inches(default_width),
                                height=Inches(default_height)
                            )
                            print(f"找到图片：{value} -> {image_path} (尺寸: {default_width}x{default_height}英寸)")
                        except Exception as e:
                            print(f"创建图片对象失败 {image_path}: {e}")
                            new_item[key] = f"[图片加载失败: {value}]"
                    else:
                        print(f"未找到图片：{value}")
                        new_item[key] = f"[图片未找到: {value}]"
                else:
                    new_item[key] = process_item(value)
            return new_item
        elif isinstance(item, list):
            return [process_item(sub_item) for sub_item in item]
        else:
            return item
    
    return process_item(data)

def scan_json_files():
    """扫描当前目录下的JSON文件"""
    json_files = []
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    for filename in os.listdir(current_dir):
        if filename.lower().endswith('.json'):
            file_path = os.path.join(current_dir, filename)
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    json_data = json.load(f)
                
                # 检查是否包含系统名
                system_name = json_data.get('系统名', '')
                
                json_files.append({
                    'filename': filename,
                    'file_path': file_path,
                    'system_name': system_name,
                    'data': json_data
                })
            except Exception as e:
                print(f"读取JSON文件失败 {filename}: {e}")
    
    return json_files

def generate_three_documents(system_name, json_files):
    """生成三个文档：系统名-说明书、系统名说明、系统名-代码文档"""
    try:
        results = []
        
        # 查找对应的JSON文件
        operation_manual_data = None
        system_description_data = None
        
        for json_file in json_files:
            if '操作手册' in json_file['filename']:
                operation_manual_data = json_file['data']
            elif '系统说明' in json_file['filename']:
                system_description_data = json_file['data']
        
        # 1. 生成操作手册（系统名-说明书）
        if operation_manual_data:
            operation_manual_result = generate_operation_manual(system_name, operation_manual_data)
            results.append(operation_manual_result)
        
        # 2. 生成系统说明（系统名说明）
        if system_description_data:
            system_description_result = generate_system_description(system_name, system_description_data)
            results.append(system_description_result)
        
        # 3. 生成源码文档（系统名-代码文档）
        source_code_result = generate_source_code_document(system_name)
        results.append(source_code_result)
        
        return results
        
    except Exception as e:
        return [{'success': False, 'message': f'生成文档失败：{str(e)}'}]

def generate_operation_manual(system_name, json_data):
    """生成操作手册"""
    try:
        from docxtpl import DocxTemplate
        
        # 使用操作手册模板
        template_path = os.path.join(TEMPLATES_FOLDER, '操作手册内置模板2.docx')
        if not os.path.exists(template_path):
            return {'success': False, 'message': '操作手册模板文件不存在'}
        
        # 处理图片
        processed_data = process_images_in_data(json_data, IMAGES_FOLDER)
        
        # 加载模板并渲染
        doc = DocxTemplate(template_path)
        
        # 为InlineImage对象设置模板引用
        def set_template_for_images(data):
            if isinstance(data, dict):
                for key, value in data.items():
                    if hasattr(value, 'tpl') and value.tpl is None:
                        value.tpl = doc
                    else:
                        set_template_for_images(value)
            elif isinstance(data, list):
                for item in data:
                    set_template_for_images(item)
        
        set_template_for_images(processed_data)
        doc.render(processed_data)
        
        # 生成文件名（无时间戳）
        filename = f'{system_name}-说明书.docx'
        # 保存到父文件夹
        parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        filepath = os.path.join(parent_dir, filename)
        doc.save(filepath)
        
        return {
            'success': True,
            'message': '操作手册生成成功',
            'filename': filename,
            'filepath': filepath,
            'type': '操作手册'
        }
        
    except Exception as e:
        return {'success': False, 'message': f'生成操作手册失败：{str(e)}'}

def generate_system_description(system_name, json_data):
    """生成系统说明文档"""
    try:
        from docxtpl import DocxTemplate
        
        # 使用系统说明模板
        template_path = os.path.join(TEMPLATES_FOLDER, '系统说明文档内置模板2.docx')
        if not os.path.exists(template_path):
            return {'success': False, 'message': '系统说明模板文件不存在'}
        
        # 处理图片
        processed_data = process_images_in_data(json_data, IMAGES_FOLDER)
        
        # 加载模板并渲染
        doc = DocxTemplate(template_path)
        
        # 为InlineImage对象设置模板引用
        def set_template_for_images(data):
            if isinstance(data, dict):
                for key, value in data.items():
                    if hasattr(value, 'tpl') and value.tpl is None:
                        value.tpl = doc
                    else:
                        set_template_for_images(value)
            elif isinstance(data, list):
                for item in data:
                    set_template_for_images(item)
        
        set_template_for_images(processed_data)
        doc.render(processed_data)
        
        # 生成文件名（无时间戳）
        filename = f'{system_name}说明.docx'
        # 保存到父文件夹
        parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        filepath = os.path.join(parent_dir, filename)
        doc.save(filepath)
        
        return {
            'success': True,
            'message': '系统说明文档生成成功',
            'filename': filename,
            'filepath': filepath,
            'type': '系统说明'
        }
        
    except Exception as e:
        return {'success': False, 'message': f'生成系统说明文档失败：{str(e)}'}

def generate_source_code_document(system_name):
    """生成源码文档"""
    try:
        # 扫描源码文件
        source_files = scan_project_source_code()
        if not source_files:
            return {'success': False, 'message': '未找到任何源码文件'}
        
        from docx import Document
        from docx.shared import Pt
        
        # 创建Word文档
        doc = Document()
        
        # 按优先级排序文件
        source_files.sort(key=lambda x: x.get('priority', 999))
        
        # 只保留源码内容，不同文件之间直接连接
        for i, file_info in enumerate(source_files):
            # 源码内容直接添加，不添加标题
            code_paragraph = doc.add_paragraph(file_info['content'])
            for run in code_paragraph.runs:
                run.font.name = 'Courier New'
                run.font.size = Pt(9)
            
            # 如果不是最后一个文件，添加换行符分隔
            if i < len(source_files) - 1:
                doc.add_paragraph('\n')
        
        # 生成文件名（无时间戳）
        filename = f'{system_name}-代码文档.docx'
        # 保存到父文件夹
        parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        filepath = os.path.join(parent_dir, filename)
        doc.save(filepath)
        
        return {
            'success': True,
            'message': f'源码文档生成成功，包含 {len(source_files)} 个文件',
            'filename': filename,
            'filepath': filepath,
            'type': '源码文档'
        }
        
    except Exception as e:
        return {'success': False, 'message': f'生成源码文档失败：{str(e)}'}

# 首页 - 模板渲染界面
@app.route('/')
def index():
    builtin_templates = get_builtin_templates()
    return render_template('index.html', 
                         builtin_templates=builtin_templates,
                         images_folder=os.path.abspath(IMAGES_FOLDER))

# 测试页面
@app.route('/test')
def test():
    return send_file('test_upload.html')

# 检查图片目录
@app.route('/check_image_directory', methods=['POST'])
def check_image_directory():
    try:
        data = request.get_json()
        directory = data.get('directory', '').strip()
        
        if not directory:
            directory = app.config['IMAGES_FOLDER']
        
        if not os.path.exists(directory):
            return jsonify({'success': False, 'message': '目录不存在'})
        
        if not os.path.isdir(directory):
            return jsonify({'success': False, 'message': '路径不是一个目录'})
        
        # 获取目录中的图片文件
        images = []
        for root, dirs, files in os.walk(directory):
            for file in files:
                if is_image_file(file):
                    images.append(file)
        
        return jsonify({
            'success': True,
            'directory': os.path.abspath(directory),
            'image_count': len(images),
            'images': images[:20]  # 最多显示20个图片名称
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

# 上传模板文件
@app.route('/upload_template', methods=['POST'])
def upload_template():
    try:
        if 'template' not in request.files:
            return jsonify({'success': False, 'message': '没有选择模板文件'})
        
        file = request.files['template']
        
        if file.filename == '':
            return jsonify({'success': False, 'message': '没有选择模板文件'})
        
        if not file.filename.lower().endswith('.docx'):
            return jsonify({'success': False, 'message': '只支持.docx格式的模板文件'})
        
        # 生成安全的文件名
        original_filename = secure_filename(file.filename)
        stored_filename = generate_unique_filename(original_filename)
        
        # 保存文件
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], stored_filename)
        file.save(file_path)
        
        return jsonify({
            'success': True,
            'message': '模板上传成功',
            'original_filename': original_filename,
            'file_path': file_path,
            'absolute_path': os.path.abspath(file_path)
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

# 上传JSON文件
@app.route('/upload_json', methods=['POST'])
def upload_json():
    try:
        if 'jsonfile' not in request.files:
            return jsonify({'success': False, 'message': '没有选择JSON文件'})
        
        file = request.files['jsonfile']
        
        if file.filename == '':
            return jsonify({'success': False, 'message': '没有选择JSON文件'})
        
        if not file.filename.lower().endswith('.json'):
            return jsonify({'success': False, 'message': '只支持.json格式的文件'})
        
        # 读取JSON内容
        json_content = file.read().decode('utf-8')
        json_data = json.loads(json_content)
        
        return jsonify({
            'success': True,
            'message': 'JSON文件上传成功',
            'json_data': json_data
        })
        
    except json.JSONDecodeError as e:
        return jsonify({'success': False, 'message': f'JSON格式错误：{str(e)}'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

# 渲染文档
@app.route('/render', methods=['POST'])
def render_document():
    try:
        data = request.get_json()
        action = data.get('action')
        template_path = data.get('template_path')
        json_data = data.get('json_data')
        image_directory = data.get('image_directory', '').strip()
        image_settings = data.get('image_settings', {})
        
        if not template_path or not json_data:
            return jsonify({'success': False, 'message': '缺少模板文件或JSON数据'})
        
        if not os.path.exists(template_path):
            return jsonify({'success': False, 'message': '模板文件不存在'})
        
        # 如果没有指定图片目录，使用默认目录
        if not image_directory:
            image_directory = app.config['IMAGES_FOLDER']
        
        # 导入docxtpl
        try:
            from docxtpl import DocxTemplate
        except ImportError:
            return jsonify({'success': False, 'message': '请先安装docxtpl库：pip install python-docx-template'})
        
        # 处理JSON数据中的图片
        image_info = []
        processed_data = process_images_in_data(json_data, image_directory, image_settings)
        
        # 加载模板
        doc = DocxTemplate(template_path)
        
        # 为InlineImage对象设置模板引用
        def set_template_for_images(data):
            if isinstance(data, dict):
                for key, value in data.items():
                    if hasattr(value, 'tpl') and value.tpl is None:
                        value.tpl = doc
                        # 添加图片设置信息
                        width = image_settings.get('width', 6.5)
                        height = image_settings.get('height', 4.9)
                        center = image_settings.get('center', True)
                        image_info.append(f"✓ 图片字段 '{key}' 处理成功 (尺寸: {width}x{height}英寸, 居中: {'是' if center else '否'})")
                    else:
                        set_template_for_images(value)
            elif isinstance(data, list):
                for item in data:
                    set_template_for_images(item)
        
        set_template_for_images(processed_data)
        
        # 渲染文档
        doc.render(processed_data)
        
        software_full_name='软件全称-{}'
        if '软件全称' in json_data:
            software_full_name = json_data['软件全称']
    
        if '系统名' in json_data:
            software_full_name = json_data['系统名']

        
        # 生成输出文件名
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_filename = f"{software_full_name}-{action}.docx"
        output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)
        
        # 保存渲染后的文档
        doc.save(output_path)
        
        return jsonify({
            'success': True,
            'message': '文档渲染成功',
            'output_file': output_path,
            'output_filename': output_filename,
            'absolute_path': os.path.abspath(output_path),
            'image_info': image_info
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': f'渲染失败：{str(e)}'})

# 导出项目源码
@app.route('/export_source_code', methods=['POST'])
def export_source_code():
    try:
        data = request.get_json() or {}
        project_dir = data.get('project_dir', '').strip()
        
        # 如果提供了项目目录，转换为绝对路径
        if project_dir:
            if not os.path.isabs(project_dir):
                # 相对路径转换为绝对路径
                project_dir = os.path.abspath(project_dir)
        else:
            project_dir = None
        
        filename, message = export_source_code_to_docx(project_dir)
        
        if filename:
            return jsonify({
                'success': True,
                'message': message,
                'filename': filename,
                'download_url': f'/download_output/{filename}'
            })
        else:
            return jsonify({'success': False, 'message': message})
            
    except Exception as e:
        return jsonify({'success': False, 'message': f'导出失败：{str(e)}'})

# 一次性生成三个文档
@app.route('/generate_three_documents', methods=['POST'])
def generate_three_documents_route():
    try:
        data = request.get_json()
        system_name = data.get('system_name', '').strip()
        
        if not system_name:
            return jsonify({'success': False, 'message': '请输入系统名称'})
        
        # 扫描JSON文件
        json_files = scan_json_files()
        if not json_files:
            return jsonify({'success': False, 'message': '未找到任何JSON文件'})
        
        # 生成三个文档
        results = generate_three_documents(system_name, json_files)
        
        # 统计结果
        success_count = sum(1 for result in results if result.get('success', False))
        failed_count = len(results) - success_count
        
        # 准备下载链接
        download_links = []
        for result in results:
            if result.get('success', False):
                download_links.append({
                    'type': result.get('type', ''),
                    'filename': result.get('filename', ''),
                    'download_url': f'/download_output/{result.get("filename", "")}'
                })
        
        return jsonify({
            'success': True,
            'message': f'成功生成 {success_count} 个文档，失败 {failed_count} 个',
            'results': results,
            'download_links': download_links,
            'system_name': system_name
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': f'生成文档失败：{str(e)}'})

# 截图功能相关路由
@app.route('/take_screenshot', methods=['POST'])
def take_screenshot():
    """截图API"""
    try:
        data = request.get_json()
        url = data.get('url', '').strip()
        save_dir = data.get('save_dir', '').strip()
        
        if not url:
            return jsonify({'success': False, 'error': '请提供URL'})
        
        # 确保URL格式正确
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        
        # 创建截图工具实例
        from simple_screenshot import SimpleScreenshot
        screenshot_tool = SimpleScreenshot()
        
        # 如果提供了保存目录，则设置新的保存路径
        if save_dir:
            screenshot_tool.set_screenshot_dir(save_dir)
        
        result = screenshot_tool.take_screenshot(url)
        screenshot_tool.close_driver()
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/set_save_dir', methods=['POST'])
def set_save_directory():
    """设置截图保存目录"""
    try:
        data = request.get_json()
        save_dir = data.get('save_dir', '').strip()
        
        if not save_dir:
            return jsonify({'success': False, 'error': '请提供保存目录路径'})
        
        from simple_screenshot import SimpleScreenshot
        screenshot_tool = SimpleScreenshot()
        
        if screenshot_tool.set_screenshot_dir(save_dir):
            return jsonify({
                'success': True,
                'message': f'保存目录已设置为: {save_dir}',
                'save_dir': save_dir
            })
        else:
            return jsonify({'success': False, 'error': '设置保存目录失败'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/list_screenshots')
def list_screenshots():
    """列出所有截图文件"""
    try:
        from simple_screenshot import SimpleScreenshot
        screenshot_tool = SimpleScreenshot()
        
        files = []
        if os.path.exists(screenshot_tool.screenshot_dir):
            for filename in os.listdir(screenshot_tool.screenshot_dir):
                if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                    filepath = os.path.join(screenshot_tool.screenshot_dir, filename)
                    stat = os.stat(filepath)
                    files.append({
                        'filename': filename,
                        'size': stat.st_size,
                        'modified': datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S')
                    })
        
        # 按修改时间倒序排列
        files.sort(key=lambda x: x['modified'], reverse=True)
        return jsonify({'success': True, 'files': files})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/download_screenshot/<filename>')
def download_screenshot(filename):
    """下载截图文件"""
    try:
        from simple_screenshot import SimpleScreenshot
        screenshot_tool = SimpleScreenshot()
        
        filepath = os.path.join(screenshot_tool.screenshot_dir, filename)
        if os.path.exists(filepath):
            return send_file(filepath, as_attachment=True)
        else:
            return jsonify({'success': False, 'error': '文件不存在'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# 下载渲染后的文档
@app.route('/download_output/<filename>')
def download_output(filename):
    try:
        # 首先检查output文件夹
        file_path = os.path.join(app.config['OUTPUT_FOLDER'], filename)
        if not os.path.exists(file_path):
            # 如果不在output文件夹，检查父文件夹
            parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            file_path = os.path.join(parent_dir, filename)
        
        if os.path.exists(file_path):
            return send_file(file_path, as_attachment=True)
        else:
            return jsonify({'success': False, 'message': '文件不存在'}), 404
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/start_selenium_screenshot', methods=['POST'])
def start_selenium_screenshot():
    """启动Selenium截图功能"""
    global selenium_thread
    
    try:
        data = request.get_json()
        url = data.get('url', '').strip()
        save_dir = data.get('save_dir', '').strip()
        
        if not url:
            return jsonify({'success': False, 'error': '请提供有效的URL'})
        
        # 验证URL格式
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        
        # 如果已有线程在运行，先停止
        if selenium_thread and selenium_thread.is_alive():
            if selenium_driver:
                try:
                    selenium_driver.quit()
                except:
                    pass
        
        # 启动新的截图线程
        selenium_thread = threading.Thread(
            target=selenium_screenshot_worker,
            args=(url, save_dir),
            daemon=True
        )
        selenium_thread.start()
        
        return jsonify({
            'success': True,
            'message': f'Selenium截图功能已启动，正在打开: {url}'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/selenium_take_screenshot', methods=['POST'])
def selenium_take_screenshot():
    """Selenium截图API"""
    global selenium_driver, selenium_screenshot_dir
    
    try:
        if not selenium_driver:
            return jsonify({'success': False, 'error': 'Selenium驱动未初始化'})
        
        data = request.get_json()
        url = data.get('url', '')
        
        # 获取页面标题作为文件名
        try:
            title = selenium_driver.title
            if not title or title.strip() == '':
                title = 'screenshot'
        except:
            title = 'screenshot'
        
        # 生成文件名
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{title}_{timestamp}.png"
        
        # 确保文件名安全
        filename = "".join(c for c in filename if c.isalnum() or c in (' ', '-', '_', '.')).rstrip()
        filename = filename.replace(' ', '_')
        
        # 设置截图路径
        if not selenium_screenshot_dir:
            selenium_screenshot_dir = "images"
        
        if not os.path.exists(selenium_screenshot_dir):
            os.makedirs(selenium_screenshot_dir)
        
        screenshot_path = os.path.join(selenium_screenshot_dir, filename)
        
        # 等待页面稳定
        time.sleep(1)
        
        # 执行截图
        selenium_driver.save_screenshot(screenshot_path)
        
        print(f"✓ Selenium截图成功: {filename}")
        
        return jsonify({
            'success': True,
            'filename': filename,
            'path': screenshot_path
        })
        
    except Exception as e:
        print(f"✗ Selenium截图失败: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/stop_selenium_screenshot', methods=['POST'])
def stop_selenium_screenshot():
    """停止Selenium截图功能"""
    global selenium_driver, selenium_thread
    
    try:
        if selenium_driver:
            selenium_driver.quit()
            selenium_driver = None
        
        return jsonify({
            'success': True,
            'message': 'Selenium截图功能已停止'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

if __name__ == '__main__':
    print("DOCX模板渲染系统启动中...")
    print(f"内置模板文件夹: {os.path.abspath(TEMPLATES_FOLDER)}")
    print(f"默认图片文件夹: {os.path.abspath(IMAGES_FOLDER)}")
    print(f"上传文件夹: {os.path.abspath(UPLOAD_FOLDER)}")
    print(f"输出文件夹: {os.path.abspath(OUTPUT_FOLDER)}")
    print("注意：程序停止时会自动清理uploads和output文件夹中的所有文件")
    
    try:
        app.run(debug=True, host='0.0.0.0', port=5001)
    except KeyboardInterrupt:
        print("\n程序被用户中断")
    except Exception as e:
        print(f"程序运行出错: {e}")
    finally:
        cleanup_temp_files() 