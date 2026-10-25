"""
FIN-OS RAG Engine — configuration.
See docs/RAG_HARDWARE.md and docs/RAG_MODELS.md for the reasoning behind these defaults.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# ── Paths ────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent   # .../Initial Deployment
HTML_PAGES_DIR = PROJECT_ROOT / "html"
RAG_ENGINE_DIR = Path(__file__).resolve().parent

load_dotenv(RAG_ENGINE_DIR / ".env")

# ── Supabase (Phase 3 — see docs/RAG_SECURITY.md §4 for the auth flow this enables) ──
# Reuses the existing FIN-OS Supabase project (same credentials as alerts/.env).
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# ── Ollama ───────────────────────────────────────────────────────────────
OLLAMA_BASE_URL = "http://localhost:11434"
EMBED_MODEL = "mxbai-embed-large"
EMBED_DIM = 1024
UTILITY_MODEL = "qwen3:8b"     # query rewrite / HyDE — Phase 2+
# Measured on this M5 (24GB, likely base chip — see docs/RAG_HARDWARE.md "Measured
# Performance" section): qwen3:14b decodes at only ~7-11 tok/s here (RAG_HARDWARE.md's
# original ~50 tok/s estimate assumed higher-bandwidth Pro/Max-class memory and did not
# hold on this hardware). qwen3:8b decodes ~2x faster (~20 tok/s) with acceptable
# quality for grounded RAG answers, so it's the default. Swap back to qwen3:14b for
# harder synthesis tasks (e.g. multi-hop in Phase 3) where quality matters more than speed.
GENERATION_MODEL = os.environ.get("RAG_GENERATION_MODEL", "qwen3:8b")   # env override for experiments (Oct 25 2026)

# ── Qdrant ───────────────────────────────────────────────────────────────
QDRANT_HOST = "localhost"
QDRANT_PORT = 6333
COLLECTION_NAME = "finos_chunks"

# ── Redis (Phase 2+) ─────────────────────────────────────────────────────
REDIS_HOST = "localhost"
REDIS_PORT = 6379

# ── Chunking (docs/RAG_PIPELINE.md §2) ──────────────────────────────────
CHUNK_SIZES = {
    "finos_page":        {"size": 350, "overlap": 70},
    "regulation":        {"size": 400, "overlap": 80},
    "news":              {"size": 200, "overlap": 40},
    "user_doc":          {"size": 150, "overlap": 30},
    # Corporate filing text is a short structured block (~100-150 tokens) — each
    # announcement is already an atomic unit, so chunk size just needs to fit one
    # full announcement. 200/40 matches the news chunk size, which has the same shape.
    "corporate_filing":  {"size": 200, "overlap": 40},
}

# ── Pipeline version ─────────────────────────────────────────────────────
# Bump whenever prompt construction, chunk selection or generation settings change.
# It is part of the Redis cache key (storage/redis_cache.py): before Oct 15 2026 the key
# held only the query, the user and the kb_version, so a prompt fix kept serving the
# previous prompt's cached answers for up to an hour.
PIPELINE_VERSION = "2026-10-25.3-personal-quota"

# Retrieval tuning (Oct 25 2026, found by triaging the failing benchmark questions): 6 of 20 failures had the
# answer at rank 4-10 because the reranker only saw the HEAD of each long chunk, and 2 more were not in the
# 10+10 candidate pool at all. RERANK_WINDOW_CHARS scores the query-relevant window (what the generator sees);
# the candidate pool size is overridable by env for experiments.
RERANK_WINDOW_CHARS = int(os.environ.get("RAG_RERANK_WINDOW_CHARS", "800"))   # 0 = old behaviour (chunk head)
# Personal prior (Oct 25 2026): the window change let public chunks outrank a person's own short fact cards on
# "my ..." questions (personalized benchmark 38 -> 36: rent, loan EMI, Hinglish food spend). A first-person question
# is about the caller's own data, so their own-namespace chunks get a multiplicative prior. Fixed a priori (x4;
# reranker scores are small sigmoid probabilities, so an additive bonus would swamp relevance), not swept.
PERSONAL_PRIOR = float(os.environ.get("RAG_PERSONAL_PRIOR", "1.0"))   # OFF by default: measured no benefit (35/41 with and without)
# Personal quota (Oct 25 2026): the index grew to 1,000 news chunks and a person's own fact cards stopped reaching the top 3
# (personalized 38 -> 35 with the OLD retrieval too, so it was corpus growth, not a code change). For first-person questions the
# person's own namespace is searched on its own and its best chunk is guaranteed a slot. 0 disables.
PERSONAL_QUOTA = int(os.environ.get("RAG_PERSONAL_QUOTA", "1"))
# Own-namespace candidates per leg (dense, sparse) for that extra search. 8 -> 4 (Oct 25 audit H15): identical top-3 on all 33 first-person
# personalized questions, merged rerank pool 21.8 -> 18.8, retrieval 1.9 s -> 1.6 s.
PERSONAL_POOL_K = int(os.environ.get("RAG_PERSONAL_POOL_K", "4"))
# News demotion (Oct 25 2026): news is ~half the index and recency-boosted. On the 112 public questions it fills 4.8% of
# top-3 slots (15 questions get one). For questions that are not asking for news its rerank score is multiplied by this
# factor. 1.0 = off; measured: 0 of 15 affected questions changed (docs/RAG_PHASES.md Phase 9 addendum).
NEWS_DEMOTION = float(os.environ.get("RAG_NEWS_DEMOTION", "1.0"))
# Prompt variant (Oct 25 2026): "base" = current prompt; "quote" = the model first copies the ONE sentence that answers the
# question (with its [SOURCE_N]) and then answers from that sentence only. Measured 90/112 vs 95-96, so "base" stays.
PROMPT_VARIANT = os.environ.get("RAG_PROMPT_VARIANT", "base")
NUM_PREDICT = int(os.environ.get("RAG_NUM_PREDICT", "170" if PROMPT_VARIANT == "quote" else "120"))
RETRIEVE_DENSE_K = int(os.environ.get("RAG_RETRIEVE_K", "10"))
RETRIEVE_SPARSE_K = int(os.environ.get("RAG_RETRIEVE_K", "10"))


def _env_int(name: str, default: int, lo: int, hi: int) -> int:
    """Integer env knob that cannot break the server: an unparsable value falls back to the default, an out-of-range one is clamped."""
    try:
        return max(lo, min(hi, int(os.environ.get(name, default))))
    except (TypeError, ValueError):
        return default


# Context size experiment (B13, Oct 25 2026): how many chunks reach the prompt and how many characters of each. Defaults = shipped
# values; both tested variants were worse (2x500 = 91/112, 3x300 = 93/112 vs 95-96). Range-checked: 0 chunks would send an empty context.
PROMPT_TOP_K = _env_int("RAG_PROMPT_TOP_K", 3, 1, 10)
PROMPT_CHUNK_CHARS = _env_int("RAG_PROMPT_CHUNK_CHARS", 500, 100, 2000)

# ── Namespaces ───────────────────────────────────────────────────────────
PUBLIC_NAMESPACE = "public"

def user_namespace(user_id: str) -> str:
    return f"user:{user_id}"

# ── Server ───────────────────────────────────────────────────────────────
SERVER_PORT = 7476


def pipeline_signature() -> str:
    """Everything that changes what a query returns, for the Redis cache key (Oct 25 2026: the key held only
    PIPELINE_VERSION, so flipping an env tunable such as RAG_NEWS_DEMOTION would have served stale cached answers)."""
    return (f"{PIPELINE_VERSION}|w{RERANK_WINDOW_CHARS}|k{RETRIEVE_DENSE_K}-{RETRIEVE_SPARSE_K}|pq{PERSONAL_QUOTA}-{PERSONAL_POOL_K}|pp{PERSONAL_PRIOR}|nd{NEWS_DEMOTION}|pv{PROMPT_VARIANT}|np{NUM_PREDICT}|gm{GENERATION_MODEL}|pk{PROMPT_TOP_K}|pc{PROMPT_CHUNK_CHARS}")
