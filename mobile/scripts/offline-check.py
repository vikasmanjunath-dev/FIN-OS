from playwright.sync_api import sync_playwright
import sys
routes=["/tracker/budget","/tracker/transactions","/tracker/networth","/tracker/goals","/tracker/subscriptions","/tracker/import","/tracker/health"]
bad=0
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":375,"height":780})
    pg=ctx.new_page(); errs=[]
    pg.on("pageerror",lambda e:errs.append(str(e)[:120]))
    pg.goto("http://localhost:8191/tracker/budget"); pg.wait_for_timeout(2500)
    ctx.set_offline(True)
    for r in routes:
        errs.clear()
        pg.goto("http://localhost:8191"+r) if False else pg.evaluate("r=>{history.pushState({},'',r);dispatchEvent(new PopStateEvent('popstate'))}",r)
        pg.wait_for_timeout(1200)
        t=pg.inner_text("body")
        ok=len(t)>80 and "Unmatched" not in t and not errs
        print(("ok  " if ok else "FAIL"),r,len(t),errs[:2]); bad+=0 if ok else 1
    b.close()
sys.exit(bad)
