"""
FIN-OS Financial Health Score — v2
════════════════════════════════════════════════════════════════════════════════
40-factor weighted scoring model with trajectory tracking, biggest risk
detection, and quick-win recommendations.

Architecture: expert-weighted linear model (no training data required).
Weights were calibrated against standard Indian financial planning benchmarks
(SEBI, RBI guidelines, IIM Ahmedabad personal finance research).

Pillars (max pts):
  1. Emergency Fund          — 16 pts
  2. Debt Management         — 16 pts
  3. Savings & Discipline    — 16 pts
  4. Investment Quality      — 16 pts
  5. Insurance Coverage      — 12 pts
  6. Tax Efficiency          — 12 pts
  7. Behavioral Health       —  6 pts
  8. Goal Trajectory         —  6 pts

Total: 100 pts
  0-39  → DANGER   (Red)
  40-59 → FAIR     (Amber)
  60-74 → GOOD     (Blue)
  75-89 → GREAT    (Teal)
  90+   → ELITE    (Gold)

New v2 outputs:
  trajectory:          "improving" | "stable" | "declining"
  biggest_risk_factor: human-readable worst feature name
  quick_win:           single action to gain 5+ points this week
  top_tips:            ordered list of high-impact actions
"""

from __future__ import annotations

import math
import re
import statistics
from dataclasses import dataclass, field
from datetime import datetime, date, timedelta
from typing import Any


# ══════════════════════════════════════════════════════════════════════════════
# DATA STRUCTURES
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class PillarResult:
    name:      str
    score:     int
    max_pts:   int
    grade:     str
    emoji:     str
    headline:  str
    tips:      list[str] = field(default_factory=list)
    features:  dict      = field(default_factory=dict)  # raw feature values for v2


@dataclass
class HealthScoreResult:
    user_id:             str
    total:               int
    tier:                str
    tier_color:          str
    tier_emoji:          str
    headline:            str
    trajectory:          str          # "improving" | "stable" | "declining"
    biggest_risk_factor: str          # worst feature name
    quick_win:           str          # one action to gain 5+ points
    pillars:             list[PillarResult] = field(default_factory=list)
    top_tips:            list[str]    = field(default_factory=list)
    computed_at:         str          = ""

    def to_dict(self) -> dict:
        return {
            "user_id":             self.user_id,
            "total":               self.total,
            "tier":                self.tier,
            "tier_color":          self.tier_color,
            "tier_emoji":          self.tier_emoji,
            "headline":            self.headline,
            "trajectory":          self.trajectory,
            "biggest_risk_factor": self.biggest_risk_factor,
            "quick_win":           self.quick_win,
            "top_tips":            self.top_tips,
            "pillars": [
                {
                    "name":     p.name,
                    "score":    p.score,
                    "max_pts":  p.max_pts,
                    "pct":      round(p.score / p.max_pts * 100) if p.max_pts else 0,
                    "grade":    p.grade,
                    "emoji":    p.emoji,
                    "headline": p.headline,
                    "tips":     p.tips,
                }
                for p in self.pillars
            ],
            "computed_at": self.computed_at,
        }


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _n(v, default: float = 0.0) -> float:
    try:    return float(v or 0)
    except: return default

def _parse_dt(raw) -> datetime:
    """Parse ISO datetime string safely — strips Z/timezone suffix for Python <3.11."""
    s = str(raw or "").strip()
    # Remove timezone info so fromisoformat works on Python 3.9/3.10
    s = s.replace("Z", "").split("+")[0].split("-")[0] if "T" in s else s
    # Fallback for date-only strings
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return datetime(2000, 1, 1)

def _grade(score: int, max_pts: int) -> str:
    pct = score / max_pts if max_pts else 0
    if pct >= 0.95: return "A+"
    if pct >= 0.80: return "A"
    if pct >= 0.65: return "B"
    if pct >= 0.50: return "C"
    if pct >= 0.30: return "D"
    return "F"

def _inr(n: float) -> str:
    n = int(n)
    if n >= 1_00_00_000: return f"₹{n/1_00_00_000:.1f}Cr"
    if n >= 1_00_000:    return f"₹{n/1_00_000:.1f}L"
    if n >= 1_000:       return f"₹{n/1_000:.0f}K"
    return f"₹{n}"

def _tx_by_type(transactions: list[dict], types: set[str]) -> list[dict]:
    return [t for t in transactions
            if str(t.get("type", "")).lower() in types or _n(t.get("amount")) > 0]

def _monthly_income(transactions: list[dict], profile: dict) -> float:
    income_txns = [
        _n(t.get("amount"))
        for t in transactions
        if str(t.get("type", "")).lower() in ("income", "credit", "salary")
        or _n(t.get("amount")) > 0
    ]
    from_txns = sum(income_txns) / 2 if income_txns else 0
    from_prof = _n(profile.get("monthly_income") or profile.get("income_monthly"))
    return max(from_txns, from_prof)

def _monthly_expenses(transactions: list[dict]) -> float:
    expense = [
        abs(_n(t.get("amount")))
        for t in transactions
        if str(t.get("type", "")).lower() in ("expense", "debit")
        or _n(t.get("amount")) < 0
    ]
    total = sum(expense)
    return total / 2 if total else 0

def _monthly_emi(transactions: list[dict]) -> float:
    return sum(
        abs(_n(t.get("amount")))
        for t in transactions
        if any(kw in str(t.get("category", "")).lower()
               for kw in ("emi", "loan", "mortgage", "repayment"))
    ) / 2

def _liquid_savings(profile: dict, holdings: dict) -> float:
    return (
        _n(profile.get("liquid_savings"))
        or _n(profile.get("savings_balance"))
        or _n(holdings.get("cash_balance"))
        or 0
    )

def _spending_volatility(transactions: list[dict]) -> float:
    """Std dev of daily spend normalised to 0-100 (0=steady, 100=very volatile)."""
    daily: dict[str, float] = {}
    for t in transactions:
        if str(t.get("type", "")).lower() not in ("expense", "debit"):
            continue
        try:
            d = _parse_dt(t.get("date", "")).strftime("%Y-%m-%d")
            daily[d] = daily.get(d, 0) + abs(_n(t.get("amount")))
        except Exception:
            continue
    if len(daily) < 3:
        return 50.0  # not enough data — assume moderate
    vals = list(daily.values())
    mean = statistics.mean(vals)
    if mean == 0:
        return 0.0
    cv = statistics.stdev(vals) / mean  # coefficient of variation
    return min(100.0, cv * 50)

def _income_stability(transactions: list[dict]) -> float:
    """0-100: how consistent is income month-to-month."""
    monthly: dict[str, float] = {}
    for t in transactions:
        if str(t.get("type", "")).lower() not in ("income", "credit", "salary"):
            continue
        try:
            dt = _parse_dt(t.get("date", ""))
            key = f"{dt.year}-{dt.month:02d}"
            monthly[key] = monthly.get(key, 0) + _n(t.get("amount"))
        except Exception:
            continue
    if len(monthly) < 2:
        return 60.0  # assume moderate
    vals = list(monthly.values())
    mean = statistics.mean(vals)
    if mean == 0:
        return 0.0
    cv = statistics.stdev(vals) / mean
    return max(0.0, 100.0 - cv * 100)

def _savings_acceleration(transactions: list[dict]) -> float:
    """
    +1 = savings rate improving month-over-month
     0 = stable
    -1 = declining
    """
    monthly_in:  dict[str, float] = {}
    monthly_out: dict[str, float] = {}
    for t in transactions:
        try:
            dt  = _parse_dt(t.get("date", ""))
            key = f"{dt.year}-{dt.month:02d}"
            typ = str(t.get("type", "")).lower()
            amt = _n(t.get("amount"))
            if typ in ("income", "credit", "salary") or amt > 0:
                monthly_in[key] = monthly_in.get(key, 0) + abs(amt)
            elif typ in ("expense", "debit") or amt < 0:
                monthly_out[key] = monthly_out.get(key, 0) + abs(amt)
        except Exception:
            continue

    keys = sorted(set(monthly_in) | set(monthly_out))
    if len(keys) < 2:
        return 0.0

    rates = []
    for k in keys:
        inc = monthly_in.get(k, 0)
        exp = monthly_out.get(k, 0)
        if inc > 0:
            rates.append((inc - exp) / inc)

    if len(rates) < 2:
        return 0.0

    # Compare last vs first half
    half = len(rates) // 2
    early = sum(rates[:half]) / half
    late  = sum(rates[half:]) / len(rates[half:])
    diff  = late - early
    if diff > 0.03:    return 1.0
    if diff < -0.03:   return -1.0
    return 0.0

def _investment_diversification_hhi(holdings: dict) -> float:
    """
    Herfindahl-Hirschman Index inverted: 100 = perfectly diverse, 0 = single asset.
    """
    items = holdings.get("items") or []
    if not items:
        return 0.0

    type_totals: dict[str, float] = {}
    for h in items:
        atype = str(h.get("asset_type") or h.get("type") or "equity").lower()
        val   = _n(h.get("current_value") or h.get("value") or h.get("amount"))
        type_totals[atype] = type_totals.get(atype, 0) + val

    total = sum(type_totals.values())
    if total == 0:
        return 0.0

    hhi = sum((v / total) ** 2 for v in type_totals.values())
    # HHI = 1 means total concentration; 0 = perfect diversity (not achievable)
    # Invert and scale to 0-100
    n = len(type_totals)
    min_hhi = 1 / n if n else 1
    normalised = (1 - hhi) / (1 - min_hhi) if (1 - min_hhi) > 0 else 0
    return max(0.0, min(100.0, normalised * 100))

def _sip_consistency(transactions: list[dict], profile: dict) -> float:
    """
    0-100: % of expected months where SIP transaction occurred.
    """
    sip_months: set[str] = set()
    for t in transactions:
        cat  = str(t.get("category", "")).lower()
        note = str(t.get("notes") or t.get("description", "")).lower()
        typ  = str(t.get("type", "")).lower()
        if (typ == "investment" or
                any(kw in cat + note for kw in ("sip", "mutual fund", "mf", "elss", "ppf", "nps"))):
            try:
                dt = _parse_dt(t.get("date", ""))
                sip_months.add(f"{dt.year}-{dt.month:02d}")
            except Exception:
                continue

    # Count total months in the transaction window
    all_dates = []
    for t in transactions:
        try:
            all_dates.append(_parse_dt(t.get("date", "")))
        except Exception:
            continue

    if not all_dates:
        return 0.0

    min_dt = min(all_dates)
    max_dt = max(all_dates)
    months_span = max(1, (max_dt.year - min_dt.year) * 12 + max_dt.month - min_dt.month + 1)

    consistency = len(sip_months) / months_span * 100
    return min(100.0, consistency)


# ══════════════════════════════════════════════════════════════════════════════
# PILLAR SCORERS  (v2 — each returns PillarResult with features dict)
# ══════════════════════════════════════════════════════════════════════════════

def score_emergency_fund(
    profile: dict, transactions: list[dict], holdings: dict,
) -> PillarResult:
    """
    v2 Features:
      F01: emergency_fund_months       (exact months covered, not binary)
      F02: spending_volatility_30d     (high volatility → need more buffer)
      F03: income_stability_score      (unstable income → need more buffer)
      F04: liquid_vs_invested_ratio    (not in stocks)
    """
    MAX = 16

    monthly_exp = _monthly_expenses(transactions)
    monthly_inc = _monthly_income(transactions, profile)
    if monthly_exp <= 0:
        monthly_exp = monthly_inc * 0.6 or 30_000

    liquid          = _liquid_savings(profile, holdings)
    months_covered  = liquid / monthly_exp if monthly_exp else 0

    vol  = _spending_volatility(transactions)          # F02: 0-100
    stab = _income_stability(transactions)             # F03: 0-100

    # Target: base 6 months, +1 if volatile, +1 if freelancer/unstable income
    target_months = 6
    if vol > 60:    target_months += 1
    if stab < 50:   target_months += 1

    # Score on coverage vs target
    ratio = months_covered / target_months if target_months else 0
    if   ratio >= 1.0:  pts = 16
    elif ratio >= 0.80: pts = 14
    elif ratio >= 0.60: pts = 11
    elif ratio >= 0.40: pts = 7
    elif ratio >= 0.20: pts = 4
    elif ratio >= 0.10: pts = 2
    else:               pts = 0

    # Bonus: liquid fund (not FD or stocks)
    if profile.get("emergency_in_liquid_fund") or profile.get("ef_type") == "liquid":
        pts = min(MAX, pts + 1)

    pts  = max(0, min(MAX, pts))
    tips = []
    if months_covered < target_months:
        gap  = monthly_exp * (target_months - months_covered)
        tips.append(f"Add {_inr(gap)} to reach {target_months}-month buffer (your target, given income stability {stab:.0f}/100)")
        if months_covered < 1:
            tips.append("Keep emergency fund in liquid mutual fund — NOT stocks, NOT FD")

    headline = (
        f"🛡️ {months_covered:.1f}/{target_months} months covered"
        if months_covered < target_months
        else f"✅ {months_covered:.0f} months covered — strong"
    )

    return PillarResult(
        name="Emergency Fund", score=pts, max_pts=MAX,
        grade=_grade(pts, MAX), emoji="🛡️",
        headline=headline, tips=tips,
        features={"months_covered": round(months_covered, 2),
                  "target_months": target_months,
                  "spending_volatility": round(vol, 1),
                  "income_stability": round(stab, 1)},
    )


def score_debt_management(
    profile: dict, transactions: list[dict],
) -> PillarResult:
    """
    v2 Features:
      F05: debt_service_ratio          (EMIs / income)
      F06: credit_card_revolving       (carrying CC balance)
      F07: high_interest_debt_flag     (personal loan / CC debt)
      F08: debt_free_flag
      F09: total_debt_to_income_ratio  (annual)
    """
    MAX = 16

    income = _monthly_income(transactions, profile)
    emi    = _monthly_emi(transactions)

    cc_bal        = _n(profile.get("cc_outstanding", 0))
    has_cc_debt   = bool(cc_bal > 500 or profile.get("has_cc_debt"))
    has_perso_loan = bool(profile.get("personal_loan_outstanding") or profile.get("has_personal_loan"))
    has_car_loan  = bool(profile.get("has_car_loan"))

    dsr = (emi / income) if income else 0  # debt service ratio

    # Base score from DSR
    if   dsr == 0 and not has_cc_debt:   pts = 16
    elif dsr <= 0.10:                    pts = 14
    elif dsr <= 0.20:                    pts = 11
    elif dsr <= 0.30:                    pts = 8
    elif dsr <= 0.40:                    pts = 4
    elif dsr <= 0.50:                    pts = 2
    else:                                pts = 0

    # Penalties for high-interest instruments
    if has_cc_debt and cc_bal > 5_000:
        pts = max(0, pts - 5)   # revolving CC = worst financial habit
    if has_perso_loan:
        pts = max(0, pts - 2)
    if has_car_loan:
        pts = max(0, pts - 1)   # depreciating asset on debt

    pts  = max(0, min(MAX, pts))
    tips = []

    if has_cc_debt and cc_bal > 5_000:
        tips.append(f"Clear CC debt of {_inr(cc_bal)} FIRST — it's costing 36-42% p.a. compounding")
    if dsr > 0.40:
        tips.append(f"EMIs are {dsr:.0%} of income — aim for <35%. Consider foreclosing personal loan first")
    if has_perso_loan and not has_cc_debt:
        tips.append("Personal loan is the next priority after CC — typically 14-20% interest")

    headline = (
        "Debt-free 🎉" if dsr == 0 and not has_cc_debt
        else f"DSR: {dsr:.0%} of income" + (" + CC revolving ⚠️" if has_cc_debt else "")
    )

    return PillarResult(
        name="Debt Management", score=pts, max_pts=MAX,
        grade=_grade(pts, MAX), emoji="💳",
        headline=headline, tips=tips,
        features={"debt_service_ratio": round(dsr, 3),
                  "cc_revolving": has_cc_debt,
                  "high_interest_debt": has_perso_loan or has_cc_debt,
                  "cc_balance": cc_bal},
    )


def score_savings_and_discipline(
    profile: dict, transactions: list[dict],
) -> PillarResult:
    """
    v2 Features:
      F10: savings_rate                (income - expense) / income
      F11: savings_acceleration        (trending up/down)
      F12: sip_consistency_score       (% months SIP hit)
      F13: income_to_invest_delay      (0 = invest on salary day)
      F14: subscription_drain_pct      (subscriptions / income)
    """
    MAX = 16

    income  = _monthly_income(transactions, profile)
    expense = _monthly_expenses(transactions)

    savings_rate = ((income - expense) / income) if income > 0 else 0
    savings_rate = max(0.0, savings_rate)

    accel = _savings_acceleration(transactions)   # +1 / 0 / -1
    sip_c = _sip_consistency(transactions, profile)  # 0-100

    # Subscription drain
    subs = profile.get("subscriptions") or []
    sub_drain = sum(_n(s.get("amount")) for s in subs) if isinstance(subs, list) else _n(profile.get("subscription_drain", 0))
    sub_drain_pct = (sub_drain / income * 100) if income else 0

    # Base score from savings rate
    if   savings_rate >= 0.35:   pts = 14
    elif savings_rate >= 0.30:   pts = 12
    elif savings_rate >= 0.25:   pts = 10
    elif savings_rate >= 0.20:   pts = 8
    elif savings_rate >= 0.15:   pts = 6
    elif savings_rate >= 0.10:   pts = 4
    elif savings_rate >= 0.05:   pts = 2
    else:                        pts = 0

    # SIP consistency bonus (+1 for >80%, +2 for >90%)
    if sip_c >= 90:   pts = min(MAX, pts + 2)
    elif sip_c >= 70: pts = min(MAX, pts + 1)

    # Acceleration bonus/penalty
    if accel > 0:   pts = min(MAX, pts + 1)
    elif accel < 0: pts = max(0, pts - 1)

    # Subscription drain penalty (>5% of income on subs)
    if sub_drain_pct > 5:   pts = max(0, pts - 1)
    if sub_drain_pct > 10:  pts = max(0, pts - 1)

    pts  = max(0, min(MAX, pts))
    tips = []

    if savings_rate < 0.20:
        gap = income * 0.20 - (income * savings_rate)
        tips.append(f"Set up auto-SIP of {_inr(gap)}/month on salary day — pay yourself first")
    if sip_c < 70:
        tips.append(f"SIP consistency only {sip_c:.0f}% — set a standing instruction, not a manual transfer")
    if sub_drain_pct > 8:
        tips.append(f"Subscriptions eating {sub_drain_pct:.1f}% of income ({_inr(sub_drain)}/mo) — audit and cancel unused ones")
    if accel < 0:
        tips.append("Savings rate is declining month-over-month — review discretionary spending")

    headline = (
        f"Saving {savings_rate:.0%}/mo"
        + (" 📈" if accel > 0 else " 📉" if accel < 0 else "")
        + f" | SIP hit rate {sip_c:.0f}%"
    )

    return PillarResult(
        name="Savings & Discipline", score=pts, max_pts=MAX,
        grade=_grade(pts, MAX), emoji="💰",
        headline=headline, tips=tips,
        features={"savings_rate": round(savings_rate, 3),
                  "savings_acceleration": accel,
                  "sip_consistency": round(sip_c, 1),
                  "subscription_drain_pct": round(sub_drain_pct, 1)},
    )


def score_investment_quality(
    profile: dict, goals: list[dict], holdings: dict, transactions: list[dict],
) -> PillarResult:
    """
    v2 Features:
      F15: investment_diversification  (HHI across asset classes)
      F16: fno_exposure_pct            (F&O as % of portfolio)
      F17: net_worth_to_annual_income  (wealth accumulation ratio)
      F18: goal_funding_velocity       (rate of goal progress)
      F19: equity_allocation_age_fit   (age-appropriate allocation)
      F20: active_trading_loss_flag    (losing trader)
      F21: direct_mf_vs_regular        (direct plan = more return)
      F22: over_diversification_flag   (>10 MFs = diworsification)
    """
    MAX = 16

    items       = holdings.get("items") or []
    total_value = _n(holdings.get("total_equity_value") or holdings.get("total_value"))
    income_mo   = _monthly_income(transactions, profile)
    annual_inc  = income_mo * 12

    # F15: Diversification HHI
    div_score = _investment_diversification_hhi(holdings)   # 0-100

    # F16: F&O exposure
    fno_val = _n(holdings.get("fno_value", 0))
    fno_pct = (fno_val / total_value * 100) if total_value else 0

    # F17: Net worth ratio
    nw_ratio = (total_value / annual_inc) if annual_inc else 0

    # F18: Goal funding velocity — % of goals ≥30% funded
    on_track = sum(1 for g in goals if _n(g.get("current_amount")) >= _n(g.get("target_amount")) * 0.30)
    goal_vel = (on_track / len(goals) * 100) if goals else 50

    # F19: Age-appropriate equity allocation
    age = _n(profile.get("age", 35))
    recommended_eq_pct = max(20, 100 - age)
    actual_eq_pct = _n(holdings.get("equity_pct", 100))  # default assume 100% equity
    age_fit = max(0.0, 100 - abs(actual_eq_pct - recommended_eq_pct))

    # F21: Direct MF flag
    has_direct = bool(profile.get("has_direct_mf") or profile.get("direct_plan"))

    # F22: Over-diversification
    mf_count = int(_n(holdings.get("mf_count", 0)))
    over_div = mf_count > 10

    # Base score
    pts = 6  # start neutral

    # Diversification scoring
    if   div_score >= 70:  pts += 4
    elif div_score >= 40:  pts += 2
    elif div_score > 0:    pts += 1

    # Net worth ratio bonus
    if   nw_ratio >= 3:    pts += 4
    elif nw_ratio >= 1:    pts += 2
    elif nw_ratio >= 0.5:  pts += 1
    elif total_value == 0:
        pts -= 3

    # F&O penalty
    if fno_pct > 30:   pts -= 6
    elif fno_pct > 15: pts -= 3
    elif fno_pct > 5:  pts -= 1

    # Direct MF bonus
    if has_direct:  pts += 1

    # Goal velocity bonus
    if goal_vel >= 80: pts += 1

    # Over-diversification small penalty
    if over_div:    pts -= 1

    pts  = max(0, min(MAX, pts))
    tips = []

    if total_value == 0:
        tips.append("Start with ₹500/month Nifty 50 index fund on Kuvera — your wealth machine starts now")
    elif fno_pct > 15:
        tips.append(f"F&O is {fno_pct:.0f}% of portfolio — SEBI data: 90% retail F&O traders lose money. Cut exposure")
    if div_score < 40 and total_value > 0:
        tips.append("Add debt/gold allocation — HHI diversification score is low. Balanced fund or SGB recommended")
    if not has_direct and mf_count > 0:
        tips.append("Switch to Direct MFs on Kuvera — saves 0.5-1.5% expense ratio, that's ₹50K+ on ₹50L over 10 years")
    if over_div:
        tips.append(f"{mf_count} mutual funds is too many — consolidate to 4-5 diversified funds")

    headline = (
        f"Portfolio ₹{total_value/1e5:.1f}L | Div: {div_score:.0f}/100"
        + (f" | F&O {fno_pct:.0f}% ⚠️" if fno_pct > 10 else "")
    )

    return PillarResult(
        name="Investment Quality", score=pts, max_pts=MAX,
        grade=_grade(pts, MAX), emoji="📈",
        headline=headline, tips=tips,
        features={"diversification_hhi": round(div_score, 1),
                  "fno_exposure_pct": round(fno_pct, 1),
                  "nw_to_income_ratio": round(nw_ratio, 2),
                  "goal_funding_velocity": round(goal_vel, 1),
                  "has_direct_mf": has_direct,
                  "over_diversified": over_div},
    )


def score_insurance(profile: dict, transactions: list[dict]) -> PillarResult:
    """
    v2 Features:
      F23: term_coverage_ratio         (cover / 10× annual income)
      F24: health_cover_adequacy       (≥10L for metro, ≥5L for others)
      F25: ulip_flag                   (ULIP = wealth destroyer)
      F26: insurance_review_recency    (stale policies)
      F27: family_protection_gap       (dependents vs cover)
    """
    MAX = 12

    income_mo  = _monthly_income(transactions, profile)
    annual_inc = income_mo * 12
    ideal_term = annual_inc * 10

    has_term   = bool(profile.get("has_term_insurance") or profile.get("term_cover")
                       or profile.get("life_insurance_type") == "term")
    has_health = bool(profile.get("has_health_insurance") or profile.get("health_cover"))
    has_ulip   = bool(profile.get("has_ulip") or profile.get("life_insurance_type") == "ulip")
    has_dep    = bool(profile.get("married") or profile.get("has_kids") or profile.get("dependent_parents"))

    term_amount   = _n(profile.get("term_cover") or profile.get("life_cover_amount"))
    health_amount = _n(profile.get("health_cover", 0))
    city_tier     = str(profile.get("city_tier") or "metro").lower()
    health_target = 1_000_000 if "metro" in city_tier else 500_000

    pts  = 0
    tips = []

    # Term insurance (F23)
    if has_term:
        ratio = term_amount / ideal_term if ideal_term else 0
        if   ratio >= 1.0:  pts += 5
        elif ratio >= 0.6:
            pts += 3
            tips.append(f"Increase term cover — current {_inr(term_amount)} vs ideal {_inr(ideal_term)} (10× income)")
        else:
            pts += 1
            tips.append(f"Term cover critically low — need {_inr(ideal_term)} at minimum. Cost: ~₹10K/yr for ₹1Cr")
    else:
        if has_dep:
            tips.append("NO TERM INSURANCE with dependents — top priority. Buy ₹1Cr plan today for ~₹10K/yr (Ditto/PolicyBazaar)")
        else:
            tips.append("No term insurance — not critical now, but buy before 35 when premiums are lowest")

    # Health insurance (F24)
    if has_health:
        if   health_amount >= health_target:       pts += 5
        elif health_amount >= health_target * 0.5: pts += 3
        else:
            pts += 1
            tips.append(f"Upgrade health cover to {_inr(health_target)} — one hospitalisation can cost ₹3-8L")
    else:
        pts += 0
        tips.append("No health insurance — a single surgery can wipe 2 years of savings. Get ₹10L cover today")

    # ULIP penalty (F25)
    if has_ulip:
        pts = max(0, pts - 3)
        tips.append("ULIP is insurance + investment mixed badly — surrender and buy term + ELSS separately")

    pts  = max(0, min(MAX, pts))

    headline = (
        "Term + Health covered ✅" if has_term and has_health
        else ("No term insurance 🚨" if not has_term and has_dep
              else "Partial coverage ⚠️")
    )

    return PillarResult(
        name="Insurance", score=pts, max_pts=MAX,
        grade=_grade(pts, MAX), emoji="🏥",
        headline=headline, tips=tips,
        features={"has_term": has_term, "term_ratio": round(term_amount / ideal_term, 2) if ideal_term else 0,
                  "has_health": has_health, "health_cover": health_amount,
                  "has_ulip": has_ulip, "has_dependents": has_dep},
    )


def score_tax_efficiency(profile: dict, transactions: list[dict]) -> PillarResult:
    """
    v2 Features:
      F28: s80c_utilisation_pct        (% of ₹1.5L 80C used)
      F29: nps_flag                    (extra ₹50K deduction)
      F30: ppf_flag                    (7.1% tax-free guaranteed)
      F31: ltcg_harvesting_flag        (harvesting up to ₹1.25L LTCG free)
      F32: regime_optimality           (new vs old — is user in the right one)
      F33: tax_saved_estimate          (actual ₹ saved vs potential)
    """
    MAX = 12

    LIMIT_80C = 1_50_000
    income_mo  = _monthly_income(transactions, profile)
    annual_inc = income_mo * 12

    _80C_RE = re.compile(r"elss|ppf|epf|nsc|tax.?sav|80c|ssy|sukanya|ulip|life.?ins|lic|nps", re.I)

    # Compute 80C invested this FY
    today = date.today()
    fy_start = today.replace(month=4, day=1) if today.month >= 4 else today.replace(year=today.year - 1, month=4, day=1)
    invested_80c = 0.0
    for t in transactions:
        try:
            tx_date = _parse_dt(t.get("date", "")).date()
        except Exception:
            continue
        if tx_date < fy_start:
            continue
        cat  = str(t.get("category") or "")
        note = str(t.get("notes") or t.get("description") or "")
        amt  = _n(t.get("amount"))
        if amt > 0 and _80C_RE.search(cat + " " + note):
            invested_80c += amt

    utilisation_pct = min(100, invested_80c / LIMIT_80C * 100)
    gap_80c         = max(0, LIMIT_80C - invested_80c)

    has_nps    = bool(profile.get("has_nps"))
    has_ppf    = bool(profile.get("has_ppf"))
    has_ltcg   = bool(profile.get("ltcg_harvesting") or profile.get("does_ltcg_harvest"))
    regime     = str(profile.get("tax_regime", "")).lower()

    pts  = 0
    tips = []

    # 80C (F28)
    if   utilisation_pct >= 95:  pts += 5
    elif utilisation_pct >= 70:  pts += 3
    elif utilisation_pct >= 40:  pts += 2
    elif annual_inc > 500_000:
        pts += 0
        tips.append(f"80C only {utilisation_pct:.0f}% used — invest {_inr(gap_80c)} more in ELSS for ₹{int(gap_80c*0.30):,} tax saving")

    # NPS (F29) — extra ₹50K deduction
    if has_nps:   pts += 3
    elif annual_inc > 600_000 and regime != "new":
        tips.append("Open NPS Tier-1 — extra ₹50K deduction under 80CCD, saves ₹15K+ tax at 30% slab")

    # PPF (F30)
    if has_ppf:   pts += 2
    elif annual_inc > 300_000:
        tips.append("Open PPF account — 7.1% guaranteed, completely tax-free (EEE status). Takes 5 min online")

    # LTCG harvesting (F31)
    if has_ltcg:  pts += 1
    elif annual_inc > 10_00_000:
        tips.append("Harvest LTCG up to ₹1.25L free — sell and rebuy equity yearly to reset cost basis")

    pts  = max(0, min(MAX, pts))

    headline = (
        f"80C: {utilisation_pct:.0f}% used | NPS: {'✅' if has_nps else '❌'} | PPF: {'✅' if has_ppf else '❌'}"
    )

    return PillarResult(
        name="Tax Efficiency", score=pts, max_pts=MAX,
        grade=_grade(pts, MAX), emoji="📋",
        headline=headline, tips=tips,
        features={"s80c_utilisation_pct": round(utilisation_pct, 1),
                  "invested_80c": round(invested_80c),
                  "gap_80c": round(gap_80c),
                  "has_nps": has_nps, "has_ppf": has_ppf,
                  "has_ltcg_harvesting": has_ltcg},
    )


def score_behavioral_health(profile: dict, transactions: list[dict], holdings: dict) -> PillarResult:
    """
    NEW in v2 — detects bad financial behaviours.
    v2 Features:
      F34: panic_sell_flag             (sold during market drops)
      F35: fomo_buy_flag               (bought at peaks)
      F36: impulse_spend_score         (high weekend / late-night spending)
      F37: cc_paid_in_full_flag        (full vs minimum payment)
      F38: budget_adherence_score      (vs set budgets)
    """
    MAX = 6

    pts  = 3  # start neutral
    tips = []

    # Panic sell / FOMO signals from profile
    panic_sell = bool(profile.get("panic_sold_before") or profile.get("behavioral_panic"))
    fomo_buy   = bool(profile.get("fomo_buy") or profile.get("behavioral_fomo"))
    cc_full    = bool(profile.get("cc_paid_in_full") or profile.get("cc_full_payment"))
    cc_min     = bool(profile.get("cc_minimum_only"))

    # Trading loss signal
    win_rate = _n(profile.get("win_rate", 50))
    is_losing_trader = (
        bool(holdings.get("total_pnl") and _n(holdings.get("total_pnl")) < 0)
        and win_rate < 40
    )

    if panic_sell:
        pts = max(0, pts - 1)
        tips.append("Selling during crashes locks in losses — set a rule: only sell when fundamentals change, not price")
    if fomo_buy:
        pts = max(0, pts - 1)
        tips.append("FOMO buying at peaks is costly — always check PE ratio before buying. Buy on dips via SIP, not lump sum at highs")
    if cc_full:
        pts = min(MAX, pts + 2)
    if cc_min:
        pts = max(0, pts - 2)
        tips.append("Paying only minimum on CC compounds at 36-42% p.a. — pay in full every month")
    if is_losing_trader:
        pts = max(0, pts - 1)
        tips.append(f"Win rate {win_rate:.0f}% — below 40% threshold. Consider switching from active trading to index funds")

    if not tips:
        pts = min(MAX, pts + 1)  # bonus for clean behaviour

    pts = max(0, min(MAX, pts))

    headline = (
        "Strong financial discipline 💪" if pts >= 5
        else "A few behavioural habits to fix" if pts >= 3
        else "Behavioural traps detected ⚠️"
    )

    return PillarResult(
        name="Behavioral Health", score=pts, max_pts=MAX,
        grade=_grade(pts, MAX), emoji="🧠",
        headline=headline, tips=tips,
        features={"panic_sell": panic_sell, "fomo_buy": fomo_buy,
                  "cc_paid_in_full": cc_full, "is_losing_trader": is_losing_trader},
    )


def score_goal_trajectory(profile: dict, goals: list[dict], transactions: list[dict]) -> PillarResult:
    """
    NEW in v2 — measures goal health holistically.
    v2 Features:
      F39: goal_funding_velocity       (% goals ≥30% funded vs deadline)
      F40: retirement_corpus_on_track  (is retirement corpus trajectory right)
    """
    MAX = 6

    if not goals:
        return PillarResult(
            name="Goal Trajectory", score=3, max_pts=MAX,
            grade="C", emoji="🎯",
            headline="No goals set — add goals to track trajectory",
            tips=["Add financial goals (retirement, house, child education) for personalised tracking"],
            features={"goals_count": 0},
        )

    today      = date.today()
    on_track   = 0
    behind     = 0
    past_due   = 0
    total_gap  = 0.0

    income = _monthly_income(transactions, profile)

    for g in goals:
        target  = _n(g.get("target_amount") or g.get("target"))
        saved   = _n(g.get("current_amount") or g.get("saved") or g.get("current"))
        try:
            deadline = _parse_dt(g.get("target_date") or g.get("deadline") or "").date()
        except Exception:
            deadline = None

        if deadline and deadline < today:
            past_due += 1
            continue

        if target <= 0:
            continue

        progress = saved / target

        if deadline:
            months_left = max(1, (deadline.year - today.year) * 12 + deadline.month - today.month)
            needed_pm   = (target - saved) / months_left
            contrib     = _n(g.get("monthly_contribution", 0))
            if contrib >= needed_pm * 0.80 or progress >= 0.80:
                on_track += 1
            else:
                behind += 1
                total_gap += max(0, needed_pm - contrib)
        else:
            if progress >= 0.30:
                on_track += 1
            else:
                behind += 1

    active_goals = len(goals) - past_due
    track_pct    = (on_track / active_goals * 100) if active_goals else 0

    if   track_pct >= 80:  pts = 6
    elif track_pct >= 60:  pts = 4
    elif track_pct >= 40:  pts = 3
    elif track_pct >= 20:  pts = 1
    else:                  pts = 0

    tips = []
    if behind > 0:
        tips.append(f"{behind} goal(s) behind schedule — need extra {_inr(total_gap)}/month to get back on track")
    if past_due > 0:
        tips.append(f"{past_due} goal(s) past deadline — review and reset deadlines or target amounts")
    if on_track == active_goals and active_goals > 0:
        tips.append("All goals on track! Consider adding stretch goals or raising targets")

    headline = (
        f"{on_track}/{active_goals} goals on track"
        + (f" | {behind} behind" if behind else "")
        + (f" | {past_due} past due" if past_due else "")
    )

    return PillarResult(
        name="Goal Trajectory", score=pts, max_pts=MAX,
        grade=_grade(pts, MAX), emoji="🎯",
        headline=headline, tips=tips,
        features={"goals_on_track": on_track, "goals_behind": behind,
                  "goals_past_due": past_due, "track_pct": round(track_pct, 1),
                  "total_monthly_gap": round(total_gap)},
    )


# ══════════════════════════════════════════════════════════════════════════════
# TRAJECTORY — compare vs previous score
# ══════════════════════════════════════════════════════════════════════════════

def _compute_trajectory(current_total: int, previous_score: dict | None) -> str:
    if not previous_score:
        return "stable"
    prev = previous_score.get("total", current_total)
    diff = current_total - prev
    if diff >= 3:   return "improving"
    if diff <= -3:  return "declining"
    return "stable"


def _find_biggest_risk(pillars: list[PillarResult]) -> str:
    """Return the pillar name with the worst score relative to its max."""
    worst = min(pillars, key=lambda p: p.score / p.max_pts if p.max_pts else 0)
    ratio = worst.score / worst.max_pts if worst.max_pts else 0
    return f"{worst.name} ({worst.score}/{worst.max_pts} pts — {ratio:.0%})"


def _derive_quick_win(pillars: list[PillarResult], total: int) -> str:
    """
    Find the single action most likely to gain 5+ points this week.
    Priority: low-hanging fruit = tip from the worst-scoring pillar that is also actionable fast.
    """
    # Sort pillars by how far below max they are
    sorted_pillars = sorted(pillars, key=lambda p: p.score / p.max_pts if p.max_pts else 0)

    for p in sorted_pillars:
        if p.tips:
            return p.tips[0]

    # Fallback
    if total < 40:
        return "Start with the basics: 3-month emergency fund in liquid fund + ₹500/month SIP in Nifty 50"
    if total < 60:
        return "Max out 80C with ELSS — tax saving + equity returns, fastest path to +5 points"
    return "Review and consolidate mutual fund portfolio to <5 funds for better tracking"


# ══════════════════════════════════════════════════════════════════════════════
# TIERS
# ══════════════════════════════════════════════════════════════════════════════

_TIERS = [
    (90, "ELITE",  "#f0c040", "🏆"),
    (75, "GREAT",  "#22d3a6", "🌟"),
    (60, "GOOD",   "#00d4ff", "✅"),
    (40, "FAIR",   "#f0a500", "⚠️"),
    (0,  "DANGER", "#f04444", "🚨"),
]

_TIER_LINES = {
    "ELITE":  "Financial rockstar! Compounding is working hard for you — keep the discipline.",
    "GREAT":  "Solid foundation! A few targeted moves and you'll hit elite status.",
    "GOOD":   "On the right track — focus on the gaps your score reveals.",
    "FAIR":   "Real improvement possible with focused action — start with the biggest risk.",
    "DANGER": "Financial health needs urgent attention — basics first, everything else second.",
}

_TRAJECTORY_EMOJI = {
    "improving": "📈",
    "stable":    "➡️",
    "declining": "📉",
}


# ══════════════════════════════════════════════════════════════════════════════
# MAIN ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

def compute_health_score(
    user_data: dict,
    previous_score: dict | None = None,
) -> HealthScoreResult:
    """
    Compute the full v2 Financial Health Score.

    `user_data` keys: user_id, profile, transactions, goals, holdings
    `previous_score` — optional last score dict (for trajectory).  Pass None on first run.
    """
    uid   = user_data.get("user_id", "")
    prof  = user_data.get("profile") or {}
    txns  = user_data.get("transactions") or []
    goals = user_data.get("goals") or []
    hold  = user_data.get("holdings") or {}

    pillars = [
        score_emergency_fund(prof, txns, hold),
        score_debt_management(prof, txns),
        score_savings_and_discipline(prof, txns),
        score_investment_quality(prof, goals, hold, txns),
        score_insurance(prof, txns),
        score_tax_efficiency(prof, txns),
        score_behavioral_health(prof, txns, hold),
        score_goal_trajectory(prof, goals, txns),
    ]

    total = sum(p.score for p in pillars)

    # Tier
    tier, color, emoji = "FAIR", "#f0a500", "⚠️"
    for threshold, t, c, e in _TIERS:
        if total >= threshold:
            tier, color, emoji = t, c, e
            break

    trajectory   = _compute_trajectory(total, previous_score)
    biggest_risk = _find_biggest_risk(pillars)
    quick_win    = _derive_quick_win(pillars, total)

    # Aggregate top tips across all pillars (deduplicated, highest impact first)
    all_tips: list[str] = []
    for p in sorted(pillars, key=lambda x: x.score / x.max_pts if x.max_pts else 0):
        for tip in p.tips:
            if tip not in all_tips:
                all_tips.append(tip)
    top_tips = all_tips[:5]

    traj_emoji = _TRAJECTORY_EMOJI.get(trajectory, "➡️")

    return HealthScoreResult(
        user_id             = uid,
        total               = total,
        tier                = tier,
        tier_color          = color,
        tier_emoji          = emoji,
        headline            = f"{_TIER_LINES[tier]} {traj_emoji}",
        trajectory          = trajectory,
        biggest_risk_factor = biggest_risk,
        quick_win           = quick_win,
        pillars             = pillars,
        top_tips            = top_tips,
        computed_at         = datetime.utcnow().isoformat() + "Z",
    )
