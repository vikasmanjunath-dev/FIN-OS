"""
Prometheus metrics for rag-engine. Exposed at GET /api/metrics (server.py).

No Grafana server is set up alongside this — running a full Grafana instance
for a 398-chunk solo-dev local project is the same kind of unneeded weight
this project already declined elsewhere (LlamaIndex, bm25s, a job scheduler).
This endpoint is plain Prometheus exposition format; point any compatible
scraper or `promtool`/`curl` at it directly if you want to look at the numbers.
"""
from __future__ import annotations
from prometheus_client import Counter, Histogram, CONTENT_TYPE_LATEST, generate_latest

REQUEST_LATENCY = Histogram(
    "rag_request_latency_seconds",
    "Latency of rag-engine endpoints, end to end",
    ["endpoint"],
)

CACHE_HITS = Counter("rag_cache_hits_total", "Redis cache hits on /api/query")
CACHE_MISSES = Counter("rag_cache_misses_total", "Redis cache misses on /api/query")

INGESTION_RESULT = Counter(
    "rag_ingestion_total",
    "Ingestion attempts by source and outcome",
    ["source", "outcome"],
)

FAITHFULNESS_FLAGS = Counter(
    "rag_faithfulness_flagged_sentences_total",
    "Sentences flagged by the faithfulness/NLI guard (see docs/RAG_PHASES.md Phase 5 "
    "for the known domain-reliability gap before treating this as a quality signal)",
)


def render() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST
