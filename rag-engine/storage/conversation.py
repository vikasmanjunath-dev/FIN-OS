"""
Redis-based conversation memory for multi-turn RAG — Phase 7 (July 2026).

Each session is stored as a JSON list under key `rag:conv:{session_id}`.
TTL is 2 hours (resets on every new turn, so active conversations don't expire).

Design decisions:
  - session_id is caller-supplied (UUID from the frontend). The server never
    generates one; callers that omit it get single-turn behaviour, unchanged.
  - Only user+assistant turns are stored (not retrieved chunks — those are
    ephemeral per turn and not useful in future turns).
  - Capped at MAX_TURNS pairs to bound Redis memory usage.
  - Each turn stores role + content only — no timestamps, no metadata.
    Timestamps would be useful for "what did you say earlier?" but add
    serialization cost and aren't yet needed.
"""
from __future__ import annotations
import json
import uuid

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config
from storage.redis_cache import get_client

_KEY_PREFIX = "rag:conv:"
_TTL_SECONDS = 7200   # 2 hours, reset on every new turn
MAX_TURNS = 10        # keep the last 10 pairs (20 messages); older ones are dropped


def _key(session_id: str) -> str:
    return f"{_KEY_PREFIX}{session_id}"


def new_session_id() -> str:
    return str(uuid.uuid4())


def get_history(session_id: str) -> list[dict]:
    """Return [{role, content}, ...] for the session, most recent last."""
    raw = get_client().get(_key(session_id))
    if not raw:
        return []
    try:
        return json.loads(raw)
    except Exception:
        return []


def append_turn(session_id: str, user_text: str, assistant_text: str) -> None:
    """Add a user+assistant exchange to the session history and reset TTL."""
    history = get_history(session_id)
    history.append({"role": "user",      "content": user_text})
    history.append({"role": "assistant", "content": assistant_text})

    # Keep only the most recent MAX_TURNS pairs (each pair = 2 messages)
    if len(history) > MAX_TURNS * 2:
        history = history[-(MAX_TURNS * 2):]

    client = get_client()
    client.set(_key(session_id), json.dumps(history), ex=_TTL_SECONDS)


def clear_session(session_id: str) -> None:
    get_client().delete(_key(session_id))


def format_for_prompt(history: list[dict]) -> str:
    """Convert history list to the string format expected by build_prompt()."""
    if not history:
        return "(no prior conversation)"
    lines = []
    for h in history:
        role = "User" if h["role"] == "user" else "Arya"
        lines.append(f"{role}: {h['content']}")
    return "\n".join(lines)
