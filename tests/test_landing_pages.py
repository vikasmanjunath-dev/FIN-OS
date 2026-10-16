"""Root index.html and login.html (not covered by the earlier website QA): no invented figures, no password in the URL, pinned CDN."""
import os
import re
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import ROOT, static_server  # noqa: E402


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def open_page(env, path, init_script=None, block_cdn=True):
    base, browser = env
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    if init_script:
        ctx.add_init_script(init_script)

    def gate(route):
        u = route.request.url
        if u.startswith(base) or u.startswith("data:"):
            return route.continue_()
        return route.abort()
    ctx.route("**/*", gate)
    page = ctx.new_page()
    page.goto(f"{base}/{path}", wait_until="domcontentloaded")
    page.wait_for_timeout(800)
    return ctx, page


# ── static source guards ───────────────────────────────────────────────────────────────────────────────────────

def test_login_loads_an_exact_supabase_version_with_integrity():
    src = open(os.path.join(ROOT, "login.html"), encoding="utf-8").read()
    tags = re.findall(r"<script[^>]+cdn\.jsdelivr\.net[^>]*>", src)
    assert tags, "supabase script tag missing"
    for t in tags:
        assert re.search(r"@\d+\.\d+\.\d+/", t), f"unpinned CDN script: {t}"
        assert 'integrity="sha384-' in t and 'crossorigin="anonymous"' in t, t


def test_no_unpinned_cdn_in_root_pages():
    for name in ("index.html", "login.html"):
        src = open(os.path.join(ROOT, name), encoding="utf-8").read()
        for m in re.finditer(r'<script[^>]+src="(https?://[^"]+)"', src):
            assert re.search(r"@\d+\.\d+\.\d+", m.group(1)), (name, m.group(1))


# ── index.html ───────────────────────────────────────────────────────────────────────────────────────────────────

def test_index_has_no_unlabelled_outcome_figures_and_the_timeline_numbers_are_the_real_maths(env):
    ctx, page = open_page(env, "index.html")
    text = page.inner_text("body")
    assert "3.2 Cr" not in text
    assert "₹7.5 Lakhs" not in text and "₹38 Lakhs" not in text and "₹1.2 Crore" not in text
    assert "assumed 12%" in text and "not a forecast" in text

    def fv(m, annual, months):
        i = annual / 12
        return m * ((1 + i) ** months - 1) / i
    ten, twenty, thirty_five = fv(500, .12, 120) / 1e5, fv(500, .12, 240) / 1e5, fv(500, .12, 420) / 1e5
    late = fv(5000, .12, 180) / 1e5
    cards = page.locator(".timeline-card h4").all_inner_texts()
    nums = [float(re.search(r"([\d.]+)", c).group(1)) for c in cards if "about" in c]
    assert [round(ten, 1), round(twenty), round(thirty_five)] == nums, (cards, ten, twenty, thirty_five)
    assert thirty_five > late and abs(late - 25) < 0.6                     # the "ends ahead" claim holds at the stated rate
    ctx.close()


def test_paycheck_example_adds_up_and_ignores_the_persons_own_income(env):
    ctx, page = open_page(env, "index.html",
                          init_script="localStorage.setItem('finos_monthly_income','180000');localStorage.setItem('finos_income','1L-2.5L');"
                                      "localStorage.setItem('finos_display_name','Asha Rao');")
    cuts = page.locator(".expense").evaluate_all("els => els.map(e => Number(e.dataset.cut))")
    assert sum(cuts) == 100, cuts                                          # shares add up, so "nothing left" is arithmetic, not a forced value
    assert page.inner_text(".income-bar strong") == "₹50,000"               # a labelled example, never the person's income
    assert page.inner_text("#balanceAmount") == "₹50,000"
    assert "Example monthly income" in page.inner_text(".income-bar")
    page.click("#runPaycheck")
    page.wait_for_timeout(5200)
    assert page.inner_text("#balanceAmount") == "₹0"
    assert "Continue, Asha" in page.inner_text("#loginBtn")                 # greeting still works (textContent, no markup)
    ctx.close()


# ── login.html ───────────────────────────────────────────────────────────────────────────────────────────────────

def test_login_submit_without_the_auth_library_does_not_put_the_password_in_the_url(env):
    ctx, page = open_page(env, "login.html")                               # CDN aborted: window.supabase is undefined
    start = page.url
    page.fill("#loginEmail", "asha@example.com")
    page.fill("#loginPass", "Sup3r-secret-pw")
    page.click("#signinBtn")
    page.wait_for_timeout(500)
    assert page.url == start, page.url
    assert "Sup3r-secret-pw" not in page.url and "password=" not in page.url
    fb = page.inner_text("#auth-feedback")
    assert "could not be reached" in fb
    ctx.close()


def test_login_signup_confirmation_escapes_the_typed_email(env):
    stub = ("window.supabase={createClient:()=>({auth:{signUp:async()=>({error:null}),signInWithPassword:async()=>({error:null}),"
            "signInWithOAuth:async()=>({error:null}),resetPasswordForEmail:async()=>({})}})};")
    ctx, page = open_page(env, "login.html", init_script=stub)
    page.click("#tab-signup")
    page.fill("#regName", "Asha")
    page.fill("#regEmail", "<img src=x onerror=window.__pwned=1>@example.com")
    page.fill("#regPass", "Longenough1!")
    page.fill("#regPassConfirm", "Longenough1!")
    page.click("#signupBtn")
    page.wait_for_timeout(500)
    assert page.evaluate("window.__pwned") is None
    assert "<img src=x" in page.inner_text(".signup-success")              # shown as text
    ctx.close()


def test_login_controls_all_have_accessible_names(env):
    ctx, page = open_page(env, "login.html")
    bad = page.evaluate("""() => [...document.querySelectorAll('input,button,select,textarea,a[href]')]
        .filter(e => e.offsetParent !== null || e.id)
        .filter(e => {
          const t = (e.getAttribute('aria-label') || e.getAttribute('title') || e.innerText || e.value || '').trim();
          const lab = e.id && document.querySelector('label[for="' + e.id + '"]');
          return !t && !lab && !e.getAttribute('aria-labelledby');
        }).map(e => e.outerHTML.slice(0, 80))""")
    assert not bad, bad
    ctx.close()
