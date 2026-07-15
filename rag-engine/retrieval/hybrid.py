"""
Hybrid retrieval — dense (Qdrant) + sparse (SQLite BM25) merged via
Reciprocal Rank Fusion. See docs/RAG_PIPELINE.md Layer 5 steps 3-5.
"""
from __future__ import annotations

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from embedding.encoder import embed_batch
from storage import qdrant_store, sqlite_fts
from retrieval.hyde import generate_hypothetical_answer

_RRF_K = 60  # standard RRF damping constant


def rrf_fuse(dense_results: list[dict], sparse_results: list[dict]) -> list[dict]:
    """
    score(d) = sum over each ranked list of 1 / (k + rank_i(d))
    Results are deduplicated by point id; payload is taken from whichever
    list first produced that id (both carry the same payload anyway).
    """
    scores: dict[str, float] = {}
    payloads: dict[str, dict] = {}

    for rank, r in enumerate(dense_results):
        scores[r["id"]] = scores.get(r["id"], 0.0) + 1.0 / (_RRF_K + rank + 1)
        payloads.setdefault(r["id"], r["payload"])

    for rank, r in enumerate(sparse_results):
        scores[r["id"]] = scores.get(r["id"], 0.0) + 1.0 / (_RRF_K + rank + 1)
        payloads.setdefault(r["id"], r["payload"])

    fused = [
        {"id": pid, "rrf_score": score, "payload": payloads[pid]}
        for pid, score in scores.items()
    ]
    fused.sort(key=lambda x: x["rrf_score"], reverse=True)
    return fused


def hybrid_retrieve(
    query: str,
    user_id: str | None = None,
    dense_k: int = 10,
    sparse_k: int = 10,
    use_hyde: bool = False,
    doc_type: str | None = None,
) -> list[dict]:
    """
    Embeds the query once, runs both retrievers, fuses with RRF. Returns the
    fused candidate list (unranked-by-relevance — that's the reranker's job).

    use_hyde=True: embeds a generated hypothetical answer instead of the raw
    query for the DENSE leg only (sparse/BM25 still matches the literal query
    text, which is exactly what catches exact terms HyDE would blur). Measured
    cost on this hardware: +4-7s per query (qwen3:8b generation) — real, not
    negligible — so this is opt-in, not default. See docs/RAG_HARDWARE.md §4.
    """
    dense_query_text = generate_hypothetical_answer(query) if use_hyde else query
    query_vec = embed_batch([dense_query_text])[0]
    dense_results = qdrant_store.search(query_vec, user_id=user_id, top_k=dense_k, doc_type=doc_type)
    sparse_results = sqlite_fts.search(query, user_id=user_id, top_k=sparse_k, doc_type=doc_type)
    return rrf_fuse(dense_results, sparse_results)
