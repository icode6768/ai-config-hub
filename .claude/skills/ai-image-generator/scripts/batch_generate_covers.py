"""
Batch generate cover images for all service categories and articles.
Generates images via server API, then updates categories and service articles.
"""
import sys
import os
import time
import json
import requests

_SKILL_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
_CONFIG_PATH = os.path.join(_SKILL_DIR, 'config.json')

with open(_CONFIG_PATH, 'r', encoding='utf-8') as f:
    config = json.load(f)

SERVER = config['server']['url'].rstrip('/')
USERNAME = config['server']['username']
PASSWORD = config['server']['password']
TOKEN = config['server'].get('token', '')

# Admin backend URL (for updating categories/services)
ADMIN_URL = "http://localhost:8001"
ADMIN_TOKEN = ""  # Will get from args or login


def login_server():
    global TOKEN
    resp = requests.post(f"{SERVER}/api/v1/auth/login",
                         json={"username": USERNAME, "password": PASSWORD}, timeout=30)
    data = resp.json()
    if data.get('status') == 1:
        TOKEN = data['access_token']
        config['server']['token'] = TOKEN
        with open(_CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        print(f"[Server] Login OK")
        return True
    print(f"[Server] Login FAILED: {data.get('message')}")
    return False


def server_headers():
    return {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def generate_one_image(prompt, size="16:9", resolution="1k"):
    """Submit image generation and poll until done. Returns image URL or None."""
    payload = {
        "category": "draw",
        "prompt": prompt,
        "sourceImages": [],
        "referenceImages": [],
        "imageSize": size,
        "resolution": resolution,
    }
    resp = requests.post(f"{SERVER}/api/v1/images/process",
                         json=payload, headers=server_headers(), timeout=30)
    data = resp.json()
    if data.get('status') != 1 or not data.get('data'):
        print(f"  ERROR creating task: {data.get('message')}")
        return None

    task_id = data['data']['id']
    print(f"  Task {task_id} created, polling...", end='', flush=True)

    for attempt in range(120):
        time.sleep(5)
        try:
            r = requests.get(f"{SERVER}/api/v1/images/history/{task_id}",
                             headers=server_headers(), timeout=15)
            d = r.json()
        except Exception:
            continue

        if d.get('status') != 1 or not d.get('data'):
            continue

        h = d['data']
        if h.get('status') == 'done':
            results = h.get('result_images', [])
            if isinstance(results, str):
                try:
                    results = json.loads(results)
                except Exception:
                    results = [results]
            if results:
                img = results[0]
                if not img.startswith('http'):
                    img = f"{SERVER}/{img.lstrip('/')}"
                print(f" DONE -> {img}")
                return img
            print(f" DONE but no images")
            return None
        elif h.get('status') == 'failed':
            print(f" FAILED: {h.get('error_message')}")
            return None
        else:
            if attempt % 6 == 0 and attempt > 0:
                print('.', end='', flush=True)

    print(f" TIMEOUT")
    return None


def update_category(cat_id, cover_image, admin_token):
    """Update article category cover_image via admin API."""
    resp = requests.put(
        f"{ADMIN_URL}/api/v1/articles/categories/{cat_id}",
        json={"cover_image": cover_image},
        headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
        timeout=15
    )
    return resp.status_code == 200


def update_service(service_id, cover_image, admin_token):
    """Update service article cover_image via admin API."""
    resp = requests.put(
        f"{ADMIN_URL}/api/v1/dongchuang/services/admin/articles/{service_id}",
        json={"cover_image": cover_image},
        headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
        timeout=15
    )
    return resp.status_code == 200


# ── Image prompts for each category ──
CATEGORY_PROMPTS = {
    # Main category replacement
    89: "行业AI智能体，多个AI机器人分别服务不同行业场景（医疗、法律、教育、金融、客服），未来科技风格，橙色和蓝色调，高端企业宣传图",

    # 行业AI智能体 subcategories
    97: "智能客服机器人，AI客服正在和客户实时对话，聊天界面和语音波形，蓝色科技风格",
    98: "智能营销助手，AI驱动的数字营销，数据分析仪表盘展示用户画像和营销漏斗，科技蓝色调",
    99: "智能财务审计，AI分析财务报表和数据图表，数字化审计场景，蓝色和金色色调",
    100: "智能法律顾问，AI分析法律文件和合同，天平秤和法律书籍的科技化视觉，深蓝色调",
    101: "智能医疗问诊，AI辅助医生诊断，医疗影像和健康数据分析界面，蓝色和白色色调",
    102: "智能教育辅导，AI个性化教学场景，学生和AI互动学习，知识图谱可视化，温暖蓝色调",

    # 企业AI应用解决方案 subcategories
    95: "办公自动化，智能办公场景，AI处理文档和邮件，现代化办公桌面，蓝色科技风格",
    103: "智能客户管理CRM，AI分析客户数据和销售漏斗，客户关系可视化仪表盘，蓝色调",
    104: "AI数据分析平台，大数据可视化仪表盘，图表和数据流，深蓝色科技背景",
    105: "智能供应链管理，AI优化物流和仓储，全球供应链网络可视化，蓝色和绿色色调",
    106: "AI质检系统，工厂生产线上的AI视觉检测，机械臂和摄像头检测产品，工业蓝色调",
    107: "智能人力资源管理，AI简历筛选和人才画像分析，HR数据仪表盘，蓝色和紫色色调",

    # 算力代理租赁 subcategories
    108: "GPU云服务器租赁，NVIDIA GPU服务器机柜特写，绿色LED灯光，数据中心机房，科技感",
    109: "大模型训练算力，大规模GPU集群训练AI模型，数据流和神经网络可视化，深蓝色调",
    110: "AI推理加速服务，高速数据处理的抽象可视化，光速传输效果，蓝色和紫色色调",
    111: "分布式计算集群，多台服务器互联的网络拓扑图，节点连接可视化，蓝色科技风格",
    112: "边缘计算节点，IoT设备和边缘服务器，城市智能终端场景，蓝色和绿色色调",

    # AI本地化部署 subcategories
    113: "大模型私有化部署，企业内网服务器机房，安全隔离的AI系统，蓝色和银色色调",
    114: "AI知识库本地部署，企业知识图谱和文档检索系统，数据库和搜索界面，蓝色科技风格",
    115: "智能客服本地部署，企业内部智能客服系统，安全的对话界面，蓝色和绿色色调",
    116: "AI安全审计系统，网络安全监控中心，威胁检测仪表盘，深蓝色和红色警告色调",
    117: "数据标注平台部署，AI数据标注工作台，图像和文本标注界面，蓝色和橙色色调",

    # 国内外AI咨询 subcategories
    118: "AI战略规划咨询，商务精英在会议室讨论AI战略，白板上的路线图，专业商务风格",
    119: "AI技术选型咨询，技术架构对比图，多种AI方案评估，蓝色科技风格",
    120: "AI合规与伦理咨询，天平秤象征公正，法规文件和AI伦理，蓝色和白色色调",
    121: "AI人才培训，培训教室场景，学员使用AI工具学习，温暖的教育氛围，蓝色和橙色色调",
    122: "海外AI产品引进，全球地图和国际贸易，海外科技产品展示，蓝色和金色色调",
}

# Category ID -> Service article ID mapping
CATEGORY_TO_SERVICE = {
    89: 43, 90: 44, 91: 45, 92: 46, 93: 47, 94: 48,
    95: 49, 97: 50, 98: 51, 99: 52, 100: 53, 101: 54, 102: 55,
    103: 56, 104: 57, 105: 58, 106: 59, 107: 60,
    108: 61, 109: 62, 110: 63, 111: 64, 112: 65,
    113: 68, 114: 69, 115: 70, 116: 71, 117: 72,
    118: 73, 119: 74, 120: 75, 121: 76, 122: 77,
}

# Also duplicate service articles (66=智能客服机器人, 67=智能营销助手)
EXTRA_SERVICE_MAPPING = {
    97: [50, 66],  # 智能客服机器人 has two service articles
    98: [51, 67],  # 智能营销助手 has two service articles
}


def main():
    admin_token = sys.argv[1] if len(sys.argv) > 1 else ""
    if not admin_token:
        print("Usage: python batch_generate_covers.py <admin_token>")
        print("Get admin_token from browser: localStorage.getItem('token')")
        sys.exit(1)

    # Login to image generation server
    if not TOKEN:
        login_server()
    else:
        # Validate token
        try:
            r = requests.get(f"{SERVER}/api/v1/images/categories",
                             headers=server_headers(), timeout=10)
            if r.status_code == 401:
                login_server()
        except Exception:
            login_server()

    total = len(CATEGORY_PROMPTS)
    print(f"\n{'='*60}")
    print(f"Batch generating {total} cover images")
    print(f"{'='*60}\n")

    results = {}  # cat_id -> image_url

    for idx, (cat_id, prompt) in enumerate(CATEGORY_PROMPTS.items(), 1):
        print(f"\n[{idx}/{total}] Category {cat_id}: {prompt[:30]}...")
        img_url = generate_one_image(prompt)
        if img_url:
            results[cat_id] = img_url

            # Update category cover_image
            if update_category(cat_id, img_url, admin_token):
                print(f"  Updated category {cat_id} cover_image")
            else:
                print(f"  FAILED to update category {cat_id}")

            # Update corresponding service article(s)
            service_ids = EXTRA_SERVICE_MAPPING.get(cat_id, [CATEGORY_TO_SERVICE.get(cat_id)])
            if not service_ids:
                service_ids = [CATEGORY_TO_SERVICE.get(cat_id)]
            for sid in service_ids:
                if sid and update_service(sid, img_url, admin_token):
                    print(f"  Updated service {sid} cover_image")
                elif sid:
                    print(f"  FAILED to update service {sid}")
        else:
            print(f"  SKIPPED (generation failed)")

    # Also set main category images to their service articles
    # Categories 91-94 already got new images in the previous run
    main_cat_images = {
        91: "https://api.dongchuangai.com/uploads/files/ComfyUI_00004_maspd_1771388739.png",
        92: "https://api.dongchuangai.com/uploads/files/ComfyUI_00001_rcprc_1771388751.png",
        93: "https://api.dongchuangai.com/uploads/files/ComfyUI_00001_hfpax_1771388740.png",
        94: "https://api.dongchuangai.com/uploads/files/ComfyUI_00005_njkbo_1771388812.png",
    }
    print(f"\nUpdating main category service articles with previous images...")
    for cat_id, img_url in main_cat_images.items():
        sid = CATEGORY_TO_SERVICE.get(cat_id)
        if sid and update_service(sid, img_url, admin_token):
            print(f"  Updated service {sid} ({cat_id}) cover_image")

    print(f"\n{'='*60}")
    print(f"Done! Generated {len(results)}/{total} images successfully")
    print(f"{'='*60}")

    # Save results
    results_path = os.path.join(_SKILL_DIR, 'batch_results.json')
    with open(results_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"Results saved to {results_path}")


if __name__ == "__main__":
    main()
