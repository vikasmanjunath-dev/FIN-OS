"""
Semantic-ish chunker — sentence-boundary aware, word-count sized.
See docs/RAG_PIPELINE.md Layer 2 for the chunk-size table this implements.

No tokenizer dependency in Phase 1: word count is used as a token proxy
(~0.75 tokens/word for English finance text is close enough for chunk sizing;
this is not used for anything requiring exact token counts).
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")

# Hard safety net, found via a real failure: a PDF-extracted table (numbers,
# currency symbols, no '.!?' to sentence-split on) produced a single 2013-char
# "sentence" that the word-count heuristic underestimated, and mxbai-embed-large
# rejected it with "input length exceeds the context length" (512-token limit).
# Dense tabular/numeric content tokenizes far worse than the 0.75 divisor below
# assumes — short tokens like "₹50,000" cost more BPE tokens per character than
# prose. This is a hard character ceiling applied after normal chunking, not a
# replacement for it — see docs/RAG_PHASES.md Phase 3 for the full incident.
# Empirically measured worst case against a real failing RBI table chunk: ~3.34
# chars/token (1711 chars exceeded the 512-token limit, 1500 chars did not).
# 1200 chars gives a real safety margin (~2.3 chars/token) below that measured ratio.
_MAX_CHUNK_CHARS = 1200


@dataclass
class Chunk:
    text: str
    metadata: dict = field(default_factory=dict)


def _split_sentences(text: str) -> list[str]:
    sentences = _SENTENCE_SPLIT.split(text)
    return [s.strip() for s in sentences if s.strip()]


def chunk_text(text: str, size_tokens: int, overlap_tokens: int, base_metadata: dict | None = None) -> list[Chunk]:
    """
    Greedy sentence-packing chunker: accumulate whole sentences until the
    target token budget is hit, then start the next chunk `overlap_tokens`
    worth of trailing sentences back, so context isn't severed mid-thought.
    """
    base_metadata = base_metadata or {}
    sentences = _split_sentences(text)
    if not sentences:
        return []

    chunks: list[Chunk] = []
    current: list[str] = []
    current_tokens = 0

    def estimate_tokens(s: str) -> int:
        return max(1, int(len(s.split()) / 0.75))

    i = 0
    while i < len(sentences):
        sent = sentences[i]
        sent_tokens = estimate_tokens(sent)
        if current_tokens + sent_tokens > size_tokens and current:
            chunk_text_str = " ".join(current)
            chunks.append(Chunk(text=chunk_text_str, metadata={**base_metadata, "chunk_index": len(chunks)}))

            # Walk backwards from the end of `current` to build the overlap window
            overlap: list[str] = []
            overlap_count = 0
            for s in reversed(current):
                t = estimate_tokens(s)
                if overlap_count + t > overlap_tokens:
                    break
                overlap.insert(0, s)
                overlap_count += t
            current = overlap
            current_tokens = overlap_count
            continue  # re-evaluate this sentence against the reset window
        current.append(sent)
        current_tokens += sent_tokens
        i += 1

    if current:
        chunks.append(Chunk(text=" ".join(current), metadata={**base_metadata, "chunk_index": len(chunks)}))

    return _enforce_max_chars(chunks, base_metadata)


def _enforce_max_chars(chunks: list[Chunk], base_metadata: dict) -> list[Chunk]:
    """Splits any chunk exceeding _MAX_CHUNK_CHARS by raw character slicing.
    Sentence-aware chunking can still produce an oversized chunk when the source
    has no '.!?' to split on (tables, dense numeric content) — this is the backstop."""
    result: list[Chunk] = []
    for c in chunks:
        if len(c.text) <= _MAX_CHUNK_CHARS:
            result.append(c)
            continue
        for start in range(0, len(c.text), _MAX_CHUNK_CHARS):
            piece = c.text[start : start + _MAX_CHUNK_CHARS]
            result.append(Chunk(text=piece, metadata={**base_metadata, "chunk_index": len(result)}))
    return result
