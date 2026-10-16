#!/usr/bin/env python3
"""
Corrupt-shape fuzz for every localStorage reader on the website.

Every known finos_* key is pre-seeded with a value of the WRONG shape (an object where a list is expected, a string,
a number, null, a list of junk, truncated JSON ...) and each page is opened.  A page FAILS when, compared with the same page
loaded with empty storage, it
  * throws an uncaught exception / unhandled rejection / console error that the clean load did not, or
  * ends up (almost) blank where the clean load was not.

Usage
  python3 tests/corrupt_json_fuzz.py                       # all pages, all shapes, 6 worker processes (~6-8 min)
  python3 tests/corrupt_json_fuzz.py --shapes obj,str      # subset of shapes
  python3 tests/corrupt_json_fuzz.py --only tax,ppf        # substring filter on the page path
  python3 tests/corrupt_json_fuzz.py --bisect              # also find the key(s) responsible for each failure
tests/test_corrupt_json_fuzz.py runs a reduced version as a regression test.
"""
import argparse
import json
import re
import signal
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from smoke_pages import IGNORED_CONSOLE, ROOT, list_pages, static_server  # noqa: E402

SHAPES = {
    "obj":    "{}",
    "arr":    "[]",
    "null":   "null",
    "str":    '"abc"',
    "num":    "123",
    "junk":   '[1,"a",null,{"x":1},[2]]',
    "nested": '{"a":{"b":null},"c":[null],"items":{"0":null}}',
    "bool":   "true",
    "trunc":  '{"a":[1,2',
    "neg":    "-5",
}
# keys whose corruption is handled by design elsewhere (boot gate / gateway override), not by the page readers
SKIP_KEYS = {"finos_vault_meta", "finos_vault", "finos_api_gateway", "finos_biometric_locked", "finos_unlocked", "finos_logged_in",
             "finos_lang", "finos_navigate", "finos_query", "finos_host_ip"}
EXTRA_KEYS = ["finos-doc-history", "finos-profile", "qs_watchlist", "tc_history_", "tradebook_settings", "tradebook_trades",
              "trady_rules", "trady_setups", "trady_sighist", "trady_watchlist"]


def known_keys():
    keys = set(EXTRA_KEYS)
    pats = list((ROOT / "js").glob("*.js")) + list((ROOT / "html").glob("*.html")) + list((ROOT / "calculators").glob("*/*.html")) \
        + [ROOT / "index.html", ROOT / "login.html"]
    rx = re.compile(r"""['"`]((?:finos|FINOS)_[A-Za-z0-9_]+)['"`]""")
    for f in pats:
        try:
            keys.update(rx.findall(f.read_text(encoding="utf-8", errors="ignore")))
        except OSError:
            pass
    return sorted(k for k in keys if k not in SKIP_KEYS and not k.endswith("_"))


def norm(msg):
    msg = re.sub(r"https?://[^\s)]+", "<url>", msg)
    msg = re.sub(r"\d+", "N", msg)
    return msg[:160]


class Hang(Exception):
    pass


def _alarm(_sig, _frm):
    raise Hang()


def load(browser, base, rel, seed, wait_ms=700, hard_s=30):
    """Open one page with `seed` ({key: raw string}); return (errors:set, body_len:int).
    A page that never answers (an endless loop caused by the stored value) is reported as the error "HANG" instead of
    blocking the whole run: the sync API cannot interrupt a busy renderer, so a SIGALRM abandons the load."""
    errs = set()
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    script = "try{const s=%s;for(const k in s)localStorage.setItem(k,s[k]);}catch(e){}" % json.dumps(seed)
    ctx.add_init_script(script)

    def gate(route):
        u = route.request.url
        if u.startswith(base) or u.startswith("data:") or u.startswith("blob:"):
            return route.continue_()
        return route.abort()
    ctx.route("**/*", gate)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errs.add("pageerror: " + norm(str(e))))
    page.on("console", lambda m: errs.add("console.error: " + norm(m.text))
            if m.type == "error" and not any(s in m.text for s in IGNORED_CONSOLE) else None)
    n = 0
    signal.signal(signal.SIGALRM, _alarm)
    signal.alarm(hard_s)
    try:
        page.goto(f"{base}/{quote(rel)}", wait_until="domcontentloaded", timeout=20000)
        page.wait_for_timeout(wait_ms)
        n = page.evaluate("(document.body && document.body.innerText || '').trim().length")
    except Hang:
        errs.add("HANG: page did not respond within %ds" % hard_s)
    except Exception as e:  # noqa: BLE001
        errs.add("navigation: " + norm(str(e)))
    finally:
        signal.alarm(0)
        try:
            signal.alarm(10)
            ctx.close()
        except BaseException:  # noqa: BLE001
            pass
        finally:
            signal.alarm(0)
    return errs, n


def worker(shard, nshards, shapes, only, bisect, keys, out_path):
    from playwright.sync_api import sync_playwright
    pages = [p for i, p in enumerate(list_pages(only)) if i % nshards == shard]
    results = []
    with static_server() as base, sync_playwright() as pw:
        browser = pw.chromium.launch()
        for p in pages:
            rel = p.relative_to(ROOT).as_posix()
            base_errs, base_len = load(browser, base, rel, {})
            for sname in shapes:
                seed = {k: SHAPES[sname] for k in keys}
                errs, n = load(browser, base, rel, seed)
                new = sorted(e for e in errs if e not in base_errs)
                blank = base_len >= 120 and n < max(30, base_len * 0.4)
                if new or blank:
                    row = {"page": rel, "shape": sname, "errors": new, "blank": blank, "len": n, "base_len": base_len, "keys": None}
                    if bisect:
                        row["keys"] = find_keys(browser, base, rel, sname, keys, base_errs, set(new), blank, base_len)
                    results.append(row)
        browser.close()
    Path(out_path).write_text(json.dumps(results))


def find_keys(browser, base, rel, sname, keys, base_errs, target, blank, base_len):
    """Smallest set of keys that still reproduces the failure (delta debugging by halves)."""
    def fails(sub):
        errs, n = load(browser, base, rel, {k: SHAPES[sname] for k in sub}, wait_ms=500)
        if target:
            return bool(target & errs)
        return base_len >= 120 and n < max(30, base_len * 0.4)
    cur = list(keys)
    if not fails(cur):
        return ["(not reproducible on retry)"]
    while len(cur) > 1:
        half = len(cur) // 2
        a, b = cur[:half], cur[half:]
        if fails(a):
            cur = a
        elif fails(b):
            cur = b
        else:
            break              # needs keys from both halves
    return cur


def run(shapes, only, workers, bisect):
    keys = known_keys()
    tmp = [HERE / f".fuzz_{i}.json" for i in range(workers)]
    procs = []
    for i in range(workers):
        cmd = [sys.executable, str(Path(__file__)), "--worker", str(i), "--nshards", str(workers), "--shapes", ",".join(shapes),
               "--only", ",".join(only), "--out", str(tmp[i])] + (["--bisect"] if bisect else [])
        procs.append(subprocess.Popen(cmd))
    for p in procs:
        p.wait()
    rows = []
    for t in tmp:
        if t.exists():
            rows += json.loads(t.read_text())
            t.unlink()
    return sorted(rows, key=lambda r: (r["page"], r["shape"])), len(keys)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--shapes", default=",".join(SHAPES))
    ap.add_argument("--only", default="")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--bisect", action="store_true")
    ap.add_argument("--worker", type=int, default=None)
    ap.add_argument("--nshards", type=int, default=1)
    ap.add_argument("--out", default="")
    ap.add_argument("--json", default="")
    a = ap.parse_args()
    shapes = [s for s in a.shapes.split(",") if s]
    only = [s for s in a.only.split(",") if s]
    if a.worker is not None:
        worker(a.worker, a.nshards, shapes, only, a.bisect, known_keys(), a.out)
        sys.exit(0)
    rows, nkeys = run(shapes, only, a.workers, a.bisect)
    print(f"{nkeys} keys x {len(shapes)} shapes; {len(rows)} failing (page, shape) pairs")
    for r in rows:
        print(f"{r['page']:55} {r['shape']:6} {'BLANK ' if r['blank'] else ''}{r['errors'][:2]} keys={r['keys']}")
    if a.json:
        Path(a.json).write_text(json.dumps(rows, indent=1))
    sys.exit(1 if rows else 0)
