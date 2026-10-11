"""html/privacy.html and html/terms.html: generated from the audited registry, consent that is off by default and easy to withdraw,
honest about what is not set yet, and linked from the places that used to point at '#'."""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AXE = os.path.join(ROOT, "node_modules", "axe-core", "axe.min.js")


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def open_page(env, name="privacy", width=1280, init=None, theme="dark"):
    base, browser = env
    ctx = browser.new_context(viewport={"width": width, "height": 900})
    ctx.add_init_script(f"localStorage.setItem('finos-theme', '{theme}')")
    if init:
        ctx.add_init_script(init)
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{base}/html/{name}.html", wait_until="domcontentloaded")
    pg.wait_for_selector("h1")
    return ctx, pg, errors


def test_the_page_lists_every_registry_flow_and_only_the_data_carrying_ones_are_tagged(env):
    ctx, pg, errors = open_page(env)
    pg.wait_for_selector("#pv-flows .pv-flow")
    flows = pg.evaluate("window.FinosPrivacy.FLOWS.filter(f => f.id !== 'standards').map(f => ({id: f.id, title: f.title, personal: f.personal, kind: f.kind}))")
    assert len(flows) >= 10
    for f in flows:
        card = pg.locator(f"#flow-{f['id']}")
        assert card.count() == 1 and f["title"] in card.inner_text(), f["id"]
        tagged = "Includes your data" in card.inner_text()
        assert tagged == (f["personal"] and f["kind"] != "device"), f["id"]          # only account sync and the local AI services
    assert "Stays on your device" in pg.locator("#flow-device").inner_text()
    assert "allorigins.win" in pg.locator("#flow-proxy").inner_text()                # the third-party relay is not hidden
    assert not errors
    ctx.close()


def test_consent_is_off_by_default_can_be_given_and_withdrawn_and_is_remembered(env):
    ctx, pg, errors = open_page(env)
    boxes = pg.locator("#pv-consents input[type=checkbox]")
    assert boxes.count() == 2
    assert not any(boxes.nth(i).is_checked() for i in range(2))
    assert "never turned this on" in pg.inner_text("#pv-consents")
    assert pg.evaluate("localStorage.getItem('finos_consents')") is None             # visiting the page records nothing
    pg.check("#pv-c-feedback")
    assert "Turned on" in pg.inner_text("#pv-status")
    rec = json.loads(pg.evaluate("localStorage.getItem('finos_consents')"))
    assert rec["feedback"]["granted"] is True and "usage" not in rec                  # one yes never implies another
    pg.reload(wait_until="domcontentloaded")
    pg.wait_for_selector("#pv-consents input")
    assert pg.is_checked("#pv-c-feedback") and not pg.is_checked("#pv-c-usage")
    pg.uncheck("#pv-c-feedback")                                                      # as easy to withdraw as to give
    assert "Turned off" in pg.inner_text("#pv-status")
    assert json.loads(pg.evaluate("localStorage.getItem('finos_consents')"))["feedback"]["granted"] is False
    assert not errors
    ctx.close()


def test_switch_all_off_withdraws_everything(env):
    ctx, pg, errors = open_page(env)
    pg.check("#pv-c-feedback")
    pg.check("#pv-c-usage")
    pg.click("#pv-withdraw")
    assert not pg.is_checked("#pv-c-feedback") and not pg.is_checked("#pv-c-usage")
    assert pg.evaluate("window.FinosPrivacy.PURPOSES.every(p => window.FinosPrivacy.consent.get(p.id) === false)")
    assert "switched off" in pg.inner_text("#pv-status")
    ctx.close()


def test_if_the_choice_cannot_be_saved_the_switch_snaps_back_and_says_so(env):
    boom = "const _s = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'finos_consents') throw new Error('quota'); return _s.apply(this, arguments); };"
    ctx, pg, errors = open_page(env, init=boom)
    pg.click("#pv-c-feedback")                                                          # click, not check(): check() insists the state changed, and here it must not
    assert not pg.is_checked("#pv-c-feedback")                                         # never shows "on" for something that was not recorded
    assert "Nothing was changed" in pg.inner_text("#pv-status")
    ctx.close()


def test_business_details_are_honestly_unset_and_both_pages_are_marked_draft(env):
    ctx, pg, errors = open_page(env)
    ent = pg.inner_text("#pv-entity")
    assert ent.count("Not set yet") == 4
    assert "Draft for legal review" in pg.inner_text(".pv-draft")
    ctx.close()
    ctx, pg, errors = open_page(env, "terms")
    assert "Draft for legal review" in pg.inner_text(".pv-draft")
    text = pg.inner_text("main")
    assert "not SEBI registered" in text and "not advice" in text.lower()
    assert text.count("To be added before launch") + text.count("To be written by") + text.count("To be set by") >= 3
    assert not errors
    ctx.close()


def test_the_dead_links_on_the_landing_and_login_pages_now_lead_somewhere(env):
    base, browser = env
    ctx = browser.new_context()
    pg = ctx.new_page()
    for page, expected in (("index.html", ("html/privacy.html", "html/terms.html")), ("login.html", ("html/privacy.html", "html/terms.html"))):
        pg.goto(f"{base}/{page}", wait_until="domcontentloaded")
        hrefs = pg.locator("a").evaluate_all("els => els.map(e => e.getAttribute('href'))")
        for target in expected:
            assert target in hrefs, (page, target)
            assert pg.request.get(f"{base}/{target}").status == 200
    # no Privacy/Terms link on either page may still be a placeholder
    for page in ("index.html", "login.html"):
        pg.goto(f"{base}/{page}", wait_until="domcontentloaded")
        bad = pg.evaluate("[...document.querySelectorAll('a')].filter(a => /privacy|terms/i.test(a.innerText) && a.getAttribute('href') === '#').length")
        assert bad == 0, page
    pg.goto(f"{base}/html/settings.html", wait_until="domcontentloaded")
    assert pg.locator("a[href='privacy.html']").count() >= 1
    ctx.close()


@pytest.mark.parametrize("name", ["privacy", "terms"])
@pytest.mark.parametrize("theme", ["dark", "light"])
def test_pages_fit_a_phone_and_pass_axe(env, name, theme):
    ctx, pg, errors = open_page(env, name, width=375, theme=theme)
    pg.wait_for_timeout(300)
    assert pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), f"{name} overflows a phone"
    if os.path.exists(AXE):
        pg.add_script_tag(path=AXE)
        bad = pg.evaluate("axe.run('main', {runOnly: ['wcag2a', 'wcag2aa']}).then(r => r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(', ')))")
        assert bad == [], bad
    assert not errors
    ctx.close()
