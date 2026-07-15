"""
Ingestion job functions — run by an RQ worker process (`rq worker rag-ingestion`),
not inline in a request/response cycle. Phase 6: decouples batch ingestion from
live query latency, a real gap documented since Phase 2 (see docs/RAG_HARDWARE.md
§8 — "Ingestion stalls live queries... all ingestion is currently synchronous").

These are the same three ingestion bodies that used to run directly inside
server.py's endpoint handlers — moved here unchanged in logic, just callable by
a separate worker process (RQ jobs must be importable plain functions, not
closures or methods on a request handler).

Scope: only the three *batch* ingestion endpoints (94 FIN-OS pages, SEBI
circulars, RBI notifications). POST /api/upload stays synchronous — it's a
single small user document and the caller expects an immediate "ingested"
response, not a job to poll; converting it would change its UX for no benefit.
"""
from __future__ import annotations
import time

import config
import metrics
from ingestion.loaders import load_finos_pages
from ingestion.chunker import chunk_text
from ingestion.pii import scrub
from ingestion.regulatory import crawl_recent_circulars, crawl_recent_rbi_notifications
from embedding.encoder import embed_batch
from storage.qdrant_store import upsert_chunks, delete_by_doc_type
from storage import sqlite_fts, redis_cache


def ingest_finos_pages_job() -> dict:
    started = time.time()
    docs = load_finos_pages(config.HTML_PAGES_DIR)
    if not docs:
        metrics.INGESTION_RESULT.labels(source="finos_pages", outcome="failure").inc()
        raise RuntimeError(f"No HTML pages found in {config.HTML_PAGES_DIR}")

    delete_by_doc_type("finos_page")
    sqlite_fts.delete_by_doc_type("finos_page")

    size_cfg = config.CHUNK_SIZES["finos_page"]
    all_chunk_texts: list[str] = []
    all_payloads: list[dict] = []
    total_redactions = 0

    for doc in docs:
        scrubbed_text, redactions = scrub(doc.text, strict=False)
        total_redactions += redactions

        chunks = chunk_text(
            scrubbed_text,
            size_tokens=size_cfg["size"],
            overlap_tokens=size_cfg["overlap"],
            base_metadata={
                "doc_title": doc.title,
                "page_key": doc.metadata.get("page_key"),
                "source_path": doc.source_path,
            },
        )
        for c in chunks:
            all_chunk_texts.append(c.text)
            all_payloads.append(
                {
                    "text": c.text,
                    "namespace": config.PUBLIC_NAMESPACE,
                    "doc_type": "finos_page",
                    "doc_title": doc.title,
                    "page_key": doc.metadata.get("page_key"),
                    **c.metadata,
                }
            )

    chunks_created = 0
    if all_chunk_texts:
        vectors = embed_batch(all_chunk_texts)
        point_ids = upsert_chunks(vectors, all_payloads)
        sqlite_fts.index_chunks(point_ids, all_chunk_texts, all_payloads)
        chunks_created = len(point_ids)
        redis_cache.bump_kb_version()

    metrics.INGESTION_RESULT.labels(source="finos_pages", outcome="success").inc()
    return {
        "pages_processed": len(docs),
        "chunks_created": chunks_created,
        "pii_redactions": total_redactions,
        "duration_sec": round(time.time() - started, 2),
    }


def _ingest_regulatory_docs(docs: list, regulator: str) -> dict:
    started = time.time()
    if not docs:
        metrics.INGESTION_RESULT.labels(source=regulator.lower(), outcome="failure").inc()
        return {"fetched": 0, "chunks_created": 0, "duration_sec": round(time.time() - started, 2)}

    size_cfg = config.CHUNK_SIZES["regulation"]
    all_chunk_texts: list[str] = []
    all_payloads: list[dict] = []
    total_redactions = 0

    for d in docs:
        scrubbed_text, redactions = scrub(d.text, strict=False)
        total_redactions += redactions

        chunks = chunk_text(
            scrubbed_text,
            size_tokens=size_cfg["size"],
            overlap_tokens=size_cfg["overlap"],
            base_metadata={"doc_title": d.title, "source_url": d.detail_url, "finance_category": "regulation"},
        )
        for ch in chunks:
            all_chunk_texts.append(ch.text)
            all_payloads.append(
                {
                    "text": ch.text,
                    "namespace": config.PUBLIC_NAMESPACE,
                    "doc_type": "regulation",
                    "regulator": regulator,
                    "doc_title": d.title,
                    "source_url": d.detail_url,
                    **ch.metadata,
                }
            )

    chunks_created = 0
    if all_chunk_texts:
        vectors = embed_batch(all_chunk_texts)
        point_ids = upsert_chunks(vectors, all_payloads)
        sqlite_fts.index_chunks(point_ids, all_chunk_texts, all_payloads)
        chunks_created = len(point_ids)
        redis_cache.bump_kb_version()

    metrics.INGESTION_RESULT.labels(source=regulator.lower(), outcome="success").inc()
    return {
        "fetched": len(docs),
        "chunks_created": chunks_created,
        "pii_redactions": total_redactions,
        "duration_sec": round(time.time() - started, 2),
        "titles": [d.title for d in docs],
    }


def ingest_sebi_circulars_job(limit: int = 10) -> dict:
    circulars = crawl_recent_circulars(limit=limit)
    result = _ingest_regulatory_docs(circulars, regulator="SEBI")
    result["circulars_fetched"] = result.pop("fetched")
    return result


def ingest_rbi_notifications_job(limit: int = 10) -> dict:
    notifications = crawl_recent_rbi_notifications(limit=limit)
    result = _ingest_regulatory_docs(notifications, regulator="RBI")
    result["notifications_fetched"] = result.pop("fetched")
    return result
