"""Live Playwright audit of html/settings.html — run: python3 tests/settings/data_safety.py
Drives the real UI against a throwaway static server. Not collected by pytest (no test_ prefix); exits non-zero on any FAIL.
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import json, os, tempfile
from smoke_pages import static_server
from playwright.sync_api import sync_playwright
R=[]
def check(n, ok, d=""):
    R.append((ok,n,d)); print(("PASS " if ok else "FAIL ")+n+((" :: "+str(d)) if (d and not ok) else ""), flush=True)
tmp=tempfile.gettempdir()
with static_server() as base, sync_playwright() as pw:
    br=pw.chromium.launch(); ctx=br.new_context(viewport={"width":1280,"height":900}, accept_downloads=True)
    errs=[]
    pg=ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
    URL=f"{base}/html/settings.html"; pg.goto(URL, wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    toasts=lambda: pg.evaluate("[...document.querySelectorAll('.finos-toast .toast-msg')].map(e=>e.textContent)")

    # ---- Brain sync round-trip ----
    pg.evaluate("""localStorage.setItem('finos_goals',JSON.stringify([{n:'car',amt:500000}]));localStorage.setItem('finos_income','90000');localStorage.setItem('finos_city','Pune');localStorage.setItem('finos_stage','Rookie')""")
    with pg.expect_download(timeout=8000) as dl: pg.click("text=Export Brain")
    brain=json.load(open(dl.value.path()))
    check("brain export: valid envelope + keys", brain.get("app")=="FIN-OS" and brain.get("version")==1 and brain["data"].get("finos_income")==90000 and brain.get("keyCount")==len(brain["data"]), {k:brain.get(k) for k in ("app","version","keyCount")})
    check("brain export: strings stay strings (finos_city)", brain["data"].get("finos_city")=="Pune", brain["data"].get("finos_city"))
    # wipe, then import
    pg.evaluate("['finos_goals','finos_income','finos_city','finos_stage'].forEach(k=>localStorage.removeItem(k))")
    bp=os.path.join(tmp,"brain_ok.json"); json.dump(brain,open(bp,"w"))
    pg.set_input_files("#brain-import-file", bp); pg.wait_for_timeout(2600)
    pg.wait_for_load_state("domcontentloaded")
    got=pg.evaluate("({g:localStorage.getItem('finos_goals'),i:localStorage.getItem('finos_income'),c:localStorage.getItem('finos_city')})")
    check("brain import round-trip restores values faithfully", got["g"] and json.loads(got["g"])[0]["n"]=="car" and got["i"]=="90000" and got["c"]=="Pune", got)
    pg.goto(URL, wait_until="domcontentloaded"); pg.wait_for_timeout(1800)
    # hostile brain files
    for label, payload in (("unsupported key", {"app":"FIN-OS","version":1,"data":{"sb-evil-auth-token":"x"}}),
                           ("wrong app", {"app":"Other","version":1,"data":{}}),
                           ("wrong version", {"app":"FIN-OS","version":2,"data":{}}),
                           ("array data", {"app":"FIN-OS","version":1,"data":[1,2]}),
                           ("__proto__ key", json.loads('{"app":"FIN-OS","version":1,"data":{"__proto__":{"x":1}}}'))):
        p=os.path.join(tmp,"brain_bad.json"); open(p,"w").write(json.dumps(payload) if label!="__proto__ key" else '{"app":"FIN-OS","version":1,"data":{"__proto__":{"x":1}}}')
        pg.set_input_files("#brain-import-file", p); pg.wait_for_timeout(700)
        st=pg.inner_text("#brain-sync-status")
        check(f"brain import rejects: {label}", st.startswith("✗"), st)
    check("brain import: nothing written from hostile files", pg.evaluate("localStorage.getItem('sb-evil-auth-token')")is None and pg.evaluate("({}).x===undefined"))
    big=os.path.join(tmp,"big.json"); open(big,"w").write(json.dumps({"app":"FIN-OS","version":1,"data":{"finos_goals":"x"*(11*1024*1024)}}))
    pg.set_input_files("#brain-import-file", big); pg.wait_for_timeout(1500)
    check("brain import rejects >10MB", pg.inner_text("#brain-sync-status").startswith("✗"), pg.inner_text("#brain-sync-status"))
    tiles=pg.evaluate("document.querySelectorAll('#brain-contents > div').length")
    check("brain inventory tiles render (12)", tiles==12, tiles)

    # ---- Full export -> clear -> import round-trip ----
    pg.evaluate("localStorage.setItem('finos_income','123456');localStorage.setItem('finos_goals',JSON.stringify([{n:'house'}]))")
    with pg.expect_download(timeout=8000) as dl: pg.click("text=Export JSON")
    full=json.load(open(dl.value.path())); fp=os.path.join(tmp,"full.json"); json.dump(full,open(fp,"w"))
    pg.evaluate("openModal('clearCacheModal')"); pg.wait_for_timeout(250); pg.click("text=Yes, Clear FIN•OS Data"); pg.wait_for_timeout(1500)
    check("full: data cleared", pg.evaluate("localStorage.getItem('finos_income')") is None)
    pg.set_input_files("#importDataFile", fp); pg.wait_for_timeout(2500); pg.wait_for_load_state("domcontentloaded"); pg.wait_for_timeout(800)
    check("full export -> clear -> import restores data", pg.evaluate("localStorage.getItem('finos_income')")=="123456", pg.evaluate("localStorage.getItem('finos_income')"))
    # import merges, never overwrites existing
    pg.evaluate("localStorage.setItem('finos_income','777')"); pg.set_input_files("#importDataFile", fp); pg.wait_for_timeout(2500); pg.wait_for_load_state("domcontentloaded")
    check("import is non-destructive: existing value NOT overwritten", pg.evaluate("localStorage.getItem('finos_income')")=="777", pg.evaluate("localStorage.getItem('finos_income')"))

    # ---- Vault end to end ----
    pg.goto(URL, wait_until="domcontentloaded"); pg.wait_for_timeout(1800)
    pg.evaluate("localStorage.setItem('finos_income','555000')")
    pg.click("#vaultToggleBtn"); pg.wait_for_timeout(300)
    pg.fill("#vd-p1","correct-horse"); pg.fill("#vd-p2","correct-horse"); pg.check("#vd-ack"); pg.click("text=Turn on"); pg.wait_for_timeout(1500)
    check("vault: enabled -> button says Turn off; Lock now + options visible", pg.inner_text("#vaultToggleBtn")=="Turn off" and pg.is_visible("#vaultLockBtn") and pg.is_visible("#vaultMore"))
    # change passcode wrong old
    pg.click("text=Change passcode"); pg.wait_for_timeout(300)
    pg.fill("#vd-old","wrong-one"); pg.fill("#vd-p1","brand-new-pass"); pg.fill("#vd-p2","brand-new-pass"); pg.click("div[role=dialog] button[type=submit]"); pg.wait_for_timeout(1200)
    check("vault: change passcode with wrong current passcode is refused", any("wrong" in t.lower() for t in toasts()), toasts()[-2:])
    # auto-lock select persists
    pg.select_option("#vaultIdle", pg.evaluate("[...document.getElementById('vaultIdle').options].map(o=>o.value).slice(-1)[0]")); pg.wait_for_timeout(200)
    check("vault: idle setting persisted", pg.evaluate("FinosVault.idleMinutes()")==int(pg.input_value("#vaultIdle")), (pg.evaluate("FinosVault.idleMinutes()"), pg.input_value("#vaultIdle")))
    # lock now -> reload -> locked: data not in plaintext
    pg.click("#vaultLockBtn"); pg.wait_for_timeout(3500)
    plain=pg.evaluate("localStorage.getItem('finos_income')")
    check("vault locked: plaintext finos_income wiped from storage", plain is None, plain)
    check("vault locked: unlock prompt shown (boot overlay/dialog)", pg.evaluate("!!document.querySelector('[role=dialog], #finos-vault-lock, .finos-vault-overlay, input[type=password]')"))
    # wrong then right passcode
    pwin=pg.query_selector("input[type=password]")
    if pwin:
        pwin.fill("nope-nope"); pg.keyboard.press("Enter"); pg.wait_for_timeout(1500)
        check("vault locked: wrong passcode does not unlock", pg.evaluate("localStorage.getItem('finos_income')") is None)
        pwin=pg.query_selector("input[type=password]"); pwin.fill("correct-horse"); pg.keyboard.press("Enter"); pg.wait_for_timeout(4000)
        check("vault: right passcode restores data byte-for-byte", pg.evaluate("localStorage.getItem('finos_income')")=="555000", pg.evaluate("localStorage.getItem('finos_income')"))
    else:
        check("vault locked: password field found", False)
    print("\n=== SUMMARY ===", sum(1 for r in R if r[0]), "pass,", sum(1 for r in R if not r[0]), "fail; page errors:", errs[:3])
sys.exit(1 if any(not r[0] if isinstance(r[0], bool) else r[0]=='FAIL' for r in R) else 0)
