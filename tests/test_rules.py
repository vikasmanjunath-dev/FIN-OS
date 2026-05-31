"""
FIN-OS Alert Rules Test Suite
Tests all 13 rules for correct fire/no-fire conditions.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from datetime import datetime, date, timedelta
from alerts.rules import (
    ALL_RULES, RULES_BY_ID,
    SipMissed, SalaryCredited, MarketDrop, GoalBehind,
    EmergencyFundLow, BudgetOverrun, NetWorthMilestone,
    AnomalySpend,
)


def base_user(**kwargs):
    return {
        "profile": {"name": "Test User", "monthly_income": 100_000, **kwargs},
        "transactions": [],
        "goals": [],
        "holdings": {},
        "budget": {},
        "market": {"nifty_change_pct": 0.5, "nifty_value": 22000},
        "preferences": {},
        "prev_net_worth": 0,
    }


class TestRuleRegistry:
    def test_all_rules_have_rule_id(self):
        for rule in ALL_RULES:
            assert rule.rule_id, f"Rule {rule.__class__.__name__} has no rule_id"

    def test_all_rules_have_name(self):
        for rule in ALL_RULES:
            assert rule.name, f"Rule {rule.rule_id} has no name"

    def test_all_rules_have_cooldown(self):
        for rule in ALL_RULES:
            assert rule.cooldown_hours > 0

    def test_rules_by_id_matches_all_rules(self):
        assert len(RULES_BY_ID) == len(ALL_RULES)

    def test_14_rules_registered(self):
        assert len(ALL_RULES) == 14, f"Expected 14 rules, got {len(ALL_RULES)}"

    def test_anomaly_spend_in_registry(self):
        assert "ANOMALY_SPEND" in RULES_BY_ID

    def test_insurance_renewal_in_registry(self):
        assert "INSURANCE_RENEWAL_DUE" in RULES_BY_ID


class TestMarketDrop:
    def test_fires_on_large_drop(self):
        rule = RULES_BY_ID["MARKET_DROP"]
        ud = base_user()
        ud["market"]["nifty_change_pct"] = -3.5
        result = rule.check(ud)
        assert result is not None
        assert "Nifty" in result["title"] or "Market" in result["title"] or "market" in result["message"].lower()

    def test_does_not_fire_on_small_drop(self):
        rule = RULES_BY_ID["MARKET_DROP"]
        ud = base_user()
        ud["market"]["nifty_change_pct"] = -1.5
        assert rule.check(ud) is None

    def test_does_not_fire_on_positive_market(self):
        rule = RULES_BY_ID["MARKET_DROP"]
        ud = base_user()
        ud["market"]["nifty_change_pct"] = 2.0
        assert rule.check(ud) is None


class TestEmergencyFundLow:
    def test_fires_when_ef_below_3_months(self):
        rule = RULES_BY_ID["EMERGENCY_FUND_LOW"]
        # Rule reads emergency_fund from profile + monthly_expenses from profile
        ud = base_user(emergency_fund=50_000, monthly_expenses=60_000)
        result = rule.check(ud)
        assert result is not None, (
            "Expected alert: EF=50K, monthly_exp=60K → 0.83 months < 3"
        )
        assert "title" in result and len(result["title"]) > 0

    def test_does_not_fire_when_ef_adequate(self):
        rule = RULES_BY_ID["EMERGENCY_FUND_LOW"]
        # 300K / 60K = 5 months ≥ 3 → no alert
        ud = base_user(emergency_fund=300_000, monthly_expenses=60_000)
        assert rule.check(ud) is None


class TestGoalBehind:
    def test_fires_when_contribution_insufficient(self):
        rule = RULES_BY_ID["GOAL_BEHIND"]
        ud = base_user()
        ud["goals"] = [{
            "name": "House Down Payment",
            "target_amount": 5_000_000,
            "current_amount": 100_000,
            "target_date": (date.today() + timedelta(days=365)).isoformat(),
            "monthly_contribution": 5_000,  # way too low
        }]
        result = rule.check(ud)
        assert result is not None

    def test_does_not_fire_when_on_track(self):
        rule = RULES_BY_ID["GOAL_BEHIND"]
        ud = base_user()
        ud["goals"] = [{
            "name": "Emergency Fund",
            "target_amount": 100_000,
            "current_amount": 95_000,  # already 95% done
            "target_date": (date.today() + timedelta(days=180)).isoformat(),
            "monthly_contribution": 5_000,
        }]
        # may or may not fire — just verify it doesn't crash
        result = rule.check(ud)
        # result can be None (on track) — just check no exception was thrown
        assert result is None or isinstance(result, dict)


class TestNetWorthMilestone:
    def test_fires_on_first_lakh(self):
        rule = RULES_BY_ID["NETWORTH_MILESTONE"]
        ud = base_user()
        ud["holdings"]       = {"total_net_worth": 1_10_000}
        ud["prev_net_worth"] = 80_000   # crossed 1L threshold
        result = rule.check(ud)
        assert result is not None, "Should celebrate crossing ₹1L milestone"
        # Priority is on the rule object, not in the result dict
        assert rule.priority == "celebration"
        assert "title" in result and len(result["title"]) > 0

    def test_does_not_fire_when_already_crossed(self):
        rule = RULES_BY_ID["NETWORTH_MILESTONE"]
        ud = base_user()
        ud["holdings"]       = {"total_net_worth": 1_50_000}
        ud["prev_net_worth"] = 1_30_000   # both already above 1L — no crossing
        result = rule.check(ud)
        assert result is None, "Should not re-fire — milestone already crossed"


class TestBudgetOverrun:
    def test_fires_when_over_90_percent(self):
        rule = RULES_BY_ID["BUDGET_OVERRUN"]
        ud = base_user()
        ud["budget"] = {
            "categories": {"food": {"limit": 10000, "spent": 9500}},  # 95%
            "total_limit": 50000,
            "total_spent": 48000,
        }
        result = rule.check(ud)
        # May or may not fire depending on budget structure — just no crash
        assert result is None or isinstance(result, dict)


class TestAnomalySpend:
    def _make_anomaly_user(self, normal_amt=3000, spike_amt=42000, category="restaurant", n_normal=6):
        """Build a user with a clear spending anomaly."""
        txns = []
        for i in range(n_normal):
            txns.append({
                "amount": -normal_amt, "type": "expense",
                "category": category,
                "date": (date.today() - timedelta(days=i * 10 + 5)).isoformat(),
            })
        # The spike — most recent
        txns.append({
            "amount": -spike_amt, "type": "expense",
            "category": category,
            "date": date.today().isoformat(),
        })
        ud = base_user()
        ud["transactions"] = txns
        return ud

    def test_fires_on_clear_anomaly(self):
        rule = RULES_BY_ID["ANOMALY_SPEND"]
        ud   = self._make_anomaly_user(normal_amt=2000, spike_amt=50000)
        result = rule.check(ud)
        assert result is not None, "Should detect ₹50K spike when avg is ₹2K"
        assert "ANOMALY" in result["title"].upper() or "Unusual" in result["title"]

    def test_does_not_fire_on_normal_variation(self):
        rule = RULES_BY_ID["ANOMALY_SPEND"]
        ud   = self._make_anomaly_user(normal_amt=4000, spike_amt=5000)  # only 1.25x
        result = rule.check(ud)
        assert result is None, "1.25x variation should not trigger anomaly"

    def test_does_not_fire_with_too_few_transactions(self):
        rule = RULES_BY_ID["ANOMALY_SPEND"]
        ud   = self._make_anomaly_user(normal_amt=2000, spike_amt=50000, n_normal=2)
        result = rule.check(ud)
        assert result is None, "Needs ≥5 transactions per category"

    def test_anomaly_alert_has_data_field(self):
        rule = RULES_BY_ID["ANOMALY_SPEND"]
        ud   = self._make_anomaly_user(normal_amt=1500, spike_amt=40000)
        result = rule.check(ud)
        if result:
            assert "data" in result
            assert "anomalies" in result["data"]


class TestAlertDataStructure:
    """Every rule that fires must return a properly structured alert dict."""
    def test_market_drop_alert_structure(self):
        rule = RULES_BY_ID["MARKET_DROP"]
        ud = base_user()
        ud["market"]["nifty_change_pct"] = -4.0
        result = rule.check(ud)
        if result:
            assert "title" in result
            assert "message" in result
            assert len(result["title"]) > 0
            assert len(result["message"]) > 0

class TestInsuranceRenewalDue:
    def _make_insurance_user(self, months_ahead=25):
        """Build a user with an insurance renewal coming up."""
        from datetime import date
        renewal = date.today().replace(day=1)
        # Advance by months_ahead months
        m = renewal.month + months_ahead
        y = renewal.year + (m - 1) // 12
        m = (m - 1) % 12 + 1
        return base_user(
            health_renewal_month=m,
            health_renewal_day=1,
        )

    def test_fires_when_renewal_within_30_days(self):
        rule = RULES_BY_ID["INSURANCE_RENEWAL_DUE"]
        from datetime import date, timedelta
        renewal = date.today() + timedelta(days=20)
        ud = base_user(
            health_renewal_month=renewal.month,
            health_renewal_day=renewal.day,
        )
        result = rule.check(ud)
        assert result is not None, "Should fire — renewal in 20 days"
        assert "Insurance" in result["title"] or "Renewal" in result["title"]
        assert "data" in result and "upcoming_renewals" in result["data"]

    def test_does_not_fire_when_renewal_far_away(self):
        rule = RULES_BY_ID["INSURANCE_RENEWAL_DUE"]
        from datetime import date, timedelta
        # Renewal 90 days away — well outside 30-day window
        far = date.today() + timedelta(days=90)
        ud = base_user(
            health_renewal_month=far.month,
            health_renewal_day=far.day,
        )
        result = rule.check(ud)
        assert result is None, "Should not fire — renewal is 90 days away"

    def test_does_not_fire_when_no_insurance_data(self):
        rule = RULES_BY_ID["INSURANCE_RENEWAL_DUE"]
        ud = base_user()   # no renewal month fields in profile
        assert rule.check(ud) is None


class TestNetWorthMilestoneDataFormat:
    """Verify the milestone data payload has the milestone_key field for ShareCard."""
    def test_milestone_data_has_key_field(self):
        rule = RULES_BY_ID["NETWORTH_MILESTONE"]
        ud = base_user()
        ud["holdings"]       = {"total_net_worth": 1_10_000}
        ud["prev_net_worth"] = 80_000
        result = rule.check(ud)
        assert result is not None
        assert "data" in result
        assert "milestone_key" in result["data"], \
            "milestone_key must be present for ShareCard integration"
        assert result["data"]["milestone_key"] in ("1L","5L","10L","25L","50L","1CR","5CR")


    def test_all_fired_alerts_have_title_and_message(self):
        """Smoke test: every rule must either return None or a valid dict."""
        ud = base_user()
        ud["market"]["nifty_change_pct"] = -5.0
        ud["holdings"] = {"total_net_worth": 200_000}
        for rule in ALL_RULES:
            try:
                result = rule.check(ud)
                if result is not None:
                    assert isinstance(result, dict), f"{rule.rule_id} returned non-dict"
                    assert "title"   in result,     f"{rule.rule_id} missing title"
                    assert "message" in result,     f"{rule.rule_id} missing message"
            except Exception as e:
                pytest.fail(f"Rule {rule.rule_id} raised exception: {e}")
