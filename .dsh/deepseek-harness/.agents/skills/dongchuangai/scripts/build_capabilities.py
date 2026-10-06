import json
import os
from pathlib import Path

import requests


BASE_URL = os.environ.get('DONGCHUANGAI_BASE_URL', 'http://127.0.0.1:5000/api/v1').rstrip('/')
API_KEY = os.environ.get('DONGCHUANGAI_API_KEY', '').strip()


def main():
    if not API_KEY:
        raise SystemExit('Missing DONGCHUANGAI_API_KEY')
    response = requests.get(
        f'{BASE_URL}/quick-create/dongchuangai/tools',
        headers={'Authorization': f'Bearer {API_KEY}'},
        timeout=120,
    )
    response.raise_for_status()
    payload = response.json()
    target = Path(__file__).resolve().parents[1] / 'data' / 'capabilities.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(target)


if __name__ == '__main__':
    main()
