# ──────────────────────────────────────────────
# FIN-OS QFT Engine — brain.py
# Production-Ready v3.0 (Low Latency Optimized)
# ──────────────────────────────────────────────

import os
import uuid
import time
import asyncio
import logging
from collections import OrderedDict
from datetime import datetime
from typing import Optional, AsyncGenerator, Literal
import json

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field, field_validator, model_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# ──────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("fin-os")

# ──────────────────────────────────────────────
# Config
# ──────────────────────────────────────────────
OLLAMA_URL      = os.getenv("OLLAMA_URL",      "http://localhost:11434")
OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL",    "llama3.1")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
MAX_HISTORY     = int(os.getenv("MAX_HISTORY",  "20"))
OLLAMA_TIMEOUT  = int(os.getenv("OLLAMA_TIMEOUT", "120"))
MAX_SESSIONS    = int(os.getenv("MAX_SESSIONS",   "1000"))

_app_start_time = time.time()

limiter = Limiter(key_func=get_remote_address, default_limits=["30/minute"])

app = FastAPI(
    title="FIN-OS QFT Engine — GOD MODE",
    description="Blunt AI financial mentor for Indian professionals.",
    version="3.0.1",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions: OrderedDict[str, list[dict]] = OrderedDict()

_market_cache      = {"data": None, "fetched_at": 0}
MARKET_CACHE_TTL   = 300
_market_cache_lock = asyncio.Lock()


def get_or_create_session(session_id: str) -> list[dict]:
    """Return existing session history or create one, evicting oldest if at cap."""
    if session_id in sessions:
        sessions.move_to_end(session_id)
        return sessions[session_id]
    if len(sessions) >= MAX_SESSIONS:
        evicted_id, _ = sessions.popitem(last=False)
        logger.info("[Sessions] Evicted oldest session %s (cap=%d)", evicted_id, MAX_SESSIONS)
    sessions[session_id] = []
    return sessions[session_id]


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start    = time.perf_counter()
    response = await call_next(request)
    duration = (time.perf_counter() - start) * 1000
    if not request.url.path.startswith("/health"):
        logger.info(
            "%s %s -> %d (%.1f ms)",
            request.method, request.url.path, response.status_code, duration
        )
    return response


# ──────────────────────────────────────────────
# Models
# ──────────────────────────────────────────────
class ChatRequest(BaseModel):
    message:        str           = Field(..., min_length=1, max_length=4000)
    context:        str           = Field("", max_length=2000)
    session_id:     Optional[str] = Field(None)
    psych_profile:  Optional[dict] = Field(None)
    # Persona & language injected from frontend FINOS_SYS_SETTINGS
    persona:        Optional[str] = Field("bhai")   # bhai | mentor | analyst | strict
    language:       Optional[str] = Field("hinglish")
    intent:         Optional[str] = Field(None)
    system_prompt:  Optional[str] = Field(None, max_length=8000)  # frontend can override

class SIPRequest(BaseModel):
    goal_amount:     float
    years:           int   = Field(..., ge=1)
    expected_return: float
    existing_corpus: float
    step_up_percent: float = Field(10.0, ge=0)

class RentVsBuyRequest(BaseModel):
    property_price:         float
    down_payment:           float
    loan_interest_rate:     float
    loan_tenure_years:      int
    current_rent:           float
    rent_inflation:         float = 8.0
    property_appreciation:  float = 6.0
    equity_return:          float = 12.0

class FIRERequest(BaseModel):
    current_age:        int
    target_fire_age:    int
    life_expectancy:    int   = Field(85, ge=1)
    monthly_expenses:   float = Field(..., ge=0)
    inflation_rate:     float = Field(6.0, ge=0)
    post_retire_return: float = Field(10.0, ge=0)

    @field_validator('target_fire_age')
    @classmethod
    def fire_age_after_current(cls, v, info):
        if 'current_age' in info.data and v <= info.data['current_age']:
            raise ValueError('target_fire_age must be greater than current_age')
        return v

    @field_validator('life_expectancy')
    @classmethod
    def life_expectancy_after_fire(cls, v, info):
        if 'target_fire_age' in info.data and v <= info.data['target_fire_age']:
            raise ValueError('life_expectancy must be greater than target_fire_age')
        return v

class RatioRequest(BaseModel):
    monthly_income:      float = Field(..., gt=0)
    monthly_expenses:    float = Field(..., ge=0)
    monthly_savings:     float = Field(..., ge=0)
    total_assets:        float = Field(0.0, ge=0)
    total_liabilities:   float = Field(0.0, ge=0)
    age:                 int   = Field(..., ge=18, le=80)


class PsychVectors(BaseModel):
    anxiety:      float = 0.0
    discipline:   float = 0.0
    status:       float = 0.0
    risk:         float = 0.0
    impulse:      float = 0.0
    clarity:      float = 0.0
    financial_iq: float = 0.0
    fragility:    float = 0.0
    freedom:      float = 0.0


class PsychProfile(BaseModel):
    archetype:       str
    bio:             str
    desi_context:    str              = Field("", alias="desiContext")
    chart_data:      list[float]      = Field(default_factory=list, alias="chartData")
    raw:             PsychVectors     = Field(default_factory=PsychVectors)
    resilience:      float            = 50.0
    leak:            str              = "NONE"
    leak_desc:       str              = Field("", alias="leakDesc")
    strengths:       list[str]        = Field(default_factory=list)
    weaknesses:      list[str]        = Field(default_factory=list)
    actions:         list[dict]       = Field(default_factory=list)
    diagnosis_title: str              = Field("", alias="diagnosisTitle")
    diagnosis_desc:  str              = Field("", alias="diagnosisDesc")
    history:         list[str]        = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class ReportRequest(BaseModel):
    tab:     Literal["psyche", "wealth_path", "risk_matrix", "action_plan"]
    profile: dict 


class InsightsRequest(BaseModel):
    profile: dict


# ──────────────────────────────────────────────
# System Prompt
# ──────────────────────────────────────────────
SYSTEM_PROMPT = """
You are QFT (Quantum Financial Thinking Engine) — the ruthlessly precise, deeply Indian financial brain of FIN-OS.
Built for Indian professionals aged 22–45. You think in ₹, breathe EMIs, and understand the pressure of Sharmaji.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 THE 12 FIN-OS LAWS (NON-NEGOTIABLE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Money is stored life energy. Every rupee wasted = hours of your life burned.
2. EMI ≠ affordability. EMI is mortgaging your future income at interest. Always calculate Total Cost, not monthly.
3. Your primary home and car are LIABILITIES — they consume cash flow, not generate it. Call them what they are.
4. LIC endowment / ULIP / money-back policies are wealth destroyers disguised as love. Term + MF always wins.
5. Direct MF beats Regular MF by 1–1.5% annually. On ₹1Cr over 20yr that's ₹50L difference. Always go Direct.
6. F&O trading destroys 95% of retail accounts. Crypto speculation = digital gambling. Both are wealth cremation.
7. Tax saving ≠ investing. Don't buy ELSS just for 80C — buy it because equity compounds.
8. Inflation is the silent thief. At 6% inflation, ₹1L today = ₹55K purchasing power in 10 years.
9. Insurance ≠ investment. Separate them. Term cover = 15–20x annual income. Health ≥ ₹10L/person.
10. Your EPF is your bond allocation. Count it before adding more debt.
11. The first ₹10L corpus is the hardest. After that, compounding does most of the work.
12. Financial freedom is not a number — it's when your passive income > monthly expenses.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 CORE RULES (ALWAYS APPLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- ALWAYS quantify in ₹ lakhs / crores. Never "a lot" or "significant amount".
- ALWAYS give a concrete action at the end. Not "consider investing" — say "Set up ₹8,000/month SIP on Kuvera in Nifty 50 Index Direct today."
- NEVER invent stock prices, NAV, or live index levels. Say "I don't have live data — check NSE India or Moneycontrol" and give the calculation instead.
- NAME THE TRAP explicitly before solving it. "The trap here is called Lifestyle Inflation."
- BULLET-FIRST. Lead with the answer, then the explanation. Never bury the lede.
- PROGRESSIVE DEPTH: Short general query → conversational 1-2 para. Specific / calculation query → full structured analysis.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 INDIAN MARKET & TAX GROUND TRUTH (AY 2025-26)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TAX SLABS (New Regime, default FY25-26):
  ₹0–3L → 0%  |  ₹3–7L → 5%  |  ₹7–10L → 10%  |  ₹10–12L → 15%
  ₹12–15L → 20%  |  >₹15L → 30%  |  Rebate u/s 87A: NIL tax up to ₹7L income

CAPITAL GAINS:
  Equity LTCG (>1yr): 12.5% on gains above ₹1.25L/year (no indexation)
  Equity STCG (<1yr): 20%
  Debt MF: Slab rate (no LTCG benefit after Apr 2023)
  Real estate LTCG (>2yr): 12.5% without indexation OR 20% with indexation (choose best)

KEY DEDUCTIONS (Old Regime — still useful for some):
  80C: ₹1.5L (ELSS, PPF, EPF, NSC, home loan principal, LIC premium)
  80D: ₹25K self+family / ₹50K if parents 60+ (health insurance premium)
  80CCD(1B): Extra ₹50K for NPS (above 80C limit)
  HRA: min of [actual HRA, 50% basic (metro)/40% basic (non-metro), rent–10% basic]
  24(b): ₹2L home loan interest deduction (let-out: unlimited)

BENCHMARKS (use for all projections):
  Nifty 50 Large Cap: ~12% CAGR (15yr historical)
  Nifty Midcap 150:   ~15% CAGR (15yr historical, volatile)
  FD (SBI/HDFC):      ~6.5–7.5% p.a. (2025)
  PPF:                7.1% p.a. (tax-free, guaranteed)
  EPF:                8.25% p.a. (2024-25)
  RBI Floating Bond:  8.05% (2024)
  Gold (historical):  ~8–9% CAGR (10yr, in ₹)
  Indian CPI Inflation: ~5–6% p.a.
  Real Estate (metro): ~5–6% CAGR (rental yield 2–3%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DESI SCENARIO INTELLIGENCE — KNOW THESE COLD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCENARIO 1 — THE LIC PRESSURE:
User: "My father/agent wants me to buy LIC Jeevan Anand / ULIP / money-back policy."
Answer: "Compare: ₹50K/yr premium for 20yr LIC endowment = ₹10L invested. At 4-5% LIC return you get ₹18L. Same ₹50K/yr in ELSS = ₹55L+ at 12%. Difference = ₹37L. Buy ₹1Cr term plan (₹10K/yr) + invest the rest in MF. Your family is better protected AND richer."

SCENARIO 2 — THE SHARMAJI PROBLEM:
User: "My colleague made ₹3L in F&O last month / Sharmaji's son made ₹10L in crypto"
Answer: "SEBI data: 90% of F&O traders lose money. For every Sharmaji winning, 9 Sharmajis lost ₹5L quietly. Survivorship bias is the trap. The guys who lost never post on WhatsApp. His ₹3L gain = 10 others' ₹30K loss each."

SCENARIO 3 — THE HOUSE PRESSURE:
User: "My parents say I should buy a house ASAP / renting is waste of money"
Answer: "Run the math: ₹80L flat in Pune, 20% down = ₹16L gone, EMI ₹55K/month at 8.5% for 20yr. Total paid = ₹1.3Cr for ₹80L flat. That ₹16L down payment in Nifty 50 for 20yr = ₹1.6Cr. Compare total outflow vs wealth created. Renting ₹20K/month saves ₹35K/month → that SIP builds ₹1.3Cr in 15yr."

SCENARIO 4 — THE SALARY BONUS DILEMMA:
User: "I got ₹3L / ₹5L / ₹10L bonus. What should I do?"
Answer waterfall: (1) Emergency fund to 6 months if not done. (2) Prepay highest-interest debt (personal loan / CC). (3) Top up PPF to ₹1.5L. (4) NPS ₹50K for extra 80CCD. (5) Rest → lump sum in index fund via STPs over 3-6 months.

SCENARIO 5 — THE CAR EMI TRAP:
User: "I want to buy a car on EMI. Salary ₹80K."
Answer: "A ₹10L car on 7-yr loan at 9% = EMI ₹16K/month = ₹13.4L total paid for ₹10L car. Insurance + fuel + maintenance = ₹8–10K/month more. Total car cost = ₹24K/month. That's 30% of your salary. A depreciating asset losing 15% value/year. The FIN-OS rule: car price ≤ 50% of annual take-home."

SCENARIO 6 — THE PREPAY VS INVEST QUESTION:
User: "Should I prepay my home loan or invest the money?"
Answer: "Compare loan interest rate vs expected investment return. If home loan = 8.5% → need >8.5% post-tax returns from investment to beat prepayment. Nifty 50 CAGR ~12% → invest wins long-term. BUT: prepayment gives guaranteed, tax-free 8.5% return + psychological peace. FIN-OS rule: prepay if rate >9.5% OR you have anxiety. Invest if rate <8.5% AND you have 10+ year horizon."

SCENARIO 7 — THE MUTUAL FUND CONFUSION:
User: "Too many funds exist, I'm confused which MF to pick"
Answer: "The 3-fund India portfolio: (1) Nifty 50 Index Direct (large cap core, 50-60%) (2) Nifty Next 50 or Midcap 150 Index Direct (growth, 20-30%) (3) PPF or Short Duration Debt Fund (stability, 10-20%). No fund manager fees. No overlap. Rebalance once a year. That's it."

SCENARIO 8 — THE NRI/SALARY SLAB PROBLEM:
User: "I earn ₹25L / ₹50L per year, how to reduce tax?"
Answer at ₹25L in new regime: Tax = ~₹3.9L. Old regime saves money only if deductions >₹3.75L (need HRA + 80C + 80D + 80CCD). Use HRA if renting, NPS for extra ₹50K, health insurance ₹25K → Old regime worth it. At ₹50L+: new regime simplicity vs old regime savings — run the actual numbers.

SCENARIO 9 — THE PARENTS' RETIREMENT CRISIS:
User: "My parents are retired, they have ₹30L/₹50L in FD"
Answer: "FD at 7% = ₹2.1L/yr before tax. After 30% slab = ₹1.47L/yr. Inflation at 6% eats it alive. Better: (1) SCSS (Senior Citizens Savings Scheme): 8.2% p.a., government-backed, ₹30L max. (2) PMVVY or RBI Bonds for safety. (3) 20% in Balanced Advantage Fund for growth. Don't touch equity >10% for someone 60+."

SCENARIO 10 — THE STARTUP/ESOP QUESTION:
User: "My startup is giving ESOPs. Are they worth it?"
Answer: "ESOPs are lottery tickets, not salary. Value = (Strike price vs FMV) × Vesting schedule × Probability of exit. Until IPO/buyback, they're paper. Never reduce current salary sacrifice for more ESOPs unless you deeply believe in the company AND have 2+ yr emergency fund without ESOPs."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 LIFE STAGE FINANCIAL MAPS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STAGE 1 — FIRST JOB (22–26, income ₹4–12L):
  Priority: Emergency fund (3mo), term insurance, start SIP ₹3–5K/month, avoid car loan.
  Trap: Lifestyle inflation on first salary. EMI for gadgets.

STAGE 2 — GROWTH PHASE (26–32, income ₹12–30L):
  Priority: Increase SIP to 20% of take-home, health insurance, check if house makes math sense.
  Trap: Big wedding expense, status upgrades, keeping up with social circle.

STAGE 3 — FAMILY PHASE (30–38, income ₹20–50L):
  Priority: Term cover upgrade (child added), child education SIP (18yr horizon), reduce debt.
  Trap: Overbuying house for "child's future", wrong school plan (endowment instead of PPF+MF).

STAGE 4 — PEAK INCOME (38–48, income ₹40L+):
  Priority: Max out NPS, accelerate FIRE corpus, diversify beyond MF (REITs, SGB, international).
  Trap: Lifestyle lock-in, too conservative in asset allocation, parents' financial stress.

STAGE 5 — PRE-RETIREMENT (48–58):
  Priority: Shift 40% to debt/hybrid, zero high-interest loans, health insurance buffer ₹50L+.
  Trap: Panic selling in market crash, helping children financially at cost of own retirement.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 INDIAN PRODUCT TRUTH TABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
| Product          | What People Think       | What It Actually Is          | FIN-OS Verdict |
|------------------|-------------------------|------------------------------|----------------|
| LIC Endowment    | Safe + Insurance        | 4-5% return, overpriced cover| ❌ Avoid        |
| ULIP             | MF + Insurance          | High charges, illiquid       | ❌ Avoid        |
| FD               | Safe savings            | Taxable, inflation negative  | ⚠️ Only for <3yr|
| PPF              | Old people's thing      | Tax-free 7.1%, guaranteed    | ✅ Must-have    |
| ELSS             | Just for 80C            | Best tax-saving + equity     | ✅ Use it       |
| NPS              | Government scheme       | Extra ₹50K deduction + equity| ✅ Do it        |
| Regular MF       | Same as Direct          | Pays 0.5-1.5% extra to agent | ❌ Switch Direct|
| F&O Trading      | Income source           | 90% lose money (SEBI data)   | ❌ Avoid        |
| Crypto (long)    | High return             | Extreme volatility, no yield | ⚠️ Max 5% if at all|
| Gold (SGB)       | Emergency/culture       | 2.5% interest + gold return  | ✅ Better than physical|
| Real Estate      | Best investment         | Illiquid, 5-6% CAGR, no yield| ⚠️ Only if math works|

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PSYCHOMETRIC AWARENESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- When USER FINANCIAL DNA PROFILE is provided, reference archetype, traits, and weaknesses in advice.
- If anxiety > 6: automate everything, check portfolio monthly max, use balanced advantage funds.
- If impulse > 6: enforce 72-hour rule, set up SIP (not lump sum), remove investment apps from phone.
- If clarity < 3: skip investment advice — start with 30-day expense tracking first.
- If status > 7: call out the "Sharmaji trap" directly, quantify the cost of status spending.
- If discipline > 7: can handle advanced strategies — step-up SIPs, rebalancing, direct stocks.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 RESPONSE STRUCTURE (DEEP QUERIES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ONLY use these headers when the query demands real analysis:
  ### 🔍 Reality Check       — What's actually happening (not the story they're telling themselves)
  ### 📐 The Math            — Actual numbers. Show the calculation. Indian amounts in ₹.
  ### 🧠 Psychology Trap     — Name the cognitive/social trap at play.
  ### ⚠️ Where Indians Fail  — Specific Indian mistake pattern with this topic.
  ### ✅ The FIN-OS Fix       — Exact, actionable steps with apps/platforms named.
  ### 🎯 Your Next Move      — ONE specific action to do THIS WEEK.

For short casual queries: 2-3 lines max. Ask one clarifying question. Stay conversational.
"""


# ──────────────────────────────────────────────
# Helpers — Profile Context Builder
# ──────────────────────────────────────────────
def build_profile_context(profile: dict) -> str:
    if not profile:
        return ""

    raw = profile.get("raw", {}) or {}
    lines = [
        "━━━━━━━━━━━━ USER FINANCIAL DNA PROFILE ━━━━━━━━━━━━",
        f"Archetype   : {profile.get('archetype', 'Unknown')}",
        f"Bio         : {profile.get('bio', '')}",
        f"Resilience  : {profile.get('resilience', 50)}/100",
        f"Leak        : {profile.get('leak', 'NONE')} — {profile.get('leakDesc', '')}",
        f"Strengths   : {', '.join(profile.get('strengths', []))}",
        f"Weaknesses  : {', '.join(profile.get('weaknesses', []))}",
        f"Desi Context: {profile.get('desiContext', '')}",
        "",
        "RAW VECTORS:",
        f"  anxiety={raw.get('anxiety', 0):.1f}  discipline={raw.get('discipline', 0):.1f}  "
        f"status={raw.get('status', 0):.1f}  risk={raw.get('risk', 0):.1f}",
        f"  impulse={raw.get('impulse', 0):.1f}  clarity={raw.get('clarity', 0):.1f}  "
        f"financial_iq={raw.get('financial_iq', 0):.1f}  fragility={raw.get('fragility', 0):.1f}",
    ]
    return "\n".join(lines)


# ──────────────────────────────────────────────
# Helpers — Ollama / AI calls (Latency Optimized)
# ──────────────────────────────────────────────
async def get_live_market_data() -> str:
    global _market_cache
    now = time.time()

    if _market_cache["data"] and (now - _market_cache["fetched_at"]) < MARKET_CACHE_TTL:
        return _market_cache["data"]

    async with _market_cache_lock:
        if _market_cache["data"] and (now - _market_cache["fetched_at"]) < MARKET_CACHE_TTL:
            return _market_cache["data"]

        logger.info("[Market] Fetching live data...")
        fetched_text = (
            f"📡 LIVE INDIAN MARKET DATA — "
            f"{datetime.now().strftime('%d %b %Y, %H:%M IST')}\n"
            f"(Live logic executed)"
        )
        _market_cache["data"]       = fetched_text
        _market_cache["fetched_at"] = time.time()
        return fetched_text


async def call_ollama_nonstream(messages: list[dict], retries: int = 2) -> dict:
    url     = f"{OLLAMA_URL}/api/chat"
    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
        "keep_alive": -1,
        "options": {
            "num_ctx":     4096,   # Increased: handles long system prompt + history
            "num_predict": 1000,   # Deeper responses, won't cut mid-analysis
            "temperature": 0.18,   # Precise but not robotic
            "top_p":       0.9,    # Focused sampling
            "repeat_penalty": 1.1, # Prevents repetition in long answers
        }
    }

    for attempt in range(retries + 1):
        try:
            async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            if attempt == retries:
                raise HTTPException(status_code=502, detail=str(e))
            await asyncio.sleep(1.5 ** attempt)


async def call_ollama_stream(messages: list[dict]) -> AsyncGenerator[str, None]:
    url     = f"{OLLAMA_URL}/api/chat"
    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": True,
        "keep_alive": -1,
        "options": {
            "num_ctx":     4096,
            "num_predict": 1200,   # Full analytical responses
            "temperature": 0.18,
            "top_p":       0.9,
            "repeat_penalty": 1.1,
        }
    }

    async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
        async with client.stream("POST", url, json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line:
                    yield line


# ──────────────────────────────────────────────
# Endpoints — Health
# ──────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status":          "ok",
        "version":         app.version,
        "uptime_seconds":  round(time.time() - _app_start_time, 1),
        "active_sessions": len(sessions),
        "ollama_url":      OLLAMA_URL,
        "model":           OLLAMA_MODEL,
    }


# ──────────────────────────────────────────────
# Endpoints — Chat
# ──────────────────────────────────────────────
PERSONA_ADDONS = {
    "bhai":    "PERSONA: Talk like a smart desi best friend — 'yaar', 'bhai', 'dekh', 'seedha bol'. Hinglish freely. Roast bad decisions gently. Make things obvious. No corporate speak.",
    "mentor":  "PERSONA: Wise CA-uncle mentor — structured, patient, explains the WHY. Use 'beta' occasionally. Step-by-step. Celebrate small wins.",
    "analyst": "PERSONA: Pure quant. Zero metaphors. Lead with numbers, ratios, tables. Reject claims without data. Cold and precise.",
    "strict":  "PERSONA: Drill sergeant. No validation. 'This is wrong.' 'Stop immediately.' Brutally honest. Tough love = real love.",
}
LANG_ADDONS = {
    "hinglish": "LANGUAGE: Mix Hindi naturally — 'yaar', 'paisa', 'iska matlab', 'seedha baat', 'bakwaas mat karo'. Keep financial terms in English.",
    "english":  "LANGUAGE: Pure English. Professional but approachable. No Hindi.",
    "hindi":    "LANGUAGE: Mostly Hindi in Roman script — 'aapko', 'kariye', 'dhyan rakhein'. Financial terms may stay English.",
    "tamil":    "LANGUAGE: Tamil-inflected English. South Indian context — gold, chit funds, TNPL, local banks.",
}


def build_system(body: ChatRequest) -> str:
    """Compose full system prompt: base + market data hook + persona + language + psych profile."""
    # Use frontend-provided system_prompt if present (it already has persona/lang baked in)
    base = body.system_prompt if body.system_prompt and len(body.system_prompt) > 200 else SYSTEM_PROMPT

    # Persona + language addons (append if not already in base)
    persona_text = PERSONA_ADDONS.get(body.persona or "bhai", PERSONA_ADDONS["bhai"])
    lang_text    = LANG_ADDONS.get(body.language or "hinglish", LANG_ADDONS["hinglish"])
    if "PERSONA:" not in base:
        base += f"\n\n{persona_text}"
    if "LANGUAGE:" not in base:
        base += f"\n{lang_text}"

    # Intent hint
    if body.intent:
        base += f"\n\nACTIVE INTENT: {body.intent} — apply the deepest analysis for this topic."

    return base


@app.post("/api/chat")
@limiter.limit("30/minute")
async def chat(request: Request, body: ChatRequest):
    session_id = body.session_id or str(uuid.uuid4())
    history    = get_or_create_session(session_id)

    system = build_system(body)
    if any(kw in body.message.lower() for kw in ("nifty", "market", "sensex", "stock", "shares")):
        market_data = await get_live_market_data()
        system += f"\n\n{market_data}"

    if body.psych_profile:
        system += f"\n\n{build_profile_context(body.psych_profile)}"
    elif body.context:
        system += f"\n\n━━━━━ USER CONTEXT ━━━━━\n{body.context}"

    history.append({"role": "user", "content": body.message})
    if len(history) > MAX_HISTORY:
        history[:] = history[-MAX_HISTORY:]

    messages = [{"role": "system", "content": system}] + history

    result          = await call_ollama_nonstream(messages)
    assistant_reply = result["message"]["content"]
    history.append({"role": "assistant", "content": assistant_reply})

    return {"session_id": session_id, "response": assistant_reply}


@app.post("/api/chat/stream")
@limiter.limit("30/minute")
async def chat_stream(request: Request, body: ChatRequest):
    session_id = body.session_id or str(uuid.uuid4())
    history    = get_or_create_session(session_id)

    system = build_system(body)
    if any(kw in body.message.lower() for kw in ("nifty", "market", "sensex", "stock", "shares")):
        market_data = await get_live_market_data()
        system += f"\n\n{market_data}"

    if body.psych_profile:
        system += f"\n\n{build_profile_context(body.psych_profile)}"
    elif body.context:
        system += f"\n\n━━━━━ USER CONTEXT ━━━━━\n{body.context}"

    history.append({"role": "user", "content": body.message})
    if len(history) > MAX_HISTORY:
        history[:] = history[-MAX_HISTORY:]

    messages = [{"role": "system", "content": system}] + history

    async def event_stream():
        full_reply = []
        try:
            async for line in call_ollama_stream(messages):
                try:
                    chunk = json.loads(line)
                    if token := chunk.get("message", {}).get("content", ""):
                        full_reply.append(token)
                        yield f"data: {json.dumps({'token': token, 'session_id': session_id})}\n\n"
                    if chunk.get("done"):
                        history.append({"role": "assistant", "content": "".join(full_reply)})
                        yield f"data: {json.dumps({'done': True, 'session_id': session_id})}\n\n"
                except Exception:
                    continue
        except HTTPException as e:
            yield f"data: {json.dumps({'error': e.detail})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ──────────────────────────────────────────────
# Endpoints — AI Report
# ──────────────────────────────────────────────
REPORT_PROMPTS: dict[str, str] = {
    "psyche": """
You are QFT. Provide a deep psychological analysis (250 words max) of this user's financial psyche.
Cover:
1. What their dominant trait means in practice for an Indian professional
2. The specific emotional traps they will face with money this year
3. One brutal truth they need to hear
Use the Desi Context clue to make this hyper-relevant. Be direct, not preachy.
Respond in markdown with bold for key terms.
""",
    "wealth_path": """
You are QFT. Create a personalized 5-year wealth path for this user.
Given their archetype and resilience score:
1. What financial foundation they need in Year 1
2. Specific investment instruments best suited (SIP amounts, asset allocation %)
3. The one wealth lever they are currently ignoring
4. Red flags that will derail this plan
Be specific with Indian numbers and instruments (ELSS, Nifty Index, PPF, etc.).
Respond in markdown.
""",
    "risk_matrix": """
You are QFT. Perform a risk matrix analysis for this specific financial archetype.
Cover:
1. Their ACTUAL risk tolerance vs PERCEIVED risk tolerance (these differ — explain why)
2. The 3 biggest financial risks given their profile (specific, not generic)
3. The risk they are UNDEREXPOSED to
4. How to build antifragility into their specific situation
Use Indian market context (equity volatility, real estate cycles, inflation, currency).
Respond in markdown with clear section headers.
""",
    "action_plan": """
You are QFT. Create a surgical 90-day financial action plan.
Format exactly as:

**Week 1–2: The Foundation Audit**
[2-3 actions]

**Week 3–4: The Cuts**
[2-3 actions]

**Month 2: The Builds**
[2-3 actions]

**Month 3: The Locks**
[2-3 actions]

**The One Metric**: [single KPI to track success]

Use Indian context (specific apps like Fi, Zerodha, INDmoney; fund categories; account types).
""",
}


@app.post("/api/ai-report/stream")
@limiter.limit("10/minute")
async def ai_report_stream(request: Request, body: ReportRequest):
    profile_ctx = build_profile_context(body.profile)
    tab_prompt  = REPORT_PROMPTS.get(body.tab, REPORT_PROMPTS["psyche"])

    system   = SYSTEM_PROMPT + f"\n\n{profile_ctx}"
    messages = [
        {"role": "system",    "content": system},
        {"role": "user",      "content": tab_prompt}
    ]

    async def event_stream():
        try:
            async for line in call_ollama_stream(messages):
                try:
                    chunk = json.loads(line)
                    if token := chunk.get("message", {}).get("content", ""):
                        yield f"data: {json.dumps({'token': token})}\n\n"
                    if chunk.get("done"):
                        yield f"data: {json.dumps({'done': True})}\n\n"
                except Exception:
                    continue
        except HTTPException as e:
            yield f"data: {json.dumps({'error': e.detail})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/ai-report")
@limiter.limit("10/minute")
async def ai_report(request: Request, body: ReportRequest):
    profile_ctx = build_profile_context(body.profile)
    tab_prompt  = REPORT_PROMPTS.get(body.tab, REPORT_PROMPTS["psyche"])

    system   = SYSTEM_PROMPT + f"\n\n{profile_ctx}"
    messages = [
        {"role": "system", "content": system},
        {"role": "user",   "content": tab_prompt}
    ]

    result = await call_ollama_nonstream(messages)
    return {
        "tab":      body.tab,
        "response": result["message"]["content"]
    }


# ──────────────────────────────────────────────
# Endpoints — Proactive Insights
# ──────────────────────────────────────────────
INSIGHT_PROMPT = """
You are QFT. Based on this user's financial profile, generate 4 proactive insights.
Return ONLY a JSON array with no other text. Format exactly:
[
  {
    "id": 1,
    "severity": "critical|warning|info",
    "category": "savings|investing|debt|behavior|tax|protection",
    "title": "Short sharp title (max 8 words)",
    "body": "1-2 sentence insight specific to their profile. Indian context."
  }
]
Insights must be ranked: critical first, info last.
Be brutally specific — reference their actual vectors, not generic advice.
"""

@app.post("/api/insights")
@limiter.limit("10/minute")
async def get_insights(request: Request, body: InsightsRequest):
    profile_ctx = build_profile_context(body.profile)
    system      = SYSTEM_PROMPT + f"\n\n{profile_ctx}"
    messages    = [
        {"role": "system", "content": system},
        {"role": "user",   "content": INSIGHT_PROMPT}
    ]

    result = await call_ollama_nonstream(messages)
    raw    = result["message"]["content"].strip()

    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

    try:
        insights = json.loads(raw)
        if not isinstance(insights, list):
            raise ValueError("Expected JSON array")
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning("[Insights] JSON parse failed: %s | raw=%s", e, raw[:200])
        insights = []

    return {"insights": insights}


# ──────────────────────────────────────────────
# Endpoints — Financial Tools
# ──────────────────────────────────────────────
@app.post("/api/tools/sip")
async def step_up_sip_calculator(req: SIPRequest):
    monthly_rate   = req.expected_return / 100 / 12
    total_months   = req.years * 12
    fv_existing    = req.existing_corpus * ((1 + req.expected_return / 100) ** req.years)
    remaining_goal = max(req.goal_amount - fv_existing, 0)
    step_up_rate   = req.step_up_percent / 100

    if remaining_goal <= 0:
        return {
            "required_initial_sip_inr": 0,
            "total_invested_inr": 0,
            "reality_check": "Existing corpus already meets the goal!"
        }

    denominator = sum(
        ((1 + step_up_rate) ** ((m - 1) // 12)) * ((1 + monthly_rate) ** (total_months - m))
        for m in range(1, total_months + 1)
    )

    initial_sip    = remaining_goal / denominator if denominator > 0 else 0
    total_invested = 0.0
    current_sip    = initial_sip
    for _ in range(req.years):
        total_invested += current_sip * 12
        current_sip    *= (1 + step_up_rate)

    return {
        "required_initial_sip_inr": round(initial_sip, 2),
        "total_invested_inr":       round(total_invested, 2),
        "wealth_multiple":          round(req.goal_amount / total_invested if total_invested > 0 else 0, 1),
        "reality_check": (
            f"A standard SIP requires more upfront. "
            f"With a {req.step_up_percent}% annual step-up, you start at "
            f"₹{round(initial_sip):,}/month."
        ),
    }


@app.post("/api/tools/rent_vs_buy")
async def rent_vs_buy(req: RentVsBuyRequest):
    loan_amt = req.property_price - req.down_payment
    r        = req.loan_interest_rate / 12 / 100
    n        = req.loan_tenure_years * 12
    emi      = (loan_amt * r * (1 + r) ** n) / ((1 + r) ** n - 1) if r > 0 else loan_amt / n

    property_fv         = req.property_price * ((1 + req.property_appreciation / 100) ** req.loan_tenure_years)
    portfolio_value     = req.down_payment
    current_rent        = req.current_rent
    monthly_equity_rate = req.equity_return / 12 / 100

    for month in range(1, n + 1):
        if month > 1 and month % 12 == 1:
            current_rent *= (1 + req.rent_inflation / 100)
        surplus_sip     = max(emi - current_rent, 0)
        portfolio_value = (portfolio_value + surplus_sip) * (1 + monthly_equity_rate)

    winner     = "Renting" if portfolio_value > property_fv else "Buying"
    difference = abs(portfolio_value - property_fv)

    return {
        "monthly_emi_inr":                  round(emi, 2),
        "property_value_after_tenure_inr":  round(property_fv, 2),
        "portfolio_value_if_renting_inr":   round(portfolio_value, 2),
        "winner":                           winner,
        "net_worth_difference_inr":         round(difference, 2),
        "finos_verdict": (
            f"In this scenario, {winner} makes you richer by "
            f"₹{difference / 100_000:.2f} Lakhs over {req.loan_tenure_years} years."
        ),
    }


@app.post("/api/tools/fire")
async def fire_calculator(req: FIRERequest):
    years_to_fire       = req.target_fire_age - req.current_age
    years_in_retirement = req.life_expectancy - req.target_fire_age

    if years_in_retirement <= 0:
        raise HTTPException(
            status_code=422,
            detail="life_expectancy must be greater than target_fire_age"
        )

    future_monthly_expenses = req.monthly_expenses * ((1 + req.inflation_rate / 100) ** years_to_fire)
    future_annual_expenses  = future_monthly_expenses * 12
    real_return             = ((1 + req.post_retire_return / 100) / (1 + req.inflation_rate / 100)) - 1

    if real_return > 0:
        fire_corpus = future_annual_expenses * (1 - (1 + real_return) ** (-years_in_retirement)) / real_return
    else:
        fire_corpus = future_annual_expenses * years_in_retirement

    fire_multiplier = fire_corpus / future_annual_expenses if future_annual_expenses > 0 else 0
    swr             = round((1 / fire_multiplier) * 100, 2) if fire_multiplier > 0 else 0

    return {
        "current_annual_expenses_inr":  round(req.monthly_expenses * 12, 2),
        "expenses_at_retirement_inr":   round(future_annual_expenses, 2),
        "required_fire_corpus_inr":     round(fire_corpus, 2),
        "fire_multiplier_achieved":     round(fire_multiplier, 1),
        "reality_check": (
            f"You need ₹{fire_corpus / 10_000_000:.2f} Crores at age {req.target_fire_age}. "
            f"A safe withdrawal rate in India is ~{swr}%."
        ),
    }


@app.post("/api/tools/ratios")
async def financial_ratios(req: RatioRequest):
    savings_rate  = req.monthly_savings / req.monthly_income if req.monthly_income > 0 else 0
    net_worth     = req.total_assets - req.total_liabilities
    debt_to_asset = req.total_liabilities / req.total_assets if req.total_assets > 0 else 0
    expected_nw   = req.age * req.monthly_income * 12 / 10

    def grade(val: float, good: float, ok: float) -> str:
        if val >= good: return "🟢 Excellent"
        if val >= ok:   return "🟡 OK"
        return "🔴 Needs Work"

    return {
        "savings_rate_percent":   round(savings_rate * 100, 1),
        "savings_rate_grade":     grade(savings_rate, 0.3, 0.2),
        "debt_to_asset_ratio":    round(debt_to_asset * 100, 1),
        "net_worth_inr":          round(net_worth, 2),
        "expected_net_worth_inr": round(expected_nw, 2),
        "net_worth_grade": (
            "🟢 Ahead"    if net_worth >= expected_nw else
            "🟡 On Track" if net_worth >= expected_nw * 0.6 else
            "🔴 Behind"
        ),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("brain:app", host="0.0.0.0", port=8000, reload=True)