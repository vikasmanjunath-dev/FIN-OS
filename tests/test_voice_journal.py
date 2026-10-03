"""Voice / quick-log journal: what each phrase is recorded as. Savings must not masquerade as income."""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

CASES = [
    ("spent 800 on food", "expense", "food"),
    ("SIP 5000", "saving", "investment"),
    ("invested 12000 in nifty", "saving", "investment"),
    ("saved 2000 for emergency", "saving", None),
    ("salary 80000", "income", "income"),
    ("received 2000 dividend from stock", "income", None),     # money IN wins over the 'stock' keyword
    ("got paid 15000 freelance", "income", "income"),
    ("petrol 1500", "expense", "transport"),
]


@pytest.fixture(scope="module")
def page():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        pg = browser.new_page()
        pg.goto(f"{base}/html/dashboard.html", wait_until="domcontentloaded")
        pg.wait_for_function("typeof window._finosQlLog === 'function'", timeout=15000)
        pg.wait_for_selector("#finos-ql-input", state="attached")
        yield pg
        browser.close()


@pytest.mark.parametrize("text,kind,category", CASES)
def test_phrase_is_classified(page, text, kind, category):
    page.evaluate("localStorage.removeItem('finos_transactions')")
    page.evaluate("t => { document.getElementById('finos-ql-input').value = t; window._finosQlLog(); }", text)
    txns = json.loads(page.evaluate("localStorage.getItem('finos_transactions')"))
    assert len(txns) == 1, txns
    assert txns[0]["type"] == kind, (text, txns[0])
    if category:
        assert txns[0]["category"] == category, (text, txns[0])


def test_budget_ignores_logged_savings_and_counts_logged_spending(page):
    page.evaluate("localStorage.removeItem('finos_transactions')")
    for t in ("spent 800 on food", "SIP 5000", "salary 80000"):
        page.evaluate("t => { document.getElementById('finos-ql-input').value = t; window._finosQlLog(); }", t)
    page.add_script_tag(url=page.url.split("/html/")[0] + "/js/finos-budget.js")
    out = page.evaluate("""() => { const t = FinosBudget.transactions(); return {kinds: t.map(x => x.kind).sort(), spend: FinosBudget.monthSpend(t, new Date().toISOString().slice(0,7)).total}; }""")
    assert out["kinds"] == ["expense", "income", "saving"], out
    assert out["spend"] == 800, out
