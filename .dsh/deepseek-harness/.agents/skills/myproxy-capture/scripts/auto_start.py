# -*- coding: utf-8 -*-
"""
auto_start.py
1. Saves Windows system proxy settings (ProxyEnable / ProxyServer / ProxyOverride).
2. Sets proxy to 127.0.0.1:8882 and clears ProxyOverride so that localhost /
   LAN addresses (192.168.*, 10.*, 172.*) are NO LONGER bypassed.
3. Starts mitmproxy.
4. On exit (Ctrl+C or normal), restores all original settings.

NOTE for Chrome/Edge localhost capture:
  Chrome has a hardcoded internal bypass for 'localhost' and '127.0.0.1'.
  Registry changes alone cannot override it.
  To capture localhost in Chrome, launch Chrome with:
      chrome.exe --proxy-bypass-list="" --proxy-server="http://127.0.0.1:8882"
  The bat file offers to open Chrome this way automatically.
"""
import sys
import os
import asyncio
import winreg
import ctypes

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from proxy_server import _run_async
from config import setting

PROXY_ADDR = "127.0.0.1:8882"
_REG_KEY = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings"
_OPT_SETTINGS_CHANGED = 39
_OPT_REFRESH = 37


def _notify_system():
    try:
        wininet = ctypes.windll.wininet
        wininet.InternetSetOptionW(0, _OPT_SETTINGS_CHANGED, 0, 0)
        wininet.InternetSetOptionW(0, _OPT_REFRESH, 0, 0)
    except Exception:
        pass


def get_proxy_settings():
    """Return dict with ProxyEnable, ProxyServer, ProxyOverride."""
    settings = {"ProxyEnable": 0, "ProxyServer": "", "ProxyOverride": ""}
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _REG_KEY, 0, winreg.KEY_READ) as k:
            for name in ("ProxyEnable", "ProxyServer", "ProxyOverride"):
                try:
                    settings[name] = winreg.QueryValueEx(k, name)[0]
                except FileNotFoundError:
                    pass
    except Exception as e:
        print(f"[proxy-settings] Read registry failed: {e}")
    return settings


def apply_proxy_settings(enabled: bool, server: str, override: str):
    """Write all three proxy keys and notify the system."""
    try:
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, _REG_KEY, 0, winreg.KEY_SET_VALUE
        ) as k:
            winreg.SetValueEx(k, "ProxyEnable",   0, winreg.REG_DWORD, 1 if enabled else 0)
            winreg.SetValueEx(k, "ProxyServer",   0, winreg.REG_SZ, server)
            winreg.SetValueEx(k, "ProxyOverride", 0, winreg.REG_SZ, override)
        _notify_system()
        return True
    except Exception as e:
        print(f"[proxy-settings] Write registry failed: {e}")
        return False


if __name__ == "__main__":
    # ── 1. save ──────────────────────────────────────────────────────────────
    orig = get_proxy_settings()
    print(f"[proxy-settings] Saved  ProxyEnable  = {orig['ProxyEnable']}")
    print(f"[proxy-settings] Saved  ProxyServer  = {orig['ProxyServer']!r}")
    print(f"[proxy-settings] Saved  ProxyOverride= {orig['ProxyOverride']!r}")

    # ── 2. set proxy + clear override (capture localhost & LAN) ──────────────
    # ProxyOverride="" means NO addresses are excluded from the proxy.
    # This makes 192.168.*, 10.*, 127.*, LAN IPs all routed through mitmproxy.
    if apply_proxy_settings(True, PROXY_ADDR, ""):
        print(f"[proxy-settings] ProxyServer  -> {PROXY_ADDR}")
        print(f"[proxy-settings] ProxyOverride-> '' (localhost + LAN now captured)")
    else:
        print("[proxy-settings] WARNING: registry write failed, set proxy manually.")

    print()
    print("[proxy-settings] Chrome/Edge note:")
    print("  Chrome has a hardcoded bypass for 'localhost'/'127.0.0.1'.")
    print("  To capture localhost in Chrome, use the --proxy-bypass-list flag.")
    print("  See start_myproxy_chrome.bat for a one-click Chrome launcher.")
    print()

    # ── 3. run mitmproxy ─────────────────────────────────────────────────────
    try:
        config = setting.load_config()
        asyncio.run(_run_async(config))
    except KeyboardInterrupt:
        print("\n[myproxy] Ctrl+C received, shutting down...")
    finally:
        # ── 4. restore ───────────────────────────────────────────────────────
        apply_proxy_settings(
            bool(orig["ProxyEnable"]),
            orig["ProxyServer"],
            orig["ProxyOverride"],
        )
        print(f"[proxy-settings] Restored ProxyEnable  = {orig['ProxyEnable']}")
        print(f"[proxy-settings] Restored ProxyServer  = {orig['ProxyServer']!r}")
        print(f"[proxy-settings] Restored ProxyOverride= {orig['ProxyOverride']!r}")
