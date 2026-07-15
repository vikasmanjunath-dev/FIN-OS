"""
Cross-encoder reranking — BAAI/bge-reranker-v2-m3 on PyTorch MPS.
See docs/RAG_MODELS.md §5 and docs/RAG_PIPELINE.md Layer 5 step 6.
"""
from __future__ import annotations
import torch
from sentence_transformers import CrossEncoder

_MODEL_NAME = "BAAI/bge-reranker-v2-m3"
# Measured on M5 MPS with real FIN-OS chunk lengths (~300 tokens avg): max_length=512
# took 2.33s for 14 pairs vs 1.13s at 256 (attention cost scales ~O(n^2)). 256 tokens
# (~170-190 words) is enough for relevance scoring without needing the full chunk body.
_MAX_LENGTH = 256

_model: CrossEncoder | None = None


def _get_model() -> CrossEncoder:
    global _model
    if _model is None:
        device = "mps" if torch.backends.mps.is_available() else "cpu"
        _model = CrossEncoder(_MODEL_NAME, device=device, max_length=_MAX_LENGTH)
        # sentence-transformers 3.3.1's CrossEncoder constructor silently ignores
        # device="mps" for this model (verified: model.model stayed on cpu despite
        # the param). Explicit .to() after construction does move it — measured
        # ~5-7s -> well under 1s for a 29-candidate rerank batch.
        _model.model.to(device)
    return _model


def rerank(query: str, candidates: list[dict], top_k: int = 8) -> list[dict]:
    """
    candidates: list of {"id", "payload", ...} with payload["text"] present.
    Returns the top_k candidates re-scored by the cross-encoder, descending.
    """
    if not candidates:
        return []

    model = _get_model()
    pairs = [(query, c["payload"].get("text", "")) for c in candidates]
    scores = model.predict(pairs)

    for c, score in zip(candidates, scores):
        c["rerank_score"] = float(score)

    candidates.sort(key=lambda c: c["rerank_score"], reverse=True)
    return candidates[:top_k]
