"""
Accessibility gate (axe-core in real Chromium).

Fails if a key page has ANY violation of the rules that lock screen-reader users out — unnamed form controls,
buttons, links, dialogs, missing page title / language / image alt — in either theme. Color contrast is tracked
separately and held to a ceiling (it is being burned down; the ceiling may only go DOWN).

    npm i --no-save axe-core          # once, in "Initial Deployment/"  (not shipped; Vercel ignores it)
    python3 -m pytest tests/test_a11y.py -q

Skips when axe-core or Chromium isn't available.
"""
import os
import sys
from pathlib import Path
from urllib.parse import quote

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
AXE_CANDIDATES = [
    os.environ.get("AXE_PATH", ""),
    str(ROOT / "node_modules" / "axe-core" / "axe.min.js"),
    str(ROOT.parent / "node_modules" / "axe-core" / "axe.min.js"),
]
AXE_FILE = next((p for p in AXE_CANDIDATES if p and os.path.exists(p)), None)
pytestmark = pytest.mark.skipif(AXE_FILE is None, reason="axe-core not installed (npm i --no-save axe-core)")

PAGES = [
    "html/home.html", "html/dashboard.html", "html/calculators.html", "html/track-finances.html", "html/net-worth.html",
    "html/retirement-planner.html", "html/tax.html", "html/settings.html", "html/portfolio.html", "html/markets.html",
    "html/financial-calendar.html", "calculators/investment & wealth/sip.html", "calculators/loans, debt & emi/emi.html",
    "calculators/retirement & life planning/retirement.html", "index.html", "login.html",
    "html/subscription-tracker.html", "html/money-score.html", "calculators/loans, debt & emi/prepayinvest.html", "calculators/tax & salary/offercompare.html",
]
MUST_BE_ZERO = ["label", "select-name", "button-name", "link-name", "aria-dialog-name", "image-alt", "document-title",
                "html-has-lang", "nested-interactive", "aria-required-attr", "aria-valid-attr-value", "duplicate-id-aria"]
CONTRAST_CEILING = 45           # nodes across all pages × both themes (596 before the Oct 2026 pass, 31 after). Only ever lower this.


@pytest.fixture(scope="module")
def results():
    out = {}
    axe = Path(AXE_FILE).read_text()
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        for theme in ("dark", "light"):
            ctx = browser.new_context(color_scheme=theme, viewport={"width": 1280, "height": 900})
            ctx.add_init_script(f"try{{localStorage.setItem('finos-theme','{theme}')}}catch(e){{}}")
            for path in PAGES:
                page = ctx.new_page()
                page.goto(f"{base}/{quote(path)}", wait_until="domcontentloaded")
                page.wait_for_timeout(1800)                       # let scripts (and finos-a11y) run
                page.evaluate(axe)
                out[(theme, path)] = page.evaluate(
                    "axe.run(document,{resultTypes:['violations']}).then(r=>r.violations.map(v=>({id:v.id,n:v.nodes.length,"
                    "t:v.nodes.slice(0,3).map(n=>n.target.join(' '))})))")
                page.close()
            ctx.close()
        browser.close()
    return out


@pytest.mark.parametrize("rule", MUST_BE_ZERO)
def test_rule_has_no_violations(results, rule):
    bad = [(k, v) for k, res in results.items() for v in res if v["id"] == rule]
    assert not bad, f"{rule}: " + "; ".join(f"{k[0]}/{k[1]} → {v['t']}" for k, v in bad[:6])


def test_contrast_stays_under_ceiling(results):
    n = sum(v["n"] for res in results.values() for v in res if v["id"] == "color-contrast")
    assert n <= CONTRAST_CEILING, f"{n} low-contrast nodes (ceiling {CONTRAST_CEILING})"
