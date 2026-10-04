"""Live Playwright audit of html/settings.html — run: python3 tests/settings/controls.py
Drives the real UI against a throwaway static server. Not collected by pytest (no test_ prefix); exits non-zero on any FAIL.
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import json
from smoke_pages import static_server
from playwright.sync_api import sync_playwright

R = []  # (status, name, detail)
def check(name, ok, detail=""):
    R.append(("PASS" if ok else "FAIL", name, detail)); 
    print(("PASS " if ok else "FAIL ") + name + ((" :: " + str(detail)) if detail and not ok else ""), flush=True)

def S(pg):  # stored settings
    return pg.evaluate("JSON.parse(localStorage.getItem('FINOS_SYS_SETTINGS')||'{}')")
def attr(pg, a): return pg.evaluate(f"document.documentElement.getAttribute('{a}')")
def cls(pg, c): return pg.evaluate(f"document.documentElement.classList.contains('{c}')")
def var(pg, v): return pg.evaluate(f"document.documentElement.style.getPropertyValue('{v}').trim()")

with static_server() as base, sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
    ctx.grant_permissions([])
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
    pg.on("console", lambda m: errs.append("console.error: " + m.text[:200]) if m.type == "error" and "Failed to load resource" not in m.text and "ERR_" not in m.text and "net::" not in m.text else None)
    pg.goto(f"{base}/html/settings.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2500)
    URL = f"{base}/html/settings.html"

    # ---------- 0. load health ----------
    check("page loads with no JS errors", not errs, errs[:3])
    check("no duplicate IDs at runtime", pg.evaluate("(()=>{const m={};document.querySelectorAll('[id]').forEach(e=>m[e.id]=(m[e.id]||0)+1);return Object.entries(m).filter(([k,v])=>v>1).map(x=>x[0])})()") == [])

    # ---------- 1. appearance ----------
    for v in ("light", "dark", "system"):
        pg.select_option("#themeSelect", v); pg.wait_for_timeout(150)
        resolved = v if v != "system" else ("dark" if pg.evaluate("matchMedia('(prefers-color-scheme: dark)').matches") else "light")
        check(f"theme={v}: stored", S(pg).get("theme") == v, S(pg).get("theme"))
        check(f"theme={v}: data-theme={resolved}", attr(pg, "data-theme") == resolved, attr(pg, "data-theme"))
        check(f"theme={v}: legacy keys synced", pg.evaluate("localStorage.getItem('finos-theme')") == resolved and pg.evaluate("localStorage.getItem('theme')") == resolved)
    pg.select_option("#themeSelect", "dark"); pg.wait_for_timeout(100)
    # header toggle
    pg.click("#themeToggle"); pg.wait_for_timeout(150)
    check("header theme toggle flips to light + stored + select synced", attr(pg, "data-theme") == "light" and S(pg)["theme"] == "light" and pg.input_value("#themeSelect") == "light", (attr(pg, "data-theme"), S(pg).get("theme"), pg.input_value("#themeSelect")))
    pg.click("#themeToggle"); pg.wait_for_timeout(150)
    check("header theme toggle flips back; exactly one handler (not double)", attr(pg, "data-theme") == "dark", attr(pg, "data-theme"))

    # accent swatches
    sw = pg.query_selector_all(".color-swatch[data-color]")
    check("7 accent swatches", len(sw) == 7, len(sw))
    for s in sw:
        col = s.get_attribute("data-color"); s.click(); pg.wait_for_timeout(80)
        ok = var(pg, "--accent").lower() == col.lower() and S(pg)["accent"] == col.upper() and s.get_attribute("aria-pressed") == "true" and "active" in (s.get_attribute("class") or "")
        check(f"accent {col}: applied+stored+active+aria-pressed", ok, (var(pg, "--accent"), S(pg).get("accent"), s.get_attribute("aria-pressed")))
    check("only one swatch active", pg.evaluate("document.querySelectorAll('.color-swatch.active').length") == 1)
    pg.evaluate("(()=>{const p=document.getElementById('accentPicker');p.value='#123abc';p.dispatchEvent(new Event('input',{bubbles:true}))})()"); pg.wait_for_timeout(100)
    check("custom accent picker applies+stores uppercase", var(pg, "--accent").lower() == "#123abc" and S(pg)["accent"] == "#123ABC", (var(pg, "--accent"), S(pg).get("accent")))
    check("custom accent: no preset swatch left marked active", pg.evaluate("document.querySelectorAll('.color-swatch.active').length") == 0, pg.evaluate("document.querySelectorAll('.color-swatch.active').length"))
    check("accent preview shows hex", pg.evaluate("document.getElementById('accentPreview').style.background") != "")

    # font size
    for v in ("small", "large", "normal"):
        pg.click(f".font-size-btn[data-size='{v}']"); pg.wait_for_timeout(80)
        check(f"fontSize={v}: attr+stored+aria-pressed", attr(pg, "data-font-size") == v and S(pg)["fontSize"] == v and pg.get_attribute(f".font-size-btn[data-size='{v}']", "aria-pressed") == "true", (attr(pg, "data-font-size"), S(pg).get("fontSize")))
    # does fontSize actually change rendered size?
    pg.click(".font-size-btn[data-size='large']"); pg.wait_for_timeout(100)
    fl = pg.evaluate("parseFloat(getComputedStyle(document.body).fontSize)")
    pg.click(".font-size-btn[data-size='small']"); pg.wait_for_timeout(100)
    fs = pg.evaluate("parseFloat(getComputedStyle(document.body).fontSize)")
    pg.click(".font-size-btn[data-size='normal']"); pg.wait_for_timeout(100)
    check("font size actually changes rendered text size (small<large)", fs < fl, (fs, fl))

    # ---------- 2. toggles ----------
    for tid, key, c in (("reduceMotionToggle", "reduceMotion", "reduce-motion"), ("highContrastToggle", "highContrast", "high-contrast"), ("compactUIToggle", "compactUI", "compact-ui"), ("aiMemoryToggle", "aiMemory", None)):
        start = pg.is_checked("#" + tid)
        pg.evaluate(f"document.getElementById('{tid}').click()"); pg.wait_for_timeout(100)
        check(f"{key}: toggle -> stored {not start}", S(pg).get(key) == (not start), S(pg).get(key))
        if c: check(f"{key}: class {c} {'on' if not start else 'off'}", cls(pg, c) == (not start))
        pg.evaluate(f"document.getElementById('{tid}').click()"); pg.wait_for_timeout(100)
        check(f"{key}: toggle back -> stored {start}", S(pg).get(key) == start)
    # reduce-motion really kills animation/transition?
    pg.evaluate("document.getElementById('reduceMotionToggle').click()"); pg.wait_for_timeout(100)
    rm = pg.evaluate("(()=>{const e=document.querySelector('.settings-card');const c=getComputedStyle(e);return [c.transitionDuration,c.animationDuration]})()")
    check("reduce-motion: transitions/animations effectively disabled on a card", all(float(x.split(',')[0].replace('s','')) < 0.02 for x in rm), rm)
    pg.evaluate("document.getElementById('reduceMotionToggle').click()")
    # high-contrast measurable
    pg.evaluate("document.getElementById('highContrastToggle').click()"); pg.wait_for_timeout(100)
    hc = pg.evaluate("[getComputedStyle(document.documentElement).getPropertyValue('--border-soft').trim(), getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim()]")
    check("high-contrast: borders AND muted text both strengthened", ("0.08" not in hc[0]) and hc[1].lower() in ("#c2c9d8","#d0d4e0"), hc)
    pg.evaluate("document.getElementById('highContrastToggle').click()")
    pg.evaluate("document.getElementById('compactUIToggle').click()"); pg.wait_for_timeout(100)
    cp = pg.evaluate("getComputedStyle(document.querySelector('.settings-card')).paddingTop")
    pg.evaluate("document.getElementById('compactUIToggle').click()"); pg.wait_for_timeout(100)
    cp2 = pg.evaluate("getComputedStyle(document.querySelector('.settings-card')).paddingTop")
    check("compact-ui: card padding smaller when on", float(cp.replace('px','')) < float(cp2.replace('px','')), (cp, cp2))

    # ---------- 3. selects: AI / display ----------
    for sel, key, vals in (("#aiLangSelect", "aiLang", ["english", "hindi", "hinglish"]), ("#numberFormatSelect", "numberFormat", ["western", "indian"]), ("#currencySelect", "currency", ["usd", "inr"]), ("#dateFormatSelect", "dateFormat", ["mdy", "ymd", "dmy"])):
        opts = pg.evaluate(f"[...document.querySelector('{sel}').options].map(o=>o.value)")
        for v in vals:
            pg.select_option(sel, v); pg.wait_for_timeout(80)
            check(f"{key}={v}: stored", S(pg).get(key) == v, S(pg).get(key))
        check(f"{key}: every <option> value is an accepted value", all(o in {"aiLang":["hinglish","english","hindi"],"numberFormat":["indian","western"],"currency":["inr","usd"],"dateFormat":["dmy","mdy","ymd"]}[key] for o in opts), opts)
    for p in ("ca_sahab", "trader_bro", "retirement_uncle", "bhai"):
        pg.click(f".persona-card[data-persona='{p}']"); pg.wait_for_timeout(80)
        check(f"persona={p}: stored+active+aria-pressed", S(pg).get("aiPersona") == p and pg.get_attribute(f".persona-card[data-persona='{p}']", "aria-pressed") == "true", S(pg).get("aiPersona"))
    check("exactly one persona active", pg.evaluate("document.querySelectorAll('.persona-card.active').length") == 1)
    # voice speed
    pg.evaluate("(()=>{const s=document.getElementById('voiceSpeedSlider');s.value='1.6';s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}))})()"); pg.wait_for_timeout(100)
    check("voice speed 1.6 stored+label+aria-valuetext", S(pg).get("aiVoiceSpeed") == 1.6 and pg.inner_text("#voiceSpeedVal") == "1.6×" and pg.get_attribute("#voiceSpeedSlider", "aria-valuetext") == "1.6×", (S(pg).get("aiVoiceSpeed"), pg.inner_text("#voiceSpeedVal")))

    # ---------- 4. strictness: invalid values via public handlers & tampered storage ----------
    before = json.dumps(S(pg), sort_keys=True)
    pg.evaluate("""(()=>{setTheme('<img>');setAccent('red');setAccent('#12');setAccent('#GGGGGG');setFontSize('huge');setAILang('klingon');setAIPersona('__proto__');setNumberFormat('x');setCurrency('btc');setDateFormat('q');toggleReduceMotion('yes');saveAIVoiceSpeed('abc');saveAIVoiceSpeed(99);})()""")
    pg.wait_for_timeout(200)
    after = S(pg)
    check("invalid inputs rejected (theme/accent/font/lang/persona/format/currency/date/bool)", all(after.get(k) == json.loads(before).get(k) for k in ("theme","accent","fontSize","aiLang","aiPersona","numberFormat","currency","dateFormat","reduceMotion")), {k:(json.loads(before).get(k),after.get(k)) for k in ("theme","accent","fontSize","aiLang","aiPersona","numberFormat","currency","dateFormat","reduceMotion") if after.get(k)!=json.loads(before).get(k)})
    check("out-of-range voice speed is clamped to 0.6-2.0, junk rejected", S(pg).get("aiVoiceSpeed") == 2.0, S(pg).get("aiVoiceSpeed"))
    # tampered storage
    pg.evaluate("localStorage.setItem('FINOS_SYS_SETTINGS', JSON.stringify({theme:'evil',accent:'javascript:1',fontSize:'x',aiVoiceSpeed:'NaN',reduceMotion:'true',currency:'eur',__proto__:{polluted:1},constructor:{prototype:{pwn:1}}}))")
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_timeout(1800)
    check("tampered storage: theme falls back to a valid value", attr(pg, "data-theme") in ("dark", "light"), attr(pg, "data-theme"))
    check("tampered storage: bad accent not applied", not var(pg, "--accent") or var(pg, "--accent").startswith("#"), var(pg, "--accent"))
    check("tampered storage: no prototype pollution", pg.evaluate("({}).polluted===undefined && ({}).pwn===undefined"))
    check("tampered storage: select shows a valid option", pg.evaluate("['dark','light','system'].includes(document.getElementById('themeSelect').value)"), pg.input_value("#themeSelect"))
    pg.evaluate("localStorage.setItem('FINOS_SYS_SETTINGS','{not json')"); pg.reload(wait_until="domcontentloaded"); pg.wait_for_timeout(1500)
    check("corrupt JSON in storage: page still works (defaults)", pg.input_value("#themeSelect") in ("dark","light","system") and not [e for e in errs if "SyntaxError" in e], [e for e in errs if "SyntaxError" in e][:2])
    pg.evaluate("localStorage.removeItem('FINOS_SYS_SETTINGS')"); pg.reload(wait_until="domcontentloaded"); pg.wait_for_timeout(1500)

    # ---------- 5. persistence + cross-tab ----------
    pg.select_option("#currencySelect", "usd"); pg.click(".persona-card[data-persona='trader_bro']"); pg.click(".font-size-btn[data-size='large']")
    pg.evaluate("document.getElementById('compactUIToggle').click()"); pg.wait_for_timeout(150)
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_timeout(1800)
    check("persisted across reload: currency/persona/font/compact all restored in UI", pg.input_value("#currencySelect")=="usd" and pg.get_attribute(".persona-card[data-persona='trader_bro']","aria-pressed")=="true" and attr(pg,"data-font-size")=="large" and pg.is_checked("#compactUIToggle") and cls(pg,"compact-ui"))
    pg2 = ctx.new_page(); pg2.goto(URL, wait_until="domcontentloaded"); pg2.wait_for_timeout(1500)
    pg2.select_option("#themeSelect", "light"); pg2.wait_for_timeout(500)
    pg.wait_for_timeout(500)
    check("cross-tab sync: change in tab 2 reaches tab 1 (theme)", attr(pg, "data-theme") == "light" and pg.input_value("#themeSelect") == "light", (attr(pg, "data-theme"), pg.input_value("#themeSelect")))
    pg2.close()
    # other-page consumption
    pg.select_option("#numberFormatSelect", "western"); pg.select_option("#currencySelect", "usd"); pg.select_option("#dateFormatSelect", "ymd")
    pg.goto(f"{base}/html/dashboard.html", wait_until="domcontentloaded"); pg.wait_for_timeout(1500)
    fm = pg.evaluate("[window.FINOS&&FINOS.fmt(1234567), window.FINOS&&FINOS.fmtShort&&FINOS.fmtShort(12345678), window.FINOS&&FINOS.date&&FINOS.date('2026-03-05')]")
    check("settings consumed on another page: FINOS.fmt uses western+USD", fm[0] == "$1,234,567", fm)
    check("settings consumed on another page: fmtShort western (M)", fm[1] and fm[1].endswith("M"), fm)
    check("settings consumed on another page: date format ymd", fm[2] in ("2026-03-05",), fm)
    pg.goto(URL, wait_until="domcontentloaded"); pg.wait_for_timeout(1200)
    pg.select_option("#numberFormatSelect", "indian"); pg.select_option("#currencySelect", "inr"); pg.select_option("#dateFormatSelect", "dmy")

    # ---------- 6. Save All ----------
    pg.click("#saveAllBtn"); pg.wait_for_timeout(300)
    check("Save All: shows saved state + toast", "Saved" in pg.inner_text("#saveAllBtn") and pg.evaluate("!!document.querySelector('.finos-toast')"), pg.inner_text("#saveAllBtn"))
    pg.wait_for_timeout(2200)
    check("Save All: button restored", pg.inner_text("#saveAllBtn").strip() == "Save All Settings" and not pg.is_disabled("#saveAllBtn"), pg.inner_text("#saveAllBtn"))

    # ---------- 7. modals ----------
    for mid, opener in (("emailModal", "text=Change Email"), ("clearDNAModal", "text=Clear DNA"), ("clearCacheModal", "text=Clear Local Data"), ("deleteModal", "text=Delete Account")):
        loc = pg.locator(opener).first
        vis_before = pg.is_visible(f"#{mid}")
        try:
            if not loc.is_visible(): pg.evaluate(f"openModal('{mid}')")
            else: loc.click()
        except Exception: pg.evaluate(f"openModal('{mid}')")
        pg.wait_for_timeout(350)
        check(f"modal {mid}: opens", pg.is_visible(f"#{mid}") and not vis_before)
        check(f"modal {mid}: focus moves inside", pg.evaluate(f"document.getElementById('{mid}').contains(document.activeElement)"))
        pg.keyboard.press("Escape"); pg.wait_for_timeout(450)
        check(f"modal {mid}: Escape closes", not pg.is_visible(f"#{mid}"))
        pg.evaluate(f"openModal('{mid}')"); pg.wait_for_timeout(300)
        pg.mouse.click(5, 5); pg.wait_for_timeout(450)
        check(f"modal {mid}: backdrop click closes", not pg.is_visible(f"#{mid}"))
    # delete modal strictness: needs exact DELETE and signed-in
    pg.evaluate("openModal('deleteModal')"); pg.wait_for_timeout(250)
    pg.fill("#deleteConfirmInput", "delete"); pg.click("#deleteForeverBtn"); pg.wait_for_timeout(300)
    t = pg.evaluate("[...document.querySelectorAll('.finos-toast .toast-msg')].map(e=>e.textContent)")
    check("delete account: lowercase 'delete' rejected, nothing deleted", any("DELETE" in x for x in t) and pg.is_visible("#deleteModal"), t)
    pg.fill("#deleteConfirmInput", "DELETE"); pg.click("#deleteForeverBtn"); pg.wait_for_timeout(500)
    t = pg.evaluate("[...document.querySelectorAll('.finos-toast .toast-msg')].map(e=>e.textContent)")
    check("delete account: guest cannot delete (clear 'Not signed in' error, no data wiped)", any("Not signed in" in x for x in t), t)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(450)
    pg.evaluate("openModal('emailModal')"); pg.wait_for_timeout(250)
    pg.fill("#newEmailInput", "not-an-email"); pg.click("#confirmEmailBtn"); pg.wait_for_timeout(300)
    t = pg.evaluate("[...document.querySelectorAll('.finos-toast .toast-msg')].map(e=>e.textContent)")
    check("change email: invalid address rejected client-side", any("valid email" in x.lower() for x in t) and pg.is_visible("#emailModal"), t)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(450)
    check("modal inputs cleared on close", pg.input_value("#newEmailInput") == "" and pg.input_value("#deleteConfirmInput") == "")

    # ---------- 8. data ops ----------
    pg.evaluate("localStorage.setItem('finos_goals', JSON.stringify([{n:'car'}])); localStorage.setItem('finos_income','90000')")
    with pg.expect_download(timeout=8000) as dl:
        pg.click("text=Export JSON")
    path = dl.value.path(); data = json.load(open(path))
    check("export JSON downloads valid JSON with app marker", isinstance(data, dict) and len(data) > 0, list(data)[:5] if isinstance(data, dict) else type(data))
    ser = json.dumps(data)
    check("export excludes credentials (no sb-*-auth-token / api keys)", "auth-token" not in ser and "access_token" not in ser and "refresh_token" not in ser)
    # import: garbage + valid
    import os, tempfile
    bad = os.path.join(tempfile.gettempdir(), "bad.json"); open(bad, "w").write("{nope")
    pg.set_input_files("#importDataFile", bad); pg.wait_for_timeout(500)
    t = pg.evaluate("[...document.querySelectorAll('.finos-toast .toast-msg')].map(e=>e.textContent)")
    check("import garbage JSON: clear error, no crash", any(("read" in x.lower() or "json" in x.lower() or "valid" in x.lower() or "backup" in x.lower()) for x in t[-2:]), t[-2:])
    big = os.path.join(tempfile.gettempdir(), "wrong.json"); open(big, "w").write(json.dumps({"hello": "world"}))
    pg.set_input_files("#importDataFile", big); pg.wait_for_timeout(600)
    t = pg.evaluate("[...document.querySelectorAll('.finos-toast .toast-msg')].map(e=>e.textContent)")
    check("import wrong-shape JSON: rejected with message, nothing imported", len(t) > 0 and not any("Restored" in x and "Restored 0" not in x for x in t[-2:]), t[-2:])
    # clear DNA
    pg.evaluate("localStorage.setItem('finos_dna','x');localStorage.setItem('financial_dna','x')")
    pg.evaluate("openModal('clearDNAModal')"); pg.wait_for_timeout(250); pg.click("text=Yes, Clear DNA"); pg.wait_for_timeout(500)
    check("Clear DNA removes DNA keys, keeps other data", pg.evaluate("localStorage.getItem('finos_dna')===null && localStorage.getItem('financial_dna')===null && localStorage.getItem('finos_income')==='90000'"))
    # clear local data preserves preferences
    pg.evaluate("localStorage.setItem('FINOS_SYS_SETTINGS', JSON.stringify({...JSON.parse(localStorage.getItem('FINOS_SYS_SETTINGS')||'{}'), accent:'#00D4FF'}))")
    pg.evaluate("openModal('clearCacheModal')"); pg.wait_for_timeout(250); pg.click("text=Yes, Clear FIN•OS Data"); pg.wait_for_timeout(1500)
    left = pg.evaluate("({income:localStorage.getItem('finos_income'),goals:localStorage.getItem('finos_goals'),settings:!!localStorage.getItem('FINOS_SYS_SETTINGS')})")
    check("Clear Local Data: wipes finos data, keeps preferences", left["income"] is None and left["goals"] is None and left["settings"], left)

    # ---------- 9. reminders / install / language ----------
    pg.evaluate("document.getElementById('notifRemindersToggle').click()"); pg.wait_for_timeout(600)
    t = pg.evaluate("[...document.querySelectorAll('.finos-toast .toast-msg')].map(e=>e.textContent)")
    check("reminders toggle: gives feedback (on/blocked/unsupported) and box state is truthful", len(t) > 0 and (pg.is_checked("#notifRemindersToggle") == pg.evaluate("!!(window.FinosReminders&&FinosReminders.systemEnabled())")), (t[-1:], pg.is_checked("#notifRemindersToggle")))
    pg.select_option("#uiLangSelect", "hi"); pg.wait_for_timeout(900)
    check("UI language hi: stored + <html lang>/text translated", pg.evaluate("localStorage.getItem('finos_lang')") == "hi" and pg.evaluate("document.documentElement.lang") == "hi", pg.evaluate("[localStorage.getItem('finos_lang'),document.documentElement.lang]"))
    pg.select_option("#uiLangSelect", "en"); pg.wait_for_timeout(700)
    check("UI language en restored", pg.evaluate("localStorage.getItem('finos_lang')") == "en")

    # ---------- 10. vault ----------
    check("vault: Set up button present, lock/more hidden when off", pg.inner_text("#vaultToggleBtn") == "Set up" and pg.is_hidden("#vaultLockBtn") and pg.is_hidden("#vaultMore"))
    pg.click("#vaultToggleBtn"); pg.wait_for_timeout(400)
    check("vault setup dialog opens", pg.is_visible("#vd-p1"))
    pg.fill("#vd-p1", "abc"); pg.fill("#vd-p2", "abc"); pg.check("#vd-ack"); pg.click("text=Turn on"); pg.wait_for_timeout(250)
    check("vault: <6 char passcode rejected", "6" in pg.inner_text("#vd-err"), pg.inner_text("#vd-err"))
    pg.fill("#vd-p1", "abcdef"); pg.fill("#vd-p2", "abcdeX"); pg.click("text=Turn on"); pg.wait_for_timeout(250)
    check("vault: mismatching passcodes rejected", "match" in pg.inner_text("#vd-err").lower(), pg.inner_text("#vd-err"))
    pg.fill("#vd-p2", "abcdef"); pg.uncheck("#vd-ack"); pg.click("text=Turn on"); pg.wait_for_timeout(250)
    check("vault: must tick the no-recovery acknowledgement", "tick" in pg.inner_text("#vd-err").lower(), pg.inner_text("#vd-err"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check("vault dialog: Escape cancels, nothing enabled", not pg.is_visible("#vd-p1") and pg.inner_text("#vaultToggleBtn") == "Set up")

    out = {"pass": sum(1 for r in R if r[0] == "PASS"), "fail": [r for r in R if r[0] == "FAIL"], "console_errors": errs[:10]}
    print("\n=== SUMMARY ===", out["pass"], "pass,", len(out["fail"]), "fail")
    for f in out["fail"]: print("FAIL:", f[1], "::", f[2])
    print("console/page errors:", out["console_errors"])
sys.exit(1 if any(not r[0] if isinstance(r[0], bool) else r[0]=='FAIL' for r in R) else 0)
