"""Contrast healer: text under CSS opacity is corrected (colour first, opacity only if it must), and dark theme restores it exactly."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
HEALER = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "js", "finos-contrast.js")

PAGE = """<!doctype html><html data-theme="light"><head><meta charset="utf-8"><style>body{background:#f4f6fb;margin:20px}</style></head><body>
<p id="faint"   style="color:#0b0d12;opacity:.55;font-size:16px">Secondary text (black at 55% opacity)</p>
<p id="mid"     style="color:rgb(20,110,50);opacity:.85;font-size:16px">Green at 85% opacity</p>
<p id="fine"    style="color:#1a1a2e;font-size:16px">Already readable</p>
<p id="invis"   style="color:#000;opacity:.1;font-size:16px">Decorative watermark</p>
<p id="reveal"  style="color:#0b0d12;opacity:.3;font-size:16px">Scroll-reveal start state (opacity .3, no transition yet)</p>
<p id="fade"    style="color:#0b0d12;opacity:.6;transition:opacity .4s ease;font-size:16px">Has an opacity transition (hover / reveal effect)</p>
<p id="anim"    style="color:#0b0d12;opacity:.6;animation:pulse 3s infinite;font-size:16px">Running animation</p>
<style>@keyframes pulse{0%,100%{opacity:.6}50%{opacity:.7}}</style>
<div style="opacity:.5"><span id="nested" style="color:#556070;font-size:16px">Nested under a 50% parent</span></div>
</body></html>"""

# effective rendered contrast of an element: colour × (own opacity × ancestors') over the background
SEEN = """(id) => {
  const el = document.getElementById(id), bg = {r:244,g:246,b:251,a:1}; let op = 1;
  for (let e = el; e; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity);
  const c = FinosContrast.parse(getComputedStyle(el).color);
  return FinosContrast.contrast(FinosContrast.over({r:c.r,g:c.g,b:c.b,a:c.a*op}, bg), bg);
}"""


@pytest.fixture()
def page():
    with pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        pg = browser.new_page()
        pg.set_content(PAGE)
        pg.add_script_tag(path=HEALER)
        pg.wait_for_function("document.getElementById('faint').hasAttribute('data-fc-orig')", timeout=5000)
        yield pg
        browser.close()


def test_every_readable_text_reaches_aa_after_opacity(page):
    for el in ("faint", "mid", "fine", "nested"):
        ratio = page.evaluate(SEEN, el)
        assert ratio >= 4.5, f"#{el} renders at {ratio:.2f}:1"


def test_colour_is_tried_first_and_opacity_is_raised_only_when_it_must_be(page):
    assert page.evaluate("document.getElementById('mid').hasAttribute('data-fc-op')") is False      # a darker green was enough
    assert page.evaluate("document.getElementById('faint').hasAttribute('data-fc-op')") is True       # no colour is dark enough at 40%
    raised = float(page.evaluate("document.getElementById('faint').style.opacity"))
    assert 0.55 < raised <= 0.9                                                                        # a small nudge, not forced to 1


def test_untouched_cases(page):
    assert page.evaluate("document.getElementById('fine').hasAttribute('data-fc-orig')") is False     # already passes
    assert page.evaluate("document.getElementById('invis').hasAttribute('data-fc-orig')") is False    # decorative
    assert page.evaluate("document.getElementById('invis').style.opacity") == "0.1"
    for el, op in (("reveal", "0.3"), ("fade", "0.6"), ("anim", "0.6")):
        # pre-reveal start states and anything with an opacity transition/animation are transient: never frozen by an inline override
        assert page.evaluate(f"document.getElementById('{el}').hasAttribute('data-fc-orig')") is False, el
        assert page.evaluate(f"document.getElementById('{el}').hasAttribute('data-fc-op')") is False, el
        assert page.evaluate(f"document.getElementById('{el}').style.opacity") == op, el


def test_dark_theme_restores_colour_and_opacity_exactly(page):
    page.evaluate("document.documentElement.setAttribute('data-theme','dark')")
    page.wait_for_function("!document.getElementById('faint').hasAttribute('data-fc-orig')", timeout=5000)
    assert page.evaluate("document.querySelectorAll('[data-fc-orig],[data-fc-op]').length") == 0
    # the browser re-serialises the style attribute, so compare the properties themselves
    assert page.evaluate("[document.getElementById('faint').style.color, document.getElementById('faint').style.opacity]") == ["rgb(11, 13, 18)", "0.55"]
    assert page.evaluate("[document.getElementById('mid').style.color, document.getElementById('mid').style.opacity]") == ["rgb(20, 110, 50)", "0.85"]
    assert page.evaluate("document.querySelector('div[style]').style.opacity") == "0.5"      # the parent we raised is restored too
    # and back to light: healed again
    page.evaluate("document.documentElement.setAttribute('data-theme','light')")
    page.wait_for_function("document.getElementById('faint').hasAttribute('data-fc-orig')", timeout=5000)
    assert page.evaluate(SEEN, "faint") >= 4.5
