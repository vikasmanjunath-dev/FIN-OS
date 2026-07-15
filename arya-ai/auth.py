"""
Session token verification against Supabase Auth — required for /api/portfolio/summary,
since that endpoint reads real holdings data and arya-ai had no auth mechanism at all
before this (every other endpoint here is public market data, namespace-free).

Same verified pattern as rag-engine/storage/auth.py: calls Supabase's own
GET /auth/v1/user REST endpoint rather than decoding the JWT locally — needs
only the anon key, not the JWT signing secret.
"""
from __future__ import annotations
import time

import httpx

from config import SUPABASE_URL, SUPABASE_ANON_KEY

_TIMEOUT = httpx.Timeout(5.0)

_cache: dict[str, tuple[str, float]] = {}  # token -> (verified_user_id, expires_at)
_CACHE_TTL = 60.0


class AuthError(Exception):
    pass


def verify_session_token(token: str) -> str:
    """Returns the verified user_id for a valid access token, or raises AuthError."""
    if not token:
        raise AuthError("missing bearer token")

    cached = _cache.get(token)
    if cached and cached[1] > time.time():
        return cached[0]

    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise AuthError("Supabase not configured — set SUPABASE_URL/SUPABASE_ANON_KEY in arya-ai/.env")

    try:
        resp = httpx.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": SUPABASE_ANON_KEY},
            timeout=_TIMEOUT,
        )
    except httpx.HTTPError as e:
        raise AuthError(f"Supabase Auth unreachable: {e}")

    if resp.status_code != 200:
        raise AuthError(f"invalid or expired session token (Supabase returned {resp.status_code})")

    user_id = resp.json().get("id")
    if not user_id:
        raise AuthError("Supabase Auth response missing user id")

    _cache[token] = (user_id, time.time() + _CACHE_TTL)
    return user_id


def verify_user_matches(token: str | None, claimed_user_id: str) -> None:
    """Raises AuthError unless the token verifies to exactly claimed_user_id.
    Portfolio data has no public namespace — unlike rag-engine's auth, there is
    no "claimed_user_id is None" escape hatch here."""
    verified_user_id = verify_session_token(token or "")
    if verified_user_id != claimed_user_id:
        raise AuthError(f"user_id mismatch: token belongs to {verified_user_id}, request claimed {claimed_user_id}")
