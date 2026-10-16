"""alerts/health_score.py income classification (open item: _monthly_income counted ANY positive amount as income).

The transactions table stores every amount as a positive number, so "positive == income" turned every expense
into income and the couple / benchmark endpoints reported inflated income.  The rule now mirrors the website's
FinosBudget.normalize() (js/finos-budget.js); the parity test below runs that real file under node.
"""
import json
import os
import random
import shutil
import subprocess
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from alerts.health_score import _monthly_income, _tx_kind  # noqa: E402


def row(amount, type_="expense", category="food", **kw):
    return {"amount": amount, "type": type_, "category": category, "date": "2026-10-01", **kw}


def test_expenses_with_positive_amounts_are_not_income():
    txns = [row(5000, "expense", "food"), row(12000, "expense", "rent"), row(800, "debit", "Transport")]
    assert _monthly_income(txns, {}) == 0


def test_income_rows_are_halved_over_the_60_day_window():
    txns = [row(50000, "income", "salary"), row(50000, "income", "salary"), row(7000, "expense", "food")]
    assert _monthly_income(txns, {}) == 50000


def test_credit_rows_count_and_investments_do_not():
    txns = [
        row(40000, "credit", "Salary"),
        row(10000, "income", "SIP"),          # voice journal tags a SIP as type income: it is money going out
        row(2000, "expense", "invest_mf"),
        row(900, "debit", "Food & Dining"),
    ]
    assert _tx_kind(txns[0]) == "income"
    assert _tx_kind(txns[1]) == "saving"
    assert _tx_kind(txns[2]) == "saving"
    assert _monthly_income(txns, {}) == 20000


def test_profile_income_still_wins_when_larger():
    txns = [row(10000, "income", "salary")]
    assert _monthly_income(txns, {"monthly_income": 90000}) == 90000


def test_garbage_rows_do_not_crash():
    junk = [None, 5, "x", {}, {"amount": "abc"}, {"amount": None, "type": None, "category": 7}, {"type": ["income"]}]
    assert _monthly_income(junk, {}) == 0


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_kind_matches_the_website_normalize_on_a_random_corpus():
    rnd = random.Random(7)
    types = ["", "income", "Income", "credit", "CREDIT", "debit", "expense", "need_food", "save_sip", "salary", "want_fun", None]
    cats = ["", "salary", "Salary", "food", "Food & Dining", "SIP", "invest_mf", "save_emergency", "bonus", "refund", "Dividend",
            "interest credit", "rent", "ppf", "stock tips", "Income", "freelance", "grocery", None, "Transport"]
    labels = ["", "Salary Oct", "salary credited", "lunch", "mutual fund", "rent"]
    rows = []
    for i in range(600):
        r = {"id": i, "amount": rnd.choice([1, 50, 1200, 45000]), "date": "2026-10-02",
             "type": rnd.choice(types), "category": rnd.choice(cats), "label": rnd.choice(labels)}
        rows.append({k: v for k, v in r.items() if v is not None})
    js = (
        "const B=require(process.argv[1]);const rows=JSON.parse(require('fs').readFileSync(0,'utf8'));"
        "console.log(JSON.stringify(rows.map(r=>{const n=B.normalize(r);return n?n.kind:null;})));"
    )
    out = subprocess.run(["node", "-e", js, os.path.join(ROOT, "js", "finos-budget.js")],
                         input=json.dumps(rows), capture_output=True, text=True, check=True).stdout
    web = json.loads(out)
    diffs = []
    for r, w in zip(rows, web):
        py = _tx_kind(r)
        # type 'salary' is the one documented extension (see health_score._tx_kind); the website calls it an expense
        if str(r.get("type") or "").lower() == "salary" and py == "income" and w == "expense":
            continue
        if py != w:
            diffs.append((r, py, w))
    assert not diffs, diffs[:5]
