"""
Redis query cache — see docs/RAG_PIPELINE.md Layer 4 Tier 4.
Key includes a kb_version counter so cached answers are invalidated when
the knowledge base is re-indexed, without needing to scan/expire entries manually.
"""
from __future__ import annotations
import hashlib
import json

import redis

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config

_TTL_SECONDS = 3600
_KB_VERSION_KEY = "rag:kb_version"

_client: redis.Redis | None = None


def get_client() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis(host=config.REDIS_HOST, port=config.REDIS_PORT, decode_responses=True)
    return _client


def _kb_version() -> str:
    return get_client().get(_KB_VERSION_KEY) or "0"


def bump_kb_version() -> None:
    """Call after any re-ingestion so stale cached answers are never served."""
    get_client().incr(_KB_VERSION_KEY)


def _cache_key(query: str, namespace_user_id: str | None, filters: dict | None) -> str:
    raw = json.dumps(
        {"q": query, "user": namespace_user_id, "filters": filters or {}, "kb_version": _kb_version()},
        sort_keys=True,
    )
    return "rag:query:" + hashlib.sha256(raw.encode()).hexdigest()


def get_cached(query: str, user_id: str | None, filters: dict | None = None) -> dict | None:
    raw = get_client().get(_cache_key(query, user_id, filters))
    return json.loads(raw) if raw else None


def set_cached(query: str, user_id: str | None, result: dict, filters: dict | None = None) -> None:
    get_client().set(_cache_key(query, user_id, filters), json.dumps(result), ex=_TTL_SECONDS)
