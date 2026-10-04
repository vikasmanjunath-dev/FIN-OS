"""html/system-leak.html: the 'Sync Future Loss' button, and the radar total that must not grow on every sweep."""
import datetime
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402


def fv(monthly, annual_pct, years):
    n, i = years * 12, annual_pct / 1200
    return monthly * n if i == 0 else monthly * ((1 + i) ** n - 1) / i * (1 + i)


def inr(n):
    n = round(n)
    return f"₹{n / 1e7:.2f} Cr" if n >= 1e7 else f"₹{n / 1e5:.2f} L" if n >= 1e5 else f"₹{n:,}"


def seed(txns=None, subs=None, extra=""):
    parts = []
    if txns is not None:
        parts.append(f"localStorage.setItem('finos_transactions', {json.dumps(json.dumps(txns))});")
    if subs is not None:
        parts.append(f"localStorage.setItem('finos_subscriptions_monthly', '{subs}');")
    return "if (!sessionStorage.getItem('seeded')) {" + "".join(parts) + extra + "sessionStorage.setItem('seeded','1');}"


def food_days(n, amount=500):
    today = datetime.date.today()
    return [{"amount": amount, "category": "need_food", "type": "need_food", "label": "lunch", "date": (today - datetime.timedelta(days=i)).isoformat()} for i in range(n)]


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def open_page(env, init=None, width=1280, theme="dark"):
    base, browser = env
    ctx = browser.new_context(viewport={"width": width, "height": 900})
    ctx.add_init_script(f"localStorage.setItem('finos-theme', '{theme}')")
    if init:
        ctx.add_init_script(init)
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{base}/html/system-leak.html", wait_until="domcontentloaded")
    pg.wait_for_selector("button[onclick='syncLossData()']", state="attached")
    return ctx, pg, errors


def sync(pg):
    pg.evaluate("syncLossData()")
    pg.wait_for_selector("#leak-sync-panel:not([hidden]) #fl-title")


def ls(pg, key):
    return pg.evaluate(f"localStorage.getItem('{key}')")


def test_no_data_means_an_honest_empty_state_and_nothing_is_saved(env):
    ctx, pg, errors = open_page(env)
    sync(pg)
    txt = pg.inner_text("#leak-sync-panel")
    assert "Nothing to analyse yet" in txt and "never guesses" in txt
    hrefs = pg.locator("#leak-sync-panel a").evaluate_all("els => els.map(e => e.getAttribute('href'))")
    assert "subscription-tracker.html" in hrefs and "track-finances.html" in hrefs
    assert ls(pg, "finos_leak_monthly") is None
    assert pg.locator("#fl-monthly").count() == 0
    assert not errors
    ctx.close()


def test_real_data_shows_the_exact_monthly_leak_and_future_loss(env):
    ctx, pg, errors = open_page(env, init=seed(food_days(30), subs=799))
    sync(pg)
    monthly = 15000 + 799                                        # ₹500 × 30 days + tracked subscriptions
    assert pg.inner_text("#fl-monthly") == inr(monthly)
    horizons = pg.inner_text("#fl-horizons")
    for years in (10, 20, 30):
        assert inr(fv(monthly, 12, years)) in horizons, years
    assert "last 30 days" in pg.inner_text(".fl-source") and "subscriptions" in pg.inner_text(".fl-source")
    assert pg.get_attribute("input[data-cat='Subscriptions']", "checked") is not None
    assert ls(pg, "finos_leak_monthly") == str(monthly)
    assert ls(pg, "finos_leak_future_20y") == str(round(fv(monthly, 12, 20)))
    assert ls(pg, "finos_leak_synced_at")
    assert not errors
    ctx.close()


def test_ticking_a_category_off_recomputes_saves_and_survives_reload(env):
    ctx, pg, errors = open_page(env, init=seed(food_days(30), subs=799))
    sync(pg)
    pg.uncheck("input[data-cat='Subscriptions']")
    pg.wait_for_function("document.getElementById('fl-monthly').innerText === '₹15,000'")
    assert ls(pg, "finos_leak_monthly") == "15000"
    assert json.loads(ls(pg, "finos_leak_cats")) == ["Food & Dining", "Entertainment", "Shopping"]
    pg.reload(wait_until="domcontentloaded")
    pg.wait_for_selector("button[onclick='syncLossData()']", state="attached")
    sync(pg)
    assert pg.inner_text("#fl-monthly") == "₹15,000"             # the choice is remembered
    assert not pg.is_checked("input[data-cat='Subscriptions']")
    assert not errors
    ctx.close()


def test_growth_rate_and_redirect_controls(env):
    ctx, pg, errors = open_page(env, init=seed(food_days(30)))
    sync(pg)
    pg.fill("#fl-rate", "0")
    pg.dispatch_event("#fl-rate", "change")
    pg.wait_for_function("document.getElementById('fl-horizons').innerText.includes('growth adds ₹0')")
    assert inr(15000 * 120) in pg.inner_text("#fl-horizons")      # 0% growth: it is just what you paid in
    pg.fill("#fl-rate", "12")
    pg.dispatch_event("#fl-rate", "change")
    pg.wait_for_function(f"document.getElementById('fl-horizons').innerText.includes('{inr(fv(15000, 12, 10))}')")
    pg.evaluate("(() => { const r = document.getElementById('fl-pct'); r.value = 100; r.dispatchEvent(new Event('input', {bubbles: true})); })()")
    assert pg.inner_text("#fl-pct-v") == "100%"
    assert inr(fv(15000, 12, 20)) in pg.inner_text("#fl-redirect-out")
    assert not errors
    ctx.close()


def test_sample_mode_is_clearly_labelled_and_never_saved(env):
    ctx, pg, errors = open_page(env)
    sync(pg)
    pg.click("#fl-sample")
    pg.wait_for_selector(".fl-source.warn")
    assert "SAMPLE" in pg.inner_text(".fl-source") and "Not your data" in pg.inner_text(".fl-source")
    assert pg.inner_text("#fl-monthly") == "₹1,389"               # 120 + 680 + 90 + 499, the radar's sample leaks
    assert pg.is_disabled("#fl-rate")
    assert ls(pg, "finos_leak_monthly") is None
    assert not errors
    ctx.close()


def test_hostile_text_in_a_transaction_is_never_executed(env):
    bad = food_days(30)
    bad.append({"amount": 100, "category": "<img src=x onerror=window.__pwned=1>", "type": "expense", "label": "<script>window.__pwned=2</script>", "date": datetime.date.today().isoformat()})
    ctx, pg, errors = open_page(env, init=seed(bad))
    sync(pg)
    pg.click("input[data-cat]")                                    # force a re-render with whatever categories exist
    assert pg.evaluate("window.__pwned") is None
    assert "<img" not in pg.inner_html("#leak-sync-panel").replace("&lt;img", "")
    ctx.close()


def test_radar_total_counts_each_leak_once_and_a_second_click_does_not_stack_scans(env):
    ctx, pg, errors = open_page(env)
    pg.click("button[onclick='startForensicScan()']")
    pg.click("button[onclick='startForensicScan()']")              # used to add a second timer and a second set of blips
    pg.wait_for_function("document.querySelectorAll('.ticker-entry').length === 4", timeout=12000)
    pg.wait_for_timeout(9000)                                      # more than two full sweeps (one is about 3.8 s)
    assert pg.locator(".blip").count() == 4
    assert pg.locator(".ticker-entry").count() == 4
    assert pg.inner_text("#radar-total-leak") == "₹1,389"
    assert not errors
    ctx.close()


@pytest.mark.parametrize("theme", ["dark", "light"])
def test_panel_fits_a_phone_and_has_no_axe_violations(env, theme):
    ctx, pg, errors = open_page(env, init=seed(food_days(30), subs=799), width=375, theme=theme)
    sync(pg)
    pg.wait_for_timeout(500)
    assert pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "page scrolls sideways with the panel open"
    axe = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "node_modules", "axe-core", "axe.min.js")
    if os.path.exists(axe):
        pg.add_script_tag(path=axe)
        bad = pg.evaluate("axe.run('#leak-sync-panel', {runOnly: ['wcag2a', 'wcag2aa']}).then(r => r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(', ')))")
        assert bad == [], bad
    assert not errors
    ctx.close()
