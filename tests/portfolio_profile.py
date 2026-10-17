#!/usr/bin/env python3
"""Profile the Portfolio.AI page (Porfolio Analyser/portfolio-analyser-v10.html) with a synthetic portfolio.

    python3 tests/portfolio_profile.py [--eq 80] [--mf 25] [--seconds 20] [--fail-proxies]

Loads the page from a throwaway static server, injects N equity + M mutual-fund holdings (synthetic), calls buildAll(), then reports
build time, long tasks, DOM size, and every EXTERNAL request grouped by host and status. --fail-proxies answers the public CORS
proxies and Yahoo with 502/429, to show whether the page keeps hammering a provider that has said no.
The local backend (server.py on :8766) is used when it is running; otherwise the page runs in its offline mode.
"""
import argparse, collections, json, random, sys, time
from pathlib import Path
from urllib.parse import quote, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from smoke_pages import static_server  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

PAGE = "/Porfolio Analyser/portfolio-analyser-v10.html"
SECTORS = ["Banking", "IT", "FMCG", "Energy", "Auto", "Pharma", "Metals", "Infra", "Finance", "Telecom", "Consumer", "Chemicals"]
PROXY_HOSTS = ("allorigins.win", "corsproxy.io", "thingproxy.freeboard.io", "api.codetabs.com", "finance.yahoo.com", "stooq.com")


def synthetic(n_eq, n_mf, seed=7):
    R = random.Random(seed)
    eq, mf = [], []
    for i in range(n_eq):
        sym = f"SYM{i:03d}" if i % 9 else f"ETF{i:03d}BEES"
        qty = R.randint(5, 400); avg = round(R.uniform(80, 3500), 2); cmp = round(avg * R.uniform(0.7, 1.6), 2)
        inv = round(qty * avg, 2); cur = round(qty * cmp, 2)
        eq.append(dict(sym=sym, isin=f"INE{i:06d}", sector="ETF" if "BEES" in sym else R.choice(SECTORS),
                       type="ETF" if "BEES" in sym else "Stock", qty=qty, avg=avg, cmp=cmp, pnl=round(cur - inv, 2),
                       pnlPct=round((cur - inv) / inv * 100, 2), invested=inv, currVal=cur, source="Equity"))
    for i in range(n_mf):
        qty = round(R.uniform(50, 5000), 3); avg = round(R.uniform(10, 400), 2); cmp = round(avg * R.uniform(0.8, 1.9), 2)
        inv = round(qty * avg, 2); cur = round(qty * cmp, 2)
        mf.append(dict(sym=f"Synthetic Fund {i} - Direct Growth", isin=f"INF{i:06d}", inst="Equity", qty=qty, avg=avg, cmp=cmp,
                       pnl=round(cur - inv, 2), pnlPct=round((cur - inv) / inv * 100, 2), invested=inv, currVal=cur, source="MF"))
    return eq, mf


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--eq", type=int, default=80); ap.add_argument("--mf", type=int, default=25)
    ap.add_argument("--seconds", type=int, default=20); ap.add_argument("--fail-proxies", action="store_true")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    eq, mf = synthetic(a.eq, a.mf)
    out = {}
    with static_server() as base, sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1400, "height": 900}); pg = ctx.new_page()
        ext = collections.Counter(); status = collections.Counter(); errors = []
        flip = {"n": 0}

        def route(r):
            u = r.request.url
            host = urlparse(u).netloc
            if host.startswith(("127.0.0.1", "localhost")) and ":8766" not in host:
                return r.continue_()
            if ":8766" in host:
                ext["backend:8766"] += 1
                return r.continue_()
            ext[host] += 1
            if a.fail_proxies and any(h in host for h in PROXY_HOSTS):
                flip["n"] += 1
                code = 429 if flip["n"] % 2 else 502
                status[(host, code)] += 1
                return r.fulfill(status=code, body="rate limited", headers={"access-control-allow-origin": "*"})
            r.continue_()
        ctx.route("**/*", route)
        pg.on("pageerror", lambda e: errors.append(str(e)[:140]))
        pg.on("console", lambda m: errors.append("console.error: " + m.text[:140]) if m.type == "error" and "Failed to load resource" not in m.text else None)
        pg.add_init_script("""
          window.__long = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__long.push(Math.round(e.duration)))).observe({entryTypes:['longtask']}); } catch(e){}
        """)
        pg.goto(base + quote(PAGE, safe="/")); pg.wait_for_timeout(1500)
        t0 = time.time()
        res = pg.evaluate("""([eq, mf]) => { EQ = eq; MF = mf; const t = performance.now(); buildAll(); const dt = performance.now() - t;
            return {buildAllMs: Math.round(dt), dom: document.getElementsByTagName('*').length, canvases: document.querySelectorAll('canvas').length,
                    charts: Object.keys(CHARTS||{}).length, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : null}; }""", [eq, mf])
        out["build"] = res
        pg.wait_for_timeout(a.seconds * 1000)
        out["after"] = pg.evaluate("""() => ({dom: document.getElementsByTagName('*').length, canvases: document.querySelectorAll('canvas').length,
            charts: Object.keys(CHARTS||{}).length, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : null,
            longTasks: window.__long.length, longTaskMs: window.__long.reduce((s,x)=>s+x,0), maxLongMs: Math.max(0,...window.__long)})""")
        out["requests_by_host"] = dict(ext.most_common())
        out["injected_failures"] = {f"{h} {c}": n for (h, c), n in status.items()}
        out["page_errors"] = errors[:5]
        b.close()
    if a.json:
        print(json.dumps(out, indent=1))
    else:
        for k, v in out.items(): print(f"{k}: {v}")


if __name__ == "__main__":
    main()
