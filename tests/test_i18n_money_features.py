"""Hindi for the Money Score, Future Loss and the feedback prompt, with the real translation engine in a real browser."""
import datetime
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AXE = os.path.join(ROOT, "node_modules", "axe-core", "axe.min.js")
THIN = {"age": 30, "dependents": 1, "monthlyIncome": 100000, "monthlyExpenses": 70000, "monthlyEmi": 20000, "monthlyInvesting": 5000,
        "liquidSavings": 100000, "investedTotal": 600000, "termCover": 0, "healthCover": 0}
SAVED = lambda prof: f"localStorage.setItem('finos_money_score', {json.dumps(json.dumps({'inputs': prof}))});"   # noqa: E731
HI = "localStorage.setItem('finos_lang', 'hi');"
WAIT_HI = "window.FinosI18n && FinosI18n.lang() === 'hi' && document.documentElement.lang === 'hi'"


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def open_page(env, name, init="", width=1280, theme="dark"):
    base, browser = env
    ctx = browser.new_context(viewport={"width": width, "height": 900})
    ctx.add_init_script(f"localStorage.setItem('finos-theme', '{theme}');" + init)
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{base}/html/{name}.html", wait_until="domcontentloaded")
    return ctx, pg, errors


def with_engine(pg, lang="hi"):
    """English pages do not load the translation engine; add it and the Hindi table, like the settings switch does."""
    pg.add_script_tag(url=f"{pg.url.rsplit('/html/', 1)[0]}/js/finos-i18n.js")
    pg.evaluate(f"FinosI18n.setLang('{lang}')")
    pg.wait_for_function(f"FinosI18n.lang() === '{lang}'")


def test_the_result_is_in_hindi_with_money_in_lakh_and_the_page_language_set(env):
    ctx, pg, errors = open_page(env, "money-score", HI + SAVED(THIN))
    pg.wait_for_function(WAIT_HI, timeout=15000)
    pg.wait_for_function("document.querySelector('.ms-band') && document.querySelector('.ms-band').innerText === 'ध्यान देने की ज़रूरत'")
    text = pg.inner_text(".ms-result")
    assert "आपके अगले 3 सबसे अच्छे कदम" in text and "स्कोर कैसे बनता है" in text and "आज़माएँ: क्या आपका स्कोर बदलेगा?" in text
    assert "आपका FIN-OS मनी स्कोर 100 में से 35 है।" in text
    titles = pg.locator(".ms-action h3").all_inner_texts()
    assert titles[0] == "अपनी आपातकालीन निधि में ₹4.40 लाख और जोड़ें" and titles[1] == "अपने बीमा की कमी पूरी करें"
    assert "आपके पास 1.1 महीने का कवर है; 6 महीने का मतलब ₹5.40 लाख।" in pg.inner_text(".ms-action")
    assert "+16 अंक" in text
    assert pg.get_attribute(".ms-ring", "aria-label") == "100 में से 35 मनी स्कोर"
    assert pg.inner_text("#ms-share") == "मेरा स्कोर शेयर करें" and pg.inner_text("#ms-edit") == "मेरे जवाब बदलें"
    assert "Needs attention" not in text and "emergency fund" not in text.lower() and "Your 3 best" not in text      # nothing left in English
    assert not errors
    ctx.close()


def test_what_if_speaks_hindi_and_keeps_the_numbers_right(env):
    ctx, pg, errors = open_page(env, "money-score", HI + SAVED(THIN))
    pg.wait_for_function("document.querySelector('.ms-band') && document.querySelector('.ms-band').innerText === 'ध्यान देने की ज़रूरत'")
    pg.evaluate("(() => { const r = document.getElementById('ms-wi-cashAdd'); r.value = 440000; r.dispatchEvent(new Event('input', {bubbles: true})); })()")
    assert pg.inner_text("#ms-wi-cashAdd-v") == "₹4.40 लाख"
    out = pg.inner_text("#ms-wi-out")
    assert "आपका स्कोर 51 हो जाएगा (अभी 35), +16 अंक" in out and "ध्यान देने की ज़रूरत" in out and "सही दिशा में" in out
    pg.evaluate("(() => { const r = document.getElementById('ms-wi-investMore'); r.value = 20000; r.dispatchEvent(new Event('input', {bubbles: true})); })()")
    assert "हर महीने कमाई से ₹15,000 ज़्यादा खर्च करेंगे" in pg.inner_text("#ms-wi-surplus")
    assert pg.inner_text("#ms-wi-investMore-v") == "₹20,000/माह"
    ctx.close()


def test_switching_language_redraws_in_place_and_switching_back_restores_english_exactly(env):
    ctx, pg, errors = open_page(env, "money-score", SAVED(THIN))
    pg.wait_for_selector(".ms-result")
    english = pg.inner_text(".ms-result")
    with_engine(pg, "hi")
    pg.wait_for_function("document.querySelector('.ms-band').innerText === 'ध्यान देने की ज़रूरत'")
    assert pg.inner_text(".ms-result") != english and "लाख" in pg.inner_text(".ms-result")
    pg.evaluate("FinosI18n.setLang('en')")
    pg.wait_for_function("document.querySelector('.ms-band').innerText === 'Needs attention'")
    assert pg.inner_text(".ms-result") == english                                        # byte for byte what it was
    assert not errors
    ctx.close()


def test_a_half_filled_form_survives_a_language_change(env):
    ctx, pg, errors = open_page(env, "money-score")
    pg.wait_for_selector("#ms-form")
    pg.fill("#ms-age", "33"); pg.fill("#ms-monthlyIncome", "88000"); pg.select_option("#ms-dependents", "2"); pg.check("#ms-highInterestDebt")
    with_engine(pg, "hi")
    pg.wait_for_function("document.querySelector('label[for=ms-age] span').innerText === 'आपकी उम्र'")
    assert pg.input_value("#ms-age") == "33" and pg.input_value("#ms-monthlyIncome") == "88000"
    assert pg.input_value("#ms-dependents") == "2" and pg.is_checked("#ms-highInterestDebt")
    assert pg.inner_text("#ms-calc") == "मेरा मनी स्कोर पाएँ" and "हर महीने" in pg.inner_text(".ms-form")
    ctx.close()


def test_validation_messages_are_in_hindi_too(env):
    ctx, pg, errors = open_page(env, "money-score", HI)
    pg.wait_for_function(WAIT_HI, timeout=15000)
    pg.wait_for_function("document.querySelector('#ms-calc') && document.querySelector('#ms-calc').innerText === 'मेरा मनी स्कोर पाएँ'")
    pg.click("#ms-calc")
    msg = pg.inner_text("#ms-errors")
    assert "उम्र 18 से 80 के बीच होनी चाहिए" in msg and "हाथ में आने वाली मासिक आय शून्य से ज़्यादा होनी चाहिए" in msg
    pg.fill("#ms-age", "30"); pg.fill("#ms-monthlyIncome", "50000"); pg.fill("#ms-monthlyExpenses", "20000"); pg.fill("#ms-monthlyEmi", "-5")
    pg.click("#ms-calc")
    assert "मासिक EMI एक संख्या होनी चाहिए, शून्य या उससे ज़्यादा" in pg.inner_text("#ms-errors")
    ctx.close()


def test_the_share_card_and_text_are_in_hindi_and_still_carry_no_amounts(env):
    ctx, pg, errors = open_page(env, "money-score", HI + SAVED(THIN))
    pg.wait_for_function("document.querySelector('.ms-band') && document.querySelector('.ms-band').innerText === 'ध्यान देने की ज़रूरत'")
    texts = pg.evaluate("""(() => { const out = []; const o = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t) { out.push(String(t)); return o.apply(this, arguments); };
      FinosMoneyScore.drawCard(FinosMoneyScore.compute(%s)); CanvasRenderingContext2D.prototype.fillText = o; return out; })()""" % json.dumps(THIN))
    assert "मेरा FIN-OS मनी स्कोर" in texts and "ध्यान देने की ज़रूरत" in texts and "100 में से" in texts and "बचत दर" in texts
    assert not any("₹" in t or "100000" in t for t in texts)
    ctx.close()


def test_future_loss_panel_is_in_hindi_and_redraws_when_the_language_changes(env):
    today = datetime.date.today()
    txns = [{"amount": 500, "category": "need_food", "type": "need_food", "label": "x", "date": (today - datetime.timedelta(days=i)).isoformat()} for i in range(40)]
    seed = f"localStorage.setItem('finos_transactions', {json.dumps(json.dumps(txns))});localStorage.setItem('finos_subscriptions_monthly','799');"
    ctx, pg, errors = open_page(env, "system-leak", seed)
    pg.wait_for_selector("button[onclick='syncLossData()']", state="attached")
    pg.evaluate("syncLossData()")
    pg.wait_for_selector("#fl-title")
    assert pg.inner_text("#fl-title") == "What this leak costs you later"
    with_engine(pg, "hi")
    pg.wait_for_function("document.getElementById('fl-title').innerText === 'यह रिसाव आगे चलकर आपको कितना महँगा पड़ेगा'")
    text = pg.inner_text("#leak-sync-panel")
    assert "₹36.71 लाख" in text and "₹1.58 करोड़" in text and "₹5.58 करोड़" in text            # the same figures as in English, in lakh and crore
    assert "आपके पिछले 40 दिनों के दर्ज खर्च और ट्रैक की गई सब्सक्रिप्शन पर आधारित" in text                    # 40 days were seeded
    assert "10 साल" in text and "/माह" in text and "20 साल में यह" in text
    assert pg.inner_text("#fl-monthly") == "₹15,799"
    pg.evaluate("FinosI18n.setLang('en')")
    pg.wait_for_function("document.getElementById('fl-title').innerText === 'What this leak costs you later'")
    assert "₹36.71 L" in pg.inner_text("#leak-sync-panel")
    assert not errors
    ctx.close()


def test_feedback_prompt_and_its_messages_are_in_hindi(env):
    ctx, pg, errors = open_page(env, "feedback", HI)
    pg.wait_for_function(WAIT_HI, timeout=15000)
    pg.wait_for_selector(".fb-card")
    pg.evaluate("FinosI18n.setLang('hi')")                                                 # the prompt may have drawn before the table arrived
    pg.wait_for_function("document.querySelector('.fb-card [data-save]') && document.querySelector('.fb-card [data-save]').innerText === 'फ़ीडबैक सेव करें'")
    assert pg.inner_text(".fb-card [data-r='up']") == "👍 हाँ" and pg.inner_text(".fb-card [data-r='down']") == "👎 ख़ास नहीं"
    pg.click("[data-save]")
    assert "चुनें" in pg.inner_text(".fb-out")
    pg.click(".fb-card [data-r='up']")
    pg.click("[data-save]")
    pg.wait_for_function("document.querySelector('.fb-out').innerText.includes('सेव हो गया')")
    assert "कुछ भेजा नहीं गया" in pg.inner_text(".fb-out")
    ctx.close()


def test_no_untranslated_template_is_ever_requested_across_every_state(env):
    base, browser = env
    today = datetime.date.today()
    txns = [{"amount": 500, "category": "need_food", "type": "need_food", "label": "x", "date": (today - datetime.timedelta(days=i)).isoformat()} for i in range(40)]
    missing = set()
    wrap = """(() => { window.__missing = new Set(); const t = FinosI18n.t.bind(FinosI18n); FinosI18n.t = (k, fb) => { if (FinosI18n._lookup(k) == null) window.__missing.add(k); return t(k, fb); }; })()"""

    def drive(page_name, init, steps):
        ctx, pg, errors = open_page(env, page_name, HI + init)
        pg.wait_for_function(WAIT_HI, timeout=15000)
        pg.evaluate(wrap)
        pg.evaluate("FinosI18n.setLang('hi')")                                             # redraw everything under the recording wrapper
        steps(pg)
        missing.update(pg.evaluate("[...window.__missing]"))
        assert not errors, errors
        ctx.close()

    def money(pg):
        pg.wait_for_selector(".ms-result")
        for k in ("spendLess", "investMore", "emiLess", "cashAdd", "termAdd", "healthAdd"):
            if pg.locator(f"#ms-wi-{k}").count():
                pg.evaluate("(k) => { const r = document.getElementById('ms-wi-' + k); r.value = r.max; r.dispatchEvent(new Event('input', {bubbles: true})); }", k)
        pg.click("#ms-edit"); pg.fill("#ms-age", "5"); pg.click("#ms-calc")
        pg.evaluate("[-3, -1, 0, 1, 5].forEach(d => [{id:'a',label:'Needs attention'},{id:'b',label:'Strong'}].forEach(x => [{id:'a',label:'Needs attention'},{id:'b',label:'Strong'}].forEach(y => FinosMoneyScore._whatIfSentence({after: 50, before: 40, delta: d, bandAfter: x, bandBefore: y}))))")

    for prof in (THIN, dict(THIN, highInterestDebt=True), dict(THIN, dependents=0, termCover=12000000),
                 dict(THIN, monthlyExpenses=130000, monthlyEmi=0, liquidSavings=2000000), dict(THIN, monthlyExpenses=85000, monthlyEmi=0, liquidSavings=600000, investedTotal=1200000, termCover=12000000, healthCover=750000, monthlyInvesting=15000),
                 dict(THIN, monthlyEmi=0, liquidSavings=9e6, termCover=9e7, healthCover=9e6, monthlyInvesting=50000, investedTotal=9e7, monthlyExpenses=20000)):
        drive("money-score", SAVED(prof) + "localStorage.setItem('finos_leak_monthly','5400');", money)
    drive("money-score", "", lambda pg: (pg.wait_for_selector("#ms-form"), pg.click("#ms-calc")))
    drive("money-score", f"localStorage.setItem('finos_monthly_income','100000');localStorage.setItem('finos_age','30');localStorage.setItem('finos_dependents','2');localStorage.setItem('finos_term_insurance','5000000');localStorage.setItem('finos_emergency_fund','200000');localStorage.setItem('finos_sip_monthly','15000');localStorage.setItem('finos_epf_value','400000');localStorage.setItem('finos_transactions', {json.dumps(json.dumps(txns))});", lambda pg: pg.wait_for_selector("#ms-form"))

    def leak(pg):
        pg.wait_for_selector("button[onclick='syncLossData()']", state="attached")
        pg.evaluate("syncLossData()"); pg.wait_for_selector("#fl-title")
        pg.evaluate("(() => { const r = document.getElementById('fl-pct'); if (r) { r.value = 60; r.dispatchEvent(new Event('input', {bubbles: true})); } })()")
        if pg.locator("#fl-sample").count(): pg.click("#fl-sample")
    drive("system-leak", "", leak)
    drive("system-leak", f"localStorage.setItem('finos_transactions', {json.dumps(json.dumps(txns))});localStorage.setItem('finos_subscriptions_monthly','799');", leak)
    drive("system-leak", f"localStorage.setItem('finos_transactions', {json.dumps(json.dumps(txns[:5]))});localStorage.setItem('finos_subscriptions_monthly','1500');", leak)

    def feedback(pg):
        pg.wait_for_selector(".fb-card"); pg.click("[data-save]"); pg.click(".fb-card [data-r='up']"); pg.click("[data-save]"); pg.wait_for_timeout(300)
    drive("feedback", "", feedback)
    assert sorted(missing) == [], f"these English templates were shown without a Hindi entry: {sorted(missing)}"


@pytest.mark.parametrize("theme", ["dark", "light"])
def test_hindi_result_passes_axe_and_fits_a_phone(env, theme):
    ctx, pg, errors = open_page(env, "money-score", HI + SAVED(THIN), width=375, theme=theme)
    pg.wait_for_function("document.querySelector('.ms-band') && document.querySelector('.ms-band').innerText === 'ध्यान देने की ज़रूरत'")
    assert pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "Hindi text overflows a phone"
    if os.path.exists(AXE):
        pg.add_script_tag(path=AXE)
        bad = pg.evaluate("axe.run('main', {runOnly: ['wcag2a', 'wcag2aa']}).then(r => r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(', ')))")
        assert bad == [], bad
    assert not errors
    ctx.close()
