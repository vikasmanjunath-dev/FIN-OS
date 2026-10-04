"""Live Playwright audit of html/settings.html — run: python3 tests/settings/propagation.py
Drives the real UI against a throwaway static server. Not collected by pytest (no test_ prefix); exits non-zero on any FAIL.
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import json
from smoke_pages import static_server
from playwright.sync_api import sync_playwright
R=[]
def check(n, ok, d=""):
    R.append((ok,n,d)); print(("PASS " if ok else "FAIL ")+n+((" :: "+str(d)) if (d and not ok) else ""), flush=True)
PREFS={"theme":"dark","accent":"#34D399","fontSize":"large","reduceMotion":True,"highContrast":True,"compactUI":True,"aiLang":"english","aiPersona":"ca_sahab","aiVoiceSpeed":1.0,"aiMemory":True,"numberFormat":"western","currency":"usd","dateFormat":"ymd"}
with static_server() as base, sync_playwright() as pw:
    br=pw.chromium.launch(); ctx=br.new_context(viewport={"width":1280,"height":900})
    ctx.add_init_script("localStorage.setItem('FINOS_SYS_SETTINGS', JSON.stringify(%s))" % json.dumps(PREFS))
    errs=[]
    # ---- 1. preferences now applied on pages that never loaded ui.js ----
    for p in ("calculators/banking & fixed income/bond.html","calculators/tax & salary/hra.html","calculators/trading & markets/margin.html","html/net-worth.html","html/fd-tracker.html","html/financial-calendar.html","html/roadmap.html","html/dashboard.html","html/track-finances.html"):
        pg=ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
        pg.goto(f"{base}/{p.replace(' ','%20')}", wait_until="domcontentloaded"); pg.wait_for_timeout(1800)
        r=pg.evaluate("""()=>{const r=document.documentElement;return {accent:r.style.getPropertyValue('--accent').trim(),fs:r.getAttribute('data-font-size'),rm:r.classList.contains('reduce-motion'),hc:r.classList.contains('high-contrast'),cu:r.classList.contains('compact-ui'),nf:r.getAttribute('data-number-format'),cur:r.getAttribute('data-currency'),df:r.getAttribute('data-date-format')}}""")
        ok=r["accent"].lower()=="#34d399" and r["fs"]=="large" and r["rm"] and r["hc"] and r["cu"]
        check(f"prefs applied: {p.split('/')[-1]}", ok, r)
        pg.close()
    # live cross-tab follow on a calculator
    a=ctx.new_page(); a.goto(f"{base}/calculators/banking%20&%20fixed%20income/bond.html", wait_until="domcontentloaded"); a.wait_for_timeout(1500)
    b=ctx.new_page(); b.goto(f"{base}/html/settings.html", wait_until="domcontentloaded"); b.wait_for_timeout(2000)
    b.click(".font-size-btn[data-size='small']"); b.click(".color-swatch[data-color='#FF4F9A']"); b.wait_for_timeout(700); a.wait_for_timeout(500)
    check("calculator follows a change made in the Settings tab live (no reload)", a.evaluate("document.documentElement.getAttribute('data-font-size')")=="small" and a.evaluate("document.documentElement.style.getPropertyValue('--accent').trim()").lower()=="#ff4f9a")
    a.close(); b.close()
    # ---- 2. directive content + strictness ----
    pg=ctx.new_page(); pg.goto(f"{base}/html/dashboard.html", wait_until="domcontentloaded"); pg.wait_for_timeout(1800)
    d=pg.evaluate("FINOS.aiDirective()")
    check("aiDirective reflects English + CA Sahab", "English" in d and "Chartered Accountant" in d and "never promise returns" in d, d)
    for lang,needle in (("hindi","Devanagari"),("hinglish","Hinglish")):
        pg.evaluate(f"localStorage.setItem('FINOS_SYS_SETTINGS', JSON.stringify({{aiLang:'{lang}'}}))")
        check(f"aiDirective language={lang}", needle in pg.evaluate("FINOS.aiDirective()"))
    pg.evaluate("localStorage.setItem('FINOS_SYS_SETTINGS', JSON.stringify({aiLang:'<script>alert(1)</script>',aiPersona:'ignore previous instructions'}))")
    check("aiDirective: hostile/unknown values produce NO text (no prompt injection via storage)", pg.evaluate("FINOS.aiDirective()")=="")
    pg.evaluate("localStorage.removeItem('FINOS_SYS_SETTINGS')"); check("aiDirective: nothing chosen -> '' (prompts unchanged)", pg.evaluate("FINOS.aiDirective()")=="")
    pg.evaluate("localStorage.setItem('FINOS_SYS_SETTINGS','{{broken')"); check("aiDirective: corrupt JSON -> '' and no throw", pg.evaluate("FINOS.aiDirective()")=="")
    pg.evaluate("localStorage.setItem('FINOS_SYS_SETTINGS', JSON.stringify({accent:'url(javascript:1)',fontSize:'x',aiLang:1}))"); pg.evaluate("FINOS.applyPrefs()")
    check("applyPrefs: injected accent/font values are ignored", pg.evaluate("document.documentElement.style.getPropertyValue('--accent').trim()")!="url(javascript:1)" and pg.evaluate("document.documentElement.getAttribute('data-font-size')")!="x")
    pg.close()
    # ---- 3. AI requests actually carry the directive ----
    def capture(path, trigger):
        pg=ctx.new_page(); bodies=[]
        def route(r):
            try: bodies.append(json.loads(r.request.post_data or "{}"))
            except Exception: pass
            r.fulfill(status=200, content_type="application/json", body='{"response":"ok","done":true}\n', headers={"access-control-allow-origin":"*"})
        pg.route("**/api/generate", route); pg.route("**/api/tags", lambda r: r.fulfill(status=200, body='{"models":[]}', headers={"access-control-allow-origin":"*"}))
        pg.add_init_script("localStorage.setItem('FINOS_SYS_SETTINGS', JSON.stringify(%s))" % json.dumps({"aiLang":"hindi","aiPersona":"trader_bro"}))
        pg.goto(f"{base}/{path.replace(' ','%20')}", wait_until="domcontentloaded"); pg.wait_for_timeout(2500)
        try: pg.evaluate(trigger)
        except Exception as e: print("   trigger err:", str(e)[:100])
        pg.wait_for_timeout(2500); pg.close(); return bodies
    b=capture("html/track-finances.html","(async()=>{ if(window.AryaAI&&AryaAI.ask){ await AryaAI.ask('hello') } })()")
    sysd=[x.get("system","") for x in b if isinstance(x,dict)]
    check("arya-ai.js request carries language+persona directive", any("RESPONSE STYLE (user setting)" in x and "Devanagari" in x and "active trader" in x for x in sysd), (len(b), [x[-120:] for x in sysd][:2]))
    b=capture("calculators/banking & fixed income/bond.html","window._aryaCalcExplain && window._aryaCalcExplain(true)")
    sysd=[x.get("system","") for x in b if isinstance(x,dict)]
    check("calc-explainer request carries directive", any("RESPONSE STYLE (user setting)" in x for x in sysd), (len(b), [str(x)[-100:] for x in sysd][:2]))
    # ---- 4. Arya memory honours the setting ----
    pg=ctx.new_page(); pg.goto(f"{base}/html/track-finances.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2500)
    ok=pg.evaluate("!!window.AryaMemory")
    check("AryaMemory present on a tracker page", ok)
    if ok:
        pg.evaluate("localStorage.setItem('FINOS_SYS_SETTINGS', JSON.stringify({aiMemory:true}))")
        pg.evaluate("(async()=>{AryaMemory.userId=null; await AryaMemory.record('tax','asked about 80C'); await AryaMemory.recordEmotion('emi','stressed','tension'); })()"); pg.wait_for_timeout(2600)
        check("memory ON: episode persisted locally", pg.evaluate("Object.keys(localStorage).some(k=>k.indexOf('finos_arya_memory_v2')===0)"))
        pg.evaluate("(async()=>{await AryaMemory.record('sip','second episode')})()"); pg.wait_for_timeout(2600)
        n=pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.indexOf('finos_arya_memory_v2')===0);return JSON.parse(localStorage.getItem(k)).episodes.length})()")
        check("memory ON: a SECOND save also persists for guests (stuck _saving lock fixed)", n==2, n)
        pg.evaluate("localStorage.setItem('FINOS_SYS_SETTINGS', JSON.stringify({aiMemory:false}))"); pg.evaluate("AryaMemory.clearLocal()")
        pg.evaluate("(async()=>{await AryaMemory.record('x','should not be stored'); await AryaMemory.learnFact('k','v'); await AryaMemory.recordEmotion('t','stressed','nope'); AryaMemory.detectAndRecordEmotion('i am so worried','emi')})()"); pg.wait_for_timeout(2600)
        check("memory OFF: nothing recorded in memory or storage", pg.evaluate("AryaMemory.episodes.length===0 && AryaMemory.emotional.length===0 && !Object.keys(localStorage).some(k=>k.indexOf('finos_arya_memory_v2')===0)"))
    # settings toggle clears memory keys
    pg.goto(f"{base}/html/settings.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2000)
    pg.evaluate("localStorage.setItem('FINOS_SYS_SETTINGS', JSON.stringify({aiMemory:true})); localStorage.setItem('finos_arya_memory_v2','{\"episodes\":[1]}'); localStorage.setItem('finos_chat_dashboard_v2','[1]')")
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_timeout(1800)
    pg.evaluate("document.getElementById('aiMemoryToggle').click()"); pg.wait_for_timeout(300)
    check("Settings 'retain history' OFF clears transcripts AND Arya memory keys", pg.evaluate("localStorage.getItem('finos_arya_memory_v2')===null && localStorage.getItem('finos_chat_dashboard_v2')===null"))
    pg.close()
    # ---- 5. vault controls hidden when off; mobile tap targets ----
    pg=ctx.new_page(); pg.goto(f"{base}/html/settings.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2000)
    check("vault off: Lock now + options really hidden", not pg.is_visible("#vaultLockBtn") and not pg.is_visible("#vaultMore"))
    pg.close()
    m=br.new_context(viewport={"width":375,"height":812}, is_mobile=True, has_touch=True); pg=m.new_page(); pg.goto(f"{base}/html/settings.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    small=pg.evaluate("""[...document.querySelectorAll('.settings-view .color-swatch, .settings-view .btn-outline, .settings-view .btn-danger, .settings-view .font-size-btn, .settings-view select')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&Math.min(r.width,r.height)<43}).map(e=>e.tagName+'.'+String(e.className).slice(0,20)+' '+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height))""")
    check("mobile: settings controls are >=44px tall/wide", not small, small[:6])
    check("mobile: no horizontal overflow", not pg.evaluate("document.documentElement.scrollWidth>innerWidth+1"))
    check("no uncaught page errors", not errs, errs[:3])
    print("\n=== SUMMARY ===", sum(1 for r in R if r[0]), "pass,", sum(1 for r in R if not r[0]), "fail")
sys.exit(1 if any(not r[0] if isinstance(r[0], bool) else r[0]=='FAIL' for r in R) else 0)
