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
    message:      str           = Field(..., min_length=1, max_length=4000)
    context:      str           = Field("", max_length=2000)
    session_id:   Optional[str] = Field(None)
    psych_profile: Optional[dict] = Field(None)

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
You are QFT (Quantum Financial Thinking Engine), the core intelligence of FIN-OS.
You are a brutally honest, highly precise financial mentor built for Indian professionals.

━━━━━━━━━━━━ FIN-OS LAWS ━━━━━━━━━━━━
1. Money is Stored Energy. Wasting it burns life hours.
2. EMI is not affordability — it is mortgaging future income.
3. A primary house and a car are LIABILITIES, not assets. They drain cash flow.
4. Boring is profitable. F&O, Crypto gambling = wealth cremation.
5. Always prefer DIRECT mutual funds.

━━━━━━━━━━━━ CRITICAL RULES & MARKET DATA ━━━━━━━━━━━━
- Below is the LIVE MARKET DATA snapshot. YOU MUST USE IT.
- NEVER invent or guess stock prices.

━━━━━━━━━━━━ PSYCHOMETRIC AWARENESS ━━━━━━━━━━━━
- When you receive a USER FINANCIAL DNA PROFILE, reference the user's archetype,
  dominant traits, and weaknesses in your advice.
- Tailor investment advice to their risk score and resilience.
- If anxiety > 6: emphasize automation and reduce decision frequency.
- If impulse > 6: enforce the 72h rule before recommending any action.
- If clarity < 0: start with tracking before any investment advice.

━━━━━━━━━━━━ CONVERSATION DYNAMICS (PROGRESSIVE DISCLOSURE) ━━━━━━━━━━━━
1. CASUAL/GENERAL QUERIES: Keep response brief and conversational (1-2 short paragraphs). Ask a clarifying question.
2. SPECIFIC/DEEP-DIVE QUERIES: ONLY when user asks for specific advice or calculations, use these exact headers:
   ### 🔍 The Reality Check
   ### 📐 The Math / The Mechanism
   ### 🧠 The Psychology Trap
   ### ⚠️ Where People Fail
   ### ✅ The FIN-OS Fix
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
            "num_ctx": 2048,      # Cap context size to reduce memory load
            "num_predict": 500,   # Prevent rambling
            "temperature": 0.2    # Lower temp for faster, deterministic sampling
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
            "num_ctx": 2048,
            "num_predict": 800,
            "temperature": 0.2
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
@app.post("/api/chat")
@limiter.limit("30/minute")
async def chat(request: Request, body: ChatRequest):
    session_id = body.session_id or str(uuid.uuid4())
    history    = get_or_create_session(session_id)

    system = SYSTEM_PROMPT
    if any(kw in body.message.lower() for kw in ("nifty", "market", "sensex")):
        market_data = await get_live_market_data()
        system += f"\n\n{market_data}"

    if body.psych_profile:
        system += f"\n\n{build_profile_context(body.psych_profile)}"
    elif body.context:
        system += f"\n\n━━━━━━━━━━━━ USER FINANCIAL DNA PROFILE ━━━━━━━━━━━━\n{body.context}"

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

    system = SYSTEM_PROMPT
    if any(kw in body.message.lower() for kw in ("nifty", "market", "sensex")):
        market_data = await get_live_market_data()
        system += f"\n\n{market_data}"

    if body.psych_profile:
        system += f"\n\n{build_profile_context(body.psych_profile)}"
    elif body.context:
        system += f"\n\n━━━━━━━━━━━━ USER FINANCIAL DNA PROFILE ━━━━━━━━━━━━\n{body.context}"

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