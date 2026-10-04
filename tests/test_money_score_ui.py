"""html/money-score.html: questionnaire -> score -> next moves, persistence, share card, mobile layout."""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

# Hand-worked in tests/money-score.test.js: this profile scores exactly 35 ("Needs attention").
THIN = {"age": 30, "dependents": 1, "monthlyIncome": 100000, "monthlyExpenses": 70000, "monthlyEmi": 20000,
        "monthlyInvesting": 5000, "liquidSavings": 100000, "investedTotal": 600000, "termCover": 0, "healthCover": 0}


@pytest.fixture()
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def open_page(env, width=1280, init_script=None):
    base, browser = env
    ctx = browser.new_context(viewport={"width": width, "height": 900}, accept_downloads=True)
    if init_script:
        ctx.add_init_script(init_script)
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{base}/html/money-score.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#ms-form, .ms-result", state="attached")
    return ctx, pg, errors


def fill(pg, values):
    for k, v in values.items():
        pg.fill(f"#ms-{k}", str(v)) if k != "dependents" else pg.select_option("#ms-dependents", str(v))


def test_blank_submit_explains_what_is_missing_and_shows_no_score(env):
    ctx, pg, errors = open_page(env)
    pg.click("#ms-calc")
    msg = pg.inner_text("#ms-errors")
    assert "income" in msg.lower() and "age" in msg.lower() and "spending" in msg.lower()
    assert pg.locator(".ms-result").count() == 0
    assert not errors
    ctx.close()


def test_score_actions_and_pillars_for_the_hand_computed_profile(env):
    ctx, pg, errors = open_page(env)
    fill(pg, THIN)
    pg.click("#ms-calc")
    pg.wait_for_selector(".ms-result")
    assert pg.get_attribute(".ms-ring", "aria-label") == "Money Score 35 out of 100"
    assert pg.inner_text(".ms-band") == "Needs attention"
    titles = pg.locator(".ms-action h3").all_inner_texts()
    assert len(titles) == 3
    assert titles[0] == "Build your emergency fund by ₹4.40 L"      # urgent first: 1.1 months of cover
    assert titles[1] == "Close your insurance gap"
    assert pg.locator(".ms-pillar").count() == 6
    assert "+20 points" in pg.inner_text(".ms-actions-list")
    assert not errors
    ctx.close()


def test_result_is_saved_and_survives_reload_and_edit_prefills(env):
    ctx, pg, errors = open_page(env)
    fill(pg, THIN)
    pg.click("#ms-calc")
    pg.wait_for_selector(".ms-result")
    saved = json.loads(pg.evaluate("localStorage.getItem('finos_money_score')"))
    assert saved["score"] == 35 and saved["inputs"]["monthlyIncome"] == 100000
    # PULSE and Arya read these two without loading the scoring code
    assert saved["weakest"] == {"id": "insurance", "label": "Insurance cover", "score": 0}
    assert saved["top"]["id"] == "emergency" and saved["top"]["title"] == "Build your emergency fund by ₹4.40 L" and saved["top"]["gain"] == 16
    assert saved["top"]["href"] == "../html/emergency-fund.html" and saved["top"]["cta"] == "Open the planner"
    hist = json.loads(pg.evaluate("localStorage.getItem('finos_money_score_history')"))
    assert len(hist) == 1 and hist[0]["score"] == 35
    pg.reload(wait_until="domcontentloaded")
    pg.wait_for_selector(".ms-result")                                   # straight to the result, no re-typing
    assert pg.get_attribute(".ms-ring", "aria-label") == "Money Score 35 out of 100"
    pg.click("#ms-edit")
    pg.wait_for_selector("#ms-form")
    assert pg.input_value("#ms-monthlyIncome") == "100000"
    assert pg.input_value("#ms-age") == "30"
    # improving an answer moves the score, and the second snapshot on the same day replaces the first
    pg.fill("#ms-liquidSavings", "540000")
    pg.click("#ms-calc")
    pg.wait_for_selector(".ms-result")
    new = int(pg.get_attribute(".ms-ring", "aria-label").split()[2])
    assert new > 35
    hist = json.loads(pg.evaluate("localStorage.getItem('finos_money_score_history')"))
    assert len(hist) == 1 and hist[0]["score"] == new
    assert not errors
    ctx.close()


def test_shared_keys_are_seeded_only_when_empty(env):
    ctx, pg, errors = open_page(env, init_script="if (!localStorage.getItem('finos_monthly_income')) localStorage.setItem('finos_monthly_income', '12345');")
    fill(pg, THIN)
    pg.click("#ms-calc")
    pg.wait_for_selector(".ms-result")
    ls = pg.evaluate("({inc: localStorage.getItem('finos_monthly_income'), exp: localStorage.getItem('finos_monthly_expense'), em: localStorage.getItem('finos_emergency_fund'), sip: localStorage.getItem('finos_sip_monthly')})")
    assert ls["inc"] == "12345"                                         # the user's existing value is never overwritten
    assert ls["exp"] == "70000" and ls["em"] == "100000" and ls["sip"] == "5000"
    assert not errors
    ctx.close()


def test_share_card_is_a_png_with_no_rupee_amounts(env):
    ctx, pg, errors = open_page(env)
    fill(pg, THIN)
    pg.click("#ms-calc")
    pg.wait_for_selector(".ms-result")
    size = pg.evaluate("(() => { const c = FinosMoneyScore.drawCard(FinosMoneyScore.compute(" + json.dumps(THIN) + ")); return [c.width, c.height, c.toDataURL('image/png').slice(0, 22)]; })()")
    assert size == [1080, 1080, "data:image/png;base64,"]
    # every string painted on the card: only the score, band, pillar labels and fixed copy — no amounts
    texts = pg.evaluate("""(() => {
      const out = []; const orig = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t) { out.push(String(t)); return orig.apply(this, arguments); };
      FinosMoneyScore.drawCard(FinosMoneyScore.compute(%s)); CanvasRenderingContext2D.prototype.fillText = orig; return out; })()""" % json.dumps(THIN))
    joined = " | ".join(texts)
    assert "35" in texts and "Needs attention" in texts
    assert "₹" not in joined and "100000" not in joined and "70000" not in joined
    assert not errors
    ctx.close()


def test_share_button_downloads_the_png_when_the_browser_cannot_share_files(env):
    ctx, pg, errors = open_page(env, init_script="Object.defineProperty(navigator, 'canShare', {value: () => false, configurable: true});")
    fill(pg, THIN)
    pg.click("#ms-calc")
    pg.wait_for_selector(".ms-result")
    with pg.expect_download() as dl:
        pg.click("#ms-share")
    assert dl.value.suggested_filename == "finos-money-score.png"
    pg.wait_for_function("document.getElementById('ms-status').innerText.includes('never your amounts')")
    assert not errors
    ctx.close()


def test_share_button_uses_the_native_share_sheet_with_a_png_when_available(env):
    stub = """Object.defineProperty(navigator, 'canShare', {value: () => true, configurable: true});
      window.__shared = null;
      Object.defineProperty(navigator, 'share', {value: (d) => { window.__shared = {n: d.files[0].name, t: d.files[0].type, size: d.files[0].size, text: d.text}; return Promise.resolve(); }, configurable: true});"""
    ctx, pg, errors = open_page(env, init_script=stub)
    fill(pg, THIN)
    pg.click("#ms-calc")
    pg.wait_for_selector(".ms-result")
    pg.click("#ms-share")
    pg.wait_for_function("window.__shared !== null")
    shared = pg.evaluate("window.__shared")
    assert shared["n"] == "finos-money-score.png" and shared["t"] == "image/png" and shared["size"] > 5000
    assert "35/100" in shared["text"] and "₹" not in shared["text"]
    assert not errors
    ctx.close()


def test_every_next_move_button_leads_to_a_real_page(env):
    ctx, pg, errors = open_page(env)
    fill(pg, THIN)
    pg.click("#ms-calc")
    pg.wait_for_selector(".ms-result")
    base = env[0]
    for href in pg.locator(".ms-action a.ms-btn").evaluate_all("els => els.map(e => e.href)"):
        r = pg.request.get(href)
        assert r.status == 200, f"{href} -> {r.status}"
    ctx.close()


@pytest.mark.parametrize("theme", ["dark", "light"])
def test_phone_width_has_no_horizontal_scroll_in_both_themes(env, theme):
    ctx, pg, errors = open_page(env, width=375, init_script=f"localStorage.setItem('finos-theme', '{theme}')")
    assert pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "form overflows on a phone"
    fill(pg, THIN)
    pg.click("#ms-calc")
    pg.wait_for_selector(".ms-result")
    assert pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "result overflows on a phone"
    assert pg.evaluate("document.documentElement.getAttribute('data-theme')") == theme
    assert not errors
    ctx.close()


# ── prefill from what FIN-OS already tracks, and the link to Future Loss ───────────────────────────────────────
def _tracked_data_script(leak=None):
    import datetime
    today = datetime.date.today()
    txns = [{"amount": 1000, "category": "need_food", "type": "need_food", "label": "lunch", "date": (today - datetime.timedelta(days=i)).isoformat()} for i in range(30)]
    txns.append({"amount": 10000, "category": "emi", "type": "emi", "label": "home loan emi", "date": (today - datetime.timedelta(days=3)).isoformat()})
    keys = {"finos_monthly_income": "100000", "finos_age": "30", "finos_dependents": "2", "finos_emergency_fund": "200000",
            "finos_sip_monthly": "15000", "finos_epf_value": "400000", "finos_ppf_value": "50000"}
    if leak:
        keys["finos_leak_monthly"] = str(leak)
    js = "".join(f"localStorage.setItem('{k}', '{v}');" for k, v in keys.items())
    js += f"localStorage.setItem('finos_transactions', {json.dumps(json.dumps(txns))});"
    return "if (!sessionStorage.getItem('seeded')) {" + js + "sessionStorage.setItem('seeded','1');}"


def test_form_is_prefilled_from_tracked_data_with_a_source_for_each_answer(env):
    ctx, pg, errors = open_page(env, init_script=_tracked_data_script())
    assert pg.input_value("#ms-age") == "30"
    assert pg.input_value("#ms-monthlyIncome") == "100000"
    assert pg.input_value("#ms-monthlyExpenses") == "30000"          # ₹1,000 × 30 days of logged spending; the EMI is not spending
    assert pg.input_value("#ms-monthlyEmi") == "10000"
    assert pg.input_value("#ms-liquidSavings") == "200000"
    assert pg.input_value("#ms-monthlyInvesting") == "15000"
    assert pg.input_value("#ms-investedTotal") == "450000"           # EPF 4,00,000 + PPF 50,000
    assert pg.input_value("#ms-dependents") == "2"
    assert pg.input_value("#ms-termCover") == "" and pg.input_value("#ms-healthCover") == ""   # unknown stays blank, never guessed
    assert "We filled in 8 answers" in pg.inner_text(".ms-lead")
    assert pg.locator(".ms-src").count() == 8
    assert "last 30 days of logged spending" in pg.inner_text("label[for='ms-monthlyExpenses']")
    assert "your investment trackers" in pg.inner_text("label[for='ms-investedTotal']")
    # finish the two unknowns and score it
    pg.fill("#ms-termCover", "10000000")
    pg.fill("#ms-healthCover", "1000000")
    pg.click("#ms-calc")
    pg.wait_for_selector(".ms-result")
    saved = json.loads(pg.evaluate("localStorage.getItem('finos_money_score')"))
    assert saved["inputs"]["monthlyExpenses"] == 30000 and saved["inputs"]["investedTotal"] == 450000 and saved["inputs"]["termCover"] == 10000000
    assert not errors
    ctx.close()


def test_saved_answers_win_over_derived_ones_and_edit_shows_no_stale_source_tags(env):
    ctx, pg, errors = open_page(env, init_script=_tracked_data_script())
    pg.fill("#ms-monthlyExpenses", "45000")                          # the user overrides a derived value
    pg.click("#ms-calc")
    pg.wait_for_selector(".ms-result")
    pg.reload(wait_until="domcontentloaded")
    pg.wait_for_selector(".ms-result")
    pg.click("#ms-edit")
    pg.wait_for_selector("#ms-form")
    assert pg.input_value("#ms-monthlyExpenses") == "45000"          # not re-derived back to 30000
    assert pg.locator(".ms-src").count() == 0 and "We filled in" not in pg.inner_text(".ms-lead")
    assert not errors
    ctx.close()


def test_nothing_tracked_means_a_blank_form_with_no_prefill_claims(env):
    ctx, pg, errors = open_page(env)
    assert pg.locator(".ms-src").count() == 0
    assert "We filled in" not in pg.inner_text(".ms-lead")
    assert pg.input_value("#ms-monthlyIncome") == "" and pg.input_value("#ms-monthlyExpenses") == ""
    ctx.close()


SAVER = {"age": 30, "dependents": 1, "monthlyIncome": 100000, "monthlyExpenses": 85000, "monthlyEmi": 0, "monthlyInvesting": 15000,
         "liquidSavings": 600000, "investedTotal": 1200000, "termCover": 12000000, "healthCover": 750000}


def test_savings_move_points_at_the_measured_leak_and_that_page_exists(env):
    ctx, pg, errors = open_page(env, init_script="localStorage.setItem('finos_leak_monthly', '5400');")
    fill(pg, SAVER)
    pg.click("#ms-calc")
    pg.wait_for_selector(".ms-result")
    assert pg.locator(".ms-action").count() == 1
    assert pg.locator(".ms-action h3").inner_text() == "Free up ₹5,000 a month"
    assert "₹5,400 a month in discretionary leaks" in pg.inner_text(".ms-action")
    btn = pg.locator(".ms-action a.ms-btn")
    assert btn.inner_text().startswith("See your leak")
    href = btn.evaluate("e => e.href")
    assert href.endswith("/html/system-leak.html#radar-module")
    assert pg.request.get(href.split("#")[0]).status == 200
    assert not errors
    ctx.close()


def test_without_a_measured_leak_the_savings_move_still_points_at_subscriptions(env):
    ctx, pg, errors = open_page(env)
    fill(pg, SAVER)
    pg.click("#ms-calc")
    pg.wait_for_selector(".ms-result")
    assert pg.locator(".ms-action a.ms-btn").inner_text().startswith("Find the leaks")
    assert pg.locator(".ms-action a.ms-btn").evaluate("e => e.href").endswith("/html/subscription-tracker.html")
    ctx.close()


@pytest.mark.parametrize("theme", ["dark", "light"])
def test_prefilled_form_has_no_axe_violations(env, theme):
    axe = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "node_modules", "axe-core", "axe.min.js")
    if not os.path.exists(axe):
        pytest.skip("axe-core not installed")
    ctx, pg, errors = open_page(env, init_script=f"localStorage.setItem('finos-theme', '{theme}');" + _tracked_data_script())
    pg.add_script_tag(path=axe)
    bad = pg.evaluate("axe.run('.ms-form', {runOnly: ['wcag2a', 'wcag2aa']}).then(r => r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(', ')))")
    assert bad == [], bad
    assert not errors
    ctx.close()
