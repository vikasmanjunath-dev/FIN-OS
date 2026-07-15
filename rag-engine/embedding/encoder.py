"""
Dense embedding via Ollama's /api/embed — see docs/RAG_MODELS.md §3.
"""
from __future__ import annotations
import httpx

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config

_BATCH_SIZE = 32
_TIMEOUT = httpx.Timeout(60.0)


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts in batches of 32 via Ollama. Returns one vector per input text."""
    if not texts:
        return []

    vectors: list[list[float]] = []
    with httpx.Client(timeout=_TIMEOUT) as client:
        for i in range(0, len(texts), _BATCH_SIZE):
            batch = texts[i : i + _BATCH_SIZE]
            resp = client.post(
                f"{config.OLLAMA_BASE_URL}/api/embed",
                json={"model": config.EMBED_MODEL, "input": batch},
            )
            resp.raise_for_status()
            data = resp.json()
            vectors.extend(data["embeddings"])
    return vectors


def embed_one(text: str) -> list[float]:
    return embed_batch([text])[0]
