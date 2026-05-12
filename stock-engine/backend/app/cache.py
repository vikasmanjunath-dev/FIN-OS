"""
Lightweight async cache. Backed by Redis if REDIS_URL is set, otherwise an
in-process TTL dict. Same interface either way so callers don't care.
"""
from __future__ import annotations

import asyncio
import os
import time
from typing import Any, Optional


class _MemoryCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[float, Any]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Optional[Any]:
        async with self._lock:
            item = self._store.get(key)
            if not item:
                return None
            expires, value = item
            if expires and expires < time.time():
                self._store.pop(key, None)
                return None
            return value

    async def set(self, key: str, value: Any, ttl: int = 30) -> None:
        async with self._lock:
            expires = time.time() + ttl if ttl else 0
            self._store[key] = (expires, value)


class _RedisCache:
    def __init__(self, url: str) -> None:
        import redis.asyncio as aioredis  # type: ignore
        self._r = aioredis.from_url(url, decode_responses=True)

    async def get(self, key: str) -> Optional[Any]:
        import json
        raw = await self._r.get(key)
        return json.loads(raw) if raw else None

    async def set(self, key: str, value: Any, ttl: int = 30) -> None:
        import json
        await self._r.set(key, json.dumps(value, default=str), ex=ttl or None)


def _build():
    url = os.getenv("REDIS_URL")
    if url:
        try:
            return _RedisCache(url)
        except Exception:
            pass
    return _MemoryCache()


cache = _build()
