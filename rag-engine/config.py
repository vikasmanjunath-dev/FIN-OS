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
GENERATION_MODEL = "qwen3:8b"

# ── Qdrant ───────────────────────────────────────────────────────────────
QDRANT_HOST = "localhost"
QDRANT_PORT = 6333
COLLECTION_NAME = "finos_chunks"

# ── Redis (Phase 2+) ─────────────────────────────────────────────────────
REDIS_HOST = "localhost"
REDIS_PORT = 6379

# ── Chunking (docs/RAG_PIPELINE.md §2) ──────────────────────────────────
CHUNK_SIZES = {
    "finos_page": {"size": 350, "overlap": 70},
    "regulation": {"size": 400, "overlap": 80},
    "news": {"size": 200, "overlap": 40},
    "user_doc": {"size": 150, "overlap": 30},
}

# ── Namespaces ───────────────────────────────────────────────────────────
PUBLIC_NAMESPACE = "public"

def user_namespace(user_id: str) -> str:
    return f"user:{user_id}"

# ── Server ───────────────────────────────────────────────────────────────
SERVER_PORT = 7476
