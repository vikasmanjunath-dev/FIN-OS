"""
Retrieve + rerank with a guaranteed slot for the caller's OWN chunks on first-person questions.

Why (Oct 25 2026): public content grew (news 92 -> 1,000 chunks) and a person's short fact cards stopped reaching the
top-3 on questions like "what is my home loan EMI?". Searching the person's namespace separately and reserving
`config.PERSONAL_QUOTA` slot(s) keeps their own facts in play without removing relevant public chunks. Never
applies without a user_id, never reaches into any namespace but the caller's own.
"""
from __future__ import annotations
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config
from retrieval.hybrid import hybrid_retrieve, query_vector
from retrieval.reranker import rerank, is_first_person


def retrieve_ranked(query: str, user_id: str | None, top_k: int, use_hyde: bool = False, doc_type: str | None = None) -> list[dict]:
    own_ns = config.user_namespace(user_id) if user_id else None
    quota = config.PERSONAL_QUOTA if (user_id and is_first_person(query)) else 0
    if quota <= 0:
        pool = hybrid_retrieve(query, user_id=user_id, dense_k=config.RETRIEVE_DENSE_K, sparse_k=config.RETRIEVE_SPARSE_K, use_hyde=use_hyde, doc_type=doc_type)
        return rerank(query, pool, top_k=top_k, own_namespace=own_ns)

    vec = query_vector(query, use_hyde)        # two searches below, one embedding (and one HyDE generation)
    pool = hybrid_retrieve(query, user_id=user_id, dense_k=config.RETRIEVE_DENSE_K, sparse_k=config.RETRIEVE_SPARSE_K, use_hyde=use_hyde, doc_type=doc_type, query_vec=vec)
    own = hybrid_retrieve(query, user_id=user_id, dense_k=config.PERSONAL_POOL_K, sparse_k=config.PERSONAL_POOL_K, use_hyde=use_hyde, doc_type=doc_type, personal_only=True, query_vec=vec)
    merged, seen = [], set()
    for c in pool + own:
        if c["id"] not in seen:
            seen.add(c["id"]); merged.append(c)
    ranked = rerank(query, merged, top_k=len(merged), own_namespace=own_ns)       # full ordering, best first
    mine = [c for c in ranked if (c["payload"] or {}).get("namespace") == own_ns][:quota]
    mine_ids = {c["id"] for c in mine}
    rest = [c for c in ranked if c["id"] not in mine_ids][:max(0, top_k - len(mine))]
    final = mine + rest
    final.sort(key=lambda c: c.get("rerank_score", 0.0), reverse=True)
    return final[:top_k]
