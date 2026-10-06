"""DongChuangAI video pipelines.

Covers the DesktopAIHome server-side video pipelines that are not plain
model endpoints: merge site videos, multiframe long video and the
commerce one-click video pipeline. All of them return a quick-create
history id that this script can poll to completion.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests


BASE_URL = os.environ.get('DONGCHUANGAI_BASE_URL', 'http://127.0.0.1:5000/api/v1').rstrip('/')

TERMINAL_STATUS = {'done', 'failed', 'success', 'error'}


def api_key() -> str:
    key = os.environ.get('DONGCHUANGAI_API_KEY', '').strip()
    if not key:
        raise SystemExit('Missing DONGCHUANGAI_API_KEY')
    return key


def headers() -> dict:
    return {'Authorization': f'Bearer {api_key()}'}


def request_json(method: str, path: str, **kwargs):
    response = requests.request(method, f'{BASE_URL}{path}', headers=headers(), timeout=600, **kwargs)
    response.raise_for_status()
    return response.json()


def save_output(data, output: str | None):
    if not output:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return
    Path(output).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'OUTPUT_FILE:{output}')


def upload_media(file_path: str, target: str = 'standard') -> list[str]:
    path = Path(file_path).expanduser().resolve()
    if not path.exists() or not path.is_file():
        raise SystemExit(f'File not found: {file_path}')
    with path.open('rb') as fh:
        payload = request_json(
            'POST',
            '/quick-create/dongchuangai/upload',
            files={'file': (path.name, fh)},
            data={'target': target},
        )
    data = payload.get('data') if isinstance(payload, dict) else None
    items = data.get('items') if isinstance(data, dict) and isinstance(data.get('items'), list) else [data]
    urls = []
    for item in items or []:
        if isinstance(item, dict):
            value = str(item.get('url') or item.get('file_name') or '').strip()
            if value:
                urls.append(value)
    return urls


def collect_source_images(files: list[str]) -> list[str]:
    urls: list[str] = []
    for file_path in files:
        urls.extend(upload_media(file_path))
    return urls


def merge_videos(video_urls: list[str], resolution: str | None):
    payload = {'video_urls': video_urls}
    if resolution:
        payload['resolution'] = resolution
    return request_json('POST', '/quick-create/merge-videos', json=payload)


def multiframe_long_video(prompt: str, model: str, target_duration: int, resolution: str | None, ratio: str | None, source_images: list[str], session_id: str | None):
    payload = {
        'prompt': prompt,
        'model': model,
        'target_duration': target_duration,
        'source_images': source_images,
    }
    if resolution:
        payload['resolution'] = resolution
    if ratio:
        payload['ratio'] = ratio
    if session_id:
        payload['session_id'] = session_id
    return request_json('POST', '/quick-create/multiframe-long-video', json=payload)


def commerce_video(prompt: str, source_images: list[str], resolution: str | None, ratio: str | None, model: str | None, image_model: str | None, duration: int | None, session_id: str | None):
    payload = {
        'prompt': prompt,
        'source_images': source_images,
    }
    if resolution:
        payload['resolution'] = resolution
    if ratio:
        payload['ratio'] = ratio
    if model:
        payload['model'] = model
    if image_model:
        payload['image_model'] = image_model
    if duration:
        payload['duration'] = duration
    if session_id:
        payload['session_id'] = session_id
    return request_json('POST', '/quick-create/commerce-video', json=payload)


def history_detail(history_id: int):
    return request_json('GET', f'/quick-create/history/{history_id}')


def history_refresh(history_id: int):
    return request_json('POST', f'/quick-create/history/{history_id}/refresh')


def wait_history(history_id: int, timeout: int, interval: int = 15):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            last = history_refresh(history_id)
        except requests.RequestException:
            last = history_detail(history_id)
        item = last.get('data') if isinstance(last, dict) else None
        status = str((item or {}).get('status') or '').lower()
        if status in TERMINAL_STATUS:
            return last
        print(f'WAITING history_id={history_id} status={status or "unknown"}', file=sys.stderr)
        time.sleep(interval)
    return last


def maybe_wait(result, wait: bool, timeout: int):
    if not wait or not isinstance(result, dict):
        return result
    item = result.get('data') or {}
    history_id = item.get('history_id')
    if history_id:
        return wait_history(int(history_id), timeout)
    return result


def main():
    parser = argparse.ArgumentParser()
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--merge', action='store_true', help='Merge 2-20 site videos into one.')
    action.add_argument('--long-video', action='store_true', help='Multiframe long video (segmented generation + merge).')
    action.add_argument('--commerce', action='store_true', help='Commerce one-click video pipeline.')
    action.add_argument('--wait-history', type=int, help='Only poll an existing quick-create history id.')

    parser.add_argument('--video-url', action='append', default=[], help='Site video URL for --merge (repeatable).')
    parser.add_argument('--prompt')
    parser.add_argument('--model', help='Video model, e.g. seedance2.0 / lingkeai-16.')
    parser.add_argument('--image-model', help='Commerce pipeline image model, default lingkeai-93.')
    parser.add_argument('--duration', type=int, help='Target duration seconds (long video: 5-600, commerce: per segment).')
    parser.add_argument('--resolution', default='720p', help='480p / 720p / 1080p.')
    parser.add_argument('--ratio', default='9:16', help='Aspect ratio, e.g. 9:16 / 16:9.')
    parser.add_argument('--file', action='append', default=[], help='Local image to upload as source image (repeatable).')
    parser.add_argument('--image-url', action='append', default=[], help='Already-uploaded source image URL (repeatable).')
    parser.add_argument('--session-id')
    parser.add_argument('--wait', action='store_true', help='Poll history until terminal status.')
    parser.add_argument('--timeout', type=int, default=3600)
    parser.add_argument('-o', '--output')
    args = parser.parse_args()

    if args.wait_history:
        save_output(wait_history(args.wait_history, args.timeout), args.output)
        return

    if args.merge:
        if len(args.video_url) < 2:
            raise SystemExit('Provide at least two --video-url')
        result = merge_videos(args.video_url, args.resolution)
        save_output(result, args.output)
        return

    source_images = list(args.image_url)
    if args.file:
        source_images.extend(collect_source_images(args.file))

    if args.long_video:
        if not args.prompt or not args.model:
            raise SystemExit('Missing --prompt or --model')
        result = multiframe_long_video(
            args.prompt,
            args.model,
            args.duration or 30,
            args.resolution,
            args.ratio,
            source_images,
            args.session_id,
        )
    elif args.commerce:
        if not args.prompt:
            raise SystemExit('Missing --prompt')
        result = commerce_video(
            args.prompt,
            source_images,
            args.resolution,
            args.ratio,
            args.model,
            args.image_model,
            args.duration,
            args.session_id,
        )
    else:  # pragma: no cover
        raise SystemExit('No action')

    result = maybe_wait(result, args.wait, args.timeout)
    save_output(result, args.output)


if __name__ == '__main__':
    main()
