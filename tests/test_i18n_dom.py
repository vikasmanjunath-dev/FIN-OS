"""finos-i18n.js against a real page: translates the shared chrome, leaves data alone, restores exactly, covers late-rendered UI."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def sidebar_labels(page):
    return page.evaluate("[...document.querySelectorAll('.sb-label')].map(e => e.textContent.trim())")


def test_saved_hindi_preference_translates_the_sidebar_on_load(env):
    base, browser = env
    ctx = browser.new_context()
    ctx.add_init_script("localStorage.setItem('finos_lang','hi')")
    page = ctx.new_page()
    page.goto(f"{base}/html/net-worth.html", wait_until="domcontentloaded")
    page.wait_for_function("window.FinosI18n && FinosI18n.lang() === 'hi'", timeout=15000)
    page.wait_for_timeout(500)
    labels = sidebar_labels(page)
    assert "होम" in labels and "डैशबोर्ड" in labels and "सेटिंग्स" in labels, labels
    assert page.evaluate("document.documentElement.lang") == "hi"
    assert "नेट वर्थ" in page.evaluate("document.querySelector('.page-header-title').textContent")
    ctx.close()


def test_switching_back_restores_english_exactly(env):
    base, browser = env
    ctx = browser.new_context()
    page = ctx.new_page()
    page.goto(f"{base}/html/net-worth.html", wait_until="domcontentloaded")
    page.add_script_tag(url=f"{base}/js/finos-i18n.js")
    original = page.evaluate("document.body.innerHTML.length")
    page.evaluate("FinosI18n.setLang('hi')")
    page.wait_for_function("FinosI18n.lang() === 'hi'")
    assert "होम" in sidebar_labels(page)
    page.evaluate("FinosI18n.setLang('en')")
    page.wait_for_function("FinosI18n.lang() === 'en'")
    assert "Home" in sidebar_labels(page)
    assert page.evaluate("document.documentElement.lang") == "en"
    assert page.evaluate("document.body.innerHTML.length") == original
    ctx.close()


def test_user_data_and_data_no_i18n_are_never_translated(env):
    base, browser = env
    ctx = browser.new_context()
    page = ctx.new_page()
    page.goto(f"{base}/html/net-worth.html", wait_until="domcontentloaded")
    page.add_script_tag(url=f"{base}/js/finos-i18n.js")
    page.evaluate("""() => {
        const a = document.createElement('div'); a.id = 'keep'; a.setAttribute('data-no-i18n', ''); a.textContent = 'Home'; document.body.appendChild(a);
        const t = document.createElement('textarea'); t.id = 'note'; t.value = 'Home'; t.textContent = 'Home'; document.body.appendChild(t);
        const p = document.createElement('p'); p.id = 'prose'; p.textContent = 'Home is where the SIP is'; document.body.appendChild(p);
    }""")
    page.evaluate("FinosI18n.setLang('hi')")
    page.wait_for_function("FinosI18n.lang() === 'hi'")
    assert page.text_content("#keep") == "Home"
    assert page.input_value("#note") == "Home"
    assert page.text_content("#prose") == "Home is where the SIP is"
    ctx.close()


def test_ui_rendered_after_the_switch_is_translated_too(env):
    base, browser = env
    ctx = browser.new_context()
    page = ctx.new_page()
    page.goto(f"{base}/html/net-worth.html", wait_until="domcontentloaded")
    page.add_script_tag(url=f"{base}/js/finos-i18n.js")
    page.evaluate("FinosI18n.setLang('hi')")
    page.wait_for_function("FinosI18n.lang() === 'hi'")
    page.evaluate("() => { const b = document.createElement('button'); b.id = 'late'; b.textContent = 'Save'; b.setAttribute('aria-label', 'Close'); document.body.appendChild(b); }")
    page.wait_for_function("document.getElementById('late').textContent === 'सहेजें'", timeout=3000)
    assert page.get_attribute("#late", "aria-label") == "बंद करें"
    ctx.close()


def test_settings_page_has_a_working_language_picker(env):
    base, browser = env
    ctx = browser.new_context()
    page = ctx.new_page()
    page.goto(f"{base}/html/settings.html", wait_until="domcontentloaded")
    page.wait_for_selector("#uiLangSelect", state="attached")
    page.select_option("#uiLangSelect", "hi")
    page.wait_for_function("localStorage.getItem('finos_lang') === 'hi'", timeout=5000)
    page.wait_for_timeout(600)
    assert "सेटिंग्स" in sidebar_labels(page)
    ctx.close()


def test_a_page_that_includes_the_engine_itself_still_applies_the_saved_language(env):
    """settings.html loads finos-i18n.js directly; the saved language must still be applied on load."""
    base, browser = env
    ctx = browser.new_context()
    ctx.add_init_script("localStorage.setItem('finos_lang', 'hi');")
    pg = ctx.new_page()
    pg.goto(f"{base}/html/settings.html", wait_until="load")
    pg.wait_for_function("window.FinosI18n && FinosI18n.lang() === 'hi' && document.documentElement.lang === 'hi'", timeout=10000)
    ctx.close()


def test_calculator_pages_apply_the_saved_language_and_load_the_engine_once(env):
    """The calculators do not load pwa-init.js; the widget starts the engine for them. Loading it twice would double-apply."""
    base, browser = env
    ctx = browser.new_context()
    ctx.add_init_script("localStorage.setItem('finos_lang', 'hi');")
    page = ctx.new_page()
    requests = []
    page.on("request", lambda r: requests.append(r.url))
    page.goto(f"{base}/calculators/investment%20%26%20wealth/sip.html", wait_until="load")
    page.wait_for_function("window.FinosI18n && FinosI18n.lang() === 'hi' && document.documentElement.lang === 'hi'", timeout=10000)
    assert len([u for u in requests if u.split("?")[0].endswith("/js/finos-i18n.js")]) == 1
    assert len([u for u in requests if u.split("?")[0].endswith("/js/i18n/hi.js")]) == 1
    ctx.close()


def test_english_calculator_visitors_never_download_the_engine(env):
    base, browser = env
    ctx = browser.new_context()
    page = ctx.new_page()
    requests = []
    page.on("request", lambda r: requests.append(r.url))
    page.goto(f"{base}/calculators/investment%20%26%20wealth/sip.html", wait_until="load")
    page.wait_for_timeout(500)
    assert not [u for u in requests if "finos-i18n" in u or "/i18n/hi.js" in u]
    ctx.close()


def test_calculator_results_in_hindi_keep_their_numbers_and_translate_the_label(env):
    base, browser = env
    ctx = browser.new_context()
    ctx.add_init_script("localStorage.setItem('finos_lang', 'hi');")
    page = ctx.new_page()
    page.goto(f"{base}/calculators/banking%20%26%20fixed%20income/fd.html", wait_until="load")
    page.wait_for_function("window.FinosI18n && FinosI18n.lang() === 'hi'", timeout=10000)
    page.wait_for_timeout(800)
    texts = page.evaluate("[...document.querySelectorAll('body *')].filter(e => e.children.length === 0).map(e => e.textContent.trim()).filter(t => /परिपक्वता|Maturity:/.test(t))")
    assert any(t.startswith("परिपक्वता: ₹") for t in texts), texts
    assert not any(t.startswith("Maturity:") for t in texts), texts
    assert page.evaluate("document.title.length > 0")
    ctx.close()
