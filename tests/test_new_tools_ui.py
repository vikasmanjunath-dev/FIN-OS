"""Prepay-vs-Invest, Job-offer comparer and the Subscription tracker, driven through the real pages."""
import datetime as dt
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

PREPAY = "calculators/loans,%20debt%20&%20emi/prepayinvest.html"
OFFER = "calculators/tax%20&%20salary/offercompare.html"
SUBS = "html/subscription-tracker.html"
CAL = "html/financial-calendar.html"


@pytest.fixture()
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def open_page(browser, base, path, seed=None):
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    if seed:
        ctx.add_init_script("(s => { if (localStorage.getItem('__seeded')) return; for (const k in s) localStorage.setItem(k, s[k]); localStorage.setItem('__seeded','1'); })(%s)" % json.dumps(seed))
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{base}/{path}", wait_until="domcontentloaded")
    return ctx, pg, errors


def set_num(pg, sel, value):
    pg.fill(sel, str(value))          # fires `input`, which is what the page listens to


# ───────────────────────────── Prepay vs Invest ─────────────────────────────

def test_prepay_defaults_match_the_unit_tested_numbers(env):
    base, browser = env
    ctx, pg, errors = open_page(browser, base, PREPAY)
    pg.wait_for_function("document.getElementById('finalA').textContent !== '—'")
    assert pg.inner_text("#finalA") == "₹1.47 Cr"
    assert pg.inner_text("#finalB") == "₹1.8 Cr"
    assert "Investing wins by ₹33.28 L" in pg.inner_text("#verdict")
    assert "Loan-free in 9y 8m (vs 20y)" in pg.inner_text("#subA")
    assert "Break-even: 9.1%" in pg.inner_text("#be")
    assert errors == []


def test_prepay_verdict_flips_and_sliders_stay_in_sync(env):
    base, browser = env
    ctx, pg, errors = open_page(browser, base, PREPAY)
    pg.wait_for_function("document.getElementById('finalA').textContent !== '—'")
    set_num(pg, "#retNum", 7)
    assert pg.input_value("#ret") == "7"                      # number box drives the slider
    assert "Prepaying wins" in pg.inner_text("#verdict")
    pg.evaluate("(() => { const s = document.getElementById('ret'); s.value = 14; s.dispatchEvent(new Event('input', {bubbles:true})); })()")
    assert pg.input_value("#retNum") == "14"                  # slider drives the number box
    assert "Investing wins" in pg.inner_text("#verdict")
    assert errors == []


def test_prepay_lump_sum_only_and_empty_states(env):
    base, browser = env
    ctx, pg, errors = open_page(browser, base, PREPAY)
    set_num(pg, "#monthlyNum", 0)
    set_num(pg, "#lumpNum", 1000000)
    assert "wins by" in pg.inner_text("#verdict")             # a lump sum alone is a valid question
    set_num(pg, "#lumpNum", 0)
    assert "extra monthly amount or a lump sum" in pg.inner_text("#verdict")
    set_num(pg, "#loanNum", 0)
    assert "Enter a loan amount" in pg.inner_text("#verdict")
    assert pg.inner_text("#finalA") == "—"
    assert errors == []


def test_prepay_24b_checkbox_changes_the_headline_rate(env):
    base, browser = env
    ctx, pg, errors = open_page(browser, base, PREPAY)
    set_num(pg, "#retNum", 7)
    assert "guaranteed 8.50% on every rupee" in pg.inner_text("#verdict")
    pg.check("#claim24b")
    assert "guaranteed 5.95% after Sec 24(b) relief" in pg.inner_text("#verdict")      # 8.5% × (1 − 30%)
    assert errors == []


# ───────────────────────────── Job offer comparer ─────────────────────────────

def test_offer_defaults_and_winner(env):
    base, browser = env
    ctx, pg, errors = open_page(browser, base, OFFER)
    pg.wait_for_selector("#tbl tbody tr")
    table = pg.inner_text("#tbl")
    assert "₹1,22,045" in table                               # Offer A, matches the unit-tested reference
    assert "₹1,41,089" in table
    assert "Offer B wins on both counts" in pg.inner_text("#verdict")
    assert pg.locator("#tbl td.best").count() == 3            # best monthly, best cash, best total
    assert errors == []


def test_offer_third_offer_single_offer_and_empty(env):
    base, browser = env
    ctx, pg, errors = open_page(browser, base, OFFER)
    pg.wait_for_selector("#tbl tbody tr")
    pg.fill('[data-i="2"][data-k="ctc"]', "2500000")
    assert pg.locator("#tbl thead th").count() == 4           # label column + 3 offers
    pg.fill('[data-i="2"][data-k="ctc"]', "")
    pg.fill('[data-i="1"][data-k="ctc"]', "")
    assert "Add a second offer" in pg.inner_text("#verdict")
    pg.fill('[data-i="0"][data-k="ctc"]', "")
    assert "Enter at least one offer" in pg.inner_text("#verdict")
    assert pg.locator("#tbl tr").count() == 0
    assert errors == []


def test_offer_names_are_text_not_html(env):
    base, browser = env
    ctx, pg, errors = open_page(browser, base, OFFER)
    pg.wait_for_selector("#tbl tbody tr")
    pg.fill('[data-i="0"][data-k="name"]', '<img src=x onerror="window.__pwned=1">Acme')
    assert pg.evaluate("window.__pwned") is None
    assert pg.locator("#tbl img, #verdict img").count() == 0
    assert errors == []


def test_offer_years_and_old_regime_deductions_change_the_numbers(env):
    base, browser = env
    ctx, pg, errors = open_page(browser, base, OFFER)
    pg.wait_for_selector("#tbl tbody tr")
    before = pg.inner_text("#tbl")
    pg.fill("#years", "3")
    assert "over 3 years" in pg.inner_text("#tbl")
    pg.fill("#oldDed", "900000")                              # absurdly large claim → old regime becomes the cheaper one
    assert "Old" in pg.inner_text("#tbl")
    assert pg.inner_text("#tbl") != before
    assert errors == []


# ───────────────────────────── Subscription tracker ─────────────────────────────

def add_sub(pg, name, amount, cycle="monthly", category="ott", usefulness="", status="active"):
    pg.click("text=+ Add subscription")
    f = "form.sub-form"
    pg.fill(f"{f} [name=name]", name)
    pg.select_option(f"{f} [name=category]", category)
    pg.fill(f"{f} [name=amount]", str(amount))
    pg.select_option(f"{f} [name=cycle]", cycle)
    pg.select_option(f"{f} [name=status]", status)
    if usefulness:
        pg.select_option(f"{f} [name=usefulness]", str(usefulness))
    pg.click(f"{f} button[type=submit]")


def test_empty_state_then_add_via_preset_and_persist(env):
    base, browser = env
    ctx, pg, errors = open_page(browser, base, SUBS)
    pg.wait_for_selector(".sub-empty")
    pg.click("text=+ Netflix")
    assert pg.input_value("form.sub-form [name=name]") == "Netflix"
    pg.fill("form.sub-form [name=amount]", "649")
    pg.click("form.sub-form button[type=submit]")
    assert pg.inner_text("#sub-monthly") == "₹649"
    assert pg.inner_text("#sub-annual") == "₹7,788"
    pg.reload()
    pg.wait_for_selector(".sub-card")
    assert pg.inner_text("#sub-annual") == "₹7,788"            # survives a reload
    assert json.loads(pg.evaluate("localStorage.getItem('finos_subscriptions_annual')")) == 7788
    assert errors == []


def test_validation_messages_and_no_save_on_error(env):
    base, browser = env
    ctx, pg, errors = open_page(browser, base, SUBS)
    pg.wait_for_selector(".sub-empty")
    pg.click("text=+ Add subscription")
    pg.click("form.sub-form button[type=submit]")
    assert "Give it a name" in pg.inner_text(".sub-err")
    pg.fill("form.sub-form [name=name]", "Thing")
    pg.click("form.sub-form button[type=submit]")
    assert "bill amount" in pg.inner_text(".sub-err")
    pg.fill("form.sub-form [name=amount]", "-5")
    pg.click("form.sub-form button[type=submit]")
    assert "bill amount" in pg.inner_text(".sub-err")
    assert pg.evaluate("localStorage.getItem('finos_subscriptions')") in (None, "[]")
    assert errors == []


def test_review_candidates_pause_cancel_and_double_click_delete(env):
    base, browser = env
    ctx, pg, errors = open_page(browser, base, SUBS)
    pg.wait_for_selector(".sub-empty")
    add_sub(pg, "Netflix", 649, usefulness=4)
    add_sub(pg, "Hotstar", 899, cycle="yearly", usefulness=1)
    add_sub(pg, "Prime", 1499, cycle="yearly", usefulness=3)
    review = pg.inner_text(".sub-review")
    low = review.lower()                                       # tags are upper-cased by CSS
    assert "hotstar" in low and "low value" in low
    assert "prime" in low and "overlap" in low
    assert "3 services in streaming / ott" in low
    assert "₹2,398/year" in review                             # 899 + 1,499; Netflix is the one kept

    card = pg.locator(".sub-card", has_text="Prime")
    card.get_by_text("Pause").click()
    assert pg.locator(".sub-review").inner_text().count("Prime") == 0
    assert "Paused & cancelled (1)" in pg.inner_text("body")

    pg.locator(".sub-card", has_text="Netflix").get_by_text("Delete").click()
    assert pg.locator(".sub-card", has_text="Netflix").count() == 1      # first click only arms it
    assert "Click again to delete" in pg.inner_text("body")
    pg.locator(".sub-card", has_text="Netflix").get_by_text("Click again to delete").click()
    assert pg.locator(".sub-card", has_text="Netflix").count() == 0
    assert errors == []


def test_edit_updates_costs_and_split_plans_use_your_share(env):
    base, browser = env
    ctx, pg, errors = open_page(browser, base, SUBS)
    pg.wait_for_selector(".sub-empty")
    add_sub(pg, "Family plan", 900)
    pg.get_by_text("Edit").first.click()
    pg.fill("form.sub-form [name=split]", "3")
    pg.click("form.sub-form button[type=submit]")
    assert pg.inner_text("#sub-monthly") == "₹300"             # 900 split three ways
    assert "split 3 ways = ₹300" in pg.inner_text(".sub-card")
    assert errors == []


def test_trial_is_flagged_and_not_counted_as_spend(env):
    base, browser = env
    soon = (dt.date.today() + dt.timedelta(days=2)).isoformat()
    seed = {"finos_subscriptions": json.dumps([{"id": "t1", "name": "GymPass", "category": "fitness", "amount": 2000, "cycle": "monthly", "nextDate": soon, "status": "trial"}])}
    ctx, pg, errors = open_page(browser, base, SUBS, seed)
    pg.wait_for_selector(".sub-card")
    assert pg.inner_text("#sub-monthly") == "₹0"
    assert "free trial converts to a paid plan in 2 days" in pg.inner_text(".sub-alert.warn")
    assert "free trial" in pg.inner_text(".sub-card").lower()
    assert errors == []


def test_names_are_escaped_everywhere(env):
    base, browser = env
    ctx, pg, errors = open_page(browser, base, SUBS)
    pg.wait_for_selector(".sub-empty")
    add_sub(pg, '<img src=x onerror="window.__pwned=1">', 100)
    assert pg.evaluate("window.__pwned") is None
    assert pg.locator(".sub-card img, .sub-up img, .sub-cats img").count() == 0
    assert "<img" in pg.inner_text(".sub-card")                # visible as text
    pg.reload()
    pg.wait_for_selector(".sub-card")
    assert pg.evaluate("window.__pwned") is None
    assert errors == []


def test_csv_export_downloads_a_file(env):
    base, browser = env
    ctx, pg, errors = open_page(browser, base, SUBS)
    pg.wait_for_selector(".sub-empty")
    add_sub(pg, "Spotify", 119, category="music")
    with pg.expect_download() as dl:
        pg.click("text=Export CSV")
    d = dl.value
    assert d.suggested_filename == "finos-subscriptions.csv"
    with open(d.path(), encoding="utf-8") as fh:
        text = fh.read()
    assert text.startswith('"Name","Category"') and "Spotify" in text and "Music & audio" in text
    assert errors == []


def test_cross_tab_change_refreshes_the_list(env):
    base, browser = env
    ctx, pg, errors = open_page(browser, base, SUBS)
    pg.wait_for_selector(".sub-empty")
    other = ctx.new_page()
    other.goto(f"{base}/{SUBS}", wait_until="domcontentloaded")
    other.wait_for_selector(".sub-empty")
    add_sub(other, "iCloud+", 75, category="cloud")
    pg.wait_for_selector(".sub-card", timeout=5000)           # storage event re-renders the first tab
    assert "iCloud+" in pg.inner_text(".sub-list")
    assert errors == []


# ───────────────────────────── Calendar / reminders integration ─────────────────────────────

def test_calendar_lists_renewals_and_escapes_titles(env):
    base, browser = env
    soon = (dt.date.today() + dt.timedelta(days=3)).isoformat()
    evil = '<img src=x onerror="window.__pwned=1">'
    seed = {"finos_subscriptions": json.dumps([
        {"id": "a", "name": "Netflix", "category": "ott", "amount": 649, "cycle": "monthly", "nextDate": soon},
        {"id": "b", "name": evil, "category": "ott", "amount": 100, "cycle": "monthly", "nextDate": soon},
    ])}
    ctx, pg, errors = open_page(browser, base, CAL, seed)
    pg.click("text=Upcoming Events")
    pg.wait_for_function("document.body.innerText.includes('Netflix renews')", timeout=8000)
    assert pg.evaluate("window.__pwned") is None
    assert pg.locator(".fc-event-title img, .fc-detail-name img, [id^=fc] img").count() == 0
    assert "<img" in pg.inner_text("body")                      # the hostile name is shown as plain text
    assert "Subscription" in pg.inner_text(".fc-legend")
    assert errors == []


def test_reminder_toast_for_a_renewal_two_days_out(env):
    base, browser = env
    soon = (dt.date.today() + dt.timedelta(days=2)).isoformat()
    seed = {"finos_subscriptions": json.dumps([{"id": "a", "name": "Netflix", "category": "ott", "amount": 649, "cycle": "monthly", "nextDate": soon}])}
    ctx, pg, errors = open_page(browser, base, "html/tools.html", seed)
    pg.wait_for_function("window.FinosReminders", timeout=8000)
    pg.wait_for_function("window.FinosSubscriptions", timeout=8000)         # reminders loads it on demand
    ups = pg.evaluate("FinosReminders.upcoming(7).map(e => [e.type, e.title, e.daysAway])")
    assert ["sub", "Netflix renews", 2] in ups
    assert errors == []
