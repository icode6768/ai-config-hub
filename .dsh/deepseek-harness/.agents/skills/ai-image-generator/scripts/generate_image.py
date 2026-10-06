"""
AI Image Generation Script (Dual Mode: Local / Server)
Usage: python generate_image.py "<prompt>" [size] [resolution] [style] [--mode local|server]

Examples:
  python generate_image.py "A beautiful sunset over the ocean"
  python generate_image.py "Cyberpunk city" "16:9" "2k" "realistic"
  python generate_image.py "Cute anime girl" "1:1" "1k" "anime" --mode server
  python generate_image.py "A cat" --mode local
"""
import sys
import os
import time
import json
import requests

# ──────────────────────────────────────────────
# Config helpers
# ──────────────────────────────────────────────
_SKILL_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
_CONFIG_PATH = os.path.join(_SKILL_DIR, 'config.json')


def load_config():
    """Load config.json from skill directory."""
    if not os.path.exists(_CONFIG_PATH):
        return {"mode": "local"}
    with open(_CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_config(cfg):
    """Save config.json back to disk (e.g. after caching token)."""
    with open(_CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


def _apply_style(prompt, style):
    """Prepend style prefix to prompt if not 'realistic'."""
    style_prefixes = {
        "anime": "anime style, ",
        "cartoon": "cartoon style, ",
        "oil_painting": "oil painting style, ",
        "watercolor": "watercolor painting style, ",
    }
    if style in style_prefixes:
        return style_prefixes[style] + prompt
    return prompt


# ──────────────────────────────────────────────
# SERVER MODE
# ──────────────────────────────────────────────
class ServerImageGenerator:
    """Generate images by calling the deployed server API."""

    def __init__(self, server_cfg):
        self.base_url = server_cfg['url'].rstrip('/')
        self.username = server_cfg['username']
        self.password = server_cfg['password']
        self.token = server_cfg.get('token', '')

    def _headers(self):
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def login(self):
        """Login to the server and cache token."""
        url = f"{self.base_url}/api/v1/auth/login"
        payload = {"username": self.username, "password": self.password}
        print(f"[Server] Logging in as '{self.username}' ...")
        resp = requests.post(url, json=payload, timeout=30)
        data = resp.json()
        if data.get('status') == 1 and data.get('access_token'):
            self.token = data['access_token']
            print(f"[Server] Login successful. User: {data.get('user', {}).get('full_name', self.username)}")
            # Cache token to config
            cfg = load_config()
            cfg['server']['token'] = self.token
            save_config(cfg)
            return True
        else:
            print(f"[Server] Login failed: {data.get('message', 'Unknown error')}")
            return False

    def _ensure_token(self):
        """Ensure we have a valid token, login if not."""
        if self.token:
            # Quick validation: try a lightweight request
            test_url = f"{self.base_url}/api/v1/images/categories"
            try:
                resp = requests.get(test_url, headers=self._headers(), timeout=10)
                if resp.status_code != 401:
                    return True
            except Exception:
                pass
            print("[Server] Token expired or invalid, re-logging in...")
        return self.login()

    def generate(self, prompt, image_size="1:1", resolution="1k", style="realistic",
                 source_images=None, reference_images=None):
        """Generate an image via server API."""
        if not self._ensure_token():
            return {"status": "failed", "error": "Login failed"}

        full_prompt = _apply_style(prompt, style)

        # Step 1: Submit task
        url = f"{self.base_url}/api/v1/images/process"
        payload = {
            "category": "draw",
            "prompt": full_prompt,
            "sourceImages": source_images or [],
            "referenceImages": reference_images or [],
            "imageSize": image_size,
            "resolution": resolution,
        }
        print(f"[Server] Creating image generation task...")
        print(f"  Prompt: {full_prompt}")
        print(f"  Size: {image_size}")
        print(f"  Resolution: {resolution}")
        print(f"  Style: {style}")

        resp = requests.post(url, json=payload, headers=self._headers(), timeout=30)
        data = resp.json()

        if data.get('status') != 1 or not data.get('data'):
            error_msg = data.get('message', 'Failed to create task')
            print(f"[Server] Error: {error_msg}")
            return {"status": "failed", "error": error_msg}

        task_info = data['data']
        task_id = task_info['id']
        print(f"  Task ID: {task_id}")
        print(f"  Status: {task_info.get('status', 'unknown')}")

        # Step 2: Poll for results
        print(f"[Server] Waiting for image generation to complete...")
        history_url = f"{self.base_url}/api/v1/images/history/{task_id}"
        max_attempts = 120  # 10 minutes max
        for attempt in range(max_attempts):
            time.sleep(5)
            try:
                resp = requests.get(history_url, headers=self._headers(), timeout=15)
                poll_data = resp.json()
            except Exception as e:
                if attempt % 6 == 0:
                    print(f"  Poll error: {e}, retrying...")
                continue

            if poll_data.get('status') != 1 or not poll_data.get('data'):
                if attempt % 6 == 0:
                    print(f"  Poll returned unexpected: {poll_data.get('message', '')}")
                continue

            history = poll_data['data']
            current_status = history.get('status', 'unknown')

            if current_status == 'done':
                results = history.get('result_images', [])
                if isinstance(results, str):
                    try:
                        results = json.loads(results)
                    except json.JSONDecodeError:
                        results = [results]

                full_urls = []
                for img in (results or []):
                    if img.startswith("http"):
                        full_urls.append(img)
                    else:
                        full_urls.append(f"{self.base_url}/{img.lstrip('/')}")

                print(f"\n[Server] Image generation complete!")
                print(f"  Result images ({len(full_urls)}):")
                for u in full_urls:
                    print(f"    - {u}")
                return {
                    "status": "done",
                    "task_id": task_id,
                    "images": full_urls,
                    "raw_paths": results,
                }

            elif current_status == 'failed':
                error_msg = history.get('error_message', 'Unknown error')
                print(f"\n[Server] Image generation failed: {error_msg}")
                return {"status": "failed", "task_id": task_id, "error": error_msg}

            else:
                if attempt % 6 == 0:
                    print(f"  Still generating... ({attempt * 5}s elapsed, status: {current_status})")

        print(f"\n[Server] Timeout after {max_attempts * 5} seconds")
        return {"status": "timeout", "task_id": task_id}


# ──────────────────────────────────────────────
# LOCAL MODE
# ──────────────────────────────────────────────
def _init_local():
    """Initialize local Flask app context (lazy import)."""
    _backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', 'backend')
    _backend_dir = os.path.normpath(_backend_dir)
    os.chdir(_backend_dir)
    sys.path.insert(0, _backend_dir)

    from app import create_app
    return create_app()


def generate_image_local(prompt, image_size="1:1", resolution="1k", style="realistic",
                         source_images=None, reference_images=None, user_id=1):
    """Generate an AI image using local Flask app context."""
    app = _init_local()

    from app.models import db
    from app.services.image_processor import AIImageProcessor

    full_prompt = _apply_style(prompt, style)

    with app.app_context():
        print(f"[Local] Creating image generation task...")
        print(f"  Prompt: {full_prompt}")
        print(f"  Size: {image_size}")
        print(f"  Resolution: {resolution}")
        print(f"  Style: {style}")

        history = AIImageProcessor.create_history(
            user_id=user_id,
            category_key="draw",
            prompt=full_prompt,
            source_images=source_images or [],
            reference_images=reference_images or [],
            parent_id=None,
            image_size=image_size,
            resolution=resolution,
        )
        print(f"  Task ID: {history.id}")

        print(f"[Local] Starting image processing...")
        history = AIImageProcessor.start_process(history)
        print(f"  Status: {history.status}")
        if history.task_id:
            print(f"  RunningHub Task ID: {history.task_id}")

        if history.status == 'failed':
            print(f"  Error: {history.error_message}")
            return {"status": "failed", "error": history.error_message}

        print(f"[Local] Waiting for image generation to complete...")
        max_attempts = 120
        for attempt in range(max_attempts):
            time.sleep(5)
            db.session.refresh(history)

            if history.status == 'done':
                results = history.result_images
                if isinstance(results, str):
                    results = json.loads(results)

                base_url = os.environ.get("APP_BASE_URL", "http://localhost:5000")
                full_urls = []
                for img in (results or []):
                    if img.startswith("http"):
                        full_urls.append(img)
                    else:
                        full_urls.append(f"{base_url}/{img.lstrip('/')}")

                print(f"\n[Local] Image generation complete!")
                print(f"  Result images ({len(full_urls)}):")
                for url in full_urls:
                    print(f"    - {url}")
                return {
                    "status": "done",
                    "task_id": history.id,
                    "images": full_urls,
                    "raw_paths": results,
                }

            elif history.status == 'failed':
                print(f"\n[Local] Image generation failed: {history.error_message}")
                return {"status": "failed", "task_id": history.id, "error": history.error_message}

            else:
                if attempt % 6 == 0:
                    print(f"  Still generating... ({attempt * 5}s elapsed, status: {history.status})")

        print(f"\n[Local] Timeout after {max_attempts * 5} seconds")
        return {"status": "timeout", "task_id": history.id}


# ──────────────────────────────────────────────
# Main entry point
# ──────────────────────────────────────────────
def generate_image(prompt, image_size="1:1", resolution="1k", style="realistic",
                   source_images=None, reference_images=None, mode=None):
    """
    Generate an AI image. Dispatches to local or server mode based on config.

    Args:
        prompt: Text description of the desired image
        image_size: Aspect ratio - "1:1", "16:9", "9:16", "3:4", "4:3", etc.
        resolution: Output quality - "1k", "2k", "4k"
        style: Image style - "realistic", "anime", "cartoon", "oil_painting", "watercolor"
        source_images: List of source image paths (for image-to-image)
        reference_images: List of reference image paths
        mode: Override mode ("local" or "server"). If None, reads from config.json.

    Returns:
        dict with task info and result
    """
    cfg = load_config()
    active_mode = mode or cfg.get('mode', 'local')

    print(f"=== AI Image Generator (mode: {active_mode}) ===\n")

    if active_mode == 'server':
        server_cfg = cfg.get('server', {})
        if not server_cfg.get('url') or not server_cfg.get('username') or not server_cfg.get('password'):
            print("ERROR: Server mode requires url, username, password in config.json")
            return {"status": "failed", "error": "Server config incomplete"}

        gen = ServerImageGenerator(server_cfg)
        return gen.generate(
            prompt, image_size=image_size, resolution=resolution,
            style=style, source_images=source_images, reference_images=reference_images,
        )
    else:
        local_cfg = cfg.get('local', {})
        user_id = local_cfg.get('user_id', 1)
        return generate_image_local(
            prompt, image_size=image_size, resolution=resolution,
            style=style, source_images=source_images, reference_images=reference_images,
            user_id=user_id,
        )


if __name__ == "__main__":
    # Parse args
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    flags = {sys.argv[i].lstrip('-'): sys.argv[i + 1]
             for i in range(1, len(sys.argv) - 1) if sys.argv[i].startswith('--')}

    if not args:
        print(__doc__)
        sys.exit(1)

    prompt_text = args[0]
    size = args[1] if len(args) > 1 else "1:1"
    res = args[2] if len(args) > 2 else "1k"
    style_arg = args[3] if len(args) > 3 else "realistic"
    reference_images=args[4] if len(args) > 4 else None
    mode_override = flags.get('mode', None)

    result = generate_image(prompt_text, image_size=size, resolution=res,
                            style=style_arg, mode=mode_override,reference_images=reference_images)
    print(f"\\nFinal result: {json.dumps(result, indent=2, ensure_ascii=False)}")