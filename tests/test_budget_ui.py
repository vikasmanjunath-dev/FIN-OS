"""Budgets end to end: mixed-shape transactions → card, limits persist, suggestions, and ONE alert per level."""
import datetime as dt
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402


def day(n):
    t = dt.date.today()
    return dt.date(t.year, t.month, min(n, 28)).isoformat()


@pytest.fixture()
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def page_with(browser, base, txns=None, limits=None, extra=None):
    ctx = browser.new_context()
    seed = {"finos_monthly_income": "100000"}
    if txns is not None:
        seed["finos_transactions"] = json.dumps(txns)
    if limits is not None:
        seed["finos_budgets"] = json.dumps({"limits": limits})
    seed.update(extra or {})
    ctx.add_init_script("(s => { if (localStorage.getItem('__seeded')) return; for (const k in s) localStorage.setItem(k, s[k]); localStorage.setItem('__seeded', '1'); })(%s)" % json.dumps(seed))   # seed once, not on every reload
    pg = ctx.new_page()
    pg.goto(f"{base}/html/budget-forecast.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#finos-budget-card section")
    return ctx, pg


MIXED = [
    {"amount": 9200, "category": "need_food", "type": "need_food", "label": "meals", "date": day(2)},                      # quick capture
    {"id": "a1", "type": "debit", "category": "Shopping", "desc": "AMAZON", "amount": 8300, "date": day(3) + "T10:00:00+05:30"},   # account aggregator
    {"id": "v1", "type": "income", "category": "investment", "description": "SIP", "amount": 5000, "date": day(1)},         # voice journal (savings!)
    {"id": "s1", "type": "credit", "category": "Salary", "desc": "SAL", "amount": 90000, "date": day(1)},
]


def test_card_reads_all_shapes_and_ignores_investing_and_income(env):
    base, browser = env
    ctx, pg = page_with(browser, base, MIXED, {"Food & Dining": 10000, "Shopping": 8000})
    text = pg.inner_text("#finos-budget-card")
    assert "Food & Dining" in text and "Shopping" in text
    assert "₹17,500 spent" in text                      # 9,200 + 8,300; the SIP and the salary are not spending
    assert "Over" in text                               # Shopping 8,300 of 8,000
    assert pg.get_attribute("#finos-budget-card [role=progressbar]", "aria-valuenow") is not None
    ctx.close()


def test_editing_a_limit_persists_and_updates_status(env):
    base, browser = env
    ctx, pg = page_with(browser, base, MIXED, {"Food & Dining": 10000})
    inp = pg.locator('input[data-cat="Food & Dining"]')
    inp.fill("20000"); inp.dispatch_event("change")
    pg.wait_for_function("document.querySelector('#finos-budget-card').innerText.includes('On track')")
    assert json.loads(pg.evaluate("localStorage.getItem('finos_budgets')"))["limits"]["Food & Dining"] == 20000
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_selector("#finos-budget-card section")
    assert pg.locator('input[data-cat="Food & Dining"]').input_value() == "20000"
    ctx.close()


def test_suggest_uses_history_and_empty_state_explains_itself(env):
    base, browser = env
    ctx, pg = page_with(browser, base, [], None)
    assert "No budgets yet" in pg.inner_text("#finos-budget-card")
    pg.click("#bud-suggest")                            # no history, income 1,00,000 → income-based defaults
    pg.wait_for_selector('input[data-cat="Housing"]')
    assert pg.locator('input[data-cat="Housing"]').input_value() == "25000"
    ctx.close()


def test_overrun_alert_fires_once_per_level(env):
    base, browser = env
    ctx, pg = page_with(browser, base, MIXED, {"Food & Dining": 10000, "Shopping": 8000})
    # The page's own reminder run (pwa-init → ~2.5 s after load) announces the first alerts on its own.
    pg.wait_for_function("localStorage.getItem('finos_reminders_seen') && localStorage.getItem('finos_reminders_seen').includes('budget|')", timeout=20000)
    seen = json.loads(pg.evaluate("localStorage.getItem('finos_reminders_seen')"))
    month = dt.date.today().strftime("%Y-%m")
    assert f"budget|{month}|Shopping|over" in seen, list(seen)
    assert f"budget|{month}|Food & Dining|warn-90" in seen, list(seen)
    toasts = pg.evaluate("[...document.querySelectorAll('.finos-toast')].map(t => t.innerText)")
    assert any("Shopping budget exceeded" in t for t in toasts), toasts
    assert pg.evaluate("FinosReminders.run().map(p => p.title)") == []          # same levels, same month → silence
    # crossing into a new level alerts again
    pg.evaluate("""() => { const t = JSON.parse(localStorage.getItem('finos_transactions')); t.push({amount: 3000, category: 'need_food', type: 'need_food', date: new Date().toISOString().slice(0,10)}); localStorage.setItem('finos_transactions', JSON.stringify(t)); }""")
    newer = pg.evaluate("FinosReminders.run().map(p => p.title)")
    assert any("Food & Dining budget exceeded" in t for t in newer), newer
    ctx.close()


def dashboard_with(browser, base, txns, limits):
    ctx = browser.new_context()
    seed = {"finos_transactions": json.dumps(txns)}
    if limits is not None:
        seed["finos_budgets"] = json.dumps({"limits": limits})
    ctx.add_init_script("(s => { if (localStorage.getItem('__seeded')) return; for (const k in s) localStorage.setItem(k, s[k]); localStorage.setItem('__seeded', '1'); })(%s)" % json.dumps(seed))
    pg = ctx.new_page()
    pg.goto(f"{base}/html/dashboard.html", wait_until="domcontentloaded")
    pg.wait_for_function("window.FinosBudget", timeout=15000)
    pg.wait_for_timeout(300)
    return ctx, pg


def test_dashboard_strip_summarises_budgets(env):
    base, browser = env
    ctx, pg = dashboard_with(browser, base, MIXED, {"Food & Dining": 10000, "Shopping": 8000})
    text = pg.inner_text("#finos-budget-strip")
    assert "Budget this month" in text and "₹17,500 of ₹18,000" in text and "1 over" in text, text
    assert pg.get_attribute("#finos-budget-strip a", "href") == "budget-forecast.html"
    ctx.close()


def test_dashboard_strip_prompts_only_when_there_are_enough_expenses(env):
    base, browser = env
    many = [{"amount": 500, "category": "need_food", "date": day(i)} for i in (1, 2, 3)]
    ctx, pg = dashboard_with(browser, base, many, None)
    assert "set category budgets" in pg.inner_text("#finos-budget-strip")
    ctx.close()
    ctx, pg = dashboard_with(browser, base, many[:1], None)
    assert pg.inner_text("#finos-budget-strip").strip() == ""          # one expense: no nagging
    ctx.close()
