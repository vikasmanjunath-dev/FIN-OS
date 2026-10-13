"""Computed-style baseline for the card components (.calc-card, .tool-card, .suite-card, .card).

Why this exists: card CSS is spread over calculators.css, components.css, theme.css, interactions.css and per-page
<style> blocks. Consolidating it is only safe if what the browser computes does not move. This pins the computed
style (resting and hover) of the first card of each kind on the pages that use it, in dark and light, on desktop and
phone widths.

A failure means a card now looks different. If that is intended, regenerate with:

    UPDATE_CARD_BASELINE=1 python3 -m pytest tests/test_card_styles.py

and review the diff of tests/fixtures/card-styles.json like any other design change.
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "card-styles.json")

CASES = [
    ("html/calculators.html", ".calc-card"),
    ("html/tools.html", ".tool-card"),
    ("html/track-finances.html", ".suite-card"),
    ("html/learn-indicators.html", ".tool-card"),
    ("html/decision.html", ".tool-card"),
    ("html/home.html", ".card"),
    ("html/markets.html", ".card"),
]
PROPS = [
    "background-color", "background-image", "border-top-color", "border-top-width", "border-top-style",
    "border-radius", "padding", "box-shadow", "color", "font-size", "font-weight", "line-height", "position",
    "text-decoration-line", "cursor", "transition-property", "transition-duration", "transform", "opacity",
    "display", "min-height", "margin-top",
]
THEMES = ["dark", "light"]
WIDTHS = [1280, 390]

READ = """(el, props) => {
  const cs = getComputedStyle(el), out = {};
  props.forEach(p => { out[p] = cs.getPropertyValue(p); });
  return out;
}"""


def snapshot(browser, base):
    result = {}
    for theme in THEMES:
        for width in WIDTHS:
            ctx = browser.new_context(viewport={"width": width, "height": 900}, reduced_motion="reduce",
                                      color_scheme=theme)
            ctx.add_init_script(
                f"try{{localStorage.setItem('theme','{theme}');localStorage.setItem('finos-theme','{theme}');}}catch(e){{}}")
            for rel, sel in CASES:
                page = ctx.new_page()
                page.goto(f"{base}/{rel}")
                page.wait_for_selector(sel, timeout=8000)
                page.wait_for_timeout(700)
                el = page.locator(sel).first
                el.scroll_into_view_if_needed()
                key = f"{theme}|{width}|{rel}|{sel}"
                entry = {"rest": el.evaluate(READ, PROPS)}
                entry["rest"]["data-theme"] = page.evaluate("document.documentElement.getAttribute('data-theme')") or ""
                if width >= 1000:
                    el.hover()
                    page.wait_for_timeout(600)
                    entry["hover"] = el.evaluate(READ, PROPS)
                result[key] = entry
                page.close()
            ctx.close()
    return result


@pytest.fixture(scope="module")
def current():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        data = snapshot(browser, base)
        browser.close()
    return data


def test_card_computed_styles_match_baseline(current):
    if os.environ.get("UPDATE_CARD_BASELINE"):
        os.makedirs(os.path.dirname(FIXTURE), exist_ok=True)
        with open(FIXTURE, "w", encoding="utf8") as f:
            json.dump(current, f, indent=1, sort_keys=True)
            f.write("\n")
        pytest.skip("baseline written")
    with open(FIXTURE, encoding="utf8") as f:
        baseline = json.load(f)
    assert sorted(baseline) == sorted(current), "the set of pages/themes/widths changed: regenerate the baseline"
    diffs = []
    for key, base_entry in baseline.items():
        for state, props in base_entry.items():
            for p, want in props.items():
                got = current[key][state].get(p)
                if got != want:
                    diffs.append(f"{key} [{state}] {p}: {want!r} -> {got!r}")
    assert not diffs, "card styles moved:\n" + "\n".join(diffs[:40])


def test_baseline_covers_every_card_kind(current):
    kinds = {k.split("|")[3] for k in current}
    assert kinds == {".calc-card", ".tool-card", ".suite-card", ".card"}
    # both themes really applied (guards against a baseline captured with the theme not taking effect)
    themes = {(k.split("|")[0], v["rest"]["data-theme"]) for k, v in current.items()}
    assert ("dark", "dark") in themes and ("light", "light") in themes, themes
