"""alerts/health_score.py income classification (open item: _monthly_income counted ANY positive amount as income).

The transactions table stores every amount as a positive number, so "positive == income" turned every expense
into income and the couple / benchmark endpoints reported inflated income.  The rule now mirrors the website's
FinosBudget.normalize() (js/finos-budget.js); the parity test below runs that real file under node.
"""
import json
import os
from datetime import date
import random
import shutil
import subprocess
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from alerts.health_score import (  # noqa: E402
    MONTHLY_WINDOW_MONTHS, _monthly_emi, _monthly_expenses, _monthly_income, _monthly_window, _parse_dt, _tx_kind, window_start)


def row(amount, type_="expense", category="food", **kw):
    return {"amount": amount, "type": type_, "category": category, "date": "2026-10-01", **kw}


def test_expenses_with_positive_amounts_are_not_income():
    txns = [row(5000, "expense", "food"), row(12000, "expense", "rent"), row(800, "debit", "Transport")]
    assert _monthly_income(txns, {}) == 0


def test_income_is_averaged_over_real_calendar_months_not_halved():
    # two completed months (Aug, Sep) of 50,000 each -> 50,000 a month; the old "sum / 2" gave the same only by luck
    txns = [row(50000, "income", "salary", date="2026-08-31"), row(50000, "income", "salary", date="2026-09-30"), row(7000, "expense", "food")]
    assert _monthly_income(txns, {}, today=date(2026, 10, 16)) == 50000


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
    assert _monthly_income(txns, {}, today=date(2026, 10, 16)) == 40000      # only the credit counts; first month of data, divisor 1


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


# ── calendar-month window (replaces the assumed 60-day / 100-row "sum / 2") ─────────────────────────────────────────

TODAY = date(2026, 10, 16)


def test_window_start_is_the_first_day_of_the_oldest_month():
    assert MONTHLY_WINDOW_MONTHS == 3
    assert window_start(date(2026, 10, 16)) == date(2026, 7, 1)
    assert window_start(date(2026, 2, 3)) == date(2025, 11, 1)          # crosses a year boundary


def test_three_full_months_divide_by_three_and_the_current_month_is_left_out():
    txns = [row(30000, "income", "salary", date=d) for d in ("2026-07-31", "2026-08-31", "2026-09-30")]
    txns.append(row(90000, "income", "bonus", date="2026-10-05"))        # part-finished month: not in the average
    assert _monthly_income(txns, {}, today=TODAY) == 30000


def test_a_person_who_started_mid_window_is_not_diluted_by_months_before_their_first_row():
    txns = [row(30000, "income", "salary", date="2026-08-31"), row(30000, "income", "salary", date="2026-09-30")]
    assert _monthly_income(txns, {}, today=TODAY) == 30000              # 2 months (Aug, Sep), not 3
    assert _monthly_window(txns, TODAY)[1] == 2


def test_a_gap_month_inside_the_span_counts_as_zero():
    txns = [row(30000, "income", "salary", date="2026-07-31"), row(30000, "income", "salary", date="2026-09-30")]
    assert _monthly_income(txns, {}, today=TODAY) == 20000              # Jul, Aug (none), Sep


def test_rows_older_than_the_window_future_rows_and_undated_rows_are_ignored():
    txns = [row(99999, "income", "salary", date="2026-06-30"), row(30000, "income", "salary", date="2026-09-10"),
            row(88888, "income", "salary", date="2027-01-01"), row(77777, "income", "salary", date="not a date"),
            {"amount": 5, "type": "income"}]
    assert _monthly_income(txns, {}, today=TODAY) == 30000


def test_only_the_current_month_falls_back_to_that_month_so_far():
    txns = [row(25000, "income", "salary", date="2026-10-01"), row(4000, "expense", "food", date="2026-10-10")]
    assert _monthly_income(txns, {}, today=TODAY) == 25000
    assert _monthly_expenses(txns, today=TODAY) == 4000


def test_expenses_and_emi_use_the_same_window_and_empty_input_is_zero():
    txns = [row(12000, "expense", "emi", date="2026-08-05"), row(6000, "expense", "food", date="2026-09-05")]
    assert _monthly_expenses(txns, today=TODAY) == 9000                  # 18,000 over Aug and Sep
    assert _monthly_emi(txns, today=TODAY) == 6000
    assert _monthly_expenses([], today=TODAY) == _monthly_emi([], today=TODAY) == _monthly_income([], {}, today=TODAY) == 0


def test_timestamps_are_placed_in_the_right_month():
    assert _parse_dt("2026-09-30T23:59:00+05:30") == _parse_dt("2026-09-30")
    txns = [row(30000, "income", "salary", date="2026-09-30T23:59:00+05:30")]
    assert _monthly_income(txns, {}, today=TODAY) == 30000


def test_no_fixed_two_month_assumption_is_left_in_the_source():
    import re
    src = open(os.path.join(ROOT, "alerts", "health_score.py"), encoding="utf-8").read()
    assert not re.search(r"sum\([^\n]*\) / 2|\) / 2\s*$", src, re.M), "a '/ 2' monthly halving is back"
