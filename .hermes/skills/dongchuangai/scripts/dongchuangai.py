import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests


BASE_URL = os.environ.get('DONGCHUANGAI_BASE_URL', 'http://127.0.0.1:5000/api/v1').rstrip('/')


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


def check_account():
    return request_json('GET', '/quick-create/dongchuangai/account')


def execute(endpoint: str, prompt: str | None, params: dict, wait: bool):
    payload = {'endpoint': endpoint, 'prompt': prompt, 'params': params, 'wait': wait}
    return request_json('POST', '/quick-create/dongchuangai/execute', json=payload)


def poll(task_id: str):
    return request_json('GET', f'/quick-create/dongchuangai/tasks/{task_id}')


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


def upload_files(file_args: list[str], target: str, params: dict) -> list[dict]:
    uploaded = []
    for item in file_args:
        key = 'sourceImages'
        file_path = item
        if '=' in item:
            key, file_path = item.split('=', 1)
            key = key.strip() or 'sourceImages'
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
    parser.add_argument('--list', action='store_true')
    parser.add_argument('--type')
    parser.add_argument('--info')
    parser.add_argument('--endpoint')
    parser.add_argument('--prompt')
    parser.add_argument('--param', action='append', default=[])
    parser.add_argument('--file', action='append', default=[], help='Upload media before execution. Use path or paramKey=path.')
    parser.add_argument('--target', choices=['standard', 'ai_app'], default='standard')
    parser.add_argument('--upload-only', action='store_true')
    parser.add_argument('--wait', action='store_true')
    parser.add_argument('-o', '--output')
    args = parser.parse_args()

    if args.check:
        print(json.dumps(check_account(), ensure_ascii=False, indent=2))
        return

    if args.list:
        print(json.dumps(list_tools(args.type), ensure_ascii=False, indent=2))
        return

    if args.info:
        slug = f'dongchuangai-{args.info.lower().replace("/", "-")}'
        print(json.dumps(request_json('GET', f'/quick-create/dongchuangai/tools/{slug}'), ensure_ascii=False, indent=2))
        return

    params = parse_params(args.param)

    if args.file:
        uploaded = upload_files(args.file, args.target, params)
        if args.upload_only:
            save_output({'status': 1, 'message': 'success', 'data': {'items': uploaded}}, args.output)
            return

    if not args.endpoint:
        raise SystemExit('Missing --endpoint')

    result = execute(args.endpoint, args.prompt, params, args.wait)
    save_output(result, args.output)


if __name__ == '__main__':
    main()
