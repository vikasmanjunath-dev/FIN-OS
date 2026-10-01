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
