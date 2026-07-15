"""
Citation extraction — maps [SOURCE_N] tags in generated text back to chunk metadata.
See docs/RAG_PIPELINE.md Layer 6 and docs/RAG_API.md citation response shape.
"""
from __future__ import annotations
import re

_SOURCE_TAG = re.compile(r"\[SOURCE_(\d+)\]")


def extract_citations(answer_text: str, ranked_chunks: list[dict]) -> list[dict]:
    """
    ranked_chunks is the same ordered list used to build the prompt's context
    block (1-indexed SOURCE_N == ranked_chunks[N-1]). Returns only the sources
    actually referenced in the generated answer, deduplicated, in first-mention order.
    """
    seen: set[int] = set()
    citations = []
    for match in _SOURCE_TAG.finditer(answer_text):
        idx = int(match.group(1))
        if idx in seen or idx < 1 or idx > len(ranked_chunks):
            continue
        seen.add(idx)
        payload = ranked_chunks[idx - 1]["payload"]
        citations.append(
            {
                "id": f"SOURCE_{idx}",
                "doc_title": payload.get("doc_title", "Unknown"),
                "doc_type": payload.get("doc_type", "unknown"),
                "page_key": payload.get("page_key"),
                # source_path: FIN-OS pages (local file); source_url: regulations (live URL)
                "source_path": payload.get("source_path") or payload.get("source_url"),
            }
        )
    return citations


def citation_coverage(answer_text: str) -> float:
    """Fraction of sentences carrying at least one [SOURCE_N] tag — see docs/RAG_EVALUATION.md target ≥95%."""
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", answer_text) if s.strip()]
    if not sentences:
        return 0.0
    cited = sum(1 for s in sentences if _SOURCE_TAG.search(s))
    return cited / len(sentences)
