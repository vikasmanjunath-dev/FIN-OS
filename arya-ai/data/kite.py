"""
Zerodha Kite Connect API client — Phase 19.

Handles OAuth token exchange + proxied data fetches (holdings, positions,
orders, margins) on behalf of the FIN-OS frontend.

Credentials are loaded from .env:
    KITE_API_KEY     — your Kite Connect app key
    KITE_API_SECRET  — your Kite Connect app secret

All user state (access_token) is supplied per-request via the
X-Kite-Token header from the browser; we never persist it server-side.
"""
from __future__ import annotations
import hashlib
import os
from typing import Any

import httpx

# ── Config ────────────────────────────────────────────────────────────────────
KITE_API_KEY    = os.getenv("KITE_API_KEY",    "")
KITE_API_SECRET = os.getenv("KITE_API_SECRET", "")

KITE_LOGIN_URL   = "https://kite.zerodha.com/connect/login?v=3&api_key={api_key}"
KITE_API_BASE    = "https://api.kite.trade"
KITE_SESSION_URL = f"{KITE_API_BASE}/session/token"

_TIMEOUT = httpx.Timeout(10.0)
_KITE_VERSION = "3"


def _auth_header(access_token: str) -> dict[str, str]:
    return {
        "Authorization": f"token {KITE_API_KEY}:{access_token}",
        "X-Kite-Version": _KITE_VERSION,
    }


def _checksum(request_token: str) -> str:
    """SHA-256 of api_key + request_token + api_secret as required by Kite."""
    raw = f"{KITE_API_KEY}{request_token}{KITE_API_SECRET}"
    return hashlib.sha256(raw.encode()).hexdigest()


# ── OAuth ─────────────────────────────────────────────────────────────────────
def get_login_url() -> str:
    """Returns the Zerodha Kite Connect login URL."""
    return KITE_LOGIN_URL.format(api_key=KITE_API_KEY)


def exchange_token(request_token: str) -> dict[str, Any]:
    """
    Exchange the one-time request_token from the OAuth redirect for a
    permanent-for-the-day access_token.

    Returns the Kite API response dict on success; raises on error.
    """
    resp = httpx.post(
        KITE_SESSION_URL,
        data={
            "api_key":       KITE_API_KEY,
            "request_token": request_token,
            "checksum":      _checksum(request_token),
        },
        headers={"X-Kite-Version": _KITE_VERSION},
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    if data.get("status") != "success":
        raise ValueError(data.get("message", "Token exchange failed"))
    return data["data"]


# ── Portfolio ─────────────────────────────────────────────────────────────────
def get_holdings(access_token: str) -> list[dict]:
    """
    Returns the user's Demat holdings — stocks bought and held overnight.
    Excludes intraday (positions) and ETFs held in Demat.
    """
    resp = httpx.get(
        f"{KITE_API_BASE}/portfolio/holdings",
        headers=_auth_header(access_token),
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    if data.get("status") != "success":
        raise ValueError(data.get("message", "Holdings fetch failed"))
    return data.get("data", [])


def get_positions(access_token: str) -> dict:
    """
    Returns today's intraday and carry-over positions.
    Response has two keys: 'net' (net positions) and 'day' (intraday).
    """
    resp = httpx.get(
        f"{KITE_API_BASE}/portfolio/positions",
        headers=_auth_header(access_token),
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    if data.get("status") != "success":
        raise ValueError(data.get("message", "Positions fetch failed"))
    return data.get("data", {"net": [], "day": []})


def get_orders(access_token: str) -> list[dict]:
    """Returns all orders placed today."""
    resp = httpx.get(
        f"{KITE_API_BASE}/orders",
        headers=_auth_header(access_token),
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    if data.get("status") != "success":
        raise ValueError(data.get("message", "Orders fetch failed"))
    return data.get("data", [])


def get_margins(access_token: str) -> dict:
    """Returns available fund margins (equity and commodity segments)."""
    resp = httpx.get(
        f"{KITE_API_BASE}/user/margins",
        headers=_auth_header(access_token),
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    if data.get("status") != "success":
        raise ValueError(data.get("message", "Margins fetch failed"))
    return data.get("data", {})


# ── Credentials check ─────────────────────────────────────────────────────────
def credentials_configured() -> bool:
    return bool(KITE_API_KEY and KITE_API_SECRET)
