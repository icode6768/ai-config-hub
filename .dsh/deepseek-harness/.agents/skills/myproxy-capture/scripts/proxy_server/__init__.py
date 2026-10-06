# -*- coding: utf-8 -*-
import ssl
import asyncio

from mitmproxy import options
from mitmproxy.tools.dump import DumpMaster
from proxy_server.addons import SelfAddon
from config import setting

ssl._create_default_https_context = ssl._create_unverified_context


def _build_upstream_mode(config):
    try:
        if not config.has_section('external_proxy'):
            return ['regular']
        enabled = config.get('external_proxy', 'enabled', fallback='false').strip().lower()
        if enabled not in ('true', '1', 'yes'):
            return ['regular']
        protocol = config.get('external_proxy', 'protocol', fallback='http').strip().lower()
        host = config.get('external_proxy', 'host', fallback='').strip()
        port = config.get('external_proxy', 'port', fallback='').strip()
        if not host or not port:
            print('[External Proxy] host or port is empty, skipping upstream proxy')
            return ['regular']
        if protocol in ('http', 'https'):
            username = config.get('external_proxy', 'username', fallback='').strip()
            password = config.get('external_proxy', 'password', fallback='').strip()
            if username and password:
                return [f'upstream:http://{username}:{password}@{host}:{port}/']
            return [f'upstream:http://{host}:{port}/']
        else:
            print(f'[External Proxy] Unsupported protocol: {protocol}')
            return ['regular']
    except Exception as e:
        print(f'[External Proxy] Config error: {e}')
        return ['regular']


def _get_bypass_hosts(config):
    try:
        if not config.has_section('external_proxy'):
            return []
        bypass_str = config.get('external_proxy', 'bypass_hosts', fallback='').strip()
        always_bypass_localhost = config.get(
            'external_proxy', 'always_bypass_localhost', fallback='true'
        ).strip().lower() in ('true', '1', 'yes')
        hosts = [h.strip() for h in bypass_str.split(',') if h.strip()]
        if always_bypass_localhost:
            for h in ('localhost', '127.0.0.1', '::1'):
                if h not in hosts:
                    hosts.append(h)
        return hosts
    except Exception:
        return []


# mitmproxy 10.x+: DumpMaster must be created inside a running event loop,
# and run() is a coroutine — wrap everything in asyncio.run().
async def _run_async(config):
    self_addon = SelfAddon()
    mode = _build_upstream_mode(config)

    opts = options.Options(listen_host='0.0.0.0', listen_port=8882, mode=mode)
    m = DumpMaster(opts)
    m.addons.add(self_addon)

    if mode != ['regular']:
        bypass_hosts = _get_bypass_hosts(config)
        print(f'[External Proxy] Upstream proxy enabled: {mode[0]}')
        if bypass_hosts:
            print(f'[External Proxy] Bypass hosts: {", ".join(bypass_hosts)}')
    else:
        print('[External Proxy] Direct mode (no upstream proxy)')

    print('[myproxy] Proxy server listening on 0.0.0.0:8882')
    await m.run()


def start_proxy():
    config = setting.load_config()
    try:
        asyncio.run(_run_async(config))
    except KeyboardInterrupt:
        print('[myproxy] Stopped.')


if __name__ == "__main__":
    start_proxy()
