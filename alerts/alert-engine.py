"""
FIN-OS Alert Engine  v1
──────────────────────────────────────────────────────────────────────────────
Proactive financial intelligence — watches every user's money 24/7.

Run:
  python alert-engine.py

Ports:
  HTTP API: 8001   (browser calls /alerts/subscribe, /alerts/{uid})
  WS voice agent is on 8765 — separate process

Dependencies (install via requirements.txt):
  fastapi uvicorn apscheduler supabase pywebpush yfinance python-dotenv httpx
"""

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import yfinance as yf
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pywebpush import webpush, WebPushException
from supabase import create_client, Client
from pydantic import BaseModel

from rules import ALL_RULES, RULES_BY_ID
from health_score import compute_health_score

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

HOST = "0.0.0.0"
PORT = 8001

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

def get_market_data() -> dict:
    """Fetch Nifty 50 and Sensex data with caching."""
    global _market_cache, _market_updated_at

    if time.time() - _market_updated_at < _MARKET_CACHE_TTL and _market_cache:
        return _market_cache

    try:
        ticker = yf.Ticker("^NSEI")
        hist   = ticker.history(period="5d")

        if len(hist) >= 2:
            today_close = float(hist["Close"].iloc[-1])
            prev_close  = float(hist["Close"].iloc[-2])
            change_pct  = ((today_close - prev_close) / prev_close) * 100

            _market_cache = {
                "nifty_value":      round(today_close, 2),
                "nifty_prev":       round(prev_close, 2),
                "nifty_change_pct": round(change_pct, 2),
                "nifty_change_abs": round(today_close - prev_close, 2),
                "updated_at":       datetime.now(timezone.utc).isoformat(),
            }
        else:
            _market_cache = {"nifty_value": 0, "nifty_change_pct": 0}

        _market_updated_at = time.time()
        log.info("Market data refreshed: Nifty %.0f (%.2f%%)",
                 _market_cache.get("nifty_value", 0),
                 _market_cache.get("nifty_change_pct", 0))

    except Exception as e:
        log.warning("Market data fetch failed: %s", e)
        _market_cache = {"nifty_value": 0, "nifty_change_pct": 0}

    return _market_cache


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
        # Transactions (last 60 days)
        cutoff = (datetime.now() - timedelta(days=60)).date().isoformat()
        r = (sb.table("transactions")
               .select("*")
               .eq("user_id", user_id)
               .gte("date", cutoff)
               .order("date", desc=True)
               .limit(100)
               .execute())
        result["transactions"] = r.data or []

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
    Main scheduled job — runs every 15 minutes.
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


# ══════════════════════════════════════════════════════════════════════════════
# FASTAPI APP
# ══════════════════════════════════════════════════════════════════════════════
app = FastAPI(title="FIN-OS Alert Engine", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # restrict to your domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ───────────────────────────────────────────────────────────
class PushSubscription(BaseModel):
    user_id:    str
    endpoint:   str
    p256dh:     str
    auth_key:   str
    user_agent: str = ""


class AlertPreference(BaseModel):
    user_id:  str
    rule_id:  str
    enabled:  bool = True
    channels: list[str] = ["in_app", "push"]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/alerts/subscribe")
async def subscribe_push(sub: PushSubscription):
    """Browser registers its push subscription here."""
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
        raise HTTPException(500, str(e))


@app.delete("/alerts/subscribe")
async def unsubscribe_push(endpoint: str):
    """Browser unregisters push subscription."""
    try:
        sb = _get_supabase()
        sb.table("push_subscriptions").delete().eq("endpoint", endpoint).execute()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/alerts/{user_id}")
async def get_alerts(user_id: str, limit: int = 30, unread_only: bool = False):
    """
    Fetch pending alerts for a user.
    Called by: voice agent (on connect), frontend notification center.
    """
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
        raise HTTPException(500, str(e))


@app.post("/alerts/{alert_id}/read")
async def mark_read(alert_id: str):
    """Mark a single alert as read."""
    try:
        sb = _get_supabase()
        sb.table("alerts").update({
            "read": True,
            "read_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", alert_id).execute()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/alerts/mark-all-read/{user_id}")
async def mark_all_read(user_id: str):
    """Mark all alerts for a user as read."""
    try:
        sb = _get_supabase()
        sb.table("alerts").update({
            "read": True,
            "read_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).eq("read", False).execute()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.put("/alerts/preferences")
async def update_preferences(pref: AlertPreference):
    """User enables/disables a specific alert rule."""
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
        raise HTTPException(500, str(e))


@app.get("/alerts/preferences/{user_id}")
async def get_preferences(user_id: str):
    """Get all alert preferences for a user."""
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
        raise HTTPException(500, str(e))


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
async def run_manual(request: Request):
    """
    Manually trigger full alert check (admin/dev endpoint).
    Protect this in production!
    """
    asyncio.create_task(check_all_users())
    return {"ok": True, "message": "Alert check triggered (running in background)"}


@app.get("/health-score/{user_id}")
async def get_health_score(user_id: str):
    """
    Compute (or return cached) Financial Health Score for a user.
    Called by: dashboard widget, voice agent via finos-context.js.
    Response time: ~200-500ms (Supabase fetch + score compute).
    """
    try:
        sb        = _get_supabase()
        user_data = fetch_user_data(sb, user_id)
        result    = compute_health_score(user_data)
        return result.to_dict()
    except Exception as e:
        log.error("Health score for %s: %s", user_id[:8], e)
        raise HTTPException(500, str(e))


@app.get("/health-score/{user_id}/summary")
async def get_health_score_summary(user_id: str):
    """
    Lightweight score summary — just total + tier + top 2 tips.
    Used by the voice agent to inject a 1-line health status into LLM context.
    """
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
        raise HTTPException(500, str(e))


@app.get("/health")
async def health():
    return {
        "status":       "ok",
        "rules_loaded": len(ALL_RULES),
        "market_cached": bool(_market_cache),
        "time":          datetime.now(timezone.utc).isoformat(),
    }


# ── Startup: launch scheduler ─────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")

    # Main alert check — every 15 minutes
    scheduler.add_job(check_all_users,      "interval", minutes=15,
                      id="alert_check", replace_existing=True)

    # Market data refresh — every 60 minutes during market hours (9:15 AM - 3:30 PM IST)
    scheduler.add_job(refresh_market_data,  "interval", minutes=60,
                      id="market_refresh", replace_existing=True)

    scheduler.start()
    log.info("FIN-OS Alert Engine started — %d rules loaded", len(ALL_RULES))
    log.info("Endpoints: http://%s:%d", HOST, PORT)

    # Run first check immediately on startup
    asyncio.create_task(check_all_users())


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("alert-engine:app", host=HOST, port=PORT,
                reload=False, log_level="info")
