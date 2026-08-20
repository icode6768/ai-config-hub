import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests


BASE_URL = os.environ.get('DONGCHUANGAI_BASE_URL', 'http://127.0.0.1:5000/api/v1').rstrip('/')

TERMINAL_HISTORY_STATUS = {'done', 'failed', 'success', 'error'}


def api_key() -> str:
    key = os.environ.get('DONGCHUANGAI_API_KEY', '').strip()
    if not key:
        raise SystemExit('Missing DONGCHUANGAI_API_KEY')
    return key


def headers() -> dict:
    return {'Authorization': f'Bearer {api_key()}'}


def request_json(method: str, path: str, **kwargs):
    response = requests.request(method, f'{BASE_URL}{path}', headers=headers(), timeout=120, **kwargs)
    response.raise_for_status()
    return response.json()


def request_upload(path: str, files: dict, data: dict | None = None):
    response = requests.request(
        'POST',
        f'{BASE_URL}{path}',
        headers=headers(),
        files=files,
        data=data or {},
        timeout=300,
    )
    response.raise_for_status()
    return response.json()


def list_tools(tool_type: str | None):
    params = {}
    if tool_type:
        params['category'] = tool_type
    return request_json('GET', '/quick-create/dongchuangai/tools', params=params)


def list_all_tools(tool_type: str | None, search: str | None, page: int, per_page: int):
    params = {'page': page, 'per_page': per_page}
    if tool_type:
        params['category'] = tool_type
    if search:
        params['search'] = search
    return request_json('GET', '/quick-create/tools', params=params)


def standard_tool_detail(slug: str):
    return request_json('GET', f'/quick-create/tools/{slug}')


def check_account():
    return request_json('GET', '/quick-create/dongchuangai/account')


def execute(endpoint: str, prompt: str | None, params: dict, wait: bool):
    payload = {'endpoint': endpoint, 'prompt': prompt, 'params': params, 'wait': wait}
    return request_json('POST', '/quick-create/dongchuangai/execute', json=payload)


def run_tool(tool_slug: str, prompt: str | None, params: dict, source_images: list[str], session_id: str | None, dispatch_strategy: str | None):
    payload = {
        'tool_slug': tool_slug,
        'prompt': prompt,
        'params': params,
        'source_images': source_images,
    }
    if session_id:
        payload['session_id'] = session_id
    if dispatch_strategy:
        payload['dispatch_strategy'] = dispatch_strategy
    return request_json('POST', '/quick-create/execute', json=payload)


def poll(task_id: str):
    return request_json('GET', f'/quick-create/dongchuangai/tasks/{task_id}')


def history_list(page: int, per_page: int, category: str | None, tool_slug: str | None, status: str | None):
    params = {'page': page, 'per_page': per_page}
    if category:
        params['category'] = category
    if tool_slug:
        params['tool_slug'] = tool_slug
    if status:
        params['status'] = status
    return request_json('GET', '/quick-create/history', params=params)


def history_detail(history_id: int):
    return request_json('GET', f'/quick-create/history/{history_id}')


def history_refresh(history_id: int):
    return request_json('POST', f'/quick-create/history/{history_id}/refresh')


def wait_history(history_id: int, timeout: int = 1800, interval: int = 10):
    """Poll /quick-create/history/{id} until terminal status, refreshing upstream state."""
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            last = history_refresh(history_id)
        except requests.RequestException:
            last = history_detail(history_id)
        item = last.get('data') if isinstance(last, dict) else None
        status = str((item or {}).get('status') or '').lower()
        if status in TERMINAL_HISTORY_STATUS:
            return last
        print(f'WAITING history_id={history_id} status={status or "unknown"}', file=sys.stderr)
        time.sleep(interval)
    return last


def save_output(data: dict, output: str | None):
    if not output:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return
    Path(output).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'OUTPUT_FILE:{output}')


def parse_params(param_list: list[str]) -> dict:
    result = {}
    for item in param_list:
        if '=' not in item:
            continue
        key, value = item.split('=', 1)
        result[key] = value
    return result


def normalize_upload_items(payload: dict) -> list[dict]:
    data = payload.get('data') if isinstance(payload, dict) else payload
    if isinstance(data, dict) and isinstance(data.get('items'), list):
        return data['items']
    if isinstance(data, dict):
        return [data]
    if isinstance(data, list):
        return data
    return []


def uploaded_value(item: dict) -> str:
    return str(item.get('url') or item.get('file_name') or item.get('target') or '').strip()


def add_param_value(params: dict, key: str, value: str):
    if not value:
        return
    current = params.get(key)
    if current is None:
        params[key] = [value]
    elif isinstance(current, list):
        current.append(value)
    else:
        params[key] = [current, value]


def upload_media(file_path: str, target: str):
    path = Path(file_path).expanduser().resolve()
    if not path.exists() or not path.is_file():
        raise SystemExit(f'File not found: {file_path}')
    with path.open('rb') as fh:
        return request_upload(
            '/quick-create/dongchuangai/upload',
            files={'file': (path.name, fh)},
            data={'target': target},
        )


def upload_files(file_args: list[str], target: str, params: dict, default_key: str = 'sourceImages') -> list[dict]:
    uploaded = []
    for item in file_args:
        key = default_key
        file_path = item
        if '=' in item:
            key, file_path = item.split('=', 1)
            key = key.strip() or default_key
        payload = upload_media(file_path.strip(), target)
        upload_items = normalize_upload_items(payload)
        uploaded.extend(upload_items)
        for upload_item in upload_items:
            add_param_value(params, key, uploaded_value(upload_item))
    if uploaded:
        params['uploaded_media'] = uploaded
    return uploaded


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--list', action='store_true', help='List DongChuangAI channel tools.')
    parser.add_argument('--list-all', action='store_true', help='List the full model catalog (/quick-create/tools, all sources).')
    parser.add_argument('--type')
    parser.add_argument('--search')
    parser.add_argument('--page', type=int, default=1)
    parser.add_argument('--per-page', type=int, default=50)
    parser.add_argument('--info', help='DongChuangAI channel tool detail by endpoint.')
    parser.add_argument('--tool-info', help='Standard catalog tool detail by tool_slug.')
    parser.add_argument('--endpoint', help='Execute a DongChuangAI channel endpoint.')
    parser.add_argument('--run-tool', help='Execute any catalog model by tool_slug via /quick-create/execute.')
    parser.add_argument('--prompt')
    parser.add_argument('--param', action='append', default=[])
    parser.add_argument('--file', action='append', default=[], help='Upload media before execution. Use path or paramKey=path.')
    parser.add_argument('--target', choices=['standard', 'ai_app', 'native'], default='standard')
    parser.add_argument('--upload-only', action='store_true')
    parser.add_argument('--session-id', help='Chat session id used by run-tool history grouping.')
    parser.add_argument('--dispatch-strategy', help='run-tool dispatch strategy, e.g. quality_first / manual.')
    parser.add_argument('--history', action='store_true', help='List quick-create history.')
    parser.add_argument('--history-id', type=int, help='Show one quick-create history record.')
    parser.add_argument('--refresh-history', type=int, help='Refresh one quick-create history record from upstream.')
    parser.add_argument('--status', help='History status filter: pending/processing/done/failed.')
    parser.add_argument('--tool-slug', help='History tool_slug filter.')
    parser.add_argument('--wait', action='store_true')
    parser.add_argument('--timeout', type=int, default=1800, help='Max seconds to wait for async tasks.')
    parser.add_argument('-o', '--output')
    args = parser.parse_args()

    if args.check:
        print(json.dumps(check_account(), ensure_ascii=False, indent=2))
        return

    if args.list:
        print(json.dumps(list_tools(args.type), ensure_ascii=False, indent=2))
        return

    if args.list_all:
        save_output(list_all_tools(args.type, args.search, args.page, args.per_page), args.output)
        return

    if args.info:
        slug = f'dongchuangai-{args.info.lower().replace("/", "-")}'
        print(json.dumps(request_json('GET', f'/quick-create/dongchuangai/tools/{slug}'), ensure_ascii=False, indent=2))
        return

    if args.tool_info:
        save_output(standard_tool_detail(args.tool_info), args.output)
        return

    if args.refresh_history:
        save_output(history_refresh(args.refresh_history), args.output)
        return

    if args.history_id:
        if args.wait:
            save_output(wait_history(args.history_id, args.timeout), args.output)
        else:
            save_output(history_detail(args.history_id), args.output)
        return

    if args.history:
        save_output(history_list(args.page, args.per_page, args.type, args.tool_slug, args.status), args.output)
        return

    params = parse_params(args.param)

    if args.run_tool:
        source_images: list[str] = []
        if args.file:
            upload_params: dict = {}
            upload_files(args.file, args.target, upload_params, default_key='source_images')
            raw = upload_params.get('source_images') or []
            source_images = raw if isinstance(raw, list) else [raw]
        result = run_tool(args.run_tool, args.prompt, params, source_images, args.session_id, args.dispatch_strategy)
        data = result.get('data') if isinstance(result, dict) else None
        history_id = (data or {}).get('history_id')
        if args.wait and history_id:
            result = wait_history(int(history_id), args.timeout)
        save_output(result, args.output)
        return

    if args.file:
        uploaded = upload_files(args.file, args.target, params)
        if args.upload_only:
            save_output({'status': 1, 'message': 'success', 'data': {'items': uploaded}}, args.output)
            return

    if not args.endpoint:
        raise SystemExit('Missing --endpoint or --run-tool')

    result = execute(args.endpoint, args.prompt, params, args.wait)
    save_output(result, args.output)


if __name__ == '__main__':
    main()
