#!/usr/bin/env python3
"""
CSP conformance check — serves every page with the PRODUCTION Content-Security-Policy from vercel.json
and records every violation the browser reports (securitypolicyviolation events).

Why: the local dev server sends no CSP, so a page can look perfect locally and be broken on Vercel (blocked CDN script,
blocked image host, eval from a library…). This reproduces production's policy locally.

  python3 tests/csp_check.py                     # production policy as-is
  python3 tests/csp_check.py --drop unsafe-eval  # what would break if 'unsafe-eval' were removed?
  python3 tests/csp_check.py --only tax,home     # substring filter
  python3 tests/csp_check.py --json out.json

Exit code 1 if any violation was seen. External hosts need network access (CDNs are real).
"""
import argparse
import collections
import json
import sys
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent))
from smoke_pages import list_pages, static_server, ROOT  # noqa: E402

LISTENER = """
window.__csp = [];
document.addEventListener('securitypolicyviolation', e => window.__csp.push({
  dir: e.effectiveDirective, blocked: (e.blockedURI || '').slice(0, 120), sample: (e.sample || '').slice(0, 60), src: (e.sourceFile || '').split('/').slice(-2).join('/') + ':' + e.lineNumber
}));
"""


def production_csp(drop=None):
    cfg = json.loads((ROOT / "vercel.json").read_text())
    for h in cfg["headers"]:
        if h["source"] == "/(.*)":
            for x in h["headers"]:
                if x["key"] == "Content-Security-Policy":
                    csp = x["value"]
                    for token in drop or []:
                        csp = csp.replace(f"'{token}'", "")
                    return csp
    raise SystemExit("no CSP found in vercel.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--drop", action="append", default=[], help="CSP keyword to remove, e.g. unsafe-eval")
    ap.add_argument("--only", default="")
    ap.add_argument("--json", default="")
    a = ap.parse_args()
    csp = production_csp(a.drop)
    pages = list_pages([s for s in a.only.split(",") if s])
    from playwright.sync_api import sync_playwright

    found = collections.defaultdict(lambda: {"pages": set(), "sample": "", "src": ""})
    with static_server() as base, sync_playwright() as pw:
        b = pw.chromium.launch(channel="chromium")
        ctx = b.new_context(viewport={"width": 1280, "height": 800})
        ctx.add_init_script(LISTENER)

        def with_csp(route):
            if route.request.resource_type == "document":
                resp = route.fetch()
                headers = dict(resp.headers)
                headers["content-security-policy"] = csp
                route.fulfill(response=resp, headers=headers)
            else:
                route.continue_()

        ctx.route("**/*", with_csp)
        for i, p in enumerate(pages, 1):
            rel = p.relative_to(ROOT).as_posix()
            pg = ctx.new_page()
            try:
                pg.goto(f"{base}/{quote(rel)}", wait_until="domcontentloaded", timeout=20000)
                pg.wait_for_timeout(2600)                      # let lazy loaders (panel, reminders, a11y) run too
                for v in pg.evaluate("window.__csp || []"):
                    k = (v["dir"], v["blocked"] or "(inline/eval)")
                    found[k]["pages"].add(rel); found[k]["sample"] = v["sample"]; found[k]["src"] = v["src"]
            except Exception as e:  # noqa: BLE001
                print(f"  ! {rel}: {str(e)[:80]}")
            pg.close()
            if i % 40 == 0:
                print(f"  … {i}/{len(pages)}", flush=True)
        b.close()

    print(f"\nPolicy under test{' (dropped: ' + ', '.join(a.drop) + ')' if a.drop else ''}; {len(pages)} pages")
    if not found:
        print("No CSP violations.")
        return 0
    print(f"{len(found)} distinct violation(s):")
    for (d, blocked), v in sorted(found.items(), key=lambda kv: -len(kv[1]["pages"])):
        print(f"  [{d}] {blocked}  — {len(v['pages'])} page(s), e.g. {sorted(v['pages'])[0]}  at {v['src']}  {v['sample']!r}")
    if a.json:
        Path(a.json).write_text(json.dumps({f"{d}|{b}": sorted(v["pages"]) for (d, b), v in found.items()}, indent=2))
    return 1


if __name__ == "__main__":
    sys.exit(main())
