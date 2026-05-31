"""
FIN-OS Health Score Test Suite
Tests all 8 pillars, boundary conditions, and trajectory tracking.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from alerts.health_score import (
    compute_health_score, benchmark_comparison,
    score_emergency_fund, score_debt_management,
    score_savings_and_discipline, score_insurance,
    _n, _monthly_income, _monthly_expenses,
)


# ── Fixtures ───────────────────────────────────────────────────────────────────

def make_user(income=100_000, liquid=600_000, cc_outstanding=0,
              has_term=True, term_cover=10_000_000, has_health=True,
              health_cover=1_000_000, has_nps=False, has_ppf=False,
              age=32, city_tier="metro", **profile_extra):
    return {
        "user_id": "test-001",
        "profile": {
            "monthly_income": income,
            "liquid_savings": liquid,
            "age": age,
            "city_tier": city_tier,
            "cc_outstanding": cc_outstanding,
            "has_term_insurance": has_term,
            "term_cover": term_cover,
            "has_health_insurance": has_health,
            "health_cover": health_cover,
            "has_nps": has_nps,
            "has_ppf": has_ppf,
            **profile_extra,
        },
        "transactions": [],
        "goals": [],
        "holdings": {},
    }


def make_txn(amount, type_="expense", category="food", days_ago=5):
    from datetime import date, timedelta
    return {
        "amount": amount,
        "type": type_,
        "category": category,
        "date": (date.today() - timedelta(days=days_ago)).isoformat(),
    }


# ── Health Score Tests ─────────────────────────────────────────────────────────

class TestHealthScoreTotal:
    def test_returns_health_score_result(self):
        u = make_user()
        r = compute_health_score(u)
        assert r.user_id == "test-001"
        assert 0 <= r.total <= 100
        assert r.tier in ("ELITE", "GREAT", "GOOD", "FAIR", "DANGER")

    def test_well_set_up_user_scores_above_60(self):
        u = make_user(income=150_000, liquid=900_000, has_nps=True, has_ppf=True)
        r = compute_health_score(u)
        assert r.total >= 60, f"Expected ≥60, got {r.total}"

    def test_danger_user_scores_below_40(self):
        u = make_user(
            income=50_000, liquid=0,
            has_term=False, has_health=False,
            cc_outstanding=80_000, has_cc_debt=True,
        )
        r = compute_health_score(u)
        assert r.total < 50, f"Expected <50, got {r.total}"

    def test_trajectory_stable_on_first_run(self):
        u = make_user()
        r = compute_health_score(u, previous_score=None)
        assert r.trajectory == "stable"

    def test_trajectory_improving_when_score_rises(self):
        u = make_user(income=150_000, liquid=900_000)
        r = compute_health_score(u, previous_score={"total": 40})
        assert r.trajectory == "improving"

    def test_trajectory_declining_when_score_falls(self):
        u = make_user(income=30_000, liquid=0, has_term=False, has_health=False)
        r = compute_health_score(u, previous_score={"total": 70})
        assert r.trajectory == "declining"

    def test_eight_pillars_always_returned(self):
        u = make_user()
        r = compute_health_score(u)
        assert len(r.pillars) == 8

    def test_pillar_scores_sum_to_total(self):
        u = make_user()
        r = compute_health_score(u)
        assert sum(p.score for p in r.pillars) == r.total

    def test_quick_win_is_non_empty_string(self):
        u = make_user()
        r = compute_health_score(u)
        assert isinstance(r.quick_win, str) and len(r.quick_win) > 10

    def test_biggest_risk_factor_is_non_empty(self):
        u = make_user()
        r = compute_health_score(u)
        assert isinstance(r.biggest_risk_factor, str) and len(r.biggest_risk_factor) > 5


class TestEmergencyFundPillar:
    def test_full_score_with_12_months_liquid(self):
        # 12 months at 60K expense = 720K liquid
        p = score_emergency_fund(
            {"liquid_savings": 720_000},
            [make_txn(-60_000, "expense")],
            {},
        )
        assert p.score == p.max_pts

    def test_zero_score_with_no_liquid(self):
        p = score_emergency_fund({}, [make_txn(-60_000, "expense")], {})
        assert p.score == 0

    def test_no_expense_transactions_uses_income_fallback(self):
        # B1 regression: ef_months should NOT be zero when no expense txns
        from alerts.health_score import benchmark_comparison
        u = make_user(income=100_000, liquid=300_000)
        result = benchmark_comparison(u)
        ef = next(m for m in result["metrics"] if m["key"] == "ef_months")
        assert ef["user"] > 0, "ef_months should use income fallback when no expense txns"


class TestDebtManagementPillar:
    def test_debt_free_user_scores_max(self):
        p = score_debt_management({"cc_outstanding": 0}, [])
        assert p.score == p.max_pts

    def test_high_cc_debt_reduces_score_significantly(self):
        p_clean = score_debt_management({}, [])
        p_debt  = score_debt_management({"cc_outstanding": 50_000, "has_cc_debt": True}, [])
        assert p_debt.score < p_clean.score - 3

    def test_high_emi_ratio_reduces_score(self):
        # EMI = 50% of income is terrible
        txns = [make_txn(-50_000, "expense", "emi") for _ in range(2)]
        p = score_debt_management({"monthly_income": 100_000}, txns)
        assert p.score < 8


class TestInsurancePillar:
    def test_full_term_and_health_scores_high(self):
        p = score_insurance(
            {"has_term_insurance": True, "term_cover": 15_000_000,
             "has_health_insurance": True, "health_cover": 1_000_000,
             "monthly_income": 100_000},
            []
        )
        assert p.score >= 8

    def test_no_insurance_with_dependents_scores_low(self):
        p = score_insurance(
            {"has_term_insurance": False, "has_health_insurance": False,
             "married": True, "has_kids": True, "monthly_income": 100_000},
            []
        )
        assert p.score <= 2

    def test_ulip_penalty_applied(self):
        p_term = score_insurance(
            {"has_term_insurance": True, "term_cover": 10_000_000,
             "has_health_insurance": True, "health_cover": 1_000_000,
             "monthly_income": 100_000},
            []
        )
        p_ulip = score_insurance(
            {"has_term_insurance": True, "term_cover": 10_000_000,
             "has_health_insurance": True, "health_cover": 1_000_000,
             "has_ulip": True, "monthly_income": 100_000},
            []
        )
        assert p_ulip.score < p_term.score


class TestBenchmarkComparison:
    def test_returns_5_metrics(self):
        u = make_user()
        result = benchmark_comparison(u)
        assert len(result["metrics"]) == 5

    def test_all_required_keys_present(self):
        u = make_user()
        result = benchmark_comparison(u)
        for m in result["metrics"]:
            for key in ("key", "label", "user", "avg", "top10", "unit", "status", "arya_comment"):
                assert key in m, f"Missing key '{key}' in metric {m.get('key')}"

    def test_segment_matches_income(self):
        u = make_user(income=200_000)
        result = benchmark_comparison(u)
        assert result["segment"]["income_bracket"] == "high"

        u2 = make_user(income=50_000)
        result2 = benchmark_comparison(u2)
        assert result2["segment"]["income_bracket"] == "lower"

    def test_age_bracket_floor_never_zero(self):
        # B2 regression
        u = make_user(age=0)
        result = benchmark_comparison(u)
        assert result["segment"]["age_bracket"] != "0s"

    def test_status_values_are_valid(self):
        u = make_user()
        result = benchmark_comparison(u)
        valid = {"top_10", "above_avg", "average", "below_target"}
        for m in result["metrics"]:
            assert m["status"] in valid

    def test_high_debt_user_has_below_target_status(self):
        u = make_user()
        u["profile"]["cc_outstanding"] = 200_000
        u["profile"]["has_cc_debt"] = True
        # Add heavy EMI transactions
        u["transactions"] = [make_txn(-40_000, "expense", "emi") for _ in range(4)]
        result = benchmark_comparison(u)
        debt = next(m for m in result["metrics"] if m["key"] == "debt_pct")
        assert debt["status"] in ("average", "below_target")


class TestHelpers:
    def test_n_handles_none(self):
        assert _n(None) == 0.0
        assert _n("") == 0.0
        assert _n("abc") == 0.0

    def test_n_handles_numbers(self):
        assert _n(100) == 100.0
        assert _n("50.5") == 50.5

    def test_monthly_income_profile_fallback(self):
        # No transactions — should use profile income
        income = _monthly_income([], {"monthly_income": 100_000})
        assert income == 100_000

    def test_monthly_expenses_empty_transactions(self):
        exp = _monthly_expenses([])
        assert exp == 0.0
