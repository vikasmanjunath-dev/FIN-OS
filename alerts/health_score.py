"""
FIN-OS Financial Health Score — v1
════════════════════════════════════════════════════════════════════════════════
Computes a 0-100 score for a user across 6 financial health pillars.
Called by alert-engine.py on the /health-score/{user_id} endpoint.

Pillars (max pts):
  1. Emergency Fund       — 20 pts
  2. Debt Management      — 20 pts
  3. Savings Rate         — 20 pts
  4. Investment Growth    — 20 pts
  5. Insurance Coverage   — 10 pts
  6. Tax Efficiency       — 10 pts

Total: 100 pts
  0-39  → DANGER   (Red)
  40-59 → FAIR     (Amber)
  60-74 → GOOD     (Blue)
  75-89 → GREAT    (Teal)
  90+   → ELITE    (Gold)
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any


# ══════════════════════════════════════════════════════════════════════════════
# DATA STRUCTURES
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class PillarResult:
    name:      str
    score:     int            # 0 to max_pts
    max_pts:   int
    grade:     str            # A+ / A / B / C / D / F
    emoji:     str
    headline:  str            # one-line assessment
    tips:      list[str] = field(default_factory=list)   # 1-2 actionable tips


@dataclass
class HealthScoreResult:
    user_id:    str
    total:      int           # 0-100
    tier:       str           # DANGER / FAIR / GOOD / GREAT / ELITE
    tier_color: str           # hex
    tier_emoji: str
    headline:   str           # one-line overall verdict
    pillars:    list[PillarResult] = field(default_factory=list)
    computed_at: str = ""

    def to_dict(self) -> dict:
        return {
            "user_id":    self.user_id,
            "total":      self.total,
            "tier":       self.tier,
            "tier_color": self.tier_color,
            "tier_emoji": self.tier_emoji,
            "headline":   self.headline,
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

def _inr(v) -> float:
    try:    return float(v or 0)
    except: return 0.0

def _grade(score: int, max_pts: int) -> str:
    pct = score / max_pts if max_pts else 0
    if pct >= 0.95: return "A+"
    if pct >= 0.80: return "A"
    if pct >= 0.65: return "B"
    if pct >= 0.50: return "C"
    if pct >= 0.30: return "D"
    return "F"

def _monthly_income(transactions: list[dict]) -> float:
    """Estimate average monthly income from last 60 days of transactions."""
    income = [
        _inr(t.get("amount"))
        for t in transactions
        if str(t.get("type", "")).lower() in ("income", "credit", "salary")
        or _inr(t.get("amount")) > 0
    ]
    total = sum(income)
    return total / 2 if total else 0   # 60 days = 2 months

def _monthly_expenses(transactions: list[dict]) -> float:
    """Estimate average monthly expenses from last 60 days."""
    expense = [
        abs(_inr(t.get("amount")))
        for t in transactions
        if str(t.get("type", "")).lower() in ("expense", "debit")
        or _inr(t.get("amount")) < 0
    ]
    total = sum(expense)
    return total / 2 if total else 0

def _monthly_emi(transactions: list[dict]) -> float:
    """Sum up recurring EMI-type transactions."""
    return sum(
        abs(_inr(t.get("amount")))
        for t in transactions
        if any(kw in str(t.get("category", "")).lower()
               for kw in ("emi", "loan", "mortgage", "repayment"))
    ) / 2   # 60 days ÷ 2

def _liquid_savings(profile: dict, holdings: dict) -> float:
    """Estimate liquid/savings balance from profile or holdings."""
    return (
        _inr(profile.get("liquid_savings"))
        or _inr(profile.get("savings_balance"))
        or _inr(holdings.get("cash_balance"))
        or 0
    )


# ══════════════════════════════════════════════════════════════════════════════
# PILLAR SCORERS
# ══════════════════════════════════════════════════════════════════════════════

def score_emergency_fund(
    profile: dict,
    transactions: list[dict],
    holdings: dict,
) -> PillarResult:
    """
    Emergency fund = liquid savings / monthly expenses.
    Full score (20) = 6+ months. 0 = no fund at all.
    """
    MAX = 20
    monthly_exp = _monthly_expenses(transactions)
    if monthly_exp <= 0:
        # Fallback: estimate from income
        monthly_exp = _monthly_income(transactions) * 0.6

    liquid = _liquid_savings(profile, holdings)
    months_covered = (liquid / monthly_exp) if monthly_exp else 0

    if   months_covered >= 6:   pts = 20
    elif months_covered >= 5:   pts = 17
    elif months_covered >= 4:   pts = 14
    elif months_covered >= 3:   pts = 10
    elif months_covered >= 2:   pts = 6
    elif months_covered >= 1:   pts = 3
    else:                       pts = 0

    if months_covered >= 6:
        headline = f"Strong! {months_covered:.0f} months covered"
        tips = []
    elif months_covered >= 3:
        need = monthly_exp * (6 - months_covered)
        headline = f"{months_covered:.1f} of 6 months covered"
        tips = [f"Add ₹{need:,.0f} more to hit 6-month target"]
    else:
        need = monthly_exp * 6
        headline = f"Only {months_covered:.1f} months — risky!"
        tips = [
            f"Target: ₹{need:,.0f} in liquid savings",
            "Keep this in FD or liquid fund — never stocks",
        ]

    return PillarResult(
        name="Emergency Fund", score=pts, max_pts=MAX,
        grade=_grade(pts, MAX),
        emoji="🛡️",
        headline=headline, tips=tips,
    )


def score_debt_management(
    profile: dict,
    transactions: list[dict],
) -> PillarResult:
    """
    EMI-to-income ratio.
    Full score (20) = 0% debt. 0 = 50%+ of income in EMIs.
    """
    MAX = 20
    income  = _monthly_income(transactions) or _inr(profile.get("monthly_income"))
    emi     = _monthly_emi(transactions)

    # Also add declared debts from profile flags
    has_cc_debt   = bool(profile.get("cc_outstanding") or profile.get("has_cc_debt"))
    has_perso_loan = bool(profile.get("personal_loan_outstanding"))

    emi_ratio = (emi / income) if income else 0
    cc_bal    = _inr(profile.get("cc_outstanding", 0))

    if   emi_ratio == 0 and not has_cc_debt:   pts = 20
    elif emi_ratio <= 0.10:                    pts = 18
    elif emi_ratio <= 0.20:                    pts = 15
    elif emi_ratio <= 0.30:                    pts = 11
    elif emi_ratio <= 0.40:                    pts = 7
    elif emi_ratio <= 0.50:                    pts = 3
    else:                                      pts = 0

    # Penalty for credit card debt (high-interest trap)
    if has_cc_debt and cc_bal > 10_000:
        pts = max(0, pts - 4)

    # Penalty for personal loan (usually 14-20% interest)
    if has_perso_loan:
        pts = max(0, pts - 2)

    if emi_ratio == 0:
        headline = "Debt-free 🎉"
        tips = []
    elif emi_ratio <= 0.30:
        headline = f"EMI is {emi_ratio:.0%} of income — manageable"
        tips = ["Try to clear high-interest debt first (credit card → personal loan)"]
    else:
        headline = f"EMI is {emi_ratio:.0%} of income — too high!"
        tips = [
            "Aim to bring EMI below 35% of take-home — you're in the danger zone",
            "Prioritise: Credit card (clear fully) → Personal loan → Car loan",
        ]

    return PillarResult(
        name="Debt Management", score=pts, max_pts=MAX,
        grade=_grade(pts, MAX),
        emoji="💳",
        headline=headline, tips=tips,
    )


def score_savings_rate(
    profile: dict,
    transactions: list[dict],
) -> PillarResult:
    """
    Savings rate = (income - expenses) / income.
    Full score (20) = 30%+ savings rate.
    """
    MAX = 20
    income  = _monthly_income(transactions) or _inr(profile.get("monthly_income"))
    expense = _monthly_expenses(transactions)

    savings_rate = ((income - expense) / income) if income > 0 else 0
    savings_rate = max(0.0, savings_rate)   # can't be negative for scoring

    # Check for SIP contributions (gold for savings)
    sip_txns = [
        t for t in transactions
        if any(kw in str(t.get("category","")).lower()
               for kw in ("sip","mutual fund","mf","elss","ppf","nps"))
    ]
    has_sip = bool(sip_txns)

    if   savings_rate >= 0.30:   pts = 20
    elif savings_rate >= 0.25:   pts = 17
    elif savings_rate >= 0.20:   pts = 14
    elif savings_rate >= 0.15:   pts = 10
    elif savings_rate >= 0.10:   pts = 7
    elif savings_rate >= 0.05:   pts = 4
    else:                        pts = 1

    # Bonus for SIP discipline
    if has_sip and pts < 20:
        pts = min(20, pts + 2)

    target_savings = income * 0.30 if income else 0
    actual_savings = income * savings_rate if income else 0

    if savings_rate >= 0.30:
        headline = f"Excellent — saving {savings_rate:.0%} every month!"
        tips = []
    elif savings_rate >= 0.15:
        gap = target_savings - actual_savings
        headline = f"Saving {savings_rate:.0%} — good, push to 30%"
        tips = [f"Increase SIP by ₹{gap:,.0f}/month to hit 30% savings rate"]
    else:
        headline = f"Saving only {savings_rate:.0%} — needs urgent attention"
        tips = [
            "Pay yourself first — set up SIP on salary day",
            f"Even ₹{income * 0.15:,.0f}/month (15%) would change your trajectory",
        ]

    return PillarResult(
        name="Savings Rate", score=pts, max_pts=MAX,
        grade=_grade(pts, MAX),
        emoji="💰",
        headline=headline, tips=tips,
    )


def score_investment_growth(
    profile: dict,
    goals: list[dict],
    holdings: dict,
    transactions: list[dict],
) -> PillarResult:
    """
    Investment quality — considers portfolio diversification, SIP presence,
    F&O exposure, and goal coverage.
    Full score (20) = diversified, no F&O, goals funded.
    """
    MAX = 20
    pts = 10   # start at 10 (neutral)

    items = holdings.get("items") or []
    total_value = _inr(holdings.get("total_equity_value"))
    monthly_income = _monthly_income(transactions) or _inr(profile.get("monthly_income"))

    tips = []

    # ── Diversification check ──
    asset_types = set(str(h.get("asset_type","")).lower() for h in items)
    diversified = len(asset_types) >= 2   # e.g. equity + debt/gold

    if total_value > 0:
        pts += 3 if diversified else 0
        if not diversified and items:
            tips.append("Diversify — add debt or gold to balance your equity-heavy portfolio")

    # ── F&O penalty ──
    if holdings.get("has_fno_positions"):
        fno_val = _inr(holdings.get("fno_value", 0))
        fno_pct = fno_val / total_value if total_value else 0
        if fno_pct > 0.20:
            pts = max(0, pts - 6)
            tips.append("F&O is >20% of portfolio — SEBI data: 90% of traders lose. Reduce exposure now.")
        else:
            pts = max(0, pts - 2)

    # ── Investment ratio (portfolio / annual income) ──
    annual_income = monthly_income * 12
    invest_ratio  = (total_value / annual_income) if annual_income else 0

    if   invest_ratio >= 3:   pts = min(MAX, pts + 5)
    elif invest_ratio >= 1:   pts = min(MAX, pts + 3)
    elif invest_ratio >= 0.5: pts = min(MAX, pts + 1)
    elif total_value == 0:
        pts = max(0, pts - 3)
        tips.append("Start investing — even ₹500/month SIP in Nifty 50 index fund")

    # ── Goals funded check ──
    if goals:
        on_track = sum(1 for g in goals
                       if _inr(g.get("current_amount")) >= _inr(g.get("target_amount")) * 0.30)
        if on_track == len(goals):
            pts = min(MAX, pts + 2)
        elif on_track == 0:
            tips.append("None of your goals have 30%+ funding — start STP for each goal")

    pts = max(0, min(MAX, pts))

    if pts >= 17:
        headline = "Well-invested and diversified 💹"
    elif pts >= 12:
        headline = "Good start — room to diversify"
    elif pts >= 7:
        headline = "Investing but could be stronger"
    else:
        headline = "Investment portfolio needs attention"

    return PillarResult(
        name="Investment Growth", score=pts, max_pts=MAX,
        grade=_grade(pts, MAX),
        emoji="📈",
        headline=headline, tips=tips,
    )


def score_insurance(profile: dict) -> PillarResult:
    """
    Insurance coverage — term plan + health insurance.
    Full score (10) = adequate term + health.
    """
    MAX = 10
    pts = 0
    tips = []

    has_term    = bool(
        profile.get("has_term_insurance")
        or profile.get("term_cover")
        or profile.get("life_insurance_type") == "term"
    )
    has_health  = bool(
        profile.get("has_health_insurance")
        or profile.get("health_cover")
    )
    has_ulip    = bool(profile.get("has_ulip") or profile.get("life_insurance_type") == "ulip")
    term_amount = _inr(profile.get("term_cover") or profile.get("life_cover_amount"))
    monthly_inc = _inr(profile.get("monthly_income"))
    annual_inc  = monthly_inc * 12
    ideal_cover = annual_inc * 10   # standard: 10× annual income

    # Term insurance scoring
    if has_term:
        if term_amount >= ideal_cover:
            pts += 5
        elif term_amount >= ideal_cover * 0.5:
            pts += 3
            tips.append(f"Increase term cover to ₹{ideal_cover/100_000:.0f}L (10× income)")
        else:
            pts += 1
            tips.append(f"Term cover is too low — target ₹{ideal_cover/100_000:.0f}L at your income")
    else:
        tips.append("No term insurance — buy a ₹1 crore plan for ~₹8,000/yr. Do it this week.")

    # Health insurance scoring
    if has_health:
        health_cover = _inr(profile.get("health_cover", 0))
        if health_cover >= 1_000_000:   pts += 5   # 10L+
        elif health_cover >= 500_000:   pts += 3   # 5L+
        else:
            pts += 2
            tips.append("Upgrade health cover to ₹10 lakh — hospitalisation costs are rising fast")
    else:
        tips.append("No health insurance — a single hospitalisation can wipe out 2 years of savings")

    # ULIP penalty (combines insurance + investment badly)
    if has_ulip:
        pts = max(0, pts - 2)
        tips.append("ULIP is a wealth destroyer — surrender and buy term + MF separately")

    pts = max(0, min(MAX, pts))

    if pts >= 8:
        headline = "Well covered — term + health in place"
    elif pts >= 5:
        headline = "Partial coverage — gaps to fill"
    elif pts >= 3:
        headline = "Under-insured — one emergency away from crisis"
    else:
        headline = "No meaningful insurance detected"

    return PillarResult(
        name="Insurance", score=pts, max_pts=MAX,
        grade=_grade(pts, MAX),
        emoji="🏥",
        headline=headline, tips=tips,
    )


def score_tax_efficiency(
    profile: dict,
    transactions: list[dict],
) -> PillarResult:
    """
    Tax planning — 80C usage, NPS, HRA, LTCG awareness.
    Full score (10) = maxed deductions.
    """
    MAX = 10
    pts = 5    # start neutral — hard to know without ITR data
    tips = []

    # Look for tax-saving transactions
    tax_txns = [
        t for t in transactions
        if any(kw in str(t.get("category","")).lower()
               for kw in ("80c","ppf","elss","nps","tax","epf","lic"))
    ]

    tax_saved  = sum(abs(_inr(t.get("amount"))) for t in tax_txns)
    has_nps    = bool(profile.get("has_nps"))
    has_ppf    = bool(profile.get("has_ppf"))
    regime     = str(profile.get("tax_regime", "")).lower()
    monthly_inc = _inr(profile.get("monthly_income"))
    annual_inc  = monthly_inc * 12

    # 80C utilisation
    if tax_saved >= 150_000:
        pts += 3
    elif tax_saved >= 75_000:
        pts += 1
        tips.append("80C not maxed — add ₹{:,.0f} more in ELSS/PPF".format(
            max(0, 150_000 - tax_saved)
        ))
    elif annual_inc > 500_000:
        tips.append("No 80C savings detected — max out ₹1.5L via ELSS (best option) or PPF")
        pts -= 2

    # NPS bonus (extra ₹50K deduction under 80CCD)
    if has_nps:
        pts += 2
    elif annual_inc > 600_000 and regime != "new":
        tips.append("Open NPS Tier-1 for extra ₹50K deduction — pure tax arbitrage")

    # PPF bonus (7.1% tax-free — everyone should have one)
    if has_ppf:
        pts += 1
    elif annual_inc > 300_000:
        tips.append("PPF account: 7.1% guaranteed, tax-free, EEE status — open today")

    pts = max(0, min(MAX, pts))

    if pts >= 8:
        headline = "Tax-efficient — deductions well used"
    elif pts >= 5:
        headline = "Moderate tax planning — room to save more"
    else:
        headline = "Tax planning is weak — leaving money on the table"

    return PillarResult(
        name="Tax Efficiency", score=pts, max_pts=MAX,
        grade=_grade(pts, MAX),
        emoji="📋",
        headline=headline, tips=tips,
    )


# ══════════════════════════════════════════════════════════════════════════════
# MAIN SCORER
# ══════════════════════════════════════════════════════════════════════════════

_TIERS = [
    (90, "ELITE",  "#f0c040", "🏆"),
    (75, "GREAT",  "#22d3a6", "🌟"),
    (60, "GOOD",   "#00d4ff", "✅"),
    (40, "FAIR",   "#f0a500", "⚠️"),
    (0,  "DANGER", "#f04444", "🚨"),
]

_TIER_LINES = {
    "ELITE":  "Financial rockstar! You're doing everything right — keep compounding.",
    "GREAT":  "Solid finances! A few tweaks and you'll hit elite status.",
    "GOOD":   "On the right track — some gaps to address.",
    "FAIR":   "Room for major improvement — focus on the red pillars first.",
    "DANGER": "Financial health needs urgent attention — start with the basics.",
}


def compute_health_score(user_data: dict) -> HealthScoreResult:
    """
    Compute the full Financial Health Score for a user.
    `user_data` is the dict returned by `fetch_user_data()` in alert-engine.py.
    """
    uid   = user_data.get("user_id", "")
    prof  = user_data.get("profile") or {}
    txns  = user_data.get("transactions") or []
    goals = user_data.get("goals") or []
    hold  = user_data.get("holdings") or {}

    pillars = [
        score_emergency_fund(prof, txns, hold),
        score_debt_management(prof, txns),
        score_savings_rate(prof, txns),
        score_investment_growth(prof, goals, hold, txns),
        score_insurance(prof),
        score_tax_efficiency(prof, txns),
    ]

    total = sum(p.score for p in pillars)

    # Determine tier
    tier, color, emoji = "FAIR", "#f0a500", "⚠️"
    for threshold, t, c, e in _TIERS:
        if total >= threshold:
            tier, color, emoji = t, c, e
            break

    return HealthScoreResult(
        user_id    = uid,
        total      = total,
        tier       = tier,
        tier_color = color,
        tier_emoji = emoji,
        headline   = _TIER_LINES[tier],
        pillars    = pillars,
        computed_at= datetime.utcnow().isoformat() + "Z",
    )
