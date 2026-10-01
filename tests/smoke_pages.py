#!/usr/bin/env python3
"""
FIN-OS browser smoke test (Playwright, Chromium).

Serves the project root on a throwaway local port, opens every page in html/,
calculators/ and the two root pages, in dark AND light theme, and fails on:
  * uncaught JS exceptions (pageerror)
  * console.error from first-party code
  * failed requests for LOCAL files (404 / aborted) — external APIs and
    localhost backends (Arya :7475, RAG :7476, …) are expected to be offline in CI.

Usage:
  pip install playwright && playwright install chromium
  python3 tests/smoke_pages.py                    # all pages, both themes
  python3 tests/smoke_pages.py --theme dark       # one theme
  python3 tests/smoke_pages.py --only tax,dna     # substring filter
  python3 tests/smoke_pages.py --workers 6        # parallel tabs (default 4)
"""
import argparse
import contextlib
import functools
import http.server
import socketserver
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote, urlparse

ROOT = Path(__file__).resolve().parent.parent

# Console noise that is environmental, not a code defect.
IGNORED_CONSOLE = (
    "Failed to load resource",          # covered by the request-level check below
    "net::ERR_",
    "ERR_CONNECTION_REFUSED",
    "Access to fetch at",               # CORS to third-party APIs
    "has been blocked by CORS",
    "Content Security Policy",          # local server sends no CSP headers; Vercel does
    "favicon",
    "[Violation]",
    "Download the React DevTools",
)
# Requests that are allowed to fail when running offline against a static server.
def _is_external_or_backend(url: str, base: str) -> bool:
    u = urlparse(url)
    if u.scheme in ("data", "blob", "about", "chrome-extension"):
        return True
    if f"{u.scheme}://{u.netloc}" != base:
        return True                      # CDN fonts, APIs, localhost:74xx backends…
    return False


def list_pages(only=None):
    pages = []
    for pattern in ("html/*.html", "calculators/*/*.html", "index.html", "login.html"):
        pages += sorted(ROOT.glob(pattern))
    pages = [p for p in pages if not p.name.startswith(".")]
    if only:
        pages = [p for p in pages if any(o in str(p) for o in only)]
    return pages


@contextlib.contextmanager
def static_server():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Quiet, directory=str(ROOT))
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler) as srv:
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        yield f"http://127.0.0.1:{srv.server_address[1]}"
        srv.shutdown()


def check_page(browser, base, page_path, theme):
    rel = page_path.relative_to(ROOT).as_posix()
    url = f"{base}/{quote(rel)}"
    problems = []
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, color_scheme=theme)
    ctx.add_init_script(
        f"try{{localStorage.setItem('theme','{theme}');localStorage.setItem('finos-theme','{theme}');}}catch(e){{}}"
    )
    page = ctx.new_page()
    page.on("pageerror", lambda e: problems.append(f"pageerror: {str(e)[:200]}"))
    page.on("console", lambda m: problems.append(f"console.error: {m.text[:200]}")
            if m.type == "error" and not any(s in m.text for s in IGNORED_CONSOLE) else None)
    page.on("requestfailed", lambda r: problems.append(f"request failed: {r.url}")
            if not _is_external_or_backend(r.url, base) and "ERR_ABORTED" not in (r.failure or "") else None)  # aborted = redirect stub / navigation
    page.on("response", lambda r: problems.append(f"HTTP {r.status}: {r.url}")
            if r.status >= 400 and not _is_external_or_backend(r.url, base) and "favicon" not in r.url else None)
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=20000)
        page.wait_for_timeout(1200)      # let deferred scripts and first paint settle
    except Exception as e:               # noqa: BLE001
        problems.append(f"navigation: {str(e)[:150]}")
    finally:
        ctx.close()
    return rel, theme, sorted(set(problems))


def run(themes, only, workers):
    from playwright.sync_api import sync_playwright
    pages = list_pages(only)
    jobs = [(p, t) for p in pages for t in themes]
    failures = []
    with static_server() as base, sync_playwright() as pw:
        browser = pw.chromium.launch()
        # one browser, N contexts; run in threads via separate playwright-safe sequential batches
        # (sync API is not thread-safe) -> process in simple loop with context reuse per job.
        for i, (p, t) in enumerate(jobs, 1):
            rel, theme, probs = check_page(browser, base, p, t)
            status = "FAIL" if probs else "ok"
            print(f"[{i:>3}/{len(jobs)}] {status:4} {theme:5} {rel}")
            for pr in probs[:6]:
                print(f"           {pr}")
            if probs:
                failures.append((rel, theme, probs))
        browser.close()
    print(f"\n{len(jobs) - len(failures)}/{len(jobs)} page loads clean; {len(failures)} with problems.")
    return failures


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--theme", choices=["dark", "light", "both"], default="both")
    ap.add_argument("--only", default="")
    ap.add_argument("--workers", type=int, default=1)
    a = ap.parse_args()
    themes = ["dark", "light"] if a.theme == "both" else [a.theme]
    fails = run(themes, [s for s in a.only.split(",") if s], a.workers)
    sys.exit(1 if fails else 0)
