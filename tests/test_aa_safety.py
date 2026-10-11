"""js/finos-aa.js: no live provider calls, no fake data in the real ledger, and a way to remove sample data older versions left behind."""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AXE = os.path.join(ROOT, "node_modules", "axe-core", "axe.min.js")
PROVIDER_HOSTS = ("finvu.in", "onemoney.in", "perfios.com", "anumati.io", "mfcentral.com")
REAL_TXNS = [{"id": "r1", "type": "debit", "amount": 450, "desc": "Lunch", "date": "2026-09-20", "category": "Food & Dining", "source": "manual"},
             {"id": "r2", "type": "credit", "amount": 90000, "desc": "Salary", "date": "2026-09-01", "category": "Salary", "source": "manual"},
             {"id": "r3", "type": "debit", "amount": 120, "desc": "Swiggy order", "date": "2026-09-21", "category": "Food & Dining", "source": "manual"}]   # the user's own, same wording as a sample
DEMO_TXNS = [{"id": "d1", "type": "debit", "amount": 512.4, "desc": "Swiggy order", "date": "2026-09-10T00:00:00.000Z", "category": "Food & Dining", "source": "aa"},
             {"id": "d2", "type": "credit", "amount": 61234.5, "desc": "Salary Credit", "date": "2026-09-01T00:00:00.000Z", "category": "Salary", "source": "aa"}]
DEMO_FUNDS = [{"fund_name": "Axis Bluechip Fund - Direct Growth", "units": 245.8}, {"fund_name": "Parag Parikh Flexi Cap - Direct Growth", "units": 128.4}]


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def seed_js(**kv):
    body = "".join(f"localStorage.setItem({json.dumps(k)}, {json.dumps(json.dumps(v) if not isinstance(v, str) else v)});" for k, v in kv.items())
    return "if (!sessionStorage.getItem('seeded')) {" + body + "sessionStorage.setItem('seeded','1');}"


def open_settings(env, init="", requests=None, width=1280):
    base, browser = env
    ctx = browser.new_context(viewport={"width": width, "height": 900})
    ctx.add_init_script(init)
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    if requests is not None:
        pg.on("request", lambda r: requests.append(r.url))
    pg.goto(f"{base}/html/settings.html", wait_until="domcontentloaded")
    pg.wait_for_function("window.FinosAA", timeout=15000)
    pg.evaluate("(() => { let c = document.getElementById('settings-aa-dashboard'); if (!c) { c = document.createElement('div'); c.id = 'settings-aa-dashboard'; document.body.appendChild(c); } FinosAA.renderDashboard('settings-aa-dashboard'); })()")
    return ctx, pg, errors


def ls(pg, key):
    return pg.evaluate(f"localStorage.getItem({json.dumps(key)})")


def hits(requests):
    return [u for u in requests if any(h in u for h in PROVIDER_HOSTS)]


def test_live_connections_are_off_and_the_page_says_so(env):
    ctx, pg, errors = open_settings(env)
    assert pg.evaluate("FinosAA.LIVE_ENABLED") is False
    text = pg.inner_text("#settings-aa-dashboard")
    assert "Live connections are not available yet" in text and "never uploaded" in text
    assert pg.locator("#settings-aa-dashboard .aa-btn-connect").count() == 4
    assert "not available yet" in pg.inner_text("#settings-aa-dashboard .aa-btn-connect")
    assert pg.locator("#settings-aa-dashboard a[href='import-statement.html']").count() >= 1
    assert "RBI-regulated, 100% secure" not in text                                    # no unearned claims
    assert not errors
    ctx.close()


def test_no_provider_is_ever_contacted_even_with_a_key_and_an_old_active_consent(env):
    reqs = []
    seed = seed_js(finos_aa_key_finvu="my-client-id", finos_aa_consents_v1={"finvu": {"consentId": "abc", "active": True, "grantedAt": "2026-01-01T00:00:00.000Z"}})
    ctx, pg, errors = open_settings(env, init=seed, requests=reqs)
    pg.evaluate("FinosAA.connect('finvu'); FinosAA.sync('finvu'); FinosAA.autoSync(); window.dispatchEvent(new CustomEvent('finos-context-ready', {detail: {phase: 'full'}}))")
    pg.wait_for_timeout(6500)                                                          # longer than the old 3 s demo timer and the 5 s auto-sync delay
    assert hits(reqs) == [], hits(reqs)
    assert ls(pg, "finos_transactions") is None                                        # nothing was injected
    assert ls(pg, "finos_aa_income") is None
    assert pg.locator("#finos-aa-modal").count() == 1 and "not available yet" in pg.inner_text("#finos-aa-modal")
    assert "my-client-id" not in " ".join(reqs)                                        # a key never travels in a URL
    assert not errors
    ctx.close()


def test_connecting_never_adds_data_after_the_old_three_second_fallback(env):
    # with a key stored, the old code opened a window and, 3 seconds later, always ran the simulated sync (and 2 seconds after that wrote it)
    ctx, pg, errors = open_settings(env, init=seed_js(finos_transactions=REAL_TXNS, finos_aa_key_onemoney="client-id"))
    before = ls(pg, "finos_transactions")
    pg.evaluate("FinosAA.connect('onemoney')")
    pg.wait_for_timeout(6500)
    assert ls(pg, "finos_transactions") == before
    assert ls(pg, "finos_aa_consents_v1") in (None, "{}")
    assert ls(pg, "finos_aa_last_sync_v1") in (None, "{}")
    ctx.close()


def test_demo_mode_is_a_preview_and_saves_nothing_and_cannot_overwrite_real_holdings(env):
    real_funds = [{"fund_name": "My Real Fund", "units": 10}]
    ctx, pg, errors = open_settings(env, init=seed_js(finos_transactions=REAL_TXNS, finos_mf_holdings=real_funds, finos_mf_portfolio_value="12345"))
    snapshot = {k: ls(pg, k) for k in ("finos_transactions", "finos_mf_holdings", "finos_mf_portfolio_value", "finos_aa_consents_v1", "finos_aa_last_sync_v1", "finos_aa_income", "finos_aa_expense")}
    events = pg.evaluate("(() => { window.__aa = 0; document.addEventListener('aa-sync-complete', () => window.__aa++); return 0; })()")
    pg.evaluate("FinosAA._demoMode('cams_mf')")
    pg.wait_for_function("document.getElementById('finos-aa-toast') && document.getElementById('finos-aa-toast').innerText.includes('sample only')", timeout=8000)
    assert "Nothing was saved" in pg.inner_text("#finos-aa-toast")
    assert {k: ls(pg, k) for k in snapshot} == snapshot
    assert pg.evaluate("window.__aa") == 0
    ctx.close()


def test_sample_data_from_an_older_demo_mode_is_found_and_removed_only_when_asked(env):
    init = seed_js(finos_transactions=REAL_TXNS + DEMO_TXNS, finos_mf_holdings=DEMO_FUNDS, finos_mf_portfolio_value="40527", finos_aa_income="61234.5", finos_aa_expense="512.4",
                   finos_aa_consents_v1={"finvu": {"consentId": "demo_consent_1", "active": True}, "onemoney": {"consentId": "real_looking", "active": True}},
                   finos_aa_last_sync_v1={"finvu": "2026-09-30T00:00:00.000Z", "onemoney": "2026-09-29T00:00:00.000Z"})
    ctx, pg, errors = open_settings(env, init=init)
    notice = pg.inner_text("#settings-aa-dashboard .aa-notice.warn")
    assert "2 sample transactions and sample mutual funds" in notice
    assert len(json.loads(ls(pg, "finos_transactions"))) == 5                           # looking does not change anything
    pg.click("#settings-aa-dashboard .aa-notice.warn button")
    kept = json.loads(ls(pg, "finos_transactions"))
    assert [t["id"] for t in kept] == ["r1", "r2", "r3"]                                # the user's own, including one worded like a sample, survive
    assert ls(pg, "finos_mf_holdings") is None and ls(pg, "finos_mf_portfolio_value") is None
    consents = json.loads(ls(pg, "finos_aa_consents_v1"))
    assert "finvu" not in consents and "onemoney" in consents                           # only the demo consent goes
    assert "finvu" not in json.loads(ls(pg, "finos_aa_last_sync_v1"))
    assert ls(pg, "finos_aa_income") is None and ls(pg, "finos_aa_expense") is None
    assert pg.locator("#settings-aa-dashboard .aa-notice.warn").count() == 0
    assert not errors
    ctx.close()


def test_nothing_is_flagged_or_removed_without_a_demo_consent_or_when_holdings_are_real(env):
    # sample-looking transactions but no demo consent: they are the person's own
    ctx, pg, errors = open_settings(env, init=seed_js(finos_transactions=DEMO_TXNS))
    assert pg.locator("#settings-aa-dashboard .aa-notice.warn").count() == 0
    assert pg.evaluate("FinosAA.demoFootprint()") == {"txns": 0, "funds": False}
    pg.evaluate("FinosAA.removeDemoData()")
    assert len(json.loads(ls(pg, "finos_transactions"))) == 2
    ctx.close()
    # demo consent present but the holdings include a real fund: holdings are left alone
    mixed = DEMO_FUNDS + [{"fund_name": "My Real Fund", "units": 3}]
    ctx, pg, errors = open_settings(env, init=seed_js(finos_mf_holdings=mixed, finos_aa_consents_v1={"cams_mf": {"consentId": "demo_consent_9", "active": True}}))
    assert pg.evaluate("FinosAA.demoFootprint().funds") is False
    pg.evaluate("FinosAA.removeDemoData()")
    assert len(json.loads(ls(pg, "finos_mf_holdings"))) == 3
    ctx.close()


@pytest.mark.parametrize("theme", ["dark", "light"])
def test_new_notices_and_the_unavailable_dialog_pass_axe_and_fit_a_phone(env, theme):
    init = f"localStorage.setItem('finos-theme', '{theme}');" + seed_js(finos_transactions=DEMO_TXNS, finos_aa_consents_v1={"finvu": {"consentId": "demo_consent_1", "active": True}})
    ctx, pg, errors = open_settings(env, init=init, width=375)
    pg.evaluate("FinosAA.connect('onemoney')")
    assert pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
    if os.path.exists(AXE):
        pg.add_script_tag(path=AXE)
        bad = pg.evaluate("axe.run(['.aa-notice', '#finos-aa-modal'], {runOnly: ['wcag2a', 'wcag2aa']}).then(r => r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(', ')))")
        assert bad == [], bad
    assert pg.evaluate("document.activeElement && document.activeElement.tagName") == "A"      # focus moves into the dialog
    ctx.close()
