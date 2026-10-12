"""Credit score tracker: nothing is assumed or saved until the person enters a score, and zero is a real answer."""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

KEYS = ["finos_cibil_score", "finos_credit_util_pct", "finos_credit_health", "finos_credit_late", "finos_credit_inquiries"]


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def open_page(env, init=""):
    base, browser = env
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    if init:
        ctx.add_init_script(init)
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{base}/html/credit-score.html", wait_until="load")
    pg.wait_for_selector("#cs-score")
    return ctx, pg, errors


def stored(pg):
    return {k: pg.evaluate(f"localStorage.getItem({json.dumps(k)})") for k in KEYS}


def test_a_new_visitor_sees_an_invitation_and_nothing_is_stored(env):
    ctx, pg, errors = open_page(env)
    assert pg.input_value("#cs-score") == "" and pg.input_value("#cs-util") == ""
    assert pg.inner_text("#cs-score-num") == "—"
    assert "Enter your score" in pg.inner_text("#cs-band-label")
    assert all(v is None for v in stored(pg).values()), stored(pg)
    assert not errors
    ctx.close()


def test_typing_a_score_works_it_out_and_saves_only_what_was_typed(env):
    ctx, pg, errors = open_page(env)
    pg.fill("#cs-score", "782")
    pg.wait_for_function("document.querySelector('#cs-band-label').innerText.includes('Very Good')")
    assert pg.inner_text("#cs-hl-rate") == "8.75%"
    s = stored(pg)
    assert s["finos_cibil_score"] == "782" and s["finos_credit_util_pct"] is None and s["finos_credit_late"] is None
    ctx.close()


def test_zero_utilisation_and_zero_inquiries_are_kept_not_turned_into_defaults(env):
    ctx, pg, errors = open_page(env)
    pg.fill("#cs-score", "700")
    pg.fill("#cs-util", "0")
    pg.fill("#cs-inquiries", "0")
    pg.wait_for_function("localStorage.getItem('finos_credit_inquiries') === '0'")
    s = stored(pg)
    assert s["finos_credit_util_pct"] == "0" and s["finos_credit_inquiries"] == "0"
    pg.reload(wait_until="load")
    pg.wait_for_selector("#cs-util")
    assert pg.input_value("#cs-util") == "0" and pg.input_value("#cs-inquiries") == "0"
    ctx.close()


def test_clearing_the_score_does_not_leave_a_made_up_one_behind(env):
    ctx, pg, errors = open_page(env, "localStorage.setItem('finos_cibil_score','745');")
    assert pg.input_value("#cs-score") == "745"
    pg.fill("#cs-score", "")
    pg.wait_for_function("document.querySelector('#cs-score-num').innerText === '—'")
    assert "Enter your score" in pg.inner_text("#cs-band-label")
    assert pg.inner_text("#cs-hl-rate") == "—"
    ctx.close()


def test_no_improvement_tip_is_raised_from_a_number_nobody_entered(env):
    ctx, pg, errors = open_page(env, "localStorage.setItem('finos_cibil_score','760');")
    tips = pg.evaluate("FinosCreditScore._compute(" + json.dumps({"entered": True, "score": 760, "utilization": 0, "latePayments": 0, "recentInquiries": 0,
                                                               "oldestAgeYears": 8, "securedAccounts": 1, "unsecuredAccounts": 1}) + ").activeTips.map(t => t.category)")
    assert "Utilization" not in tips and "Inquiries" not in tips
    ctx.close()


def test_clear_delinquencies_is_only_advised_when_there_are_late_payments(env):
    ctx, pg, errors = open_page(env)
    base = {"entered": True, "score": 760, "utilization": 0, "recentInquiries": 0, "oldestAgeYears": 8, "securedAccounts": 1, "unsecuredAccounts": 1}
    tips = lambda late: pg.evaluate("FinosCreditScore._compute(" + json.dumps({**base, "latePayments": late}) + ").activeTips.map(t => t.tip)")   # noqa: E731
    clean, late = tips(0), tips(2)
    assert "Never miss an EMI or credit card due date" in clean and "Clear any existing delinquencies" not in clean
    assert "Never miss an EMI or credit card due date" in late and "Clear any existing delinquencies" in late
    ctx.close()
