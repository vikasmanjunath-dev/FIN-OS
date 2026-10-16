"""
Prompt templates — Indian finance persona, citation discipline, conflict handling.
See docs/RAG_PIPELINE.md Layer 6 and docs/RAG_PHASES.md Phase 2.
"""
from __future__ import annotations

import re

SYSTEM_PROMPT = """You are Arya, FIN-OS's financial assistant for Indian users.
Answer ONLY from the context below; say so if it lacks the answer. Cite every fact
with [SOURCE_N]. If sources conflict, state both with dates. Use ₹ L/Cr/K formatting.
HARD LIMIT: 3-4 sentences max (latency constraint on this hardware, not style)."""

ANSWER_TEMPLATE = """{system_prompt}

RETRIEVED CONTEXT:
{context_block}

CONVERSATION HISTORY:
{history_block}

USER QUESTION:
{query}

Answer now, citing sources as instructed:"""


_MAX_CHUNK_CHARS = 500  # ~125 tokens/chunk — prefill on this M5 measures ~200-260 tok/s
                         # (not the ~2500 tok/s originally assumed — see docs/RAG_HARDWARE.md
                         # "Measured Performance" section), so trimming context size directly
                         # cuts the dominant latency cost for a RAG query on this hardware.


_STOPWORDS = frozenset(
    "a an the of in on at to for from by with and or is are was were be been it its this that these those what which who whom "
    "how much many does do did can could should would will per as about between into over under than then there their your you "
    "i my me we our us fin os finos according mention mentions say says said describe described".split()
)


def _query_terms(query: str) -> list[str]:
    toks = re.findall(r"[a-z0-9][a-z0-9.,%₹\-]*", (query or "").lower())
    terms = []
    for t in toks:
        t = t.strip(".,-")
        if len(t) >= 2 and t not in _STOPWORDS:
            # crude stem so "issues" matches "issued", "bonds" matches "bond", "deductions" matches "deduction"
            if len(t) >= 6 and t.isalpha():
                t = t[:-2]
            elif len(t) == 5 and t.isalpha():
                t = t[:-1]
            terms.append(t)
    return terms


def select_window(text: str, query: str, max_chars: int = _MAX_CHUNK_CHARS) -> str:
    """Return at most `max_chars` of `text`, choosing the window that best matches the query.

    Why (Oct 15 2026): chunks are up to 1,200 chars but the prompt only has room for ~500, and the
    old code always kept the FIRST 500. For 6 of 17 failing benchmark questions the retrieved chunk
    did contain the answer, but past char 500, so the model never saw it. Same prompt size as before
    (latency-neutral); only *which* 500 chars changes. Short chunks are returned untouched.
    """
    if len(text) <= max_chars:
        return text
    terms = _query_terms(query)
    if not terms:
        return text[:max_chars]
    low = text.lower()
    step = 60
    best_start, best_score = 0, -1.0
    for start in range(0, len(text) - max_chars + step, step):
        start = min(start, len(text) - max_chars)
        win = low[start:start + max_chars]
        # distinct terms matter more than repeats; a small head bias keeps ties on the chunk opening
        score = sum(1.0 + 0.25 * min(win.count(t) - 1, 2) for t in terms if t in win) - start / 100000.0
        if score > best_score:
            best_start, best_score = start, score
    if best_start == 0:
        return text[:max_chars]
    # snap to a word boundary so a number or word is never cut in half
    s = best_start
    if s > 0:
        nxt = text.find(" ", s)
        if 0 <= nxt - s < 40:
            s = nxt + 1
    return "…" + text[s:s + max_chars]


def build_context_block(chunks: list[dict], query: str = "") -> str:
    lines = []
    for i, c in enumerate(chunks, start=1):
        payload = c["payload"]
        title = payload.get("doc_title", "Unknown source")
        text = select_window(payload.get("text", ""), query)
        lines.append(f"[SOURCE_{i}] ({title})\n{text}")
    return "\n\n".join(lines) if lines else "(no relevant context retrieved)"


def build_prompt(query: str, chunks: list[dict], history: list[dict] | None = None) -> str:
    history = history or []
    history_block = (
        "\n".join(f"{h['role']}: {h['content']}" for h in history[-6:])
        if history
        else "(no prior conversation)"
    )
    return ANSWER_TEMPLATE.format(
        system_prompt=SYSTEM_PROMPT,
        context_block=build_context_block(chunks, query),
        history_block=history_block,
        query=query,
    )
