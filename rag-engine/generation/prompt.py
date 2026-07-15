"""
Prompt templates — Indian finance persona, citation discipline, conflict handling.
See docs/RAG_PIPELINE.md Layer 6 and docs/RAG_PHASES.md Phase 2.
"""
from __future__ import annotations

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


def build_context_block(chunks: list[dict]) -> str:
    lines = []
    for i, c in enumerate(chunks, start=1):
        payload = c["payload"]
        title = payload.get("doc_title", "Unknown source")
        text = payload.get("text", "")[:_MAX_CHUNK_CHARS]
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
        context_block=build_context_block(chunks),
        history_block=history_block,
        query=query,
    )
