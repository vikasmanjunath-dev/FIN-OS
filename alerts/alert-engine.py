"""
FIN-OS Alert Engine  v1
──────────────────────────────────────────────────────────────────────────────
Proactive financial intelligence — watches every user's money 24/7.

Run:
  python alert-engine.py

Ports:
  HTTP API: 8001   (browser calls /alerts/subscribe, /alerts/{uid})
  WS voice agent is on 8765 — separate process

Scheduled jobs (APScheduler, timezone Asia/Kolkata):
  alert_check     — every 15 min, evaluates all 10 rules per user (not 5 min —
                     every rule's cooldown_hours is >= 12h, so finer-grained
                     checking can't notify any faster; see check_all_users()'s
                     docstring)
  market_refresh  — every 60 min, refreshes the Nifty/Sensex cache
  morning_brief   — cron, 8:30am IST, broadcasts a market-wide brief via the
                     existing Web Push mechanism to every push subscriber
                     (not per-user financial advice — that's the *separate*,
                     client-triggered "Proactive Brief" in arya-sidebar-panel.js)

Dependencies (install via requirements.txt):
  fastapi uvicorn apscheduler supabase pywebpush yfinance python-dotenv httpx
"""

import asyncio
import hmac
import json
import logging
import os
import re
import secrets
import string
import time
import uuid
from urllib.parse import urlsplit
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx
import yfinance as yf
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from cachetools import TTLCache
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from pywebpush import webpush, WebPushException
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from supabase import create_client, Client
from pydantic import BaseModel, Field, field_validator

from rules import ALL_RULES, RULES_BY_ID
from health_score import (
    compute_health_score, benchmark_comparison, window_start, _monthly_window,
    _n, _monthly_income, _monthly_expenses,
)

# ── Prometheus metrics ────────────────────────────────────────────────────────
_alerts_fired   = Counter("finos_alerts_fired_total",   "Alerts fired by rule", ["rule_id"])
_hs_latency     = Histogram("finos_health_score_seconds", "Health score compute latency")
_bench_latency  = Histogram("finos_benchmark_seconds",    "Benchmark compute latency")
_api_requests   = Counter("finos_api_requests_total",    "API requests", ["method", "path"])
_cache_hits     = Counter("finos_cache_hits_total",      "Cache hits", ["endpoint"])

# ── In-process TTL caches (5-min TTL, max 500 users) ─────────────────────────
_health_cache    = TTLCache(maxsize=500, ttl=300)
_benchmark_cache = TTLCache(maxsize=500, ttl=300)

# ── Rate limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)

# ── Config ─────────────────────────────────────────────────────────────────
load_dotenv()

log = logging.getLogger("finos-alerts")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)

SUPABASE_URL         = os.getenv("SUPABASE_URL",  "https://oeapcyucnduhwpgxfknb.supabase.co")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")   # service role key — bypasses RLS
SUPABASE_ANON_KEY    = os.getenv("SUPABASE_ANON_KEY",    "")

# VAPID keys (generate with: python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print(v.public_key, v.private_key)")
VAPID_PRIVATE_KEY    = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY     = os.getenv("VAPID_PUBLIC_KEY",  "")
VAPID_CLAIMS         = {"sub": "mailto:admin@fin-os.app"}

HOST      = os.getenv("ALERTS_HOST", "127.0.0.1")   # the container CMD binds 0.0.0.0 itself; a dev run stays on this machine
PORT      = 8001
ADMIN_KEY = os.getenv("ADMIN_API_KEY", "")

# ── Authentication ───────────────────────────────────────────────────────────
# This service reads and writes with the SERVICE ROLE key (it bypasses row-level security), so every route that takes a user id
# must prove the caller is that user: "Authorization: Bearer <Supabase access token>", verified against Supabase Auth. A server-to-
# server caller (the voice agent) may use "X-Admin-Key: <ADMIN_API_KEY>" instead.
#   ALERTS_AUTH=required (default)  enforce as above
#   ALERTS_AUTH=off                 local development only: no check at all (logged loudly at start-up)
AUTH_MODE = os.getenv("ALERTS_AUTH", "required").strip().lower()
_UUID_RE  = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
_ZERO_UUID = "00000000-0000-0000-0000-000000000000"

# Browser origins allowed to call this API (never "*"); localhost on any port is always allowed for development.
CORS_ORIGINS = [o.strip() for o in os.getenv("ALERTS_CORS", "https://finos1.vercel.app").split(",") if o.strip() and o.strip() != "*"]
CORS_LOCAL_REGEX = r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?$"

# Web Push endpoints are URLs the browser vendor gave the visitor, and this service POSTs to them. Without a host check anyone
# could register http://169.254.169.254/... or an internal service as "their push endpoint" (blind SSRF).
PUSH_HOST_SUFFIXES = ("fcm.googleapis.com", "updates.push.services.mozilla.com", "push.services.mozilla.com",
                      "notify.windows.com", "push.apple.com", "web.push.apple.com")

# ── Supabase client (service role — bypasses RLS for scheduled checks) ──────
def _get_supabase() -> Client:
    key = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
    if not key:
        raise RuntimeError("No Supabase key configured — set SUPABASE_SERVICE_KEY in .env")
    return create_client(SUPABASE_URL, key)

# ── Market data cache ────────────────────────────────────────────────────────
_market_cache: dict[str, Any] = {}
_market_updated_at: float = 0
_MARKET_CACHE_TTL = 900  # 15 minutes

def _index_change(symbol: str) -> dict | None:
    """One index's last-close vs prev-close. Returns None on bad/short history."""
    hist = yf.Ticker(symbol).history(period="5d")
    if len(hist) < 2:
        return None
    today_close = float(hist["Close"].iloc[-1])
    prev_close  = float(hist["Close"].iloc[-2])
    return {
        "value":      round(today_close, 2),
        "prev":       round(prev_close, 2),
        "change_pct": round(((today_close - prev_close) / prev_close) * 100, 2),
        "change_abs": round(today_close - prev_close, 2),
    }


def get_market_data() -> dict:
    """Fetch Nifty 50 and Sensex data with caching."""
    global _market_cache, _market_updated_at

    if time.time() - _market_updated_at < _MARKET_CACHE_TTL and _market_cache:
        return _market_cache

    try:
        nifty = _index_change("^NSEI")
        # Sensex — docstring always claimed this, code never actually fetched it
        # (only Nifty). Same _index_change helper, separate try/except so a
        # Sensex hiccup can't take Nifty down with it.
        try:
            sensex = _index_change("^BSESN")
        except Exception as e:
            log.warning("Sensex fetch failed: %s", e)
            sensex = None

        if nifty:
            _market_cache = {
                "nifty_value":      nifty["value"],
                "nifty_prev":       nifty["prev"],
                "nifty_change_pct": nifty["change_pct"],
                "nifty_change_abs": nifty["change_abs"],
                "updated_at":       datetime.now(timezone.utc).isoformat(),
            }
        else:
            _market_cache = {"nifty_value": 0, "nifty_change_pct": 0}

        if sensex:
            _market_cache.update({
                "sensex_value":      sensex["value"],
                "sensex_prev":       sensex["prev"],
                "sensex_change_pct": sensex["change_pct"],
                "sensex_change_abs": sensex["change_abs"],
            })

        _market_updated_at = time.time()
        log.info("Market data refreshed: Nifty %.0f (%.2f%%) | Sensex %.0f (%.2f%%)",
                 _market_cache.get("nifty_value", 0),
                 _market_cache.get("nifty_change_pct", 0),
                 _market_cache.get("sensex_value", 0),
                 _market_cache.get("sensex_change_pct", 0))

    except Exception as e:
        log.warning("Market data fetch failed: %s", e)
        _market_cache = {"nifty_value": 0, "nifty_change_pct": 0}

    return _market_cache


TX_PAGE_ROWS = 1000
TX_MAX_ROWS = 5000


def _fetch_transactions(sb, user_id: str, since: "date") -> tuple[list[dict], bool]:
    """(rows dated on/after `since`, newest first; True if the TX_MAX_ROWS cap cut the list short)."""
    rows: list[dict] = []
    while len(rows) < TX_MAX_ROWS:
        r = (sb.table("transactions")
               .select("*")
               .eq("user_id", user_id)
               .gte("date", since.isoformat())
               .order("date", desc=True)
               .range(len(rows), len(rows) + TX_PAGE_ROWS - 1)
               .execute())
        page = r.data or []
        rows.extend(page)
        if len(page) < TX_PAGE_ROWS:
            return rows, False
    return rows[:TX_MAX_ROWS], True


# ── User data fetcher ─────────────────────────────────────────────────────────
def fetch_user_data(sb: Client, user_id: str) -> dict:
    """
    Fetch all financial data for a user from Supabase.
    Returns a dict matching the expected structure for rule evaluation.
    """
    result = {
        "user_id":    user_id,
        "profile":    {},
        "transactions": [],
        "goals":      [],
        "holdings":   {},
        "budget":     {},
        "market":     get_market_data(),
        "preferences": {},
        "prev_net_worth": 0,
    }

    try:
        # Profile
        r = sb.table("profiles").select("*").eq("id", user_id).single().execute()
        if r.data:
            result["profile"] = r.data

    except Exception as e:
        log.debug("Profile fetch for %s: %s", user_id[:8], e)

    try:
        # Transactions: every row from the first day of the oldest month in the health-score window (health_score.window_start),
        # filtered by date in the database and read page by page. This used to be "last 60 days, LIMIT 100": busy accounts were
        # silently cut off and the monthly figures were then halved as if the rows covered two months.
        rows, truncated = _fetch_transactions(sb, user_id, window_start())
        result["transactions"] = rows
        if truncated:
            result["transactions_truncated"] = True
            log.warning("Transactions for %s hit the %d-row cap; monthly figures use the newest rows only", user_id[:8], TX_MAX_ROWS)

    except Exception as e:
        log.debug("Transactions fetch for %s: %s", user_id[:8], e)

    try:
        # Goals
        r = sb.table("goals").select("*").eq("user_id", user_id).execute()
        result["goals"] = r.data or []

    except Exception as e:
        log.debug("Goals fetch for %s: %s", user_id[:8], e)

    try:
        # Holdings (portfolio)
        r = sb.table("holdings").select("*").eq("user_id", user_id).execute()
        holdings = r.data or []
        if holdings:
            total_value = sum(
                (h.get("quantity", 0) or 0) * (h.get("current_price", 0) or 0)
                for h in holdings
            )
            total_cost = sum(
                (h.get("quantity", 0) or 0) * (h.get("avg_price", 0) or 0)
                for h in holdings
            )
            fno_holdings = [h for h in holdings
                            if h.get("asset_type") in ("futures", "options")]
            result["holdings"] = {
                "items": holdings,
                "total_equity_value": total_value,
                "total_cost": total_cost,
                "pnl": total_value - total_cost,
                "total_net_worth": total_value,
                "has_fno_positions": bool(fno_holdings),
                "fno_value": sum(
                    (h.get("quantity", 0) or 0) * (h.get("current_price", 0) or 0)
                    for h in fno_holdings
                ),
            }

    except Exception as e:
        log.debug("Holdings fetch for %s: %s", user_id[:8], e)

    try:
        # Budget (current month)
        today = datetime.now()
        r = (sb.table("budgets")
               .select("*")
               .eq("user_id", user_id)
               .eq("month", today.month)
               .eq("year", today.year)
               .single()
               .execute())
        if r.data:
            result["budget"] = r.data

    except Exception as e:
        log.debug("Budget fetch for %s: %s", user_id[:8], e)

    return result


# ── Cooldown checker ──────────────────────────────────────────────────────────
def rule_in_cooldown(sb: Client, user_id: str, rule_id: str,
                     cooldown_hours: int) -> bool:
    """Return True if this rule has fired for this user within the cooldown window."""
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=cooldown_hours)).isoformat()
        r = (sb.table("alerts")
               .select("id")
               .eq("user_id", user_id)
               .eq("rule_id", rule_id)
               .gte("created_at", cutoff)
               .limit(1)
               .execute())
        return bool(r.data)
    except Exception:
        return False   # fail open — let alert fire


# ── Push notification sender ─────────────────────────────────────────────────
def send_push_to_user(sb: Client, user_id: str, alert: dict):
    """Send Web Push notification to all of a user's registered subscriptions."""
    if not VAPID_PRIVATE_KEY:
        log.debug("No VAPID key — push skipped for user %s", user_id[:8])
        return

    try:
        r = (sb.table("push_subscriptions")
               .select("*")
               .eq("user_id", user_id)
               .execute())
        subs = r.data or []
    except Exception as e:
        log.warning("Push sub fetch failed: %s", e)
        return

    payload = json.dumps({
        "title":   alert.get("title", "FIN-OS Alert"),
        "body":    alert.get("message", ""),
        "icon":    "/assets/icons/icon-192.svg",
        "badge":   "/assets/icons/icon-72.svg",
        "tag":     alert.get("rule_id", "finos"),
        "data":    {
            "url":          alert.get("action_url", "/html/dashboard.html"),
            "alert_id":     alert.get("id", ""),
        },
    })

    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub["endpoint"],
                    "keys": {
                        "p256dh": sub["p256dh"],
                        "auth":   sub["auth_key"],
                    }
                },
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims=VAPID_CLAIMS,
            )
            log.info("Push sent to %s for rule %s",
                     user_id[:8], alert.get("rule_id"))
        except WebPushException as e:
            log.warning("Push failed (sub=%s…): %s", sub["endpoint"][:40], e)
            # Remove expired/invalid subscriptions
            if "410" in str(e) or "404" in str(e):
                try:
                    sb.table("push_subscriptions").delete().eq(
                        "endpoint", sub["endpoint"]).execute()
                    log.info("Removed expired push sub for %s", user_id[:8])
                except Exception:
                    pass
        except Exception as e:
            log.warning("Push unexpected error: %s", e)


# ── Alert writer ──────────────────────────────────────────────────────────────
def create_alert(sb: Client, user_id: str, rule, alert_data: dict) -> dict | None:
    """Write alert to DB and send push. Returns inserted alert row."""
    try:
        row = sb.table("alerts").insert({
            "user_id":      user_id,
            "rule_id":      rule.rule_id,
            "title":        alert_data["title"],
            "message":      alert_data["message"],
            "priority":     rule.priority,
            "action_url":   alert_data.get("action_url"),
            "action_label": alert_data.get("action_label"),
            "data":         alert_data.get("data", {}),
        }).execute()
        inserted = row.data[0] if row.data else None
        if inserted:
            send_push_to_user(sb, user_id, {**alert_data, "id": inserted["id"],
                                              "rule_id": rule.rule_id})
        return inserted
    except Exception as e:
        log.error("Failed to insert alert for %s rule %s: %s",
                  user_id[:8], rule.rule_id, e)
        return None


# ── Core scheduler job ────────────────────────────────────────────────────────
async def check_all_users():
    """
    Main scheduled job — runs every 15 minutes, not the 5min a literal reading
    of the plan would suggest. Checked, not assumed: every rule in rules.py
    has cooldown_hours >= 12 (the shortest is the morning/afternoon spending
    check at 12h; most are 24h-30 days). A rule that can't re-fire for at
    least 12 hours gets notified on the same cycle either way — checking
    every 5 minutes instead of 15 would triple the Supabase query load
    (O(users x rules) per cycle) for zero practical improvement in alert
    latency. 15 minutes is the deliberate choice; 5 minutes only makes sense
    if a genuinely intraday, sub-hour-cooldown rule gets added later.
    For each active user, evaluates all 10 alert rules.
    """
    try:
        sb = _get_supabase()
    except RuntimeError as e:
        log.error("Supabase init failed: %s", e)
        return

    log.info("Alert check starting…")
    t0 = time.monotonic()

    try:
        # Get all users who have logged in within the last 30 days
        # We use profiles table — every logged-in user has a row
        r  = sb.table("profiles").select("id").execute()
        users = [row["id"] for row in (r.data or [])]
    except Exception as e:
        log.error("Could not fetch user list: %s", e)
        return

    fired = 0
    for user_id in users:
        try:
            user_data = fetch_user_data(sb, user_id)

            for rule in ALL_RULES:
                # Check if user has disabled this rule
                try:
                    pref_r = (sb.table("alert_preferences")
                                .select("enabled")
                                .eq("user_id", user_id)
                                .eq("rule_id", rule.rule_id)
                                .single()
                                .execute())
                    if pref_r.data and not pref_r.data.get("enabled", True):
                        continue
                except Exception:
                    pass   # No preference row = use default (enabled)

                # Check cooldown
                if rule_in_cooldown(sb, user_id, rule.rule_id, rule.cooldown_hours):
                    continue

                # Evaluate rule
                try:
                    alert_data = rule.check(user_data)
                    if alert_data:
                        create_alert(sb, user_id, rule, alert_data)
                        fired += 1
                        log.info("Alert fired: %s for user %s",
                                 rule.rule_id, user_id[:8])
                except Exception as e:
                    log.error("Rule %s failed for user %s: %s",
                              rule.rule_id, user_id[:8], e)

        except Exception as e:
            log.error("User %s check failed: %s", user_id[:8], e)

    elapsed = time.monotonic() - t0
    log.info("Alert check done — %d users, %d alerts fired, %.1fs",
             len(users), fired, elapsed)


async def refresh_market_data():
    """Refresh market data cache every 60 minutes."""
    get_market_data()


# ── Morning brief (Phase 7 gap — was interval-only, no time-of-day job) ───────
def generate_market_brief() -> dict:
    """
    Build a market-wide (not per-user) brief: Nifty + Sensex move overnight.
    Returns a {title, message} pair ready for send_push_to_user's payload.
    """
    m = get_market_data()
    nifty_pct  = m.get("nifty_change_pct", 0)
    nifty_val  = m.get("nifty_value", 0)
    sensex_pct = m.get("sensex_change_pct")
    sensex_val = m.get("sensex_value")

    def _arrow(pct):
        return "▲" if pct > 0 else "▼" if pct < 0 else "▬"

    lines = [f"Nifty {_arrow(nifty_pct)} {nifty_val:,.0f} ({nifty_pct:+.2f}%)"]
    if sensex_val is not None:
        lines.append(f"Sensex {_arrow(sensex_pct)} {sensex_val:,.0f} ({sensex_pct:+.2f}%)")

    return {
        "title":   "Good morning — market open",
        "message": " · ".join(lines),
    }


async def morning_brief_job():
    """
    Cron job, 8:30am IST (scheduler runs with timezone="Asia/Kolkata", set at
    startup below). Broadcasts one market-wide brief via the existing Web Push
    mechanism — not a new WebSocket broadcaster; send_push_to_user already
    handles VAPID signing, per-subscription delivery, and pruning dead
    subscriptions, so this reuses it rather than standing up a second
    notification path.

    NOTE: schema.sql's alert_preferences.channels supports a "voice" channel
    (Arya literally speaking the brief), but nothing in this file ever checks
    for it — push notifications only. Wiring real voice playback means the
    always-running voiceagent process would need to be told to speak
    unprompted from a separate process, which doesn't exist today; left as a
    known, flagged gap rather than guessed at.
    """
    try:
        sb = _get_supabase()
    except RuntimeError as e:
        log.error("Supabase init failed: %s", e)
        return

    brief = generate_market_brief()

    try:
        r = sb.table("push_subscriptions").select("user_id").execute()
        user_ids = list({row["user_id"] for row in (r.data or [])})
    except Exception as e:
        log.error("Could not fetch push subscribers: %s", e)
        return

    log.info("Morning brief: %s — broadcasting to %d subscribers", brief["message"], len(user_ids))
    for user_id in user_ids:
        try:
            send_push_to_user(sb, user_id, {
                "title":      brief["title"],
                "message":    brief["message"],
                "rule_id":    "morning_brief",
                "action_url": "/html/dashboard.html",
            })
        except Exception as e:
            log.error("Morning brief push failed for %s: %s", user_id[:8], e)


# ══════════════════════════════════════════════════════════════════════════════
# FASTAPI APP
# ══════════════════════════════════════════════════════════════════════════════
app = FastAPI(title="FIN-OS Alert Engine", version="2.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_LOCAL_REGEX,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Admin-Key", "X-Trace-ID"],
)

@app.middleware("http")
async def trace_and_metrics(request: Request, call_next):
    trace_id = re.sub(r"[^A-Za-z0-9._-]", "", request.headers.get("X-Trace-ID", ""))[:32] or str(uuid.uuid4())[:8]
    request.state.trace_id = trace_id
    start = time.monotonic()
    response = await call_next(request)
    # label with the route TEMPLATE ("/alerts/{user_id}"), not the URL: a user id in the label leaks ids to /metrics and makes
    # the number of time series grow without bound
    route = request.scope.get("route")
    _api_requests.labels(method=request.method, path=getattr(route, "path", "unmatched")).inc()
    elapsed = time.monotonic() - start
    response.headers["X-Trace-ID"]    = trace_id
    response.headers["X-Response-Time"] = f"{elapsed*1000:.1f}ms"
    return response


# ── Pydantic models ───────────────────────────────────────────────────────────
class PushSubscription(BaseModel):
    user_id:    str = Field(max_length=64)
    endpoint:   str = Field(max_length=1024)
    p256dh:     str = Field(max_length=256)
    auth_key:   str = Field(max_length=128)
    user_agent: str = Field("", max_length=300)


class AlertPreference(BaseModel):
    user_id:  str = Field(max_length=64)
    rule_id:  str = Field(max_length=64)
    enabled:  bool = True
    channels: list[str] = Field(["in_app", "push"], max_length=3)

    @field_validator("channels")
    @classmethod
    def known_channels(cls, v: list[str]) -> list[str]:
        if any(c not in ("in_app", "push", "voice") for c in v):
            raise ValueError("channels must be in_app | push | voice")
        return v


class CoupleLinkRequest(BaseModel):
    user_id: str = Field(max_length=64)

class CoupleLinkAccept(BaseModel):
    user_id:     str = Field(max_length=64)
    invite_code: str

    @field_validator("invite_code")
    @classmethod
    def code_format(cls, v: str) -> str:
        v = v.strip().upper()
        if len(v) < 6 or len(v) > 16 or not v.isalnum():
            raise ValueError("Invite code must be 6-16 letters or digits")
        return v

class CoupleGoal(BaseModel):
    couple_id:     str = Field(max_length=64)
    title:         str
    target_amount: float
    target_date:   str | None = None
    contrib_a:     float = 0
    contrib_b:     float = 0
    owner:         str   = "joint"
    category:      str   = "other"

    @field_validator("target_amount", "contrib_a", "contrib_b")
    @classmethod
    def must_be_non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Amount cannot be negative")
        if v > 1_00_00_00_000:
            raise ValueError("Amount exceeds maximum (₹100 Cr)")
        return round(v, 2)

    @field_validator("title")
    @classmethod
    def sanitize_title(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Title must be at least 2 characters")
        if len(v) > 200:
            raise ValueError("Title too long (max 200 chars)")
        return v

    @field_validator("owner")
    @classmethod
    def valid_owner(cls, v: str) -> str:
        if v not in ("joint", "user_a", "user_b"):
            raise ValueError("owner must be joint | user_a | user_b")
        return v

class CoupleResponsibility(BaseModel):
    couple_id:    str = Field(max_length=64)
    label:        str
    assigned_to:  str
    amount:       float | None = None
    reminder_day: int   | None = None

    @field_validator("label")
    @classmethod
    def validate_label(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Label cannot be empty")
        if len(v) > 200:
            raise ValueError("Label too long")
        return v

    @field_validator("assigned_to")
    @classmethod
    def valid_assigned(cls, v: str) -> str:
        if v not in ("user_a", "user_b", "joint"):
            raise ValueError("assigned_to must be user_a | user_b | joint")
        return v

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError("Amount cannot be negative")
        return v

    @field_validator("reminder_day")
    @classmethod
    def validate_day(cls, v: int | None) -> int | None:
        if v is not None and not (1 <= v <= 28):
            raise ValueError("reminder_day must be 1–28")
        return v


# ── Authentication helpers ────────────────────────────────────────────────────

class Caller:
    def __init__(self, user_id: str | None, is_admin: bool = False):
        self.user_id, self.is_admin = user_id, is_admin


_token_cache: dict[str, tuple[str, float]] = {}
_TOKEN_TTL, _TOKEN_CACHE_MAX = 60.0, 2000


def _server_error(e: Exception, what: str = "request") -> HTTPException:
    """500 without the exception text: Supabase/PostgREST errors name tables, columns and the project URL. Logged instead."""
    log.error("%s failed: %s", what, e)
    return HTTPException(500, "Internal error")


def _admin_ok(key: str | None) -> bool:
    return bool(ADMIN_KEY and key and hmac.compare_digest(key.encode(), ADMIN_KEY.encode()))


async def _verify_token(token: str) -> str:
    """The user id a Supabase access token belongs to (asks Supabase Auth; cached for a minute). Raises 401."""
    if not token or len(token) > 4096:
        raise HTTPException(401, "Missing or invalid session token")
    hit = _token_cache.get(token)
    if hit and hit[1] > time.time():
        return hit[0]
    api_key = SUPABASE_ANON_KEY or SUPABASE_SERVICE_KEY
    if not api_key:
        raise HTTPException(503, "Authentication is not configured")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{SUPABASE_URL}/auth/v1/user",
                                 headers={"Authorization": f"Bearer {token}", "apikey": api_key})
    except httpx.HTTPError:
        raise HTTPException(503, "Authentication service unreachable")
    uid = r.json().get("id") if r.status_code == 200 else None
    if not uid:
        raise HTTPException(401, "Missing or invalid session token")
    if len(_token_cache) >= _TOKEN_CACHE_MAX:
        _token_cache.clear()
    _token_cache[token] = (uid, time.time() + _TOKEN_TTL)
    return uid


async def authenticate(authorization: str | None = Header(None), x_admin_key: str | None = Header(None)) -> Caller:
    if AUTH_MODE == "off":
        return Caller(None, is_admin=True)
    if _admin_ok(x_admin_key):
        return Caller(None, is_admin=True)
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Authorization: Bearer <session token> is required")
    return Caller(await _verify_token(authorization[7:].strip()))


def _own(caller: Caller, user_id: str) -> None:
    """403 unless the caller is `user_id` (or an operator)."""
    if caller.is_admin:
        return
    if not isinstance(user_id, str) or not _UUID_RE.match(user_id) or caller.user_id.lower() != user_id.lower():
        raise HTTPException(403, "Forbidden")


def _valid_push_endpoint(url: str) -> bool:
    try:
        parts = urlsplit(url)
        host = (parts.hostname or "").lower()
        if parts.scheme != "https" or parts.username or parts.password or parts.port not in (None, 443):
            return False
    except ValueError:
        return False
    return any(host == suf or host.endswith("." + suf) for suf in PUSH_HOST_SUFFIXES)


def _is_member(sb, couple_id: str, caller: Caller) -> dict:
    """The active couple_links row `couple_id` if the caller belongs to it; 403/404 otherwise."""
    if not isinstance(couple_id, str) or not _UUID_RE.match(couple_id):
        raise HTTPException(404, "Couple not found")
    r = sb.table("couple_links").select("*").eq("id", couple_id).eq("status", "active").limit(1).execute()
    row = r.data[0] if r.data else None
    if not row:
        raise HTTPException(404, "Couple not found")
    if not caller.is_admin and caller.user_id not in (row["user_a"], row["user_b"]):
        raise HTTPException(403, "Forbidden")
    return row


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/alerts/subscribe")
@limiter.limit("30/minute")
async def subscribe_push(request: Request, sub: PushSubscription, caller: Caller = Depends(authenticate)):
    """Browser registers its push subscription here."""
    _own(caller, sub.user_id)
    if not _valid_push_endpoint(sub.endpoint):
        raise HTTPException(400, "endpoint must be an https URL of a known browser push service")
    try:
        sb = _get_supabase()
        sb.table("push_subscriptions").upsert({
            "user_id":    sub.user_id,
            "endpoint":   sub.endpoint,
            "p256dh":     sub.p256dh,
            "auth_key":   sub.auth_key,
            "user_agent": sub.user_agent,
        }, on_conflict="endpoint").execute()
        return {"ok": True}
    except Exception as e:
        raise _server_error(e)


@app.delete("/alerts/subscribe")
@limiter.limit("20/minute")
async def unsubscribe_push(request: Request, endpoint: str, caller: Caller = Depends(authenticate)):
    """Browser unregisters push subscription (only the caller's own)."""
    try:
        sb = _get_supabase()
        q = sb.table("push_subscriptions").delete().eq("endpoint", endpoint[:1024])
        if not caller.is_admin:
            q = q.eq("user_id", caller.user_id)
        q.execute()
        return {"ok": True}
    except Exception as e:
        raise _server_error(e)


@app.get("/alerts/{user_id}")
@limiter.limit("60/minute")
async def get_alerts(request: Request, user_id: str, limit: int = 30, unread_only: bool = False,
                     caller: Caller = Depends(authenticate)):
    """
    Fetch pending alerts for a user.
    Called by: voice agent (on connect), frontend notification center.
    """
    _own(caller, user_id)
    limit = max(1, min(limit, 100))
    try:
        sb = _get_supabase()
        q  = (sb.table("alerts")
                .select("*")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .limit(limit))
        if unread_only:
            q = q.eq("read", False)
        r = q.execute()
        return {"alerts": r.data or [], "unread_count": sum(
            1 for a in (r.data or []) if not a.get("read")
        )}
    except Exception as e:
        raise _server_error(e)


@app.post("/alerts/{alert_id}/read")
async def mark_read(alert_id: str, caller: Caller = Depends(authenticate)):
    """Mark a single alert as read (only the caller's own)."""
    try:
        sb = _get_supabase()
        q = sb.table("alerts").update({
            "read": True,
            "read_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", alert_id)
        if not caller.is_admin:
            q = q.eq("user_id", caller.user_id)
        q.execute()
        return {"ok": True}
    except Exception as e:
        raise _server_error(e)


@app.post("/alerts/mark-all-read/{user_id}")
async def mark_all_read(user_id: str, caller: Caller = Depends(authenticate)):
    """Mark all alerts for a user as read."""
    _own(caller, user_id)
    try:
        sb = _get_supabase()
        sb.table("alerts").update({
            "read": True,
            "read_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).eq("read", False).execute()
        return {"ok": True}
    except Exception as e:
        raise _server_error(e)


@app.put("/alerts/preferences")
async def update_preferences(pref: AlertPreference, caller: Caller = Depends(authenticate)):
    """User enables/disables a specific alert rule."""
    _own(caller, pref.user_id)
    if pref.rule_id not in RULES_BY_ID:
        raise HTTPException(400, "Unknown rule_id")
    try:
        sb = _get_supabase()
        sb.table("alert_preferences").upsert({
            "user_id":  pref.user_id,
            "rule_id":  pref.rule_id,
            "enabled":  pref.enabled,
            "channels": pref.channels,
        }, on_conflict="user_id,rule_id").execute()
        return {"ok": True}
    except Exception as e:
        raise _server_error(e)


@app.get("/alerts/preferences/{user_id}")
async def get_preferences(user_id: str, caller: Caller = Depends(authenticate)):
    """Get all alert preferences for a user."""
    _own(caller, user_id)
    try:
        sb = _get_supabase()
        r  = (sb.table("alert_preferences")
                .select("*")
                .eq("user_id", user_id)
                .execute())
        # Merge with defaults (all rules enabled by default)
        prefs = {row["rule_id"]: row for row in (r.data or [])}
        result = []
        for rule in ALL_RULES:
            result.append(prefs.get(rule.rule_id, {
                "user_id":  user_id,
                "rule_id":  rule.rule_id,
                "enabled":  True,
                "channels": ["in_app", "push"],
                "_name":    rule.name,
                "_priority":rule.priority,
            }))
        return {"preferences": result}
    except Exception as e:
        raise _server_error(e)


@app.get("/vapid-public-key")
async def get_vapid_public_key():
    """Frontend needs this to subscribe to push notifications."""
    if not VAPID_PUBLIC_KEY:
        raise HTTPException(503, "Push notifications not configured")
    return {"public_key": VAPID_PUBLIC_KEY}


@app.get("/market")
async def get_market():
    """Current market snapshot."""
    return get_market_data()


@app.post("/alerts/run")
@limiter.limit("5/minute")
async def run_manual(request: Request, x_admin_key: str = Header(None)):
    """Manually trigger full alert check. Requires ADMIN_API_KEY header."""
    if not ADMIN_KEY:
        raise HTTPException(403, "Disabled — set ADMIN_API_KEY to enable manual runs")
    if not _admin_ok(x_admin_key):
        raise HTTPException(403, "Forbidden — invalid or missing X-Admin-Key header")
    # Invalidate caches so fresh data is computed
    _health_cache.clear()
    _benchmark_cache.clear()
    asyncio.create_task(check_all_users())
    return {"ok": True, "message": "Alert check triggered (running in background)"}


@app.get("/health-score/{user_id}")
@limiter.limit("20/minute")
async def get_health_score(request: Request, user_id: str, force: bool = False, caller: Caller = Depends(authenticate)):
    """
    Compute (or return cached) Financial Health Score.
    TTL: 5 min. Pass ?force=true to bust cache.
    """
    _own(caller, user_id)
    if not force and user_id in _health_cache:
        _cache_hits.labels(endpoint="health_score").inc()
        return _health_cache[user_id]
    try:
        sb        = _get_supabase()
        user_data = fetch_user_data(sb, user_id)

        # Fetch previous score for trajectory tracking
        prev_score = None
        try:
            r = (sb.table("health_score_history")
                   .select("total,tier")
                   .eq("user_id", user_id)
                   .order("computed_at", desc=True)
                   .limit(1)
                   .execute())
            prev_score = r.data[0] if r.data else None
        except Exception:
            pass

        with _hs_latency.time():
            result = compute_health_score(user_data, previous_score=prev_score)

        # Build prev pillar score map for narratives
        prev_pillar_scores: dict = {}
        try:
            r2 = (sb.table("health_score_history")
                    .select("pillars")
                    .eq("user_id", user_id)
                    .order("computed_at", desc=True)
                    .limit(1)
                    .execute())
            if r2.data and r2.data[0].get("pillars"):
                for pp in r2.data[0]["pillars"]:
                    prev_pillar_scores[pp["name"]] = pp.get("score")
        except Exception:
            pass

        result_dict = result.to_dict(prev_pillar_scores=prev_pillar_scores)

        # Persist score to history (non-blocking)
        try:
            sb.table("health_score_history").insert({
                "user_id":    user_id,
                "total":      result.total,
                "tier":       result.tier,
                "trajectory": result.trajectory,
                "pillars":    [{"name": p.name, "score": p.score, "max_pts": p.max_pts}
                               for p in result.pillars],
            }).execute()
        except Exception as e:
            log.debug("Health score history save failed: %s", e)

        _health_cache[user_id] = result_dict
        return result_dict
    except Exception as e:
        log.error("Health score for %s: %s", user_id[:8], e)
        raise _server_error(e)


@app.get("/health-score/{user_id}/history")
@limiter.limit("20/minute")
async def get_health_score_history(request: Request, user_id: str, days: int = 90, caller: Caller = Depends(authenticate)):
    """
    Returns health score time series for sparkline/trend chart.
    Default: last 90 days. Max: 365 days.
    """
    _own(caller, user_id)
    days = max(1, min(days, 365))
    try:
        sb     = _get_supabase()
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        r = (sb.table("health_score_history")
               .select("total,tier,trajectory,computed_at")
               .eq("user_id", user_id)
               .gte("computed_at", cutoff)
               .order("computed_at", desc=False)
               .execute())
        rows = r.data or []
        # Thin the series to max 60 data points for performance
        if len(rows) > 60:
            step = len(rows) // 60
            rows = rows[::step]
        return {
            "user_id":    user_id,
            "days":       days,
            "data_points": len(rows),
            "series": [
                {
                    "date":       row["computed_at"][:10],
                    "total":      row["total"],
                    "tier":       row["tier"],
                    "trajectory": row.get("trajectory", "stable"),
                }
                for row in rows
            ],
            "latest": rows[-1] if rows else None,
            "oldest": rows[0]  if rows else None,
            "delta":  (rows[-1]["total"] - rows[0]["total"]) if len(rows) >= 2 else 0,
        }
    except Exception as e:
        raise _server_error(e)


@app.get("/health-score/{user_id}/summary")
@limiter.limit("30/minute")
async def get_health_score_summary(request: Request, user_id: str, caller: Caller = Depends(authenticate)):
    """
    Lightweight score summary — just total + tier + top 2 tips.
    Used by the voice agent to inject a 1-line health status into LLM context.
    """
    _own(caller, user_id)
    try:
        sb        = _get_supabase()
        user_data = fetch_user_data(sb, user_id)
        result    = compute_health_score(user_data)

        # Gather top 2 tips (from lowest-scoring pillars)
        sorted_pillars = sorted(result.pillars,
                                key=lambda p: p.score / p.max_pts if p.max_pts else 0)
        top_tips = []
        for p in sorted_pillars:
            for tip in p.tips[:1]:
                top_tips.append(f"{p.emoji} {tip}")
            if len(top_tips) >= 2:
                break

        return {
            "user_id":    user_id,
            "total":      result.total,
            "tier":       result.tier,
            "tier_emoji": result.tier_emoji,
            "headline":   result.headline,
            "top_tips":   top_tips,
            "worst_pillar": sorted_pillars[0].name if sorted_pillars else None,
        }
    except Exception as e:
        raise _server_error(e)


@app.get("/health")
async def health():
    return {
        "status":       "ok",
        "rules_loaded": len(ALL_RULES),
        "market_cached": bool(_market_cache),
        "time":          datetime.now(timezone.utc).isoformat(),
    }


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE 21 — AI FINANCIAL BENCHMARKING
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/benchmark/{user_id}")
@limiter.limit("10/minute")
async def get_benchmark(request: Request, user_id: str, force: bool = False, caller: Caller = Depends(authenticate)):
    """
    Compare user's financial metrics against anonymised peer percentiles.
    Peer segment = (age_bracket, city_tier, income_bracket) — zero PII stored.
    TTL: 5 min. Pass ?force=true to bust cache.
    """
    _own(caller, user_id)
    if not force and user_id in _benchmark_cache:
        _cache_hits.labels(endpoint="benchmark").inc()
        return _benchmark_cache[user_id]
    try:
        sb = _get_supabase()
        _require_plan(sb, user_id, ["smart", "family", "pro"])
        user_data = fetch_user_data(sb, user_id)
        with _bench_latency.time():
            result = benchmark_comparison(user_data)
        _benchmark_cache[user_id] = result
        return result
    except HTTPException:
        raise                       # the 402 "upgrade required" used to be swallowed and turned into a 500
    except Exception as e:
        log.error("Benchmark for %s: %s", user_id[:8], e)
        raise _server_error(e)


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE 22 — COUPLE / FAMILY FINANCE MODE
# ══════════════════════════════════════════════════════════════════════════════

def _gen_invite_code() -> str:
    # secrets, not random: an invite code links two people's finances, so it must not be predictable
    return "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(10))


def _get_user_plan(sb, user_id: str) -> str:
    """Return the user's current plan: 'free' | 'smart' | 'family' | 'pro'."""
    try:
        r = sb.table("profiles").select("plan").eq("id", user_id).single().execute()
        return r.data.get("plan", "free") if r.data else "free"
    except Exception:
        return "free"  # fail open — never block on plan check error


def _require_plan(sb, user_id: str, min_plans: list[str]) -> None:
    """Raise 402 if user's plan is not in the allowed set."""
    plan = _get_user_plan(sb, user_id)
    if plan not in min_plans:
        raise HTTPException(
            status_code=402,
            detail={
                "error":       "upgrade_required",
                "message":     f"This feature requires {min_plans[0]} plan or higher.",
                "current_plan": plan,
                "upgrade_url":  "/html/settings.html#upgrade",
                "plans":        min_plans,
            },
        )


def _get_couple(sb, user_id: str, status: str = "active") -> dict | None:
    """Return a couple_links row for a user by status, or None."""
    # user_id is placed inside a PostgREST "or=(...)" filter string, where a comma or parenthesis changes the filter itself:
    # only a plain UUID is allowed through.
    if not isinstance(user_id, str) or not _UUID_RE.match(user_id):
        return None
    try:
        r = (sb.table("couple_links")
               .select("*")
               .or_(f"user_a.eq.{user_id},user_b.eq.{user_id}")
               .eq("status", status)
               .limit(1)
               .execute())
        return r.data[0] if r.data else None
    except Exception:
        return None


@app.post("/couple/invite")
async def couple_invite(req: CoupleLinkRequest, caller: Caller = Depends(authenticate)):
    """
    Inviter creates an invite code.  Share this code with partner to link.
    """
    _own(caller, req.user_id)
    try:
        sb = _get_supabase()
        # B5 fix: check for existing active link
        existing_active = _get_couple(sb, req.user_id, "active")
        if existing_active:
            return {"ok": True, "invite_code": None,
                    "message": "Already linked with a partner",
                    "couple_id": existing_active["id"]}

        # B6 fix: reuse an existing pending invite instead of creating duplicates
        existing_pending = _get_couple(sb, req.user_id, "pending")
        if existing_pending:
            return {"ok": True, "invite_code": existing_pending["invite_code"],
                    "couple_id": existing_pending["id"],
                    "message": "Share this code with your partner to link accounts"}

        code = _gen_invite_code()
        r = sb.table("couple_links").insert({
            "user_a":      req.user_id,
            "user_b":      _ZERO_UUID,  # placeholder until accepted
            "status":      "pending",
            "invite_code": code,
        }).execute()
        couple_id = r.data[0]["id"] if r.data else None
        return {"ok": True, "invite_code": code, "couple_id": couple_id,
                "message": "Share this code with your partner to link accounts"}
    except Exception as e:
        raise _server_error(e)


@app.post("/couple/accept")
@limiter.limit("10/minute")
async def couple_accept(request: Request, req: CoupleLinkAccept, caller: Caller = Depends(authenticate)):
    """Partner accepts invite by entering the invite code (rate-limited: the code is the only thing protecting the link)."""
    _own(caller, req.user_id)
    try:
        sb = _get_supabase()
        r  = (sb.table("couple_links")
                .select("*")
                .eq("invite_code", req.invite_code)
                .eq("status", "pending")
                .limit(1)
                .execute())
        if not r.data:
            raise HTTPException(404, "Invalid or expired invite code")

        link = r.data[0]
        if link["user_a"] == req.user_id:
            raise HTTPException(400, "Cannot accept your own invite")

        # B5 fix: reject if acceptor already has an active couple link
        existing = _get_couple(sb, req.user_id, "active")
        if existing:
            raise HTTPException(400, "You already have an active couple link. Dissolve it first.")

        sb.table("couple_links").update({
            "user_b":      req.user_id,
            "status":      "active",
            "accepted_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", link["id"]).execute()

        return {"ok": True, "couple_id": link["id"],
                "message": "Accounts linked! You can now view your joint financial OS."}
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e)


@app.get("/couple/overview/{user_id}")
async def couple_overview(user_id: str, caller: Caller = Depends(authenticate)):
    """
    Combined financial overview for both partners.
    Returns merged income/savings, joint goals, responsibilities, and
    spending conflict signals.
    """
    _own(caller, user_id)
    try:
        sb = _get_supabase()
        _require_plan(sb, user_id, ["family", "pro"])
        couple = _get_couple(sb, user_id)
        if not couple:
            raise HTTPException(404, "No active couple link found")

        couple_id = couple["id"]
        user_a    = couple["user_a"]
        user_b    = couple["user_b"]

        # Fetch both users' financial data
        data_a = fetch_user_data(sb, user_a)
        data_b = fetch_user_data(sb, user_b)

        # B3 fix: use shared helpers so profile income fallback is included
        inc_a = _monthly_income(data_a["transactions"], data_a["profile"])
        inc_b = _monthly_income(data_b["transactions"], data_b["profile"])
        exp_a = _monthly_expenses(data_a["transactions"])
        exp_b = _monthly_expenses(data_b["transactions"])

        # ── Spending category breakdown for conflict detection ─────────────
        def _cat_spend(txns):
            cats: dict[str, float] = {}
            txns, months = _monthly_window(txns)
            for t in txns:
                if str(t.get("type", "")).lower() not in ("expense", "debit"):
                    continue
                cat = str(t.get("category") or "Other").title()
                cats[cat] = cats.get(cat, 0) + abs(_n(t.get("amount")))
            return {k: round(v / months, 0) for k, v in cats.items()} if months else {}

        cats_a = _cat_spend(data_a["transactions"])
        cats_b = _cat_spend(data_b["transactions"])

        # Conflict: category where combined spend > 15% of joint income
        joint_inc = inc_a + inc_b
        conflicts = []
        all_cats = set(cats_a) | set(cats_b)
        for cat in all_cats:
            combined = cats_a.get(cat, 0) + cats_b.get(cat, 0)
            pct = (combined / joint_inc * 100) if joint_inc else 0
            if pct > 15:
                conflicts.append({
                    "category": cat,
                    "combined_spend": combined,
                    "pct_of_income": round(pct, 1),
                    "arya_message": (
                        f"⚠️ {cat} spending ₹{combined:,.0f}/mo hai — joint income ka "
                        f"{pct:.0f}%. Budget se discuss karo?"
                    ),
                })

        # ── Joint goals ────────────────────────────────────────────────────
        goals_r = (sb.table("couple_goals")
                     .select("*")
                     .eq("couple_id", couple_id)
                     .order("created_at", desc=True)
                     .execute())
        joint_goals = goals_r.data or []

        # ── Responsibilities ───────────────────────────────────────────────
        resp_r = (sb.table("couple_responsibilities")
                    .select("*")
                    .eq("couple_id", couple_id)
                    .execute())
        responsibilities = resp_r.data or []

        # ── Arya message ───────────────────────────────────────────────────
        savings_rate = ((joint_inc - exp_a - exp_b) / joint_inc) if joint_inc else 0
        # B4 fix: handle negative savings_rate explicitly
        if savings_rate < 0:
            deficit = abs(joint_inc - exp_a - exp_b)
            arya = (f"🚨 Dono mila ke ₹{deficit:,.0f}/mo zyada kharch kar rahe ho than income — "
                    f"immediately expenses cut karo!")
        elif savings_rate > 0.30:
            arya = f"Dono mila ke {savings_rate:.0%} save kar rahe ho — top 20% couples mein ho! 🎉"
        elif savings_rate > 0.15:
            arya = f"Joint savings rate {savings_rate:.0%} — decent hai, par thoda aur push karo."
        else:
            arya = f"⚠️ Joint savings rate sirf {savings_rate:.0%} — expenses zyada hain. Conflicts dekho neeche."

        return {
            "couple_id":   couple_id,
            "partner_a":   {"user_id": user_a, "monthly_income": round(inc_a),
                            "monthly_expense": round(exp_a)},
            "partner_b":   {"user_id": user_b, "monthly_income": round(inc_b),
                            "monthly_expense": round(exp_b)},
            "joint": {
                "monthly_income":  round(joint_inc),
                "monthly_expense": round(exp_a + exp_b),
                "monthly_savings": round(joint_inc - exp_a - exp_b),
                "savings_rate":    round(savings_rate * 100, 1),
            },
            "spending_conflicts": conflicts,
            "joint_goals":        joint_goals,
            "responsibilities":   responsibilities,
            "arya_message":       arya,
            "computed_at":        datetime.now(timezone.utc).isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        log.error("Couple overview for %s: %s", user_id[:8], e)
        raise _server_error(e)


@app.post("/couple/goal")
async def add_couple_goal(goal: CoupleGoal, caller: Caller = Depends(authenticate)):
    """Create a shared financial goal for a linked couple (the caller must be one of the two partners)."""
    try:
        sb = _get_supabase()
        _is_member(sb, goal.couple_id, caller)
        r  = sb.table("couple_goals").insert({
            "couple_id":      goal.couple_id,
            "title":          goal.title,
            "target_amount":  goal.target_amount,
            "current_amount": 0,
            "target_date":    goal.target_date,
            "contrib_a":      goal.contrib_a,
            "contrib_b":      goal.contrib_b,
            "owner":          goal.owner,
            "category":       goal.category,
        }).execute()
        return {"ok": True, "goal": r.data[0] if r.data else None}
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e)


@app.put("/couple/goal/{goal_id}/contribute")
async def update_goal_contribution(goal_id: str, amount: float, caller: Caller = Depends(authenticate)):
    """Add money towards a joint goal (the caller must be one of the two partners)."""
    if not (0 < amount <= 1_00_00_00_000):          # also rejects NaN
        raise HTTPException(400, "amount must be greater than 0 and at most ₹100 Cr")
    if not _UUID_RE.match(goal_id or ""):
        raise HTTPException(404, "Goal not found")
    try:
        sb = _get_supabase()
        r  = sb.table("couple_goals").select("current_amount,couple_id").eq("id", goal_id).single().execute()
        if not r.data:
            raise HTTPException(404, "Goal not found")
        _is_member(sb, r.data["couple_id"], caller)
        new_amount = _n(r.data["current_amount"]) + amount
        sb.table("couple_goals").update({
            "current_amount": new_amount,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", goal_id).execute()
        return {"ok": True, "new_amount": new_amount}
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e)


@app.post("/couple/responsibility")
async def add_responsibility(resp: CoupleResponsibility, caller: Caller = Depends(authenticate)):
    """Assign a financial responsibility (e.g. EMI, SIP) to a partner (the caller must be one of the two)."""
    try:
        sb = _get_supabase()
        _is_member(sb, resp.couple_id, caller)
        r  = sb.table("couple_responsibilities").insert({
            "couple_id":    resp.couple_id,
            "label":        resp.label,
            "assigned_to":  resp.assigned_to,
            "amount":       resp.amount,
            "reminder_day": resp.reminder_day,
        }).execute()
        return {"ok": True, "responsibility": r.data[0] if r.data else None}
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e)


@app.delete("/couple/dissolve/{user_id}")
async def dissolve_couple(user_id: str, caller: Caller = Depends(authenticate)):
    """Unlink a couple (requires confirmation from client side)."""
    _own(caller, user_id)
    try:
        sb = _get_supabase()
        couple = _get_couple(sb, user_id)
        if not couple:
            raise HTTPException(404, "No active couple link")
        sb.table("couple_links").update({"status": "dissolved"}).eq("id", couple["id"]).execute()
        return {"ok": True, "message": "Couple link dissolved"}
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e)


# ── Startup: launch scheduler ─────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    # ── Key validation ────────────────────────────────────────────────────────
    key = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
    if not key:
        log.critical("SUPABASE_SERVICE_KEY not set — alert engine will fail on DB calls")
    elif not SUPABASE_SERVICE_KEY:
        log.warning("Running with ANON key — alert engine has limited DB access. "
                    "Set SUPABASE_SERVICE_KEY for full functionality.")

    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        log.warning(
            "⚠️  VAPID keys not configured — push notifications disabled.\n"
            "Generate with: python -c \"from py_vapid import Vapid; v=Vapid(); "
            "v.generate_keys(); print('PRIVATE:', v.private_key, '\\nPUBLIC:', v.public_key)\""
        )

    if not ADMIN_KEY:
        log.warning("ADMIN_API_KEY not set — /alerts/run is disabled. Set ADMIN_API_KEY in .env to enable it.")
    if AUTH_MODE == "off":
        log.critical("ALERTS_AUTH=off — NO AUTHENTICATION: any caller can read and change any user's alerts, health score and "
                     "couple data using the service-role key. Local development only.")

    # ── Scheduler ─────────────────────────────────────────────────────────────
    scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")
    scheduler.add_job(check_all_users,     "interval", minutes=15,
                      id="alert_check",    replace_existing=True)
    scheduler.add_job(refresh_market_data, "interval", minutes=60,
                      id="market_refresh", replace_existing=True)
    scheduler.add_job(morning_brief_job,   "cron", hour=8, minute=30,
                      id="morning_brief",  replace_existing=True)
    scheduler.start()

    log.info("FIN-OS Alert Engine v2 started — %d rules loaded | Metrics: /metrics | Cache: TTL=5min",
             len(ALL_RULES))
    log.info("Endpoints: http://%s:%d", HOST, PORT)
    asyncio.create_task(check_all_users())


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("alert-engine:app", host=HOST, port=PORT,
                reload=False, log_level="info")
