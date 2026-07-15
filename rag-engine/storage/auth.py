"""
Session token verification against Supabase Auth — closes the auth gap flagged
in docs/RAG_API.md and docs/RAG_SECURITY.md §4.

Verifies via Supabase's own Auth REST endpoint (GET /auth/v1/user) rather than
decoding the JWT locally — this needs only the anon key (already public, see
js/supabase-config.js) and avoids requiring the separate JWT signing secret.
"""
from __future__ import annotations
import time

import httpx

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config

_TIMEOUT = httpx.Timeout(5.0)

# Tiny in-process cache so a burst of requests from the same session doesn't
# hit Supabase Auth on every call. Not a security boundary — just latency relief.
_cache: dict[str, tuple[str, float]] = {}  # token -> (verified_user_id, expires_at)
_CACHE_TTL = 60.0


class AuthError(Exception):
    pass


def verify_session_token(token: str) -> str:
    """
    Returns the verified user_id (Supabase auth.users.id) for a valid access token.
    Raises AuthError if the token is missing, malformed, expired, or revoked.
    """
    if not token:
        raise AuthError("missing bearer token")

    cached = _cache.get(token)
    if cached and cached[1] > time.time():
        return cached[0]

    if not config.SUPABASE_URL or not config.SUPABASE_ANON_KEY:
        raise AuthError("Supabase not configured (rag-engine/.env missing SUPABASE_URL/SUPABASE_ANON_KEY)")

    try:
        resp = httpx.get(
            f"{config.SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": config.SUPABASE_ANON_KEY,
            },
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


def verify_user_matches(token: str | None, claimed_user_id: str | None) -> None:
    """
    Raises AuthError unless claimed_user_id is None (public-only query) or
    matches the user_id verified from the token. This is the actual security
    check — see docs/RAG_SECURITY.md §2 for why this must hold before any
    namespace filter is applied.
    """
    if claimed_user_id is None:
        return  # public-only query, no private namespace requested
    verified_user_id = verify_session_token(token or "")
    if verified_user_id != claimed_user_id:
        raise AuthError(
            f"user_id mismatch: token belongs to {verified_user_id}, request claimed {claimed_user_id}"
        )
