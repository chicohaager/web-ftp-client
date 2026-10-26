#!/usr/bin/env python3
"""Sign-in in a real browser (Playwright, Chromium) against the built backend: the first visit shows the setup
page, the account is created with the setup code, the file panels appear, sign-out leads to the sign-in page,
a wrong password shows the error, the right one opens the app again. Screenshots go to the folder given as
argument (default: a temp folder). Needs `pnpm run build` and `pip install playwright` (+ `playwright install chromium`).
    python3 tools/e2e-signin.py [screenshot-folder]      exit 0 = all passed"""
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 3997
BASE = f"http://127.0.0.1:{PORT}"
shots = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="wfc-e2e-shots-"))
shots.mkdir(parents=True, exist_ok=True)
fails = 0


def check(cond, msg):
    global fails
    print(("ok   " if cond else "FAIL ") + msg)
    fails += 0 if cond else 1


with tempfile.TemporaryDirectory(prefix="wfc-e2e-") as tmp:
    app = Path(tmp, "app")
    (Path(tmp) / "data").mkdir()
    env = dict(os.environ, PORT=str(PORT), DATA_DIR=str(Path(tmp, "data")), APP_DATA=str(app))
    proc = subprocess.Popen(["node", str(ROOT / "packages/backend/dist/index.js")], env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(BASE + "/api/auth/status", timeout=1)
                break
            except OSError:
                time.sleep(0.1)
        code = (app / "setup-code").read_text().strip()
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1280, "height": 800})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(BASE)
            page.get_by_role("heading", name="Create your account").wait_for(timeout=10000)
            check(True, "first visit: setup page")
            page.screenshot(path=str(shots / "1-setup.png"))
            page.get_by_label("Setup code").fill(code)
            page.get_by_label("User name").fill("holgi")
            page.get_by_label("Password", exact=True).fill("short")
            check(page.get_by_text("At least 10 characters").is_visible(), "short password: hint shown")
            check(page.get_by_role("button", name="Create account").is_disabled(), "short password: button disabled")
            page.get_by_label("Password", exact=True).fill("a long test password")
            page.get_by_label("Repeat password").fill("a long test password")
            page.get_by_role("button", name="Create account").click()
            page.get_by_role("button", name="Sign out").wait_for(timeout=10000)
            check(page.get_by_text("Web FTP Client").first.is_visible(), "after setup: the app with its header")
            page.screenshot(path=str(shots / "2-app.png"))
            page.get_by_role("button", name="Sign out").click()
            page.get_by_role("heading", name="Sign in").wait_for(timeout=10000)
            check(True, "sign-out: sign-in page")
            page.get_by_label("User name").fill("holgi")
            page.get_by_label("Password").fill("wrong password!")
            page.get_by_role("button", name="Sign in").click()
            page.get_by_role("alert").wait_for(timeout=10000)
            check(page.get_by_role("alert").inner_text() == "Wrong user name or password", "wrong password: error shown")
            page.screenshot(path=str(shots / "3-wrong-password.png"))
            page.get_by_label("Password").fill("a long test password")
            page.get_by_role("button", name="Sign in").click()
            page.get_by_role("button", name="Sign out").wait_for(timeout=10000)
            check(True, "right password: the app again")
            page.reload()
            page.get_by_role("button", name="Sign out").wait_for(timeout=10000)
            check(True, "reload: still signed in (cookie)")
            check(not errors, f"no page errors {errors[:2]}")
            browser.close()
    except Exception as e:  # noqa: BLE001 - every failure is a test failure here
        check(False, f"aborted: {e}")
    finally:
        proc.terminate()
        proc.wait(timeout=10)
print(f"screenshots: {shots}")
print("✓ e2e sign-in: all checks passed" if fails == 0 else f"✗ e2e sign-in: {fails} failed")
sys.exit(fails)
