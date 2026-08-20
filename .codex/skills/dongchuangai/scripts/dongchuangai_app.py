import argparse
import json
import os

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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--list', action='store_true')
    parser.add_argument('--webapp-id')
    parser.add_argument('--nodes', action='store_true')
    parser.add_argument('--run', action='store_true')
    parser.add_argument('--payload')
    args = parser.parse_args()

    if args.list:
        print(json.dumps(request_json('GET', '/quick-create/dongchuangai/apps'), ensure_ascii=False, indent=2))
        return

    if not args.webapp_id:
        raise SystemExit('Missing --webapp-id')

    if args.nodes:
        print(json.dumps(request_json('GET', f'/quick-create/dongchuangai/apps/{args.webapp_id}/nodes'), ensure_ascii=False, indent=2))
        return

    if args.run:
        payload = json.loads(args.payload or '{}')
        print(json.dumps(request_json('POST', f'/quick-create/dongchuangai/apps/{args.webapp_id}/execute', json=payload), ensure_ascii=False, indent=2))
        return

    raise SystemExit('Use --list, --nodes, or --run')


if __name__ == '__main__':
    main()
