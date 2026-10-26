#!/usr/bin/env python3
"""The ZimaOS dashboard tile (zpkg/index.html) in a fresh browser that has never accepted the app's self-signed
certificate — the state of every first install. The tile must find the app (plain-HTTP probe) and open its HTTPS
address; a probe that only works once the certificate is trusted passes in a warm browser and fails for everyone else.

The tile has port 8089 built in, so the backend runs on 8089 here (must be free); the tile page is served from
another local port, like the dashboard serves it from its own.
  python3 tools/e2e-tile.py      exit 0 = all passed (needs pnpm run build and Python Playwright)
"""
import functools
import http.server
import os
import subprocess
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
APP_PORT = 8089      # fixed in zpkg/index.html
TILE_PORT = 3989
fails = 0


def check(cond, msg):
    global fails
    print(("ok   " if cond else "FAIL ") + msg)
    fails += 0 if cond else 1


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


with tempfile.TemporaryDirectory(prefix="wfc-tile-") as tmp:
    (Path(tmp) / "data").mkdir()
    env = dict(os.environ, PORT=str(APP_PORT), DATA_DIR=str(Path(tmp, "data")), APP_DATA=str(Path(tmp, "app")))
    proc = subprocess.Popen(["node", str(ROOT / "packages/backend/dist/index.js")], env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    tile = http.server.ThreadingHTTPServer(("127.0.0.1", TILE_PORT), functools.partial(Quiet, directory=str(ROOT / "zpkg")))
    threading.Thread(target=tile.serve_forever, daemon=True).start()
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{APP_PORT}/healthz", timeout=1)
                break
            except OSError:
                time.sleep(0.1)
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()            # no ignore_https_errors: the certificate is not trusted
            opened = []
            page.on("request", lambda r: opened.append(r.url) if r.url.startswith(f"https://127.0.0.1:{APP_PORT}/") and r.is_navigation_request() else None)
            page.goto(f"http://127.0.0.1:{TILE_PORT}/index.html")
            deadline = time.time() + 15
            while time.time() < deadline and not opened:
                page.wait_for_timeout(200)
            check(bool(opened), f"fresh browser: the tile opens https://127.0.0.1:{APP_PORT}/ (got {opened[:1] or 'nothing within 15 s'})")
            if not opened:
                print("     tile status: " + page.locator("#status").inner_text())
            browser.close()
    finally:
        tile.shutdown()
        proc.terminate()
        proc.wait(timeout=10)

print("✓ tile: all checks passed" if fails == 0 else f"✗ tile: {fails} failed")
raise SystemExit(fails)
