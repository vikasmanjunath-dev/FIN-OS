"""
Multi-hop retrieval — decomposes a compound question into sub-questions,
retrieves+reranks independently for each, merges evidence.
See docs/RAG_PIPELINE.md Layer 5 step 7.

Direct Python implementation (LlamaIndex's SubQuestionQueryEngine was the
original plan — dropped per docs/RAG_SYSTEM.md design decisions; not needed
for this scope).

Capped at 2 sub-questions, not the originally-planned 2-4 — each hop costs a
full retrieve+rerank cycle (~2-4s measured) on top of the ~4-7s decomposition
call itself, so an uncapped multi-hop query could exceed 20s. See
docs/RAG_HARDWARE.md §4 for the measured cost basis.
"""
from __future__ import annotations
import json
import re

import httpx

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config
from retrieval.hybrid import hybrid_retrieve
from retrieval.reranker import rerank

_TIMEOUT = httpx.Timeout(30.0)
_MAX_SUBQUESTIONS = 2

_DECOMPOSE_PROMPT = """Does this question contain two genuinely distinct sub-questions \
that would need different information to answer? If yes, split it into exactly 2 \
short standalone questions. If no (it's already a single simple question), respond \
with just the word NONE.

Question: {query}

Respond with ONLY a JSON array of 2 strings, or the word NONE. No explanation."""


def decompose_query(query: str) -> list[str]:
    """Returns [query] unchanged if not a compound question, else up to 2 sub-questions."""
    resp = httpx.post(
        f"{config.OLLAMA_BASE_URL}/api/generate",
        json={
            "model": config.UTILITY_MODEL,
            "prompt": _DECOMPOSE_PROMPT.format(query=query),
            "stream": False,
            "think": False,
            "options": {"temperature": 0.1, "num_predict": 100},
        },
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    raw = resp.json()["response"].strip()

    if "NONE" in raw.upper() and "[" not in raw:
        return [query]

    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if not match:
        return [query]

    try:
        sub_questions = json.loads(match.group(0))
    except json.JSONDecodeError:
        return [query]

    sub_questions = [q.strip() for q in sub_questions if isinstance(q, str) and q.strip()]
    if len(sub_questions) < 2:
        return [query]

    return sub_questions[:_MAX_SUBQUESTIONS]


def multi_hop_retrieve(query: str, user_id: str | None = None, top_k_per_hop: int = 3) -> tuple[list[str], list[dict]]:
    """
    Returns (sub_questions, merged_ranked_chunks). If the query wasn't compound,
    sub_questions == [query] and this behaves like a single normal retrieve+rerank.
    Chunks are deduped by id; first-seen ordering is preserved across hops.
    """
    sub_questions = decompose_query(query)

    seen_ids: set[str] = set()
    merged: list[dict] = []
    for sub_q in sub_questions:
        candidates = hybrid_retrieve(sub_q, user_id=user_id, dense_k=10, sparse_k=10)
        ranked = rerank(sub_q, candidates, top_k=top_k_per_hop)
        for r in ranked:
            if r["id"] not in seen_ids:
                seen_ids.add(r["id"])
                merged.append(r)

    return sub_questions, merged
