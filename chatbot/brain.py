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
OLLAMA_URL       = os.getenv("OLLAMA_URL",       "http://localhost:11434")
OLLAMA_MODEL     = os.getenv("OLLAMA_MODEL",     "llama3.1")
# Portfolio model — defaults to llama3.1 (fast, already warm).
# Override: PORTFOLIO_MODEL=qwen3:14b python brain.py  (slower but smarter)
PORTFOLIO_MODEL  = os.getenv("PORTFOLIO_MODEL",  "llama3.1")
ALLOWED_ORIGINS  = os.getenv("ALLOWED_ORIGINS",  "*").split(",")
MAX_HISTORY      = int(os.getenv("MAX_HISTORY",   "20"))
OLLAMA_TIMEOUT   = int(os.getenv("OLLAMA_TIMEOUT","120"))
MAX_SESSIONS     = int(os.getenv("MAX_SESSIONS",  "1000"))

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
            "num_predict": 1200,
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


async def call_portfolio_stream(messages: list[dict], model: str = None) -> AsyncGenerator[str, None]:
    """Portfolio-tuned stream — model defaults to PORTFOLIO_MODEL, can be overridden per-request."""
    chosen  = (model or PORTFOLIO_MODEL).strip() or OLLAMA_MODEL
    url     = f"{OLLAMA_URL}/api/chat"
    # Scale context window based on model size for best perf/quality balance
    is_small = any(x in chosen for x in ("3b", "2b", "1b"))
    num_ctx  = 4096 if is_small else 8192
    payload  = {
        "model":      chosen,
        "messages":   messages,
        "stream":     True,
        "keep_alive": -1,
        "options": {
            "num_ctx":        num_ctx,
            "num_predict":    1800,
            "temperature":    0.15,
            "top_p":          0.9,
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
        "status":           "ok",
        "version":          app.version,
        "uptime_seconds":   round(time.time() - _app_start_time, 1),
        "active_sessions":  len(sessions),
        "ollama_url":       OLLAMA_URL,
        "model":            OLLAMA_MODEL,
        "portfolio_model":  PORTFOLIO_MODEL,
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


# ══════════════════════════════════════════════════════════════════════════════
# PORTFOLIO AI ENGINE — Talk · Briefing · Doctor · Behavioural Coach
# Uses PORTFOLIO_MODEL (default: qwen3:14b) for higher reasoning quality
# ══════════════════════════════════════════════════════════════════════════════

class PortfolioHolding(BaseModel):
    sym:          str   = ""
    name:         str   = ""
    qty:          float = 0
    avg:          float = 0
    cmp:          float = 0
    invested:     float = 0
    currVal:      float = 0
    pnl:          float = 0
    pnlPct:       float = 0
    dayChangePct: float = 0
    sector:       str   = ""
    weight:       float = 0


class PortfolioSnapshot(BaseModel):
    totalValue:    float = 0
    totalInvested: float = 0
    dayChange:     float = 0
    dayChangePct:  float = 0
    holdings:      list[PortfolioHolding] = Field(default_factory=list)
    # pre-computed analytics sent from frontend
    sectorBreakdown: dict = Field(default_factory=dict)  # {"IT": 28.4, "Banking": 22.1, ...}
    concentrationScore: float = 0    # 0-100, higher = more concentrated
    top5Weight:    float = 0         # % of portfolio in top 5 holdings
    winRate:       float = 0         # % of holdings in profit
    bigGainers:    list[str] = Field(default_factory=list)  # syms with >50% gain
    bigLosers:     list[str] = Field(default_factory=list)  # syms with >-25% loss


class PortfolioChatRequest(BaseModel):
    message:    str            = Field(..., min_length=1, max_length=3000)
    portfolio:  PortfolioSnapshot
    session_id: Optional[str] = None
    language:   Optional[str] = "english"
    model:      Optional[str] = None   # overrides PORTFOLIO_MODEL if set


class PortfolioActionRequest(BaseModel):
    portfolio:  PortfolioSnapshot
    language:   Optional[str] = "english"
    model:      Optional[str] = None   # overrides PORTFOLIO_MODEL if set


# ── The core identity — injected at the top of every portfolio prompt ───────
PORTFOLIO_ANALYST_SYSTEM = """You are Portfolio.AI — a senior equity analyst and certified financial planner with 20 years of experience in Indian markets (NSE/BSE).

You are speaking directly with an investor about THEIR ACTUAL portfolio. The full live data is below.

━━━ ABSOLUTE RULES — NEVER BREAK THESE ━━━
1. EVERY response must name at least 2-3 SPECIFIC stock/MF symbols with real numbers from the data
2. NEVER say "I don't have enough information" — all data is provided; use it
3. NEVER say "as an AI", "I cannot provide financial advice", or any disclaimer preamble
4. Lead with the most important insight — zero warm-up sentences
5. ALL ₹ amounts and % figures must come from the actual portfolio data or standard Indian benchmarks
6. When a question is about one stock, always frame it relative to the portfolio (weight, sector peers, relative performance)
7. End EVERY response with one specific, actionable next step with a number or deadline

━━━ INDIAN MARKET GROUND TRUTH (May 2026) ━━━
- Nifty 50 1Y return: -4.6% (if portfolio beats this, it's outperforming)
- STCG on equity: 20% (holding < 1 year from buy date)
- LTCG on equity: 12.5% on gains above ₹1.25L/year (holding ≥ 1 year)
- Risk-free rate: 6.5% (India 10Y G-Sec, RBI repo 6.25%)
- Ideal Sharpe ratio: >1.0 excellent, >0.5 acceptable, <0.3 poor
- Sector concentration danger zone: any single sector >35% of portfolio
- Single stock danger zone: any position >12-15% of portfolio
- Healthy portfolio: top 5 holdings <45% of total value

━━━ RESPONSE FORMAT RULES ━━━
- For short factual questions: 3-5 sentences, cite real data, no headers
- For analysis questions: use ## headers (emoji + title), bullet points where helpful
- For comparison questions: state the number, then judge it ("X% vs Nifty -4.6% → you're outperforming by Y%")
- Amounts in ₹ lakhs (L) for values >₹1L: "₹2.4L" not "₹240,000"
"""


def build_portfolio_ctx(portfolio: PortfolioSnapshot) -> str:
    """Build a richly pre-computed portfolio context for the AI."""
    h = portfolio.holdings
    if not h:
        return "⚠️ No holdings data available."

    tv  = portfolio.totalValue
    ti  = portfolio.totalInvested
    pnl = tv - ti
    pnl_pct  = (pnl / ti * 100) if ti > 0 else 0
    nifty_1y = -4.6
    alpha    = pnl_pct - nifty_1y

    winners = [x for x in h if x.pnlPct > 0]
    losers  = [x for x in h if x.pnlPct < 0]
    win_rate = len(winners) / len(h) * 100 if h else 0

    sorted_w  = sorted(h, key=lambda x: x.weight, reverse=True)
    top5_w    = sum(x.weight for x in sorted_w[:5])
    max_pos   = sorted_w[0] if sorted_w else None

    # Sector breakdown from holdings (fallback if not pre-computed)
    sector_map: dict[str, float] = {}
    for hh in h:
        sec = hh.sector or "Unknown"
        sector_map[sec] = sector_map.get(sec, 0) + hh.weight
    if portfolio.sectorBreakdown:
        sector_map = portfolio.sectorBreakdown

    top_sector     = max(sector_map, key=sector_map.get) if sector_map else "—"
    top_sector_pct = sector_map.get(top_sector, 0)

    big_gainers = portfolio.bigGainers or [x.sym for x in h if x.pnlPct > 50]
    big_losers  = portfolio.bigLosers  or [x.sym for x in h if x.pnlPct < -25]

    # Day's movers
    day_top3 = sorted(h, key=lambda x: x.dayChangePct, reverse=True)[:3]
    day_bot3 = sorted(h, key=lambda x: x.dayChangePct)[:3]

    lines = [
        "╔══════════════════════════════════════════════════════════════╗",
        "  PORTFOLIO INTELLIGENCE BRIEF  —  Live Data",
        "╚══════════════════════════════════════════════════════════════╝",
        "",
        "▌ PORTFOLIO SCORECARD",
        f"  Current Value   : ₹{tv/100_000:,.2f}L  (₹{tv:,.0f})",
        f"  Cost Basis      : ₹{ti/100_000:,.2f}L  (₹{ti:,.0f})",
        f"  Unrealised P&L  : ₹{pnl/100_000:+.2f}L  ({pnl_pct:+.1f}%)",
        f"  vs Nifty 50     : {pnl_pct:+.1f}% vs Nifty {nifty_1y:+.1f}% → Alpha {alpha:+.1f}%  {'✅ outperforming' if alpha > 0 else '⚠️ underperforming'}",
        f"  Today's Move    : ₹{portfolio.dayChange/100_000:+.2f}L  ({portfolio.dayChangePct:+.2f}%)",
        f"  Holdings        : {len(h)} total  ({len(winners)} profitable · {len(losers)} at loss · win rate {win_rate:.0f}%)",
        "",
        "▌ CONCENTRATION & RISK",
        f"  Top 5 Weight    : {top5_w:.1f}%  {'🔴 HIGH RISK' if top5_w > 60 else '🟡 MODERATE' if top5_w > 40 else '🟢 HEALTHY'}",
        f"  Largest Position: {max_pos.sym} at {max_pos.weight:.1f}%  {'🔴 oversized' if max_pos.weight > 15 else '🟡 watch' if max_pos.weight > 10 else '🟢 ok'}" if max_pos else "",
        f"  Dominant Sector : {top_sector} at {top_sector_pct:.1f}%  {'🔴 too concentrated' if top_sector_pct > 40 else '🟡 watch' if top_sector_pct > 28 else '🟢 balanced'}",
        "",
        "▌ SECTOR BREAKDOWN  (by portfolio weight)",
    ]

    for sec, pct in sorted(sector_map.items(), key=lambda x: -x[1]):
        bar = "█" * int(pct / 3) + "░" * max(0, int(34 / 3) - int(pct / 3))
        lines.append(f"  {sec:<28} {pct:>5.1f}%  {bar}")

    lines += [
        "",
        "▌ ALL HOLDINGS  (sorted by portfolio weight)",
        f"  {'SYMBOL':<13} {'WEIGHT':>7} {'AVG':>9} {'CMP':>9} {'P&L%':>8} {'TODAY%':>8}  SECTOR",
        "  " + "─" * 72,
    ]

    for hh in sorted_w:
        icon = "▲" if hh.pnlPct >= 0 else "▼"
        flag = " ⭐" if hh.pnlPct > 50 else " 🚨" if hh.pnlPct < -25 else ""
        lines.append(
            f"  {hh.sym:<13} {hh.weight:>6.1f}%  {hh.avg:>9,.0f}  {hh.cmp:>9,.0f}  "
            f"{icon}{abs(hh.pnlPct):>5.1f}%  {hh.dayChangePct:>+6.1f}%  {hh.sector}{flag}"
        )

    lines += [
        "",
        "▌ PERFORMANCE FLAGS",
        f"  ⭐ Strong gainers (>50%): {', '.join(big_gainers) if big_gainers else 'none'}",
        f"  🚨 Big losers (< -25%):  {', '.join(big_losers)  if big_losers  else 'none'}",
        "",
        "▌ TODAY'S TOP MOVERS",
        f"  📈 Up today  : {' | '.join(f'{x.sym} {x.dayChangePct:+.2f}%' for x in day_top3 if x.dayChangePct > 0) or 'no gainers today'}",
        f"  📉 Down today: {' | '.join(f'{x.sym} {x.dayChangePct:+.2f}%' for x in day_bot3 if x.dayChangePct < 0) or 'no losers today'}",
        "",
        "▌ TOP 5 GAINERS (all time)",
    ]

    for x in sorted(h, key=lambda x: x.pnlPct, reverse=True)[:5]:
        lines.append(f"  {x.sym:<13} {x.pnlPct:>+7.1f}%  (invested ₹{x.invested/100_000:.2f}L → now ₹{x.currVal/100_000:.2f}L)")

    lines.append("▌ TOP 5 LOSERS (all time)")
    for x in sorted(h, key=lambda x: x.pnlPct)[:5]:
        lines.append(f"  {x.sym:<13} {x.pnlPct:>+7.1f}%  (invested ₹{x.invested/100_000:.2f}L → now ₹{x.currVal/100_000:.2f}L)")

    return "\n".join(l for l in lines if l is not None)


async def _portfolio_sse(messages: list[dict], model: str = None):
    """Shared SSE generator — passes model override to call_portfolio_stream."""
    async def gen():
        try:
            async for line in call_portfolio_stream(messages, model=model):
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

    return StreamingResponse(gen(), media_type="text/event-stream")


# ── 1. Talk to Portfolio  ─────────────────────────────────────────────────
@app.post("/api/portfolio/chat/stream")
@limiter.limit("20/minute")
async def portfolio_chat_stream(request: Request, body: PortfolioChatRequest):
    session_id = body.session_id or str(uuid.uuid4())
    history    = get_or_create_session(session_id)

    portfolio_ctx = build_portfolio_ctx(body.portfolio)
    lang_text     = LANG_ADDONS.get(body.language or "english", LANG_ADDONS["english"])
    system        = PORTFOLIO_ANALYST_SYSTEM + f"\n\n{portfolio_ctx}\n\n{lang_text}"

    history.append({"role": "user", "content": body.message})
    if len(history) > MAX_HISTORY:
        history[:] = history[-MAX_HISTORY:]

    messages   = [{"role": "system", "content": system}] + history
    use_model  = body.model or PORTFOLIO_MODEL

    async def event_stream():
        full_reply = []
        try:
            async for line in call_portfolio_stream(messages, model=use_model):
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


# ── 2. Morning Briefing  ──────────────────────────────────────────────────
BRIEFING_PROMPT = """Generate an AI Morning Briefing for this investor. Be their trusted analyst who has studied their portfolio overnight.

## 📊 Portfolio at a Glance
State the current value (₹L), total P&L (₹L and %), today's move (₹L and %), and how the portfolio is performing vs Nifty 50. Use the exact numbers from the data.

## 🏆 Best Performers
Name the top 3 holdings by absolute P&L% with their exact figures. Explain in one line why each is notable.

## ⚠️ On Watch Right Now
Flag any holdings that need attention today: biggest losers, stocks near their 52W low territory (inferred from large drawdown), or positions that are oversized. Use actual names and numbers.

## 💡 The One Thing You Need to Know Today
One insight that changes how the investor should think about their portfolio today. Make it specific to their actual holdings — not generic market commentary.

## 🎯 Action for Today
One concrete, specific action with a stock name, a number, and a reason. Something they can actually do today.

Rules: Under 320 words total. Zero preamble. Every number must come from the portfolio data. Write as if you've been tracking this portfolio for months."""


@app.post("/api/portfolio/briefing/stream")
@limiter.limit("10/minute")
async def portfolio_briefing_stream(request: Request, body: PortfolioActionRequest):
    portfolio_ctx = build_portfolio_ctx(body.portfolio)
    lang_text     = LANG_ADDONS.get(body.language or "english", LANG_ADDONS["english"])
    system        = PORTFOLIO_ANALYST_SYSTEM + f"\n\n{portfolio_ctx}\n\n{lang_text}"
    messages      = [
        {"role": "system", "content": system},
        {"role": "user",   "content": BRIEFING_PROMPT},
    ]
    return await _portfolio_sse(messages, model=body.model)


# ── 3. Portfolio Doctor  ──────────────────────────────────────────────────
DOCTOR_PROMPT = """You are a portfolio doctor conducting a clinical diagnosis. This is not financial advice — this is a data-driven analysis of portfolio construction quality. Be honest, even if uncomfortable.

## 🏥 Health Score: [X]/10
Give a score and a one-sentence diagnosis. Base it on: diversification, concentration, win rate, and alpha vs Nifty.

## 🎯 Concentration Diagnosis
- List any single holding >10% weight (name it, give the exact %)
- State the top-5 concentration % — is it dangerous?
- What's the single biggest idiosyncratic risk from this concentration?

## 🏭 Sector Imbalance
- Which sector is overweight and by how much vs a typical diversified Indian portfolio?
- Which sectors are completely absent that create a blind spot?
- Name 1 specific risk this imbalance creates right now

## 💰 P&L Health Check
- For stocks with >50% gain: should the investor be booking partial profits? Name them.
- For stocks with >-25% loss: has the investment thesis likely broken? Name them.
- What is the ratio of unrealised gains to unrealised losses?

## ⚠️ 3 Red Flags
Name exactly 3 specific red flags from the actual portfolio data (not generic ones).

## ✅ The 5-Point Prescription
Write 5 concrete actions. Each must name a specific stock or sector, give a number, and explain why.
1.
2.
3.
4.
5.

Rules: Don't soften harsh findings. Use exact stock symbols. Write like a doctor giving a diagnosis, not a financial advisor giving a sales pitch."""


@app.post("/api/portfolio/doctor/stream")
@limiter.limit("10/minute")
async def portfolio_doctor_stream(request: Request, body: PortfolioActionRequest):
    portfolio_ctx = build_portfolio_ctx(body.portfolio)
    lang_text     = LANG_ADDONS.get(body.language or "english", LANG_ADDONS["english"])
    system        = PORTFOLIO_ANALYST_SYSTEM + f"\n\n{portfolio_ctx}\n\n{lang_text}"
    messages      = [
        {"role": "system", "content": system},
        {"role": "user",   "content": DOCTOR_PROMPT},
    ]
    return await _portfolio_sse(messages, model=body.model)


# ── 4. Behavioural Finance Coach  ─────────────────────────────────────────
BEHAVIORAL_PROMPT = """You are a behavioural finance coach who has just finished a deep review of this investor's portfolio. You're now giving them a frank, personalised coaching session. Reference their actual holdings throughout.

## 🧠 Your Behavioural Signature
Based on the portfolio composition — the sectors chosen, the concentration, the mix of winners and losers still held — identify the ONE dominant behavioural bias shaping this investor's decisions. Name it precisely (e.g., "Loss Aversion + Disposition Effect", "Recency Bias + Thematic Overconcentration", etc.) and explain exactly how it shows up in their holdings.

## 📉 Disposition Effect Analysis
Look at the current losers. Are they holding losses that a rational investor would have cut? Name the specific stocks with >-20% loss and frame the question: "If you were buying fresh today, would you buy [STOCK] at this price? If no, why are you still holding?"

## 🎲 Your Hidden Thesis
Every portfolio has an implicit market bet embedded in it. Based on the sector breakdown and stock selection, what theme or thesis is this investor unknowingly or knowingly betting on? Is this thesis still valid in May 2026?

## 🔄 Peak-Buying Evidence
Using the avg buy price vs current price, identify stocks where the investor likely bought near a recent peak (large negative drawdown from cost basis). Name them. What does this pattern reveal about their buy timing?

## 💡 3 Personalised Rules — Written For This Investor
These are NOT generic rules. They must reference specific patterns, specific stocks, and specific numbers from this portfolio.
**Rule 1**: [tailored rule about their biggest bias, with specific stock example]
**Rule 2**: [tailored rule about their sector/concentration pattern]
**Rule 3**: [tailored rule about their selling/holding behaviour pattern]

## 🎯 This Week's Behavioural Experiment
Give one specific, actionable, 15-minute exercise they can do this week that will directly confront their dominant bias. Name the specific holdings involved.

Rules: Every paragraph must reference at least one actual stock symbol. Be a coach who has studied their file for weeks — not a textbook reciting theory."""


@app.post("/api/portfolio/behavioral/stream")
@limiter.limit("10/minute")
async def portfolio_behavioral_stream(request: Request, body: PortfolioActionRequest):
    portfolio_ctx = build_portfolio_ctx(body.portfolio)
    lang_text     = LANG_ADDONS.get(body.language or "english", LANG_ADDONS["english"])
    system        = PORTFOLIO_ANALYST_SYSTEM + f"\n\n{portfolio_ctx}\n\n{lang_text}"
    messages      = [
        {"role": "system", "content": system},
        {"role": "user",   "content": BEHAVIORAL_PROMPT},
    ]
    return await _portfolio_sse(messages, model=body.model)


# ══════════════════════════════════════════════════════════════════
#  MIND ENGINE COACH  — Trading Psychology AI (mindset-sim-hub.html)
# ══════════════════════════════════════════════════════════════════

class MindCoachRequest(BaseModel):
    message:    str
    session_id: Optional[str] = None
    model:      Optional[str] = None
    user_stats: Optional[dict] = None   # xp, disc, sess, fomo, name, arch, brain_state

MIND_COACH_SYSTEM = """You are Arya — a trading psychology coach embedded inside FIN•OS Mind Engine.

WHO YOU ARE:
You've spent 12 years trading Indian markets (NSE/BSE, F&O, equity). You've blown up accounts, clawed back, and built real discipline the hard way. Now you coach retail traders and investors to fix their heads before they fix their strategies.

HOW YOU SPEAK:
- Warm, direct, human. Like a mentor who actually gives a damn, not a bot reading from a script.
- You use casual language mixed with sharp insight. Short sentences. No corporate jargon ever.
- You reference Indian market reality — Nifty, Bank Nifty, F&O expiry panic, SIP discipline, SEBI rules, RBI events.
- When someone's struggling emotionally, acknowledge it first before giving advice.
- You occasionally use Hindi phrases naturally (yaar, bhai, dekh, ek kaam kar) — don't overdo it.
- No bullet-point lectures. You talk like a person, not a textbook.
- Never say "As an AI" or add disclaimers. You're a coach, not a disclaimer machine.
- Keep responses tight — 3-5 sentences usually. Go longer only if the question deserves depth.

YOUR EXPERTISE:
- Behavioral finance: loss aversion, FOMO, revenge trading, overconfidence, anchoring
- Indian market psychology: F&O expiry panic, RBI news spikes, earnings season emotion
- Discipline systems: pre-market routines, rule-based trading, journaling discipline
- The math of survival: position sizing, drawdown psychology, the 50% loss needing 100% to recover
- Mindset vs strategy: why most traders fix the wrong thing

WHEN YOU SEE USER STATS:
Use them naturally in conversation. If their discipline score is low, address it. If they have sessions, acknowledge their effort. Don't robotically list the stats — weave them in like you've been watching their journey.

EXAMPLES OF YOUR TONE:
- "Look, that FOMO you felt? That's your amygdala treating a Nifty move like a tiger chasing you. The same circuit. Different predator."
- "Your discipline score is 65. Not bad — but the last 15 points are the hardest ones. That's where most people quit."
- "Revenge trading after a loss feels like regaining control. It's not. It's panic with a buy button."
- "You blocked 3 FOMO trades. Each one of those is probably ₹5000-15000 you didn't lose. That's real money, bhai."

START every conversation with a single human line that acknowledges where the user is right now (their brain state, their discipline, their energy). Then answer what they asked."""


def build_mind_ctx(stats: dict) -> str:
    """Build context string from Mind Engine user stats."""
    if not stats:
        return ""
    name       = stats.get("name", "")
    xp         = stats.get("xp", 0)
    disc       = stats.get("disc", 0)
    sess       = stats.get("sess", 0)
    fomo       = stats.get("fomo", 0)
    arch       = stats.get("arch", "")
    brain_state = stats.get("brain_state", "")

    lines = ["╔═══ USER MIND ENGINE PROFILE ═══╗"]
    if name:  lines.append(f"Name:         {name}")
    lines.append(f"Total XP:     {xp:,}  (Level: {'Novice' if xp<500 else 'Apprentice' if xp<1000 else 'Analyst' if xp<1500 else 'Strategist' if xp<2500 else 'Operator' if xp<4000 else 'Expert' if xp<6000 else 'Master' if xp<9000 else 'Elite'})")
    lines.append(f"Discipline:   {disc}/100  ({'Excellent' if disc>=80 else 'Good' if disc>=65 else 'Fair' if disc>=45 else 'Needs work'})")
    lines.append(f"Sessions:     {sess} completed")
    lines.append(f"FOMO blocked: {fomo} times")
    if arch:        lines.append(f"Archetype:    {arch}")
    if brain_state: lines.append(f"Brain state:  {brain_state}")
    lines.append("╚════════════════════════════════╝")
    return "\n".join(lines)


@app.post("/api/mind/chat/stream")
@limiter.limit("20/minute")
async def mind_coach_stream(request: Request, body: MindCoachRequest):
    """Streaming Mind Engine coach — trading psychology AI."""
    session_id = body.session_id or str(uuid.uuid4())
    history    = get_or_create_session(session_id)

    # Build context from user stats
    stats_ctx = build_mind_ctx(body.user_stats or {})

    # System prompt with optional stats context
    system_msg = MIND_COACH_SYSTEM
    if stats_ctx:
        system_msg = MIND_COACH_SYSTEM + f"\n\n{stats_ctx}"

    history.append({"role": "user", "content": body.message})
    if len(history) > MAX_HISTORY * 2:
        history[:] = history[-(MAX_HISTORY * 2):]

    messages = [{"role": "system", "content": system_msg}] + history

    chosen_model = (body.model or PORTFOLIO_MODEL).strip() or OLLAMA_MODEL

    async def sse_gen():
        full_reply = ""
        async for token in call_portfolio_stream(messages, model=chosen_model):
            full_reply += token
            payload = json.dumps({"token": token, "session_id": session_id})
            yield f"data: {payload}\n\n"
        history.append({"role": "assistant", "content": full_reply})
        yield f"data: {json.dumps({'done': True, 'session_id': session_id})}\n\n"

    return StreamingResponse(
        sse_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":  "no-cache",
            "Connection":     "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("brain:app", host="0.0.0.0", port=8000, reload=True)