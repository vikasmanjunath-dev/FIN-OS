"""
FIN-OS Alert Rules  v1
──────────────────────────────────────────────────────────────────────────────
Each rule is a class that:
  1. Receives a full user_data dict (profile + transactions + goals + market)
  2. Returns an Alert dict if the rule should fire, else None
  3. Has a cooldown_hours so it doesn't spam

Rule IDs:
  SIP_MISSED          — SIP date passed without matching transaction
  SALARY_CREDITED     — Large income detected → budget allocation prompt
  MARKET_DROP         — Nifty falls 3%+ → portfolio impact estimate
  GOAL_BEHIND         — Monthly savings insufficient for deadline
  CC_BILL_DUE         — Credit card bill due in ≤3 days
  BUDGET_OVERRUN      — Monthly spend > 90% of budget in any category
  EMERGENCY_FUND_LOW  — Emergency fund < 3 months of expenses
  TAX_SEASON          — March/April/July ITR/80C reminders
  FNO_EXPIRY_WEEK     — Last Thursday week warning (if user has F&O signals)
  NETWORTH_MILESTONE  — First ₹1L / ₹5L / ₹10L / ₹25L / ₹50L / ₹1Cr
"""

from __future__ import annotations
from datetime import datetime, date, timedelta
from typing import Optional
import calendar

# ── Alert priority levels ────────────────────────────────────────────────────
CRITICAL     = "critical"     # red   — act now, financial loss at stake
WARNING      = "warning"      # amber — attention needed soon
INFO         = "info"         # blue  — helpful, not urgent
CELEBRATION  = "celebration"  # green — milestone / good news

# ── Base class ───────────────────────────────────────────────────────────────
class Rule:
    rule_id:        str  = ""
    name:           str  = ""
    cooldown_hours: int  = 24      # don't re-fire within this window per user
    priority:       str  = INFO

    def check(self, ud: dict) -> Optional[dict]:
        """
        Evaluate the rule against user data.
        Returns an alert dict or None.
        ud keys: profile, transactions, goals, holdings, market, preferences
        """
        raise NotImplementedError

    # Helpers
    @staticmethod
    def _inr(n: float) -> str:
        """Format ₹ in Indian system (lakhs/crores)."""
        n = int(n)
        if n >= 1_00_00_000: return f"₹{n/1_00_00_000:.1f}Cr"
        if n >= 1_00_000:    return f"₹{n/1_00_000:.1f}L"
        if n >= 1_000:       return f"₹{n/1_000:.0f}K"
        return f"₹{n}"

    @staticmethod
    def _today() -> date:
        return date.today()


# ═══════════════════════════════════════════════════════════════════════════
# RULE 1 — SIP MISSED
# Fires when a user's SIP date has passed this month but no matching
# transaction was recorded.
# ═══════════════════════════════════════════════════════════════════════════
class SipMissed(Rule):
    rule_id        = "SIP_MISSED"
    name           = "SIP Not Detected"
    cooldown_hours = 72    # don't fire again for 3 days (give them time to fix it)
    priority       = WARNING

    def check(self, ud: dict) -> Optional[dict]:
        goals = ud.get("goals") or []
        txs   = ud.get("transactions") or []
        profile = ud.get("profile") or {}

        # Look for SIP goals
        sip_goals = [g for g in goals if g.get("type") == "sip" or
                     "sip" in str(g.get("name","")).lower()]
        if not sip_goals:
            return None

        today = self._today()
        # Check if today is past the 7th of the month (typical SIP dates: 1,5,7,10,15)
        if today.day < 8:
            return None

        # Check if any SIP-matching transaction exists this month
        this_month_txs = [
            t for t in txs
            if t.get("type") == "investment"
            and datetime.fromisoformat(t["date"]).month == today.month
            and datetime.fromisoformat(t["date"]).year  == today.year
        ]

        if this_month_txs:
            return None   # SIP already recorded this month

        # Estimate total monthly SIP commitment
        total_sip = sum(g.get("monthly_contribution", 0) for g in sip_goals)
        name = profile.get("full_name", "").split()[0] or "Bhai"

        return {
            "title":        "⚠️ SIP Not Detected This Month",
            "message":      (f"{name}, tera SIP {self._inr(total_sip)}/month ka "
                             f"is mahine abhi tak register nahi hua. "
                             f"Bank mein balance check karo — auto-debit set hai?"),
            "action_url":   "/html/calculators.html",
            "action_label": "SIP Calculator dekho",
            "data":         {"total_sip": total_sip, "month": today.month},
        }


# ═══════════════════════════════════════════════════════════════════════════
# RULE 2 — SALARY CREDITED
# Detects a large income transaction in the last 24 hours and triggers
# a personalised budget waterfall suggestion.
# ═══════════════════════════════════════════════════════════════════════════
class SalaryCredited(Rule):
    rule_id        = "SALARY_CREDITED"
    name           = "Salary Credited"
    cooldown_hours = 25 * 24     # once per month max (25 days)
    priority       = INFO

    _MIN_AMOUNT = 15_000  # minimum ₹15K to qualify as salary

    def check(self, ud: dict) -> Optional[dict]:
        txs     = ud.get("transactions") or []
        profile = ud.get("profile") or {}

        # Find large income transaction in last 24h
        cutoff = datetime.now() - timedelta(hours=24)
        salary_tx = None
        for t in txs:
            try:
                tx_dt = datetime.fromisoformat(t.get("date", ""))
            except Exception:
                continue
            if (t.get("type") == "income"
                    and float(t.get("amount", 0)) >= self._MIN_AMOUNT
                    and tx_dt >= cutoff):
                salary_tx = t
                break

        if not salary_tx:
            return None

        amount = float(salary_tx["amount"])
        name   = (profile.get("full_name") or "Bhai").split()[0]

        # Build quick waterfall suggestion
        emergency = 0.1 * amount   # 10% to emergency fund top-up
        invest    = 0.2 * amount   # 20% to investments
        savings   = 0.1 * amount   # 10% to savings

        return {
            "title":        f"💰 {self._inr(amount)} Credited!",
            "message":      (f"{name}, {self._inr(amount)} aaya! "
                             f"Pehle plan karo: {self._inr(invest)} SIP/investment, "
                             f"{self._inr(emergency)} emergency fund, "
                             f"baki spend budget ke andar. "
                             f"Pura breakdown FIN-OS AI se poocho!"),
            "action_url":   "/html/dashboard.html",
            "action_label": "Budget plan karo",
            "data":         {"amount": amount, "suggested_invest": invest},
        }


# ═══════════════════════════════════════════════════════════════════════════
# RULE 3 — MARKET DROP
# Fires when Nifty 50 drops ≥3% in a single day.
# Personalised with the user's portfolio impact if holdings data is available.
# ═══════════════════════════════════════════════════════════════════════════
class MarketDrop(Rule):
    rule_id        = "MARKET_DROP"
    name           = "Nifty Market Drop"
    cooldown_hours = 12    # can fire twice per day max (morning + afternoon)
    priority       = WARNING

    _DROP_THRESHOLD = -3.0  # percent

    def check(self, ud: dict) -> Optional[dict]:
        market   = ud.get("market") or {}
        holdings = ud.get("holdings") or {}
        profile  = ud.get("profile") or {}

        nifty_chg = market.get("nifty_change_pct", 0)
        if nifty_chg > self._DROP_THRESHOLD:
            return None   # drop not large enough (note: threshold is negative)

        nifty_val = market.get("nifty_value", 0)
        name      = (profile.get("full_name") or "Bhai").split()[0]

        # Estimate portfolio impact if we know total equity value
        port_val  = holdings.get("total_equity_value", 0)
        port_drop = ""
        if port_val > 0:
            drop_amt = port_val * (abs(nifty_chg) / 100)
            port_drop = f" Tera portfolio roughly {self._inr(drop_amt)} neeche gaya hoga."

        # Tone: calm, not panic
        return {
            "title":        f"📉 Nifty {abs(nifty_chg):.1f}% Neeche Gira",
            "message":      (f"{name}, aaj Nifty {abs(nifty_chg):.1f}% gira hai "
                             f"({self._inr(nifty_val)} pe hai).{port_drop} "
                             f"SIP investors ke liye yeh opportunity hai — "
                             f"ghabrana nahi, data dekho!"),
            "action_url":   "/html/market-intel.html",
            "action_label": "Market Analysis dekho",
            "data":         {"nifty_change_pct": nifty_chg, "nifty_value": nifty_val,
                             "portfolio_impact": port_val * (abs(nifty_chg) / 100) if port_val else 0},
        }


# ═══════════════════════════════════════════════════════════════════════════
# RULE 4 — GOAL BEHIND SCHEDULE
# Fires when a savings goal's current progress means the user will miss
# their target by ≥20% at current saving rate.
# ═══════════════════════════════════════════════════════════════════════════
class GoalBehind(Rule):
    rule_id        = "GOAL_BEHIND"
    name           = "Goal Behind Schedule"
    cooldown_hours = 7 * 24   # weekly
    priority       = WARNING

    def check(self, ud: dict) -> Optional[dict]:
        goals   = ud.get("goals") or []
        profile = ud.get("profile") or {}
        today   = self._today()

        for goal in goals:
            try:
                deadline = date.fromisoformat(goal.get("target_date") or "")
            except (ValueError, TypeError):
                continue

            if deadline <= today:
                continue   # already past deadline

            target   = float(goal.get("target_amount") or 0)
            saved    = float(goal.get("current_amount") or 0)
            if target <= 0:
                continue

            months_left  = max(1, (deadline.year - today.year) * 12
                                  + deadline.month - today.month)
            gap          = target - saved
            needed_pm    = gap / months_left
            monthly_cont = float(goal.get("monthly_contribution") or 0)

            # If current monthly contribution < 80% of what's needed, alert
            if monthly_cont > 0 and monthly_cont >= needed_pm * 0.8:
                continue   # on track

            goal_name = goal.get("name") or "tumhara goal"
            name      = (profile.get("full_name") or "Bhai").split()[0]

            return {
                "title":        f"🎯 '{goal_name}' Goal Behind Schedule",
                "message":      (f"{name}, '{goal_name}' ke liye "
                                 f"{self._inr(needed_pm)}/month chahiye, "
                                 f"lekin sirf {self._inr(monthly_cont)}/month ja raha hai. "
                                 f"{months_left} mahine baaki hain — "
                                 f"{self._inr(needed_pm - monthly_cont)} badhaana padega!"),
                "action_url":   "/html/dashboard.html",
                "action_label": "Goals review karo",
                "data":         {"goal_id": goal.get("id"), "shortfall_pm": needed_pm - monthly_cont,
                                 "months_left": months_left},
            }
        return None


# ═══════════════════════════════════════════════════════════════════════════
# RULE 5 — CREDIT CARD BILL DUE
# Fires 3 days before a credit card payment due date.
# ═══════════════════════════════════════════════════════════════════════════
class CcBillDue(Rule):
    rule_id        = "CC_BILL_DUE"
    name           = "Credit Card Bill Due"
    cooldown_hours = 48
    priority       = WARNING

    def check(self, ud: dict) -> Optional[dict]:
        profile    = ud.get("profile") or {}
        bill_day   = profile.get("cc_due_day")   # day of month the CC bill is due
        bill_amount= profile.get("cc_outstanding") or 0

        if not bill_day or not bill_amount:
            return None

        today     = self._today()
        due_this_month = today.replace(day=int(bill_day))
        if due_this_month < today:
            # Already past — calculate next month's
            if today.month == 12:
                due_this_month = due_this_month.replace(
                    year=today.year+1, month=1)
            else:
                due_this_month = due_this_month.replace(month=today.month+1)

        days_until_due = (due_this_month - today).days
        if days_until_due > 3 or days_until_due < 0:
            return None

        name = (profile.get("full_name") or "Bhai").split()[0]
        urgency = "AJ HI" if days_until_due == 0 else f"{days_until_due} din mein"

        return {
            "title":        f"💳 CC Bill Due in {days_until_due if days_until_due else 'Today'}!",
            "message":      (f"{name}, tera credit card bill {self._inr(bill_amount)} ka "
                             f"{urgency} due hai! "
                             f"Time pe bhar de — late payment fee + interest compound "
                             f"hota hai. Full payment karo, minimum nahi!"),
            "action_url":   "/html/dashboard.html",
            "action_label": "Bill details dekho",
            "data":         {"due_date": due_this_month.isoformat(),
                             "amount": bill_amount, "days_until_due": days_until_due},
        }


# ═══════════════════════════════════════════════════════════════════════════
# RULE 6 — BUDGET OVERRUN
# Fires when monthly spend exceeds 90% of any budget category.
# ═══════════════════════════════════════════════════════════════════════════
class BudgetOverrun(Rule):
    rule_id        = "BUDGET_OVERRUN"
    name           = "Budget Category Near Limit"
    cooldown_hours = 48
    priority       = WARNING

    _THRESHOLD = 0.90  # 90% of budget used

    def check(self, ud: dict) -> Optional[dict]:
        budget  = ud.get("budget") or {}
        profile = ud.get("profile") or {}

        categories  = budget.get("categories") or {}
        total_budget= budget.get("monthly_budget", 0)
        total_spent = budget.get("total_spent", 0)

        overruns = []

        # Check category-level overruns
        for cat, data in categories.items():
            if isinstance(data, dict):
                limit = float(data.get("limit") or 0)
                spent = float(data.get("spent") or 0)
                if limit > 0 and spent >= limit * self._THRESHOLD:
                    overruns.append({
                        "category": cat,
                        "spent": spent,
                        "limit": limit,
                        "pct": int(spent / limit * 100),
                    })

        # Also check total budget
        if total_budget > 0 and total_spent >= total_budget * self._THRESHOLD:
            overruns.insert(0, {
                "category": "Total Budget",
                "spent": total_spent,
                "limit": total_budget,
                "pct": int(total_spent / total_budget * 100),
            })

        if not overruns:
            return None

        worst = max(overruns, key=lambda x: x["pct"])
        name  = (profile.get("full_name") or "Bhai").split()[0]
        days_left = calendar.monthrange(date.today().year,
                                        date.today().month)[1] - date.today().day

        return {
            "title":        f"💸 {worst['category']} Budget {worst['pct']}% Used!",
            "message":      (f"{name}, {worst['category']} mein "
                             f"{self._inr(worst['spent'])} kharcha ho gaya "
                             f"({worst['pct']}% of {self._inr(worst['limit'])}). "
                             f"Abhi bhi {days_left} din baaki hain month ke — "
                             f"thoda slow down karo!"),
            "action_url":   "/html/dashboard.html",
            "action_label": "Budget tracker dekho",
            "data":         {"overruns": overruns[:3]},
        }


# ═══════════════════════════════════════════════════════════════════════════
# RULE 7 — EMERGENCY FUND LOW
# Fires when emergency fund < 3 months of expenses.
# ═══════════════════════════════════════════════════════════════════════════
class EmergencyFundLow(Rule):
    rule_id        = "EMERGENCY_FUND_LOW"
    name           = "Emergency Fund Below Target"
    cooldown_hours = 7 * 24   # weekly
    priority       = CRITICAL

    _MIN_MONTHS = 3

    def check(self, ud: dict) -> Optional[dict]:
        profile = ud.get("profile") or {}
        budget  = ud.get("budget") or {}

        ef_balance   = float(profile.get("emergency_fund") or 0)
        monthly_exp  = float(budget.get("total_spent") or
                             profile.get("monthly_expenses") or 0)

        if ef_balance <= 0 or monthly_exp <= 0:
            return None

        months_covered = ef_balance / monthly_exp
        if months_covered >= self._MIN_MONTHS:
            return None

        name    = (profile.get("full_name") or "Bhai").split()[0]
        needed  = monthly_exp * self._MIN_MONTHS
        gap     = needed - ef_balance

        return {
            "title":        "🚨 Emergency Fund Critical!",
            "message":      (f"{name}, tera emergency fund sirf "
                             f"{months_covered:.1f} months cover karta hai. "
                             f"Minimum 3 months chahiye — "
                             f"{self._inr(gap)} aur bharni hai liquid fund ya FD mein. "
                             f"Yeh sabse pehli priority hai, SIP se bhi zyada!"),
            "action_url":   "/html/dashboard.html",
            "action_label": "Action plan dekho",
            "data":         {"months_covered": round(months_covered, 1),
                             "gap": gap, "needed": needed},
        }


# ═══════════════════════════════════════════════════════════════════════════
# RULE 8 — TAX SEASON REMINDERS
# Context-aware tax reminders at key Indian financial dates.
# ═══════════════════════════════════════════════════════════════════════════
class TaxSeason(Rule):
    rule_id        = "TAX_SEASON"
    name           = "Tax Season Reminder"
    cooldown_hours = 6 * 24    # max 6 days (some reminders are weekly)
    priority       = INFO

    # (month, day_from, day_to, title, message_template, url, action_label)
    _EVENTS = [
        # Jan 15 — Advance tax 3rd installment
        (1, 10, 15,
         "📊 Advance Tax Installment Due Jan 15",
         "{name}, 15 January deadline hai advance tax ka tera 3rd installment. "
         "Agar income ₹10K+ tax nikli hai, pay kar de — default interest 1%/month padta hai!",
         "/html/calculators.html", "Tax calculate karo"),

        # March — 80C window closing
        (3, 1, 10,
         "⏰ 80C Window Closing — March 31 Last Date!",
         "{name}, sirf March 31 tak invest karke ₹1.5L ka 80C claim kar sakte ho. "
         "Abhi tak kitna invest kiya? ELSS best option hai — tax bachao aur returns bhi!",
         "/html/calculators.html", "80C calculator"),

        # March — NPS top-up for extra ₹50K deduction
        (3, 10, 20,
         "🏦 NPS Top-Up — ₹50K Extra Deduction Available",
         "{name}, NPS Tier-1 mein ₹50K daalte ho toh 80C ke UPAR extra deduction milta hai. "
         "Effectively ₹15K+ tax bachta hai agar 30% slab mein ho. Jaldi karo — March 31 deadline!",
         "/html/calculators.html", "NPS calculator"),

        # March 31 — Final deadline
        (3, 28, 31,
         "🚨 Last 3 Days — FY Closes March 31!",
         "{name}, kal se naya financial year! Aaj poora karo: 80C investments, "
         "advance tax, LTCG harvesting. Kal tak wait mat karo — "
         "March 31 sabse badi financial deadline hai India mein!",
         "/html/calculators.html", "Tax checklist"),

        # April — New FY fresh start
        (4, 1, 5,
         "🎉 Naya Financial Year — FY 2025-26 Shuru!",
         "{name}, Happy New Financial Year! Ab fresh start karo: "
         "new SIP set karo, 80C plan banao, ITR ke liye Form 16 collect karna start karo. "
         "Jinhone saal ki shuruaat mein hi plan kiya — woh winners hain!",
         "/html/dashboard.html", "FY plan banao"),

        # July — ITR deadline
        (7, 1, 10,
         "📄 ITR Filing Deadline July 31 — Shuru Kar Abhi!",
         "{name}, ITR filing ka deadline 31 July hai. "
         "Abhi karo — servers July 30-31 pe CRASH ho jaate hain! "
         "Form 16 aaya? AIS check kiya? ClearTax ya CA se karwa lo!",
         "/html/calculators.html", "Tax resources"),

        # July final reminder
        (7, 25, 31,
         "🚨 ITR Filing — Last Week! July 31 Deadline",
         "{name}, agar abhi tak ITR file nahi ki toh AJ KAR! "
         "July 31 ke baad ₹5,000 penalty + interest. "
         "5 saal ka historical return bhi loss hota hai. Ek ghante ka kaam hai!",
         "/html/calculators.html", "ITR file karo"),

        # December — Advance tax 3rd installment
        (12, 10, 15,
         "📊 Advance Tax Due Dec 15",
         "{name}, December 15 advance tax 3rd installment deadline. "
         "75% annual tax abhi tak pay hona chahiye tha. Check karo!",
         "/html/calculators.html", "Advance tax calculator"),
    ]

    def check(self, ud: dict) -> Optional[dict]:
        profile = ud.get("profile") or {}
        today   = self._today()
        name    = (profile.get("full_name") or "Bhai").split()[0]

        for month, day_from, day_to, title, msg_tpl, url, action in self._EVENTS:
            if today.month == month and day_from <= today.day <= day_to:
                return {
                    "title":        title,
                    "message":      msg_tpl.format(name=name),
                    "action_url":   url,
                    "action_label": action,
                    "data":         {"tax_event": title, "deadline_month": month},
                }
        return None


# ═══════════════════════════════════════════════════════════════════════════
# RULE 9 — F&O EXPIRY WEEK
# Fires in the last 5 days of each month (F&O expiry week).
# Only fires for users who have asked about F&O or hold positions.
# ═══════════════════════════════════════════════════════════════════════════
class FnoExpiryWeek(Rule):
    rule_id        = "FNO_EXPIRY_WEEK"
    name           = "F&O Expiry Week Alert"
    cooldown_hours = 7 * 24   # once per expiry week
    priority       = WARNING

    def check(self, ud: dict) -> Optional[dict]:
        profile  = ud.get("profile") or {}
        holdings = ud.get("holdings") or {}
        prefs    = ud.get("preferences") or {}

        # Only fire if user has F&O exposure or interest
        has_fno = (holdings.get("has_fno_positions")
                   or profile.get("interests") and "fno" in str(profile.get("interests","")).lower()
                   or prefs.get("show_fno_alerts"))
        if not has_fno:
            return None

        today = self._today()
        # Find last Thursday of the month
        last_day    = calendar.monthrange(today.year, today.month)[1]
        last_thurs  = max(d for d in range(last_day, last_day - 7, -1)
                         if date(today.year, today.month, d).weekday() == 3)
        days_to_exp = last_thurs - today.day

        if not (0 <= days_to_exp <= 5):
            return None

        name = (profile.get("full_name") or "Bhai").split()[0]
        fno_val = holdings.get("fno_value", 0)

        return {
            "title":        f"⚡ F&O Expiry in {days_to_exp} Day{'s' if days_to_exp != 1 else ''}!",
            "message":      (f"{name}, F&O expiry {days_to_exp} din mein hai (last Thursday). "
                             + (f"Teri open positions {self._inr(fno_val)} ki hain — " if fno_val else "")
                             + "Square off ya roll over ka decision abhi kar. "
                               "Expiry pe liquidity kam ho jaati hai!"),
            "action_url":   "/html/trading-simulator.html",
            "action_label": "Trading tools dekho",
            "data":         {"expiry_date": date(today.year, today.month, last_thurs).isoformat(),
                             "days_until": days_to_exp, "fno_value": fno_val},
        }


# ═══════════════════════════════════════════════════════════════════════════
# RULE 10 — NET WORTH MILESTONE
# Celebrates when user hits ₹1L, ₹5L, ₹10L, ₹25L, ₹50L, ₹1Cr
# ═══════════════════════════════════════════════════════════════════════════
class NetWorthMilestone(Rule):
    rule_id        = "NETWORTH_MILESTONE"
    name           = "Net Worth Milestone"
    cooldown_hours = 30 * 24   # once per milestone (won't re-fire for same milestone)
    priority       = CELEBRATION

    _MILESTONES = [
        (1_00_000,     "₹1 Lakh",    "🎯"),
        (5_00_000,     "₹5 Lakh",    "🔥"),
        (10_00_000,    "₹10 Lakh",   "💎"),
        (25_00_000,    "₹25 Lakh",   "🚀"),
        (50_00_000,    "₹50 Lakh",   "🏆"),
        (1_00_00_000,  "₹1 Crore",   "👑"),
        (5_00_00_000,  "₹5 Crore",   "🌟"),
    ]

    def check(self, ud: dict) -> Optional[dict]:
        holdings  = ud.get("holdings") or {}
        profile   = ud.get("profile") or {}
        prev_nw   = ud.get("prev_net_worth", 0)   # last recorded net worth
        curr_nw   = holdings.get("total_net_worth", 0)

        if curr_nw <= 0 or prev_nw <= 0:
            return None

        name = (profile.get("full_name") or "Bhai").split()[0]

        for milestone, label, emoji in self._MILESTONES:
            if prev_nw < milestone <= curr_nw:
                years_to_next = None
                # Find next milestone
                for nxt_val, nxt_label, _ in self._MILESTONES:
                    if nxt_val > curr_nw:
                        # Rough estimate at 12% CAGR
                        import math
                        try:
                            years_to_next = math.log(nxt_val / curr_nw) / math.log(1.12)
                            next_label = nxt_label
                        except Exception:
                            pass
                        break

                next_str = (f" Agli milestone {next_label} approximately "
                            f"{years_to_next:.1f} saal mein at 12% CAGR!"
                            if years_to_next else "")

                return {
                    "title":        f"{emoji} Net Worth Milestone: {label} Crossed!",
                    "message":      (f"BHAI {name.upper()}!! "
                                     f"Tune {label} net worth cross kar liya! "
                                     f"Yeh compounding ka kamaal hai — "
                                     f"pehla {label} sabse mushkil hota hai, "
                                     f"ab easy ho jayega!{next_str}"),
                    "action_url":   "/html/dashboard.html",
                    "action_label": "Net worth tracker",
                    "data":         {"milestone": milestone, "current_nw": curr_nw,
                                     "label": label},
                }
        return None


# ═══════════════════════════════════════════════════════════════════════════
# Registry — all active rules
# ═══════════════════════════════════════════════════════════════════════════
ALL_RULES: list[Rule] = [
    SipMissed(),
    SalaryCredited(),
    MarketDrop(),
    GoalBehind(),
    CcBillDue(),
    BudgetOverrun(),
    EmergencyFundLow(),
    TaxSeason(),
    FnoExpiryWeek(),
    NetWorthMilestone(),
]

RULES_BY_ID: dict[str, Rule] = {r.rule_id: r for r in ALL_RULES}
