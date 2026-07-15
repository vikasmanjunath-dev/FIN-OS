"""
Streaming generation via Ollama's /api/generate — qwen3:14b.
See docs/RAG_PIPELINE.md Layer 6 and docs/RAG_MODELS.md §1.
"""
from __future__ import annotations
import json
from collections.abc import Iterator

import httpx

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config

_TIMEOUT = httpx.Timeout(120.0)


def stream_generate(prompt: str, temperature: float = 0.1) -> Iterator[str]:
    """Yields response tokens as they arrive from Ollama."""
    with httpx.stream(
        "POST",
        f"{config.OLLAMA_BASE_URL}/api/generate",
        json={
            "model": config.GENERATION_MODEL,
            "prompt": prompt,
            "stream": True,
            "think": False,  # qwen3 reasons-by-default; FIN-OS's existing arya-ai.js
                              # convention disables this — measured 11.9s -> 0.58s on a
                              # trivial prompt by avoiding hidden chain-of-thought tokens.
            "options": {
                "temperature": temperature,
                # Measured decode on this M5 with qwen3:8b: ~20 tok/s, stable. Latency
                # scales linearly with answer length, so the hard lever for the 3s P95
                # target (docs/RAG_EVALUATION.md) is capping output length, not chasing
                # decode speed. 120 tokens ≈ 6s at 20 tok/s — generous for a 3-4 sentence
                # cited answer per the prompt's conciseness rule.
                "num_predict": 120,
            },
        },
        timeout=_TIMEOUT,
    ) as resp:
        resp.raise_for_status()
        for line in resp.iter_lines():
            if not line:
                continue
            data = json.loads(line)
            if data.get("response"):
                yield data["response"]
            if data.get("done"):
                break


def generate(prompt: str, temperature: float = 0.1) -> str:
    """Non-streaming convenience wrapper — collects the full response."""
    return "".join(stream_generate(prompt, temperature=temperature))
