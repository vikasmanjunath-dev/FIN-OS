"""
HyDE — Hypothetical Document Embeddings. See docs/RAG_PIPELINE.md Layer 5 step 6.

Generates a plausible (not necessarily factually correct) answer to the query
with a fast LLM, then that answer — not the raw question — is embedded for the
dense search. Answer-shaped text matches document-shaped text better than
question-shaped text does, which consistently improves recall on vague or
conversational queries.
"""
from __future__ import annotations
import httpx

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config

_TIMEOUT = httpx.Timeout(30.0)

_HYDE_PROMPT = """Write a short, plausible-sounding answer to this Indian personal \
finance question, as if it were a paragraph from a financial knowledge base. \
Do not worry about being precisely factually correct — this is only used to \
improve document search, never shown to the user. Keep it to 2-3 sentences.

Question: {query}

Hypothetical answer:"""


def generate_hypothetical_answer(query: str) -> str:
    resp = httpx.post(
        f"{config.OLLAMA_BASE_URL}/api/generate",
        json={
            "model": config.UTILITY_MODEL,
            "prompt": _HYDE_PROMPT.format(query=query),
            "stream": False,
            "think": False,
            "options": {"temperature": 0.4, "num_predict": 80},
        },
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()["response"].strip()
