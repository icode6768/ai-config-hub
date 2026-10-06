#!/usr/bin/env python3
"""
gpt-image-2 skill 核心脚本
通过 OpenAI 兼容图片接口将结果保存为本地 PNG 文件。

支持两种模式:
  1) 文生图 (text-to-image): 不传 --image, 调用 /images/generations
  2) 图像编辑 (image edit / image-to-image): 传入 --image, 调用 /images/edits
     可选 --mask 做局部重绘 (inpainting)

用法:
  # 文生图
  python generate_image.py --prompt <提示词> [--output <路径>] [--quality low|medium|high] [--n 1-4]

  # 图像编辑 / 以图改图 (--image 可重复传入多张参考图)
  python generate_image.py --prompt <编辑描述> --image <输入图> [--image <输入图2> ...] \
      [--mask <蒙版图>] [--output <路径>] [--quality low|medium|high] [--n 1-4]

环境变量:
  OPENAI_BASE_URL  OpenAI 兼容 API 地址，例如 https://api.example.com/v1
  OPENAI_API_BASE  OPENAI_BASE_URL 未配置时的兼容 API 地址变量
  OPENAI_API_KEY   OpenAI 兼容 API 密钥
  IMAGE_MODE       图片生成模型名，默认 gpt-image-2
"""

import argparse
import base64
import os
import sys
import tempfile
from urllib.request import Request, urlopen
import json
import uuid

import requests

DEFAULT_MODEL = "gpt-image-2"

# 扩展名 -> MIME 类型
MIME_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


def default_output_path():
    """返回跨平台兼容的默认输出路径（使用系统临时目录）"""
    return os.path.join(tempfile.gettempdir(), f"generated-{uuid.uuid4().hex}.png")


def guess_mime(path):
    """根据文件扩展名推断 MIME 类型，未知则回退为 image/png"""
    return MIME_BY_EXT.get(os.path.splitext(path)[1].lower(), "image/png")


def get_openai_config():
    base_url = (os.getenv("OPENAI_BASE_URL") or os.getenv("OPENAI_API_BASE") or "").strip().rstrip("/")
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    model = os.getenv("IMAGE_MODE", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    if not base_url:
        print("[ERROR] 请先配置环境变量 OPENAI_BASE_URL 或 OPENAI_API_BASE", file=sys.stderr)
        sys.exit(1)
    if not api_key:
        print("[ERROR] 请先配置环境变量 OPENAI_API_KEY", file=sys.stderr)
        sys.exit(1)
    return base_url, api_key, model


def save_image(item, path):
    if item.get("b64_json"):
        img_bytes = base64.b64decode(item["b64_json"])
    elif item.get("url"):
        req = Request(item["url"], headers={"User-Agent": "gpt-image-2-skill/1.0"})
        with urlopen(req, timeout=120) as response:
            img_bytes = response.read()
    else:
        raise ValueError("响应中没有 b64_json 或 url 图片数据")

    with open(path, "wb") as f:
        f.write(img_bytes)
    return len(img_bytes)


def check_status(r):
    """统一处理 HTTP 状态码，非 200 直接退出"""
    if r.status_code == 401:
        print("[ERROR] OPENAI_API_KEY 无效或无权限。", file=sys.stderr)
        sys.exit(1)
    elif r.status_code == 429:
        print(f"[ERROR] 请求频率或额度受限: {r.text[:200]}", file=sys.stderr)
        sys.exit(1)
    elif r.status_code != 200:
        print(f"[ERROR] 图片接口错误 ({r.status_code}): {r.text[:500]}", file=sys.stderr)
        sys.exit(1)


def save_response(r, output, n):
    """解析接口响应并保存所有图片，返回保存路径列表"""
    data = r.json()
    images = data.get("data", [])
    if not images:
        print(f"[ERROR] 图片接口未返回图片数据: {json.dumps(data, ensure_ascii=False)[:500]}", file=sys.stderr)
        sys.exit(1)

    saved_paths = []
    for i, item in enumerate(images):
        if len(images) == 1:
            path = output
        else:
            base, ext = os.path.splitext(output)
            path = f"{base}_{i+1}{ext}"
        try:
            size = save_image(item, path)
        except Exception as e:
            print(f"[ERROR] 保存图片失败: {e}", file=sys.stderr)
            sys.exit(1)
        saved_paths.append(path)
        print(f"[OK] 图片已保存: {path} ({size//1024} KB)")

    usage = data.get("usage") or {}
    if usage:
        print(f"[INFO] Token 消耗: 输入={usage.get('input_tokens',0)} 输出={usage.get('output_tokens',0)} 总计={usage.get('total_tokens',0)}")
    return saved_paths


def generate(prompt: str, output: str, quality: str = "low", n: int = 1):
    """文生图: POST /images/generations"""
    base_url, api_key, model = get_openai_config()
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": model,
        "prompt": prompt,
        "size": "1024x1024",
        "quality": quality,
        "n": n,
    }

    try:
        r = requests.post(f"{base_url}/images/generations", headers=headers, json=payload, timeout=300)
    except Exception as e:
        print(f"[ERROR] 连接图片生成接口失败: {e}", file=sys.stderr)
        sys.exit(1)

    check_status(r)
    return save_response(r, output, n)


def edit(prompt: str, images, output: str, mask: str = None, quality: str = "low", n: int = 1):
    """图像编辑 / 以图改图: POST /images/edits (multipart/form-data)"""
    base_url, api_key, model = get_openai_config()
    # 注意: multipart 请求不要手动设置 Content-Type, 交给 requests 生成 boundary
    headers = {"Authorization": f"Bearer {api_key}"}
    data = {
        "model": model,
        "prompt": prompt,
        "size": "1024x1024",
        "quality": quality,
        "n": n,
    }

    # 单图用字段名 image, 多图用 image[] (兼容 gpt-image 系列)
    field = "image" if len(images) == 1 else "image[]"
    files = []
    opened = []
    try:
        for img in images:
            if not os.path.isfile(img):
                print(f"[ERROR] 输入图片不存在: {img}", file=sys.stderr)
                sys.exit(1)
            fobj = open(img, "rb")
            opened.append(fobj)
            files.append((field, (os.path.basename(img), fobj, guess_mime(img))))

        if mask:
            if not os.path.isfile(mask):
                print(f"[ERROR] 蒙版图片不存在: {mask}", file=sys.stderr)
                sys.exit(1)
            mobj = open(mask, "rb")
            opened.append(mobj)
            files.append(("mask", (os.path.basename(mask), mobj, guess_mime(mask))))

        try:
            # 编辑接口比文生图更耗时, 给更长的超时时间
            r = requests.post(f"{base_url}/images/edits", headers=headers, data=data, files=files, timeout=600)
        except Exception as e:
            print(f"[ERROR] 连接图片编辑接口失败: {e}", file=sys.stderr)
            sys.exit(1)
    finally:
        for fobj in opened:
            try:
                fobj.close()
            except Exception:
                pass

    check_status(r)
    return save_response(r, output, n)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="gpt-image-2 生图 / 改图工具")
    parser.add_argument("--prompt", required=True, help="图片描述或编辑描述提示词")
    parser.add_argument("--image", action="append", default=None,
                        help="输入图片路径; 传入即进入编辑模式, 可重复指定传入多张参考图")
    parser.add_argument("--mask", default=None,
                        help="蒙版图片路径(可选), 用于局部重绘 inpainting; 仅编辑模式有效")
    parser.add_argument("--output", default=default_output_path(), help="输出图片路径（默认使用系统临时目录）")
    parser.add_argument("--quality", default="low", choices=["low", "medium", "high"])
    parser.add_argument("--n", default=1, type=int, choices=range(1, 5), help="生成数量(1-4)")
    args = parser.parse_args()

    if args.image:
        edit(args.prompt, args.image, args.output, mask=args.mask, quality=args.quality, n=args.n)
    else:
        if args.mask:
            print("[ERROR] --mask 仅在编辑模式(配合 --image)下有效", file=sys.stderr)
            sys.exit(1)
        generate(args.prompt, args.output, args.quality, args.n)
