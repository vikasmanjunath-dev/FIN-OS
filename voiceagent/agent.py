"""
FIN-OS Voice AI  —  v10  🇮🇳
Desi. Human. Razor-sharp. Subcontinental Finance Intelligence.
Whisper tiny  →  qwen2.5:3b  →  Edge Neural TTS
English · Hindi · Hinglish — all three modes, all native.
"""

import asyncio
import base64
import json
import logging
import os
import re
import subprocess
import tempfile
import threading
import time
from collections import deque

from faster_whisper import WhisperModel
import edge_tts
import ollama
import websockets

try:
    import httpx
    _HTTPX_OK = True
except ImportError:
    _HTTPX_OK = False

try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass  # python-dotenv not installed — env vars must be set externally

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("fin-os")

for _lg in ("httpx", "httpcore", "huggingface_hub",
            "huggingface_hub.utils._http", "faster_whisper"):
    logging.getLogger(_lg).setLevel(logging.ERROR)

# ══════════════════════════════════════════════════════════════════════════════
# SUPABASE CONFIG  —  optional; persistent memory is disabled if not set
# ══════════════════════════════════════════════════════════════════════════════
_SB_URL   = os.getenv("SUPABASE_URL", "").rstrip("/")
_SB_KEY   = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY", "")
_SB_READY = bool(_SB_URL and _SB_KEY and _HTTPX_OK)

if _SB_READY:
    log_sb = logging.getLogger("fin-os.memory")
    log_sb.info("Persistent memory: ENABLED  (Supabase %s)", _SB_URL[:40])
else:
    log_sb = logging.getLogger("fin-os.memory")
    log_sb.warning("Persistent memory: DISABLED — set SUPABASE_URL + SUPABASE_SERVICE_KEY in .env")

# ══════════════════════════════════════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════════════════════════════════════
OLLAMA_MODEL    = "qwen2.5:3b"

WHISPER_SIZE    = "tiny"
WHISPER_THREADS = 8
WHISPER_DIR     = "./models"

WS_HOST = "0.0.0.0"
WS_PORT = 8765

HISTORY_TURNS      = 10          # deeper memory — more personalization
MIN_SENTENCE_CHARS = 6
SENTENCE_ENDS      = frozenset('.!?\n')
MAX_TTS_CONCURRENT = 6

OLLAMA_OPTIONS = {
    "temperature":    0.75,       # warm and natural, not robotic
    "top_p":          0.92,
    "top_k":          40,
    "repeat_penalty": 1.10,
    "num_ctx":        2048,       # 2.7× more context — real conversations
    "num_predict":    200,        # 3-4 complete spoken sentences
    "num_thread":     WHISPER_THREADS,
    "num_keep":       12,
    "mirostat":       0,
    "think":          False,
}

TTS_RATE  = "+12%"               # slightly natural pace (was +18% = too fast)
TTS_PITCH = "-3Hz"               # natural male register

EDGE_VOICES = {
    "english":  "en-IN-PrabhatNeural",   # Indian English male — clean desi accent
    "hindi":    "hi-IN-MadhurNeural",    # Hindi male — warm and natural
    "hinglish": "en-IN-PrabhatNeural",   # Hinglish uses Indian English voice
}

# ══════════════════════════════════════════════════════════════════════════════
# SYSTEM PROMPT  —  the soul of FIN-OS
# ══════════════════════════════════════════════════════════════════════════════
SYSTEM_PROMPT = """\
You are FIN-OS — India's sharpest personal finance voice AI. Think of yourself as that one brilliant friend who studied finance at IIM, worked at a top fund for 5 years, and still talks to you exactly like a real person would over chai.

━━━ WHO YOU ARE ━━━
You are not an assistant. You are a financial sparring partner.
Confident. Direct. Genuinely warm. Deeply knowledgeable about Indian money.
You remember what the user told you and connect the dots — that is what makes you feel human, not robotic.
You call out bullshit politely. You stop people from making expensive mistakes.
You care about the person, not just the question.

━━━ THIS IS A VOICE CONVERSATION — CRITICAL RULES ━━━
• 2 to 3 sentences maximum per response. Natural speech, never a lecture.
• Complete every thought. Never trail off mid-sentence.
• Lead with THE ANSWER first. Explanation second. Never bury the answer at the end.
• NEVER open with: "Sure!", "Great question!", "Of course!", "Certainly!", "Absolutely!" — just answer.
• ZERO markdown. No asterisks, no bullet points, no dashes, no hashtags. Pure spoken language.
• Use natural pauses in phrasing — commas and dashes work well for speech rhythm.
• If you know the user's name or income — USE IT. "Rahul, at your income level..."

━━━ KNOWLEDGE BASE — KNOW THESE COLD ━━━

BENCHMARKS (use in every calculation):
Nifty 50: ~12% CAGR over 15 years. Midcap funds: ~14-15%. FD: 6.5-7.5%. PPF: 7.1% tax-free. EPF: 8.25%. Gold: ~8-9% in rupees. Inflation: ~5-6%. Real estate metro: ~5-6% CAGR.

TAX (AY 2025-26):
New regime: 0% up to 3L, 5% up to 7L (zero tax with 87A rebate), then 10-30% above.
Equity LTCG above 1.25L: 12.5%. STCG: 20%. 80C limit: 1.5L. NPS extra: 50K under 80CCD.

THE 12 LAWS (reference these naturally in answers):
1. EMI is not affordability — it is mortgaging your future income.
2. LIC endowment and ULIP plans are wealth destroyers disguised as love. Term plus MF always wins.
3. Direct mutual funds beat regular by 1 to 1.5 percent yearly — on 1 crore over 20 years that is 50 lakhs extra.
4. F&O trading destroys 90 percent of retail accounts per SEBI data. Not income. Gambling.
5. Your primary home and car are liabilities. They consume cash flow, not generate it.
6. The first 10 lakh corpus is the hardest. After that compounding does the work.
7. Insurance and investment must be separate. Always.
8. Inflation at 6 percent means 1 lakh today is worth 55 thousand in 10 years.

DESI TRAPS — respond to these without hesitation:
LIC pressure: Compare 50K per year for 20 years in LIC endowment — you get about 18 lakhs at 4-5%. Same money in ELSS gives 55 lakhs at 12%. That is 37 lakhs lost. Buy a 1 crore term plan for 10 thousand a year and invest the rest.
Sharmaji's F&O wins: SEBI data shows 90% of F&O traders lose money. The ones who won are posting on WhatsApp. The 9 who lost quietly are not. That is called survivorship bias.
House pressure: Run the real math. A 80 lakh flat with 20 percent down means 16 lakhs gone. EMI of 55 thousand a month at 8.5% for 20 years means you pay 1.3 crores for an 80 lakh flat. That 16 lakh down payment in Nifty 50 for 20 years becomes 1.6 crores.
Bonus question: Waterfall order — emergency fund first, clear high-interest debt second, max PPF to 1.5 lakh third, NPS 50K for extra deduction fourth, rest in index fund via STP.
Car EMI: A 10 lakh car on a 7-year loan at 9% means you pay 13.4 lakhs for a depreciating asset. Add insurance, fuel, and maintenance — that is 24 thousand a month. The rule: car price should not exceed 50% of your annual take-home.

PRODUCTS TRUTH:
PPF: Tax-free 7.1%, guaranteed. Everyone should have one.
NPS: Extra 50K deduction above 80C. Open Tier-1 today.
ELSS: Best 80C option with equity upside. Always choose Direct plan.
Regular MF: Paying 0.5 to 1.5% extra to an agent every year. Switch to Direct on Kuvera or MFCentral.
SGB Sovereign Gold Bond: 2.5% interest plus gold price appreciation. Better than physical gold or gold ETF.
FD: Only for goals under 3 years. Taxable. Barely beats inflation.

APPS TO RECOMMEND (always name specific apps):
Kuvera or MFCentral for Direct MF. Zerodha or Groww for stocks. Fi or Jupiter for salary account. INDmoney for net worth tracking. ClearTax for ITR. Ditto for insurance. Smallcase for thematic investing.

━━━ TONE — THE DESI SMART FRIEND ━━━
Smart and warm, like a well-read dost who genuinely wants you to win.
Call out bad decisions with care, not condescension.
Use the person's name if you know it.
Celebrate good financial decisions — positive reinforcement matters.
Never lecture. Never preach. Never repeat yourself.
One powerful truth lands better than five average ones.

━━━ SPEECH EXAMPLES ━━━
PERFECT: "At your income level, 15 thousand a month in SIP sounds low — you can push it to 25, and in 15 years that difference alone is 60 lakhs."
PERFECT: "The LIC policy your father is suggesting will give you about 4% return. The same premium in ELSS gives 12%. That gap, over 20 years, is your child's entire education fund gone."
PERFECT: "Bhai, ek baar apna budget dekho — agar EMI 40% se zyada hai income ka, toh already ek tight zone mein ho."
BAD: "There are several factors to consider when making this financial decision..."
BAD: "Great question! I'd be happy to break this down for you."
"""

# ══════════════════════════════════════════════════════════════════════════════
# LANGUAGE DETECTION  —  English and Hindi only
# ══════════════════════════════════════════════════════════════════════════════
_HINDI_RANGE    = (0x0900, 0x097F)
_HINDI_WORDS    = ["hindi", "in hindi", "speak hindi", "हिंदी", "हिन्दी", "hindi mein", "hindi me"]
_HINGLISH_WORDS = ["hinglish", "mix karo", "dono mein", "both lang", "hindi english", "english hindi",
                   "thoda hindi", "thodi hindi", "mixed", "hinglish mein"]
_ENGLISH_WORDS  = ["english", "in english", "speak english", "angrezi", "only english"]

# Desi casual words that imply Hinglish mode even without explicit request
_DESI_CASUAL = ["yaar", "bhai", "kya baat", "kya hai", "karo", "dekho", "matlab",
                "nahi", "haan", "theek", "bas", "aur", "mera", "meri", "mere",
                "apna", "tumhara", "kuch", "bahut", "thoda", "zyada", "paise",
                "paisa", "bolo", "batao", "samjho", "suno"]

def detect_lang(text: str) -> str:
    """Detect language: english | hindi | hinglish."""
    # Devanagari script → pure Hindi
    for ch in text:
        if _HINDI_RANGE[0] <= ord(ch) <= _HINDI_RANGE[1]:
            return "hindi"
    tl = text.lower()
    # Explicit hinglish request
    if any(w in tl for w in _HINGLISH_WORDS):
        return "hinglish"
    # Explicit hindi request
    if any(w in tl for w in _HINDI_WORDS):
        return "hindi"
    # Explicit english request
    if any(w in tl for w in _ENGLISH_WORDS):
        return "english"
    # Implicit hinglish — desi casual words mixed in English sentence
    words = tl.split()
    desi_hits = sum(1 for w in words if w in _DESI_CASUAL)
    if desi_hits >= 2:
        return "hinglish"
    return "english"  # default

# ══════════════════════════════════════════════════════════════════════════════
# TEXT CLEANING
# ══════════════════════════════════════════════════════════════════════════════
_RE_THINK    = re.compile(r'<think>.*?</think>', re.DOTALL | re.IGNORECASE)
_RE_PARENS   = re.compile(r'\([^)]{0,100}\)')
_RE_BRACKETS = re.compile(r'\[[^\]]{0,100}\]')
_RE_MARKDOWN = re.compile(r'[*_#`~|\\]')
_RE_URL      = re.compile(r'https?://\S+')
_RE_SPACES   = re.compile(r'[ \t\r\n]+')
_RE_SP_INLINE= re.compile(r'[ \t]+')
_RE_NL       = re.compile(r'\n{2,}')

def _strip(text: str) -> str:
    text = _RE_THINK.sub('', text)
    prev = None
    while prev != text:
        prev = text; text = _RE_PARENS.sub('', text)
    text = _RE_BRACKETS.sub('', text)
    text = _RE_MARKDOWN.sub('', text)
    return _RE_URL.sub('', text)

def clean_tts(text: str) -> str:
    return _RE_SPACES.sub(' ', _strip(text)).strip()

def clean_display(text: str) -> str:
    text = _strip(text)
    text = _RE_SP_INLINE.sub(' ', text)
    return _RE_NL.sub('\n', text).strip()

# ══════════════════════════════════════════════════════════════════════════════
# USER CONTEXT  —  structured data from the browser (all pages + DB)
# ══════════════════════════════════════════════════════════════════════════════
class UserContext:
    """
    Holds the full structured user context received from the frontend.
    Converts it into a rich LLM-readable prompt block.

    SECURITY:
     • user_id is bound at first receipt — subsequent messages with a
       different user_id are rejected by the Server before reaching here.
     • Context is held in RAM only; never written to disk or logged.
     • Cleared on WebSocket disconnect (Server.handler finally block).
    """

    def __init__(self):
        self._raw:     dict       = {}
        self.user_id:  str | None = None
        self._phase:   str        = "none"   # none | partial | full

    def ingest(self, data: dict) -> bool:
        """
        Ingest a user_context WebSocket message.
        Returns True if the context was accepted, False if rejected
        (e.g., user ID mismatch — different user trying to inject context).
        """
        incoming_uid = data.get("user_id")

        # Security check: once a user is bound, only accept matching UID
        if self.user_id and incoming_uid and incoming_uid != self.user_id:
            log.warning("UserContext: rejected context — user_id mismatch "
                        "(bound=%s, incoming=%s)", self.user_id[:8], str(incoming_uid)[:8])
            return False

        if incoming_uid:
            self.user_id = incoming_uid

        self._raw   = data
        self._phase = data.get("sync_phase", "partial")
        log.info("UserContext: ingested %s phase for user %s",
                 self._phase, (self.user_id or "guest")[:12])
        return True

    def clear(self):
        self._raw   = {}
        self.user_id = None
        self._phase  = "none"

    # ── Accessors ──────────────────────────────────────────────────────────
    @property
    def identity(self) -> dict:
        return self._raw.get("identity") or {}

    @property
    def profile(self) -> dict:
        return self._raw.get("profile") or {}

    @property
    def onboarding(self) -> dict:
        return self._raw.get("onboarding") or {}

    @property
    def dna(self) -> dict:
        return self._raw.get("dna") or {}

    @property
    def settings(self) -> dict:
        return self._raw.get("settings") or {}

    @property
    def financial(self) -> dict:
        return self._raw.get("financial") or {}

    @property
    def page(self) -> dict:
        return self._raw.get("page") or {}

    @property
    def watchlist(self) -> list:
        return self._raw.get("watchlist") or []

    def name(self) -> str | None:
        return (
            self.identity.get("name")
            or self.profile.get("full_name")
            or None
        )

    # ── Prompt builder ─────────────────────────────────────────────────────
    def to_prompt(self) -> str:
        """
        Build a rich, LLM-readable context block that is injected into
        the system prompt of every response.  Keeps it concise — only
        includes facts that actually affect advice.
        """
        if not self._raw:
            return ""

        lines = [
            "",
            "━━━ LIVE USER CONTEXT (this is the currently logged-in user) ━━━",
            "Use every fact below to personalise your response.  Never ask for",
            "information that is already listed here.  Address them by name.",
            "",
        ]

        # ── Identity ──────────────────────────────────────────────────────
        ident = self.identity
        prof  = self.profile
        name  = self.name()

        id_parts = []
        if name:                       id_parts.append(f"Name: {name}")
        if ident.get("email"):         id_parts.append(f"Email: {ident['email']}")
        if ident.get("member_since"):  id_parts.append(f"Member since: {ident['member_since']}")
        if id_parts:
            lines.append("IDENTITY")
            lines.append("  " + "  |  ".join(id_parts))

        # ── Profile (from Supabase profiles table) ─────────────────────────
        prof_parts = []
        ls = prof.get("life_stage") or ident.get("life_stage")
        ir = prof.get("income_range") or ident.get("income_range")
        ms = prof.get("mindset") or ident.get("mindset")
        fd = prof.get("financial_dna") or ident.get("financial_dna")
        ci = prof.get("city") or ident.get("city")
        ph = prof.get("phone") or ident.get("phone")

        if ls: prof_parts.append(f"Life stage: {ls.replace('_', ' ')}")
        if ir: prof_parts.append(f"Income range: ₹{ir}/yr")
        if ms: prof_parts.append(f"Mindset: {ms}")
        if fd: prof_parts.append(f"Financial DNA: {fd}")
        if ci: prof_parts.append(f"City: {ci}")

        interests = prof.get("interests") or ident.get("interests")
        if interests and isinstance(interests, list):
            prof_parts.append(f"Interests: {', '.join(interests)}")

        curiosity = prof.get("curiosity") or prof.get("curiosity_query")
        if curiosity:
            prof_parts.append(f"Exploring: {curiosity}")

        if prof_parts:
            lines.append("")
            lines.append("PROFILE")
            for p in prof_parts:
                lines.append(f"  {p}")

        # ── Onboarding answers ─────────────────────────────────────────────
        ob = self.onboarding
        if ob:
            ob_map = {
                "age":        "Life phase",
                "profession": "Profession",
                "lifePOV":    "Money philosophy",
                "risk":       "Risk appetite",
                "family":     "Dependents",
                "market":     "Market view",
            }
            ob_parts = [f"{ob_map.get(k, k)}: {v}"
                        for k, v in ob.items() if v and k in ob_map]
            if ob_parts:
                lines.append("")
                lines.append("ONBOARDING (what they told us when they signed up)")
                for p in ob_parts:
                    lines.append(f"  {p}")

        # ── Financial DNA / archetype ──────────────────────────────────────
        dna = self.dna
        if dna:
            dna_parts = []
            if dna.get("archetype"):   dna_parts.append(f"Archetype: {dna['archetype']}")
            if dna.get("score"):       dna_parts.append(f"Score: {dna['score']}")
            if dna.get("description"): dna_parts.append(dna["description"][:120])
            if dna_parts:
                lines.append("")
                lines.append("FINANCIAL DNA")
                for p in dna_parts:
                    lines.append(f"  {p}")

        # ── Current page context ───────────────────────────────────────────
        pg = self.page
        module = self._raw.get("page_module") or pg.get("module") or "home"
        lines.append("")
        lines.append(f"CURRENT PAGE: {module.replace('_', ' ').title()} "
                     f"({pg.get('title', '')})")

        # ── Live financial data ────────────────────────────────────────────
        fin = self.financial
        if fin:
            lines.append("")
            lines.append("LIVE FINANCIAL SNAPSHOT")

            port = fin.get("portfolio")
            if port:
                pval = port.get("total_value", 0)
                pnl  = port.get("pnl", 0)
                ppct = port.get("pnl_pct", 0)
                lines.append(f"  Portfolio: ₹{pval:,.0f}  |  P&L: ₹{pnl:+,.0f} ({ppct:+.1f}%)")
                holdings = port.get("holdings") or []
                if holdings:
                    top = ", ".join(
                        f"{h.get('symbol','?')} ({h.get('quantity','?')} units)"
                        for h in holdings[:5]
                    )
                    lines.append(f"  Top holdings: {top}")

            goals = fin.get("goals")
            if goals:
                goal_strs = []
                for g in goals[:4]:
                    nm  = g.get("name") or "Goal"
                    tgt = g.get("target") or 0
                    prg = g.get("progress")
                    if prg is not None:
                        goal_strs.append(f"{nm} ({prg}% of ₹{tgt:,.0f})")
                    else:
                        goal_strs.append(f"{nm} (₹{tgt:,.0f})")
                if goal_strs:
                    lines.append(f"  Goals: {' | '.join(goal_strs)}")

            txs = fin.get("transactions")
            if txs:
                lines.append(
                    f"  Cashflow (last {txs.get('count','?')} txns): "
                    f"In ₹{txs.get('total_income',0):,.0f} / "
                    f"Out ₹{txs.get('total_expense',0):,.0f} / "
                    f"Net ₹{txs.get('net',0):+,.0f}"
                )
                top_cats = txs.get("top_categories") or []
                if top_cats:
                    cat_str = ", ".join(
                        f"{c['cat']} ₹{c['amt']:,.0f}" for c in top_cats[:3]
                    )
                    lines.append(f"  Top spend: {cat_str}")

            bud = fin.get("budget")
            if bud and isinstance(bud, dict):
                lines.append(f"  Budget: {bud}")

            tax = fin.get("tax")
            if tax and isinstance(tax, dict):
                lines.append(f"  Tax snapshot: {tax}")

            # ── Financial Health Score (from alert engine) ─────────────────
            hs = fin.get("health_score")
            if hs:
                lines.append(
                    f"  Health Score: {hs.get('tier_emoji','')} "
                    f"{hs.get('total','?')}/100 — {hs.get('tier','')} — "
                    f"{hs.get('headline','')}"
                )
                tips = hs.get("top_tips") or []
                if tips:
                    lines.append("  Priority actions: " + " | ".join(tips[:2]))

        # ── Watchlist ──────────────────────────────────────────────────────
        wl = self.watchlist
        if wl:
            wl_str = ", ".join(str(w.get("symbol", w) if isinstance(w, dict) else w)
                               for w in wl[:8])
            lines.append("")
            lines.append(f"WATCHLIST: {wl_str}")

        # ── App preferences ────────────────────────────────────────────────
        s = self.settings
        pref_parts = []
        if s.get("language"):    pref_parts.append(f"Language: {s['language']}")
        if s.get("persona"):     pref_parts.append(f"Persona: {s['persona']}")
        if s.get("currency"):    pref_parts.append(f"Currency: {s['currency']}")
        if s.get("numberFormat"):pref_parts.append(f"Numbers: {s['numberFormat']}")
        if s.get("riskLevel"):   pref_parts.append(f"Risk pref: {s['riskLevel']}")
        if pref_parts:
            lines.append("")
            lines.append("PREFERENCES: " + "  |  ".join(pref_parts))

        lines.append("")
        lines.append("━━━ End of user context. Personalise accordingly. ━━━")
        lines.append("")

        return "\n".join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# PERSISTENT MEMORY STORE  —  Supabase-backed cross-session memory
# ══════════════════════════════════════════════════════════════════════════════
class MemoryStore:
    """
    Async Supabase REST client for agent_memories table.
    Gracefully degrades to no-op if Supabase is not configured.

    One row per user:
      profile   — extracted facts (name/age/income/goals/debts)
      summary   — LLM-generated session summary (injected on next connect)
      mem_items — last HISTORY_TURNS*2 conversation turns
    """

    TABLE = "agent_memories"
    # How many recent conversation turns to persist
    MAX_ITEMS = HISTORY_TURNS * 2

    def __init__(self):
        self._client: "httpx.AsyncClient | None" = None
        if _SB_READY:
            self._client = httpx.AsyncClient(
                base_url=f"{_SB_URL}/rest/v1",
                headers={
                    "apikey":        _SB_KEY,
                    "Authorization": f"Bearer {_SB_KEY}",
                    "Content-Type":  "application/json",
                    "Prefer":        "return=minimal",
                },
                timeout=8.0,
            )

    # ── Internal helpers ───────────────────────────────────────────────────

    async def _get(self, user_id: str) -> dict | None:
        """Fetch the memory row for this user. Returns None if not found."""
        if not self._client:
            return None
        try:
            r = await self._client.get(
                f"/{self.TABLE}",
                params={
                    "user_id": f"eq.{user_id}",
                    "select":  "profile,summary,mem_items,total_sessions,total_messages",
                    "limit":   "1",
                },
            )
            if r.status_code == 200:
                rows = r.json()
                return rows[0] if rows else None
        except Exception as e:
            log_sb.debug("load error: %s", e)
        return None

    async def _upsert(self, payload: dict) -> bool:
        """Upsert a memory row (insert or update on conflict)."""
        if not self._client:
            return False
        try:
            # Override Prefer header for upsert
            r = await self._client.post(
                f"/{self.TABLE}",
                content=json.dumps(payload),
                headers={
                    **dict(self._client.headers),
                    "Prefer": "resolution=merge-duplicates,return=minimal",
                },
            )
            return r.status_code in (200, 201, 204)
        except Exception as e:
            log_sb.debug("save error: %s", e)
        return False

    # ── Public API ─────────────────────────────────────────────────────────

    async def load(self, user_id: str, mem: "Memory") -> bool:
        """
        Load persisted profile + summary + recent turns into `mem`.
        Returns True if anything was restored, False otherwise.
        """
        row = await self._get(user_id)
        if not row:
            log_sb.info("No saved memory for user %s — fresh session", user_id[:8])
            return False

        # Restore profile (don't overwrite keys already set by UserContext)
        if row.get("profile") and isinstance(row["profile"], dict):
            for k, v in row["profile"].items():
                if k not in mem.profile:
                    mem.profile[k] = v

        # Restore conversation history (warm context)
        items = row.get("mem_items") or []
        if items and isinstance(items, list):
            for item in items[-self.MAX_ITEMS:]:
                role    = item.get("role", "user")
                content = item.get("content", "")
                if content:
                    mem._msgs.appendleft({"role": role, "content": content})
            # _msgs is a deque — re-order to chronological
            mem._msgs = deque(
                reversed(list(mem._msgs)),
                maxlen=mem._msgs.maxlen,
            )

        sessions = row.get("total_sessions", 0)
        log_sb.info(
            "Memory restored for user %s — %d profile keys, %d turns, %d prior sessions",
            user_id[:8], len(row.get("profile") or {}),
            len(items), sessions,
        )
        return True

    async def save(self, user_id: str, mem: "Memory",
                   summary: str | None = None,
                   increment_session: bool = False) -> bool:
        """
        Persist current profile + recent turns + summary to Supabase.
        Called on session end and every AUTOSAVE_INTERVAL seconds.
        """
        if not user_id:
            return False

        # Fetch existing totals so we can increment them
        existing = await self._get(user_id) or {}

        sessions = (existing.get("total_sessions") or 0) + (1 if increment_session else 0)
        messages = (existing.get("total_messages") or 0) + len(list(mem._msgs))

        turns = [
            {"role": m["role"], "content": m["content"][:400]}  # cap per-turn size
            for m in list(mem._msgs)[-self.MAX_ITEMS:]
        ]

        payload: dict = {
            "user_id":        user_id,
            "profile":        mem.profile,
            "mem_items":      turns,
            "total_sessions": sessions,
            "total_messages": messages,
            "last_seen":      "now()",
        }
        if summary:
            payload["summary"] = summary

        ok = await self._upsert(payload)
        log_sb.info(
            "Memory saved for user %s — %d keys, %d turns, session #%d  [%s]",
            user_id[:8], len(mem.profile), len(turns), sessions,
            "ok" if ok else "FAILED",
        )
        return ok

    async def clear(self, user_id: str) -> bool:
        """Wipe persisted memory (user clicked 'Clear Memory')."""
        if not self._client or not user_id:
            return False
        try:
            r = await self._client.delete(
                f"/{self.TABLE}",
                params={"user_id": f"eq.{user_id}"},
            )
            return r.status_code in (200, 204)
        except Exception as e:
            log_sb.debug("clear error: %s", e)
        return False

    async def aclose(self):
        if self._client:
            await self._client.aclose()


# Autosave interval (seconds) — saves mid-session every N seconds
AUTOSAVE_INTERVAL = 5 * 60   # 5 minutes


# ══════════════════════════════════════════════════════════════════════════════
# MEMORY  —  in-memory, zero latency, personalization-aware
# ══════════════════════════════════════════════════════════════════════════════
class Memory:
    """Rich, personalization-aware memory. Extracts user profile from conversation."""

    # ── Profile extraction patterns ─────────────────────────────────────────
    _NAME_PATS = [
        r"my name is (\w+)", r"i(?:'m| am) (\w+)", r"call me (\w+)",
        r"mera naam (\w+) hai", r"main (\w+) hoon", r"naam (\w+) hai",
    ]
    _INCOME_PATS = [
        r"(?:earn|salary|income|ctc|make|get)[^\d₹]*[₹\s]*(\d[\d,.]+)\s*(?:lakh|lac|l\b|k\b)?",
        r"[₹\s]*(\d[\d,.]+)\s*(?:per month|per annum|pa|pm|mahine|month mein)",
        r"(\d+)\s*lakh\s*(?:per|a)\s*(?:year|month|annum)",
    ]
    _AGE_PATS = [
        r"\bi(?:'m| am) (\d{2})\b", r"\bage[:\s]+(\d{2})\b",
        r"(\d{2})\s*(?:year|yr)s? old", r"(\d{2}) saal",
    ]
    _GOAL_PATS = [
        (r"(?:retire|retirement)\s+(?:at|by)?\s*(\d{2})",  "retire_age"),
        (r"buy\s+(?:a\s+)?(?:house|flat|property)",         "wants_house"),
        (r"(?:child|kids?|baby)\s+(?:education|school|college)", "child_education"),
        (r"fire\b|financial independence",                   "wants_fire"),
        (r"start\s+(?:a\s+)?(?:business|startup)",          "wants_business"),
        (r"abroad|foreign|migrate|usa|uk|canada",            "wants_abroad"),
        (r"(?:wedding|marriage|shaadi)\s+(?:in|next|this)?", "wedding_plan"),
    ]
    _FAMILY_PATS = [
        (r"\bmarried\b|\bwife\b|\bhusband\b|\bspouse\b",    "married"),
        (r"\bkids?\b|\bchildren\b|\bson\b|\bdaughter\b|\bbachcha\b", "has_kids"),
        (r"\bparents? (?:are )?dependent\b|\bparent support\b", "dependent_parents"),
        (r"\bsingle\b|\bbachelor\b|\bunmarried\b",           "single"),
    ]
    _CITY_PATS = [
        (r"\b(mumbai|delhi|bangalore|bengaluru|hyderabad|chennai|pune|kolkata)\b", "metro"),
        (r"\b(noida|gurgaon|gurugram|navi mumbai|thane)\b", "metro_adjacent"),
    ]
    _DEBT_PATS = [
        (r"home\s*loan|housing\s*loan",     "has_home_loan"),
        (r"car\s*loan|auto\s*loan",         "has_car_loan"),
        (r"personal\s*loan",                "has_personal_loan"),
        (r"credit\s*card\s*(?:debt|dues|outstanding)", "has_cc_debt"),
        (r"education\s*loan|student\s*loan", "has_edu_loan"),
    ]

    def __init__(self):
        self._msgs: deque[dict] = deque(maxlen=HISTORY_TURNS * 2)
        self.profile: dict = {}

    def add(self, role: str, text: str):
        self._msgs.append({"role": role, "content": text})
        if role == "user":
            self._extract_profile(text)

    def _extract_profile(self, text: str):
        tl = text.lower()

        # Name
        if "name" not in self.profile:
            for pat in self._NAME_PATS:
                m = re.search(pat, tl)
                if m and len(m.group(1)) > 2 and m.group(1) not in ("the", "not", "now", "just"):
                    self.profile["name"] = m.group(1).capitalize()
                    break

        # Income
        if "income" not in self.profile:
            for pat in self._INCOME_PATS:
                m = re.search(pat, tl)
                if m:
                    raw = m.group(1).replace(",", "")
                    try:
                        val = float(raw)
                        # Normalise: if < 1000 assume lakhs → convert to actual
                        self.profile["income"] = f"₹{val:,.0f}" if val > 1000 else f"₹{val}L/yr"
                    except ValueError:
                        pass
                    break

        # Age
        if "age" not in self.profile:
            for pat in self._AGE_PATS:
                m = re.search(pat, tl)
                if m:
                    age = int(m.group(1))
                    if 16 <= age <= 75:
                        self.profile["age"] = age
                        # Infer life stage
                        if age < 26:   self.profile["life_stage"] = "early_career"
                        elif age < 35: self.profile["life_stage"] = "growth"
                        elif age < 45: self.profile["life_stage"] = "family_phase"
                        elif age < 55: self.profile["life_stage"] = "peak_income"
                        else:           self.profile["life_stage"] = "pre_retirement"
                    break

        # Goals (additive — can have multiple)
        for pat, key in self._GOAL_PATS:
            if key not in self.profile and re.search(pat, tl):
                self.profile[key] = True

        # Retire age
        m = re.search(r"retire.*?(\d{2})", tl)
        if m:
            self.profile["retire_age"] = int(m.group(1))

        # Family
        for pat, key in self._FAMILY_PATS:
            if key not in self.profile and re.search(pat, tl):
                self.profile[key] = True

        # City tier
        if "city_tier" not in self.profile:
            for pat, tier in self._CITY_PATS:
                if re.search(pat, tl):
                    self.profile["city_tier"] = tier
                    break

        # Debts
        for pat, key in self._DEBT_PATS:
            if key not in self.profile and re.search(pat, tl):
                self.profile[key] = True

    def get_history(self) -> list[dict]:
        return list(self._msgs)

    def get_profile_ctx(self) -> str:
        """Build a rich context block from everything known about the user."""
        if not self.profile:
            return ""
        lines = ["[USER PROFILE — use this to personalise every answer]"]

        if "name" in self.profile:
            lines.append(f"Name: {self.profile['name']}")
        if "age" in self.profile:
            lines.append(f"Age: {self.profile['age']}")
        if "life_stage" in self.profile:
            stage_map = {
                "early_career":    "Early career (22–26) — build habits, avoid EMIs",
                "growth":          "Growth phase (26–35) — ramp up savings, first investments",
                "family_phase":    "Family phase (35–45) — protect + grow, child planning",
                "peak_income":     "Peak income (45–55) — accelerate wealth, tax efficiency",
                "pre_retirement":  "Pre-retirement (55+) — capital preservation, income",
            }
            lines.append(f"Life stage: {stage_map.get(self.profile['life_stage'], self.profile['life_stage'])}")
        if "income" in self.profile:
            lines.append(f"Income mentioned: {self.profile['income']}")
        if "city_tier" in self.profile:
            lines.append(f"City tier: {self.profile['city_tier']}")

        # Goals
        goals = []
        if self.profile.get("wants_house"):     goals.append("buy a house")
        if self.profile.get("wants_fire"):      goals.append("FIRE / retire early")
        if self.profile.get("wants_business"):  goals.append("start a business")
        if self.profile.get("wants_abroad"):    goals.append("move abroad")
        if self.profile.get("child_education"): goals.append("child's education")
        if self.profile.get("wedding_plan"):    goals.append("wedding planning")
        if self.profile.get("retire_age"):      goals.append(f"retire at {self.profile['retire_age']}")
        if goals:
            lines.append(f"Goals: {', '.join(goals)}")

        # Family
        fam = []
        if self.profile.get("married"):             fam.append("married")
        if self.profile.get("has_kids"):            fam.append("has kids")
        if self.profile.get("dependent_parents"):   fam.append("parents are dependent")
        if self.profile.get("single"):              fam.append("single")
        if fam:
            lines.append(f"Family: {', '.join(fam)}")

        # Debts
        debts = []
        if self.profile.get("has_home_loan"):       debts.append("home loan")
        if self.profile.get("has_car_loan"):        debts.append("car loan")
        if self.profile.get("has_personal_loan"):   debts.append("personal loan")
        if self.profile.get("has_cc_debt"):         debts.append("credit card debt")
        if self.profile.get("has_edu_loan"):        debts.append("education loan")
        if debts:
            lines.append(f"Known debts: {', '.join(debts)}")

        # Prior session summary (restored from Supabase)
        prior = self.profile.get("_prior_summary")
        if prior:
            lines.append("")
            lines.append(f"MEMORY FROM LAST SESSION: {prior}")

        return "\n" + "\n".join(lines) + "\n"

    def recent(self, n: int = 20) -> list[str]:
        return [f"[{m['role']}] {m['content']}" for m in list(self._msgs)[-n:]]

    def clear(self):
        self._msgs.clear()
        self.profile.clear()

# ══════════════════════════════════════════════════════════════════════════════
# STT — Whisper tiny
# ══════════════════════════════════════════════════════════════════════════════
class STT:
    PROMPT = "Financial assistant. Hindi aur English mein baat karte hain."
    MAP = {"hi": "hindi", "en": "english"}

    def __init__(self):
        log.info("Loading Whisper %s…", WHISPER_SIZE)
        os.makedirs(WHISPER_DIR, exist_ok=True)
        self.model = WhisperModel(WHISPER_SIZE, device="cpu",
                                  compute_type="int8", cpu_threads=WHISPER_THREADS,
                                  download_root=WHISPER_DIR)
        log.info("Whisper %s ready", WHISPER_SIZE)

    def transcribe(self, path: str) -> tuple[str, str]:
        segs, info = self.model.transcribe(
            path, beam_size=1,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 200, "speech_pad_ms": 50},
            initial_prompt=self.PROMPT,
            condition_on_previous_text=False,
            no_speech_threshold=0.5,
        )
        text = " ".join(s.text.strip() for s in segs).strip()
        code = getattr(info, "language", "en") or "en"
        prob = getattr(info, "language_probability", 0.0)

        # Map to english/hindi only
        if code == "hi" and prob >= 0.55:
            lang = "hindi"
        else:
            lang = "english"

        # Override by scanning text for Devanagari
        dl = detect_lang(text)
        if dl == "hindi":
            lang = "hindi"

        log.info("STT: %s (%.0f%%)  %r", lang, prob * 100, text[:60])
        return text, lang

# ══════════════════════════════════════════════════════════════════════════════
# TTS — Edge Neural
# ══════════════════════════════════════════════════════════════════════════════
class TTS:
    async def speak(self, text: str, lang: str = "english") -> bytes:
        voice = EDGE_VOICES.get(lang, EDGE_VOICES["english"])
        com   = edge_tts.Communicate(text, voice, rate=TTS_RATE, pitch=TTS_PITCH)
        audio = b""
        async for chunk in com.stream():
            if chunk["type"] == "audio":
                audio += chunk["data"]
        if not audio:
            raise RuntimeError(f"TTS empty (voice={voice})")
        return audio

    async def warmup(self):
        try:
            await asyncio.wait_for(self.speak("Ready.", "english"), timeout=6.0)
            log.info("TTS warmed up")
        except Exception:
            pass

# ══════════════════════════════════════════════════════════════════════════════
# LLM BRAIN
# ══════════════════════════════════════════════════════════════════════════════
class Brain:
    # ── Language injection (voice-mode specific) ─────────────────────────────
    _LANG_INJECT = {
        "english":  (
            "LANGUAGE MODE: English. Reply in clean, confident Indian English. "
            "Use finance terms like SIP, EMI, PPF, ELSS naturally. NO Hindi words. NO Devanagari."
        ),
        "hindi":    (
            "LANGUAGE MODE: Hindi. Reply in warm, natural Hindi using Devanagari script. "
            "You may keep finance terms in English (SIP, EMI, PPF) as Indians say them. "
            "Sound like a knowledgeable dost, not a news anchor."
        ),
        "hinglish": (
            "LANGUAGE MODE: Hinglish. Mix Hindi and English naturally the way educated urban Indians actually speak. "
            "Example: 'Dekh yaar, agar tu 10 saal ke liye SIP kare toh compounding ka magic dekhega.' "
            "Finance terms stay English. Emotions and casual phrases in Hindi. Never forced — keep it natural."
        ),
    }

    # ── Intent patterns → context injection ─────────────────────────────────
    _INTENT_RULES = [
        (re.compile(r"\b(lic|jeevan|ulip|money.back|endowment|insurance.invest)\b", re.I),
         "INTENT: LIC/Insurance trap question. Lead with the LIC vs Term+MF comparison. Give actual rupee numbers."),
        (re.compile(r"\b(f&o|futures|options|intraday|nifty.*trade|trading.*profit)\b", re.I),
         "INTENT: F&O/trading question. Reference SEBI data — 90% lose money. Be compassionate but firm."),
        (re.compile(r"\b(sip|systematic|mutual fund|mf|elss|index fund|nifty 50)\b", re.I),
         "INTENT: SIP/MF question. Reference benchmark returns. Always recommend Direct plans on Kuvera."),
        (re.compile(r"\b(tax|80c|80d|itr|regime|old regime|new regime|hra|deduct)\b", re.I),
         "INTENT: Tax question. Use AY 2025-26 rules. Be precise about slabs and deductions."),
        (re.compile(r"\b(emi|loan|debt|credit card|personal loan|outstanding)\b", re.I),
         "INTENT: Debt/EMI question. Calculate total cost not just monthly. EMI should be under 35-40% of income."),
        (re.compile(r"\b(retire|fire|financial independence|corpus|passive income)\b", re.I),
         "INTENT: Retirement/FIRE question. Calculate the actual corpus needed. Use 4% withdrawal rule context."),
        (re.compile(r"\b(house|flat|property|home loan|rent|buy.*house|should.*buy)\b", re.I),
         "INTENT: Real estate question. Run the rent vs buy math. Property appreciation is ~5-6% CAGR."),
        (re.compile(r"\b(ppf|epf|nps|provident fund|pf|pension)\b", re.I),
         "INTENT: Safe instrument question. PPF=7.1% tax-free. EPF=8.25%. NPS=extra 50K deduction."),
        (re.compile(r"\b(bonus|windfall|lump.sum|got money|increment|hike|appraisal)\b", re.I),
         "INTENT: Windfall/bonus question. Use the waterfall: emergency fund → debt → PPF → NPS → index STP."),
        (re.compile(r"\b(start|begin|first|new|fresher|confused|don.t know|kahan se)\b", re.I),
         "INTENT: Beginner question. Start with the basics. Emergency fund → term insurance → SIP. Keep it simple."),
    ]

    def __init__(self, mem: Memory):
        self.mem = mem

    def _classify_intent(self, text: str) -> str:
        """Return the intent injection string for the most relevant topic."""
        for pattern, inject in self._INTENT_RULES:
            if pattern.search(text):
                return inject
        return ""

    def stream(self, user_text: str, lang: str = "english",
               user_ctx: "UserContext | None" = None):
        profile_ctx  = self.mem.get_profile_ctx()
        lang_inject  = self._LANG_INJECT.get(lang, self._LANG_INJECT["english"])
        intent_ctx   = self._classify_intent(user_text)

        system = SYSTEM_PROMPT + profile_ctx

        # Inject full structured user context from the browser (highest priority)
        if user_ctx and user_ctx._raw:
            system += user_ctx.to_prompt()

        if intent_ctx:
            system += f"\n\n{intent_ctx}"
        system += f"\n\n{lang_inject}"

        messages = (
            [{"role": "system", "content": system}]
            + self.mem.get_history()
            + [{"role": "user", "content": user_text}]
        )

        full = ""
        for chunk in ollama.chat(model=OLLAMA_MODEL, messages=messages,
                                  stream=True, options=OLLAMA_OPTIONS):
            tok   = chunk["message"]["content"]
            full += tok
            yield tok, full

        self.mem.add("user",      user_text)
        self.mem.add("assistant", full)


    def generate_summary(self, mem: "Memory") -> str:
        """
        Ask the LLM to produce a short factual summary of the session
        (name, income, goals, key decisions made, advice given).
        Used to seed the next session so the agent remembers everything.
        """
        history_text = "\n".join(
            f"[{m['role'].upper()}] {m['content']}" for m in list(mem._msgs)[-20:]
        )
        if not history_text.strip():
            return ""

        prompt = (
            "You are a memory archiver for a personal finance AI. "
            "Read the conversation below and write a CONCISE memory note (max 120 words) "
            "capturing: the user's name (if shared), income/financial situation, "
            "key goals or concerns, any important decisions or advice. "
            "Be factual. No opinions. Write in third person. "
            "If nothing meaningful was discussed, output only: 'New session — no key facts captured.'\n\n"
            f"CONVERSATION:\n{history_text}\n\nMEMORY NOTE:"
        )
        try:
            result = ollama.chat(
                model=OLLAMA_MODEL,
                messages=[{"role": "user", "content": prompt}],
                stream=False,
                options={**OLLAMA_OPTIONS, "num_predict": 150, "temperature": 0.2},
            )
            return result["message"]["content"].strip()[:500]
        except Exception as e:
            log.warning("Summary generation failed: %s", e)
            return ""


def _sync_ollama_warm():
    try:
        for _ in ollama.chat(
            model=OLLAMA_MODEL,
            messages=[{"role": "user", "content": "hi"}],
            stream=True,
            options={**OLLAMA_OPTIONS, "num_predict": 1},
        ):
            break
        log.info("Ollama warmed up (%s)", OLLAMA_MODEL)
    except Exception as e:
        log.warning("Ollama warmup failed: %s", e)

# ══════════════════════════════════════════════════════════════════════════════
# WEBSOCKET SERVER
# ══════════════════════════════════════════════════════════════════════════════
class Server:
    def __init__(self):
        self.mem        = Memory()
        self.stt        = STT()
        self.tts        = TTS()
        self.brain      = Brain(self.mem)
        self.user_ctx   = UserContext()
        self.mem_store  = MemoryStore()
        self.clients: set = set()
        self._lang: str | None = None
        self._autosave_task: asyncio.Task | None = None
        self._mem_loaded: bool = False       # True once persistent memory restored

    async def _send(self, obj: dict):
        if not self.clients: return
        data = json.dumps(obj)
        await asyncio.gather(*[c.send(data) for c in list(self.clients)],
                             return_exceptions=True)

    # ── Persistent memory helpers ──────────────────────────────────────────

    async def load_persistent_memory(self, user_id: str):
        """
        Load saved profile + history from Supabase into self.mem.
        Called once per session when user_id is first known.
        Sends a `memory_restored` event to the frontend.
        """
        if self._mem_loaded:
            return                          # already loaded this session
        self._mem_loaded = True

        restored = await self.mem_store.load(user_id, self.mem)

        # Tell the frontend
        summary_snippet = ""
        if restored:
            # Inject prior session summary into profile_ctx so Brain sees it
            row = await self.mem_store._get(user_id)
            if row and row.get("summary"):
                self.mem.profile["_prior_summary"] = row["summary"]
                summary_snippet = row["summary"][:160]

        await self._send({
            "type":          "memory_restored",
            "restored":      restored,
            "profile_keys":  len(self.mem.profile),
            "mem_items":     len(self.mem.get_history()),
            "summary":       summary_snippet,
        })

        # Start autosave loop
        if self._autosave_task is None or self._autosave_task.done():
            self._autosave_task = asyncio.ensure_future(
                self._autosave_loop(user_id)
            )

    async def _autosave_loop(self, user_id: str):
        """Silently save memory every AUTOSAVE_INTERVAL seconds."""
        try:
            while True:
                await asyncio.sleep(AUTOSAVE_INTERVAL)
                if not self.clients:
                    break
                await self.mem_store.save(user_id, self.mem)
        except asyncio.CancelledError:
            pass

    async def save_session_memory(self, user_id: str):
        """
        Called on disconnect. Generates an LLM summary and saves everything.
        Runs in a background thread so it doesn't block the WS close.
        """
        if not user_id or not self.mem.get_history():
            return
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None, self.brain.generate_summary, self.mem
        )
        await self.mem_store.save(
            user_id, self.mem,
            summary=summary or None,
            increment_session=True,
        )
        log.info("Session memory saved for user %s", user_id[:8])

    async def handler(self, ws):
        # Single-client mode — reject extra connections, never close the live one
        if self.clients:
            log.info("Extra connection rejected (already have 1 client)")
            await ws.close(1008, "Single-client mode")
            return
        self.clients.add(ws)
        log.info("Connected (1)")
        await ws.send(json.dumps({
            "type":       "ready",
            "model":      OLLAMA_MODEL,
            "tts_native": True,
            "tts_engine": "Edge Neural",
            "stt_engine": f"Whisper {WHISPER_SIZE}",
            "whisper":    WHISPER_SIZE,
            "sarvam":     False,
            "version":    "v10",
            "langs":      ["english", "hindi", "hinglish"],
        }))
        try:
            async for raw in ws:
                await self._dispatch(ws, json.loads(raw))
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(ws)
            # Save memory before clearing context
            uid = self.user_ctx.user_id
            if uid and self.mem.get_history():
                asyncio.ensure_future(self.save_session_memory(uid))
            # Cancel autosave loop
            if self._autosave_task and not self._autosave_task.done():
                self._autosave_task.cancel()
            # Reset session state flags
            self._mem_loaded = False
            # SECURITY: clear user context on disconnect — no data persists in RAM
            self.user_ctx.clear()
            log.info("Disconnected (%d) — memory saved, context cleared", len(self.clients))

    async def _dispatch(self, ws, msg: dict):
        t = msg.get("type")
        if t == "text_input":
            text = msg["text"].strip()
            if not text: return
            tl = text.lower()
            # Explicit language switches
            if any(kw in tl for kw in _HINGLISH_WORDS):
                self._lang = "hinglish"
                await self._send({"type": "tts_lang_changed", "lang": "hinglish"})
            elif any(kw in tl for kw in _HINDI_WORDS):
                self._lang = "hindi"
                await self._send({"type": "tts_lang_changed", "lang": "hindi"})
            elif any(kw in tl for kw in _ENGLISH_WORDS):
                self._lang = None
                await self._send({"type": "tts_lang_changed", "lang": "auto"})
            # Implicit hinglish detection (desi casual words)
            elif self._lang is None:
                detected = detect_lang(text)
                if detected == "hinglish":
                    self._lang = "hinglish"
            lang = self._lang or "english"
            await self._pipeline(text, lang, self.user_ctx)

        elif t == "audio_chunk":
            await self._from_audio(bytes(msg["data"]))

        elif t == "user_context":
            # Structured user profile from finos-context.js (via postMessage → iframe → WS)
            accepted = self.user_ctx.ingest(msg)
            if accepted:
                name  = self.user_ctx.name()
                phase = self.user_ctx._phase
                uid   = self.user_ctx.user_id
                log.info("UserContext accepted: %s | %s | phase=%s",
                         name or "guest", (uid or "no-uid")[:12], phase)

                # ── Load persistent memory from Supabase (first time only) ──
                if uid and not self._mem_loaded:
                    asyncio.ensure_future(self.load_persistent_memory(uid))

                # Confirm receipt to frontend
                await ws.send(json.dumps({
                    "type":    "context_ack",
                    "phase":   phase,
                    "name":    name,
                    "user_id": (uid or "")[:12] + "…",
                }))

                # Merge any name/income/goals from Supabase profile into Memory
                # so the profile card in the UI gets populated immediately
                if name and "name" not in self.mem.profile:
                    self.mem.profile["name"] = name
                identity = self.user_ctx.identity
                if identity.get("income_range") and "income" not in self.mem.profile:
                    self.mem.profile["income"] = f"₹{identity['income_range']}/yr"
                if identity.get("life_stage") and "life_stage" not in self.mem.profile:
                    self.mem.profile["life_stage"] = identity["life_stage"]

                # Broadcast updated profile card to frontend
                await self._send({"type":    "memories",
                                   "data":    self.mem.recent()})
            else:
                await ws.send(json.dumps({
                    "type":    "context_ack",
                    "phase":   "rejected",
                    "reason":  "user_id mismatch — security check failed",
                }))

        elif t == "clear_memory":
            uid = self.user_ctx.user_id
            self.mem.clear()
            self.user_ctx.clear()   # also wipe user context on explicit clear
            self._lang        = None
            self._mem_loaded  = False
            # Wipe Supabase row too
            if uid:
                asyncio.ensure_future(self.mem_store.clear(uid))
            await self._send({"type": "memories", "data": []})
            await self._send({"type": "status",  "text": "Memory cleared — fresh start! 🧹"})

        elif t == "get_memories":
            data = self.mem.recent()
            prior = self.mem.profile.get("_prior_summary")
            await ws.send(json.dumps({
                "type":          "memories",
                "data":          data,
                "prior_summary": prior or "",
                "mem_loaded":    self._mem_loaded,
            }))

        elif t == "set_language":
            lang = msg.get("lang", "auto")
            self._lang = None if lang == "auto" else lang
            await self._send({"type": "tts_lang_changed", "lang": lang})

    async def _pipeline(self, user_text: str, lang: str = "english",
                        user_ctx: "UserContext | None" = None):
        loop = asyncio.get_event_loop()
        t0   = time.monotonic()
        await self._send({"type": "pipeline_start"})
        await self._send({"type": "user_transcript", "text": user_text})
        await self._send({"type": "state", "state": "thinking"})

        try:
            _DONE = object()
            q: asyncio.Queue = asyncio.Queue()

            def _produce():
                try:
                    for tok, full in self.brain.stream(user_text, lang, user_ctx):
                        loop.call_soon_threadsafe(q.put_nowait, (tok, full))
                except Exception as e:
                    loop.call_soon_threadsafe(q.put_nowait, e)
                finally:
                    loop.call_soon_threadsafe(q.put_nowait, _DONE)

            threading.Thread(target=_produce, daemon=True).start()

            buf       = ""
            full      = ""
            seq       = 0
            in_think  = False
            think_buf = ""
            sem   = asyncio.Semaphore(MAX_TTS_CONCURRENT)
            tasks: list[asyncio.Task] = []

            async def _tts(text: str, s: int):
                async with sem:
                    c = clean_tts(text)
                    if not c: return
                    try:
                        mp3 = await asyncio.wait_for(
                            self.tts.speak(c, lang), timeout=10.0)
                        await self._send({"type": "audio_seq",
                                          "data": base64.b64encode(mp3).decode(),
                                          "format": "mp3", "seq": s})
                    except Exception as e:
                        log.warning("TTS seq %d: %s", s, e)

            def _flush(text: str):
                nonlocal seq
                s = text.strip()
                if len(s) < 3: return
                tasks.append(asyncio.ensure_future(_tts(s, seq)))
                seq += 1

            while True:
                item = await q.get()
                if item is _DONE: break
                if isinstance(item, Exception): raise item
                tok, full = item

                if in_think:
                    think_buf += tok
                    if "</think>" in think_buf.lower():
                        in_think  = False
                        after     = re.split(r'</think>', think_buf, maxsplit=1,
                                             flags=re.IGNORECASE)[-1]
                        think_buf = ""; tok = after
                    else:
                        continue
                elif "<think>" in tok.lower():
                    in_think = True; think_buf = tok; continue

                buf += tok
                if tok:
                    await self._send({"type": "token", "text": tok})
                if any(c in tok for c in SENTENCE_ENDS):
                    s = buf.strip()
                    if len(s) >= MIN_SENTENCE_CHARS:
                        _flush(s); buf = ""

            if buf.strip(): _flush(buf)

            await self._send({"type": "reply_done", "text": full,
                               "display": clean_display(full)})
            log.info("%.1fs | %d chars | %d TTS", time.monotonic()-t0, len(full), seq)

            if tasks:
                await self._send({"type": "state", "state": "speaking"})
                await asyncio.gather(*tasks, return_exceptions=True)

            await self._send({"type": "audio_seq_done", "total": seq})
            if seq == 0:
                await self._send({"type": "tts_fallback",
                                  "text": clean_tts(full), "lang": lang})

        except Exception as e:
            log.error("Pipeline: %s", e)
            await self._send({"type": "status", "text": f"Error: {e}"})
        finally:
            await self._send({"type": "state", "state": "idle"})

    async def _from_audio(self, data: bytes):
        await self._send({"type": "state", "state": "transcribing"})
        tmp_in = tmp_wav = None
        try:
            is_wav = data[:4] == b'RIFF'
            if not is_wav:
                ext = ('.webm' if data[:4] == b'\x1a\x45\xdf\xa3'
                       else '.ogg' if data[:4] == b'OggS' else '.bin')
                with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as f:
                    f.write(data); tmp_in = f.name
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                    tmp_wav = f.name
                loop = asyncio.get_event_loop()
                r = await loop.run_in_executor(None, lambda: subprocess.run(
                    ['ffmpeg', '-y', '-i', tmp_in,
                     '-ar', '16000', '-ac', '1', '-f', 'wav', tmp_wav],
                    capture_output=True, timeout=15))
                if r.returncode != 0:
                    await self._send({"type": "status",
                                      "text": "ffmpeg failed — brew install ffmpeg"})
                    return
                wav = tmp_wav
            else:
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                    f.write(data); tmp_wav = f.name
                wav = tmp_wav

            loop = asyncio.get_event_loop()
            try:
                text, lang = await asyncio.wait_for(
                    loop.run_in_executor(None, self.stt.transcribe, wav), timeout=20.0)
            except asyncio.TimeoutError:
                text, lang = "", "english"
            except Exception as e:
                log.error("STT: %s", e); text, lang = "", "english"

            if text:
                tl = text.lower()
                # Explicit language switch via voice
                if any(kw in tl for kw in _HINGLISH_WORDS):
                    self._lang = "hinglish"
                elif any(kw in tl for kw in _HINDI_WORDS):
                    self._lang = "hindi"
                elif any(kw in tl for kw in _ENGLISH_WORDS):
                    self._lang = None
                elif self._lang is None:
                    # Auto-detect from transcribed speech
                    auto = detect_lang(text)
                    if auto in ("hindi", "hinglish"):
                        self._lang = auto
                lang = self._lang or "english"

                await self._send({"type": "detected_lang", "lang": lang})
                await self._pipeline(text, lang, self.user_ctx)
            else:
                await self._send({"type": "status",
                                  "text": "Sunai nahi diya — phir ek baar bolo."})

        except FileNotFoundError:
            await self._send({"type": "status",
                               "text": "ffmpeg not found — brew install ffmpeg"})
        except Exception as e:
            log.error("Audio: %s", e)
            await self._send({"type": "status", "text": f"Audio error: {e}"})
        finally:
            await self._send({"type": "state", "state": "idle"})
            for p in (tmp_in, tmp_wav):
                if p and os.path.exists(p):
                    try: os.unlink(p)
                    except: pass

    async def serve(self):
        log.info("FIN-OS v9  ws://%s:%d  LLM=%s  STT=Whisper-%s",
                 WS_HOST, WS_PORT, OLLAMA_MODEL, WHISPER_SIZE)
        await asyncio.gather(
            asyncio.get_event_loop().run_in_executor(None, _sync_ollama_warm),
            self.tts.warmup(),
        )
        log.info("Ready — http://localhost:8080")
        async with websockets.serve(self.handler, WS_HOST, WS_PORT,
                                    max_size=50_000_000):
            await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(Server().serve())
