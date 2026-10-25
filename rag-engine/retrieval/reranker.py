"""
Cross-encoder reranking — BAAI/bge-reranker-v2-m3 on PyTorch MPS.
See docs/RAG_MODELS.md §5 and docs/RAG_PIPELINE.md Layer 5 step 6.
"""
from __future__ import annotations
import sys
from pathlib import Path
import torch
from sentence_transformers import CrossEncoder

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config  # noqa: E402
from generation.prompt import select_window  # noqa: E402

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


import re as _re
_FIRST_PERSON = _re.compile(r"\b(my|mine|myself|i|i'm|i've|mera|meri|mere|apna|apni|apne|maine|mai|hamara|hamari)\b|(मेरा|मेरी|मेरे|मैंने|अपना|अपनी|अपने|हमारा|हमारी)", _re.I)   # no bare "me"/"mujhe": "tell me about X" is not about the caller's data


_NEWS_INTENT = _re.compile(r"\b(news|headline|headlines|breaking|latest|today|todays|yesterday|this week|recent|recently|announce|announced|announcement|khabar|aaj)\b|(समाचार|खबर|ताज़ा|आज)", _re.I)


def wants_news(query: str) -> bool:
    return bool(_NEWS_INTENT.search(query or ""))


# "main" is Hindi for "I" but also an English adjective ("the main difference"): 2 of the 112 public benchmark questions used it that
# way and would have been routed as first-person. It counts only when it is not part of an English noun phrase.
_MAIN = _re.compile(r"\bmain\b", _re.I)
_BEFORE_MAIN_EN = {"the", "a", "an", "its", "their", "our", "your", "his", "her", "two", "three", "four", "five", "six", "these", "those", "key", "are", "is", "and", "of", "or", "other", "only"}
_AFTER_MAIN_EN = {"difference", "differences", "reason", "reasons", "purpose", "category", "categories", "type", "types", "benefit", "benefits", "feature", "features",
                  "point", "points", "advantage", "advantages", "disadvantage", "disadvantages", "risk", "risks", "idea", "goal", "goals", "aim", "objective", "objectives",
                  "factor", "factors", "step", "steps", "component", "components", "part", "parts", "way", "ways", "issue", "issues", "function", "functions", "role",
                  "principle", "principles", "source", "sources", "cause", "causes", "street", "account", "board", "market", "markets", "index", "indices", "sections"}


def _hindi_main(query: str) -> bool:
    for m in _MAIN.finditer(query):
        before = query[:m.start()].split()[-1:] ; after = query[m.end():].split()[:1]
        b = before[0].strip(".,;:!?()\"'").lower() if before else ""
        a = after[0].strip(".,;:!?()\"'").lower() if after else ""
        if b not in _BEFORE_MAIN_EN and a not in _AFTER_MAIN_EN:
            return True
    return False


def is_first_person(query: str) -> bool:
    q = query or ""
    return bool(_FIRST_PERSON.search(q)) or _hindi_main(q)


def rerank(query: str, candidates: list[dict], top_k: int = 8, own_namespace: str | None = None) -> list[dict]:
    """
    candidates: list of {"id", "payload", ...} with payload["text"] present.
    Returns the top_k candidates re-scored by the cross-encoder, descending.
    """
    if not candidates:
        return []

    model = _get_model()
    # Score the query-relevant window of each chunk (same selection the generator prompt uses), not the chunk head:
    # the cross-encoder truncates at 256 tokens, so for long chunks the answer could sit outside what it read.
    w = getattr(config, "RERANK_WINDOW_CHARS", 0)
    pairs = [(query, select_window(c["payload"].get("text", ""), query, w) if w else c["payload"].get("text", "")) for c in candidates]
    scores = model.predict(pairs)

    demote_news = getattr(config, "NEWS_DEMOTION", 1.0) != 1.0 and not wants_news(query)
    boost = own_namespace is not None and getattr(config, "PERSONAL_PRIOR", 1.0) != 1.0 and is_first_person(query)
    for c, score in zip(candidates, scores):
        sc = float(score)
        if boost and (c["payload"] or {}).get("namespace") == own_namespace:
            sc = min(1.0, sc * config.PERSONAL_PRIOR)      # prior only for the caller's own chunks
        if demote_news and (c["payload"] or {}).get("doc_type") == "news":
            sc *= config.NEWS_DEMOTION
        c["rerank_score"] = sc

    candidates.sort(key=lambda c: c["rerank_score"], reverse=True)
    return candidates[:top_k]
