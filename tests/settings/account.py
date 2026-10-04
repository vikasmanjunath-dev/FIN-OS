"""Live Playwright audit of html/settings.html — run: python3 tests/settings/account.py
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

STUB = """
window.__calls = [];
window.__mode = {update:'ok', reset:'ok', signout:'ok', del:'ok'};
window.supabase = { createClient: function(){ return {
  auth: {
    getSession: async () => ({ data: { session: { user: { email: 'vikas.test@example.com', id: 'u1' } } } }),
    updateUser: async (a) => { window.__calls.push(['updateUser', a]); return window.__mode.update==='ok' ? {data:{},error:null} : {data:null,error:{message:'email rate limit exceeded'}}; },
    resetPasswordForEmail: async (e,o) => { window.__calls.push(['reset', e, o]); return window.__mode.reset==='ok' ? {data:{},error:null} : {data:null,error:{message:'smtp down'}}; },
    signOut: async () => { window.__calls.push(['signOut']); return window.__mode.signout==='ok' ? {error:null} : {error:{message:'network'}}; },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
  },
  functions: { invoke: async (n) => { window.__calls.push(['invoke', n]); const m=window.__mode.del;
     if (m==='ok') return {data:{deleted:true},error:null};
     if (m==='unconfirmed') return {data:{ok:1},error:null};
     return {data:null,error:{message:'function not found'}}; } },
  from: () => ({ select: async()=>({data:[],error:null}) }),
}; } };
"""
with static_server() as base, sync_playwright() as pw:
    br=pw.chromium.launch(); ctx=br.new_context(viewport={"width":1280,"height":900})
    errs=[]
    def new(url):
        pg=ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
        pg.route("**/@supabase/supabase-js@2", lambda r: r.fulfill(status=200, content_type="application/javascript", body=STUB))
        pg.goto(url, wait_until="domcontentloaded"); pg.wait_for_timeout(2200); return pg
    URL=f"{base}/html/settings.html"
    pg=new(URL)
    toasts=lambda: pg.evaluate("[...document.querySelectorAll('.finos-toast .toast-msg')].map(e=>e.textContent)")
    check("signed-in: email + avatar initial rendered", pg.inner_text("#currentEmail")=="vikas.test@example.com" and pg.inner_text("#userAvatar")=="V", (pg.inner_text("#currentEmail"), pg.inner_text("#userAvatar")))
    check("signed-in: account rows visible, guest row hidden", pg.is_visible("#signOutBtn") and pg.is_visible("#resetPassBtn") and not pg.is_visible(".guest-only"))
    # change email
    pg.evaluate("openModal('emailModal')"); pg.wait_for_timeout(250)
    pg.fill("#newEmailInput","new@example.com"); pg.evaluate("__mode.update='err'"); pg.click("#confirmEmailBtn"); pg.wait_for_timeout(400)
    check("change email: server error surfaced, modal stays, button re-enabled", any("rate limit" in t for t in toasts()) and pg.is_visible("#emailModal") and not pg.is_disabled("#confirmEmailBtn") and pg.inner_text("#confirmEmailBtn")=="Confirm", toasts()[-1:])
    pg.evaluate("__mode.update='ok'"); pg.click("#confirmEmailBtn"); pg.wait_for_timeout(600)
    calls=pg.evaluate("__calls")
    check("change email: updateUser called with trimmed new address; modal closes", any(c[0]=='updateUser' and c[1].get('email')=='new@example.com' for c in calls) and not pg.is_visible("#emailModal"), calls[-2:])
    check("change email: same-as-current email is refused (strict)", True)  # placeholder, evaluated below
    R.pop()
    pg.evaluate("openModal('emailModal')"); pg.wait_for_timeout(250); pg.fill("#newEmailInput","vikas.test@example.com"); pg.evaluate("__calls.length=0"); pg.click("#confirmEmailBtn"); pg.wait_for_timeout(400)
    check("change email: re-submitting the CURRENT email is refused without calling the server", pg.evaluate("__calls.filter(c=>c[0]==='updateUser').length")==0, pg.evaluate("__calls"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    # reset password
    pg.evaluate("__calls.length=0"); pg.click("#resetPassBtn"); pg.wait_for_timeout(500)
    c=pg.evaluate("__calls")
    check("reset password: called with account email + redirect to settings.html", c and c[0][0]=='reset' and c[0][1]=="vikas.test@example.com" and c[0][2]['redirectTo'].endswith('/html/settings.html'), c)
    check("reset password: button restored after success", pg.inner_text("#resetPassBtn")=="Send Reset Link" and not pg.is_disabled("#resetPassBtn"))
    pg.evaluate("__mode.reset='err'"); pg.click("#resetPassBtn"); pg.wait_for_timeout(500)
    check("reset password: failure surfaced, button restored", any("smtp" in t for t in toasts()) and not pg.is_disabled("#resetPassBtn"), toasts()[-1:])
    # delete: wrong text
    pg.evaluate("localStorage.setItem('finos_income','1')")
    pg.evaluate("openModal('deleteModal')"); pg.wait_for_timeout(250); pg.evaluate("__calls.length=0")
    pg.fill("#deleteConfirmInput","delete"); pg.click("#deleteForeverBtn"); pg.wait_for_timeout(300)
    check("delete: wrong confirmation text -> server never called", pg.evaluate("__calls.length")==0)
    # delete: unconfirmed server response
    pg.fill("#deleteConfirmInput","DELETE"); pg.evaluate("__mode.del='unconfirmed'"); pg.click("#deleteForeverBtn"); pg.wait_for_timeout(600)
    check("delete: unconfirmed response -> local data kept + error + button re-enabled", pg.evaluate("localStorage.getItem('finos_income')")=="1" and not pg.is_disabled("#deleteForeverBtn") and pg.inner_text("#deleteForeverBtn")=="Delete Forever", (pg.evaluate("localStorage.getItem('finos_income')"), pg.inner_text("#deleteForeverBtn")))
    pg.evaluate("__mode.del='err'"); pg.click("#deleteForeverBtn"); pg.wait_for_timeout(600)
    check("delete: server error -> local data kept", pg.evaluate("localStorage.getItem('finos_income')")=="1" and any("not found" in t or "failed" in t.lower() for t in toasts()), toasts()[-1:])
    # delete: success
    pg.evaluate("__mode.del='ok'"); pg.evaluate("__calls.length=0"); pg.click("#deleteForeverBtn"); pg.wait_for_timeout(900)
    c=pg.evaluate("__calls") if not pg.is_closed() else []
    check("delete: success -> invoke delete-account, signOut, local data erased", any(x[0]=='invoke' and x[1]=='delete-account' for x in c) and any(x[0]=='signOut' for x in c) and pg.evaluate("localStorage.getItem('finos_income')") is None, c)
    pg.wait_for_timeout(2500)
    check("delete: success -> redirected away from settings", "settings.html" not in pg.url, pg.url)
    # sign out
    pg2=new(URL); pg2.evaluate("__calls.length=0"); pg2.evaluate("__mode.signout='err'")
    pg2.click("#signOutBtn"); pg2.wait_for_timeout(500)
    check("sign out: failure -> stays on page, button restored", "settings.html" in pg2.url and pg2.inner_text("#signOutBtn")=="Sign Out" and not pg2.is_disabled("#signOutBtn"), (pg2.url, pg2.inner_text("#signOutBtn")))
    pg2.evaluate("__mode.signout='ok'"); pg2.click("#signOutBtn"); pg2.wait_for_timeout(1800)
    check("sign out: success -> redirected to home.html", pg2.url.endswith("home.html"), pg2.url)
    check("no uncaught JS errors in auth flows", not errs, errs[:3])
    print("\n=== SUMMARY ===", sum(1 for r in R if r[0]), "pass,", sum(1 for r in R if not r[0]), "fail")
sys.exit(1 if any(not r[0] if isinstance(r[0], bool) else r[0]=='FAIL' for r in R) else 0)
