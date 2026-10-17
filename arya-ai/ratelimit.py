"""
Arya AI - small in-process rate limiter for the routes that cost something (LLM, TTS, outbound fetches, report files).

Sliding window per (group, client). In-memory, so it is per worker process: with `uvicorn --workers 2` a client can use
2x the stated rate. The nginx gateway (nginx-gateway.conf) applies its own per-IP limit in front; this is the second layer
for deployments that expose port 7475 directly (the phone app does that on a LAN).

Client identity: the socket peer address. Behind a reverse proxy every request has the proxy's address, so set
ARYA_TRUST_PROXY=1 only when the service is reachable ONLY through a proxy that overwrites X-Real-IP (the bundled nginx does).
Never set it when the port is reachable directly: the header would then be caller-controlled and the limit meaningless.

Tune with ARYA_RATE_LIMITS="chat=10/60,tts=20/60"  (requests / seconds) or switch off with ARYA_RATE_LIMITS=off.
"""
from __future__ import annotations

import os
import threading
import time
from collections import deque

from fastapi import HTTPException, Request

# group -> (max requests, per seconds)
DEFAULT_LIMITS: dict[str, tuple[int, int]] = {
    "chat":      (10, 60),     # one request streams from the local LLM for up to two minutes
    "tts":       (20, 60),     # calls Microsoft's neural TTS service
    "fetch":     (20, 60),     # /api/read, /api/search: outbound requests to arbitrary / public sites
    "report":    (10, 60),     # writes a file and renders HTML/PDF
    "portfolio": (30, 60),     # verifies a token with Supabase and prices every holding
    "tool":      (120, 60),    # the generic tool gateway
    "global":    (600, 60),    # everything else, per client
}
MAX_KEYS = 20000


def parse_limits(spec: str | None) -> dict[str, tuple[int, int]] | None:
    """'chat=5/30,tts=10/60' -> overrides on top of the defaults. 'off' -> None (limiter disabled)."""
    limits = dict(DEFAULT_LIMITS)
    spec = (spec or "").strip()
    if spec.lower() == "off":
        return None
    for part in filter(None, (p.strip() for p in spec.split(","))):
        try:
            name, rate = part.split("=", 1)
            count, secs = rate.split("/", 1)
            n, s = int(count), int(secs)
            if n > 0 and s > 0:
                limits[name.strip()] = (n, s)
        except ValueError:
            continue                # a malformed entry keeps the default rather than disabling protection
    return limits


class RateLimiter:
    def __init__(self, limits: dict[str, tuple[int, int]] | None):
        self.limits = limits
        self._hits: dict[tuple[str, str], deque] = {}
        self._lock = threading.Lock()

    def check(self, group: str, client: str, now: float | None = None) -> float:
        """0 if the request may proceed (and is recorded); otherwise the seconds to wait."""
        if self.limits is None:
            return 0.0
        count, secs = self.limits.get(group) or self.limits["global"]
        now = time.monotonic() if now is None else now
        key = (group, client)
        with self._lock:
            if len(self._hits) > MAX_KEYS:
                self._prune(now)
            q = self._hits.setdefault(key, deque())
            while q and now - q[0] >= secs:
                q.popleft()
            if len(q) >= count:
                return max(1.0, secs - (now - q[0]))
            q.append(now)
            return 0.0

    def _prune(self, now: float) -> None:
        longest = max((s for _, s in (self.limits or {}).values()), default=60)
        for k in [k for k, q in self._hits.items() if not q or now - q[-1] >= longest]:
            del self._hits[k]
        if len(self._hits) > MAX_KEYS:           # still too many live keys: drop the oldest half rather than grow without bound
            for k, _ in sorted(self._hits.items(), key=lambda kv: kv[1][-1])[: len(self._hits) // 2]:
                del self._hits[k]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = RateLimiter(parse_limits(os.getenv("ARYA_RATE_LIMITS")))
TRUST_PROXY = os.getenv("ARYA_TRUST_PROXY", "").strip() in ("1", "true", "yes")


def client_id(request) -> str:
    """Identity used for limits. `request` is a Starlette Request or WebSocket."""
    if TRUST_PROXY:
        real = request.headers.get("x-real-ip")
        if real:
            return real.strip()[:64]
    peer = request.client
    return peer.host if peer else "unknown"


def limit(group: str):
    """FastAPI dependency: `dependencies=[Depends(limit("chat"))]`."""
    def dep(request: Request) -> None:
        wait = limiter.check(group, client_id(request))
        if wait:
            raise HTTPException(status_code=429, detail="Too many requests - slow down", headers={"Retry-After": str(int(wait + 0.999))})
    return dep


def enforce(group: str, request) -> None:
    """Same check, callable from inside a handler (the tool gateway picks the group from the tool name)."""
    wait = limiter.check(group, client_id(request))
    if wait:
        raise HTTPException(status_code=429, detail="Too many requests - slow down", headers={"Retry-After": str(int(wait + 0.999))})
