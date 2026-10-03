#!/usr/bin/env python3
"""
Performance budget: JavaScript weight per page, split into
  • critical — scripts fetched BEFORE DOMContentLoaded (these delay interactivity)
  • total    — everything fetched within 3 s of load, including lazy loaders (Arya panel, reminders, a11y …)

  python3 tests/perf_budget.py                 # report all budgeted pages
  python3 tests/perf_budget.py --update        # rewrite tests/perf_budget.json from current numbers (+8% headroom)
  python3 tests/perf_budget.py --only dashboard

Budgets live in tests/perf_budget.json. A page over budget exits 1: either trim it, or consciously raise the budget in
the same commit that adds the weight. Sizes are decoded bytes (what the parser sees), first-party scripts only.
"""
import argparse
import json
import sys
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent))
from smoke_pages import static_server, ROOT  # noqa: E402

BUDGET_FILE = Path(__file__).resolve().parent / "perf_budget.json"
PAGES = ["html/home.html", "html/dashboard.html", "html/tax.html", "html/calculators.html", "html/net-worth.html", "html/budget-forecast.html",
         "html/retirement-planner.html", "html/settings.html", "html/markets.html", "html/track-finances.html",
         "calculators/investment & wealth/sip.html", "calculators/loans, debt & emi/emi.html", "index.html"]

JS = """() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const dcl = nav.domContentLoadedEventEnd;
  const own = performance.getEntriesByType('resource').filter(r => r.name.startsWith(location.origin) && /\\.js(\\?|$)/.test(r.name));
  const kb = (list) => Math.round(list.reduce((s, r) => s + (r.decodedBodySize || 0), 0) / 1024);
  return { critical: kb(own.filter(r => r.responseEnd <= dcl)), total: kb(own), n: own.length,
           top: own.sort((a, b) => b.decodedBodySize - a.decodedBodySize).slice(0, 3).map(r => r.name.split('/').pop().split('?')[0] + ' ' + Math.round(r.decodedBodySize / 1024) + 'K') };
}"""


def measure(pages):
    from playwright.sync_api import sync_playwright
    out = {}
    with static_server() as base, sync_playwright() as pw:
        b = pw.chromium.launch(channel="chromium")
        for rel in pages:
            ctx = b.new_context(viewport={"width": 1280, "height": 800})
            pg = ctx.new_page()
            pg.goto(f"{base}/{quote(rel)}", wait_until="load")
            pg.wait_for_timeout(3000)
            out[rel] = pg.evaluate(JS)
            ctx.close()
        b.close()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--update", action="store_true")
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    pages = [p for p in PAGES if not a.only or any(o in p for o in a.only.split(","))]
    now = measure(pages)
    if a.update:
        budgets = {p: {"critical": int(v["critical"] * 1.08) + 1, "total": int(v["total"] * 1.08) + 1} for p, v in now.items()}
        BUDGET_FILE.write_text(json.dumps(budgets, indent=2) + "\n")
        print(f"wrote {BUDGET_FILE.name} ({len(budgets)} pages, +8% headroom)")
    budgets = json.loads(BUDGET_FILE.read_text()) if BUDGET_FILE.exists() else {}
    bad = 0
    print(f"{'page':44} {'critical KB':>12} {'budget':>7} {'total KB':>9} {'budget':>7}   heaviest")
    for p, v in now.items():
        bd = budgets.get(p, {})
        over = (bd.get("critical") and v["critical"] > bd["critical"]) or (bd.get("total") and v["total"] > bd["total"])
        bad += bool(over)
        print(f"{p[:44]:44} {v['critical']:>12} {bd.get('critical', '-'):>7} {v['total']:>9} {bd.get('total', '-'):>7}   {', '.join(v['top'])}{'   ◀ OVER BUDGET' if over else ''}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
