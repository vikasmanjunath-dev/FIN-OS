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
import hashlib
import time

import config
import metrics
from ingestion.loaders import load_finos_pages
from ingestion.chunker import chunk_text
from ingestion.pii import scrub
from ingestion.regulatory import (
    crawl_recent_circulars,
    crawl_recent_rbi_notifications,
    crawl_recent_irdai_circulars,
    crawl_recent_pfrda_circulars,
)
from ingestion.corporate import (
    crawl_recent_nse_filings,
    crawl_recent_bse_filings,
    CorporateFiling,
)
from ingestion.news import fetch_all_news, NewsArticle
from embedding.encoder import embed_batch
from storage.qdrant_store import upsert_chunks, delete_by_doc_type, get_existing_hashes
from storage import sqlite_fts, redis_cache


def _chunk_hash(text: str) -> str:
    """Stable 64-char SHA-256 hex digest of chunk text.
    Used to skip re-embedding already-indexed chunks on incremental runs."""
    return hashlib.sha256(text.encode()).hexdigest()


def ingest_finos_pages_job(incremental: bool = False) -> dict:
    """Re-index all FIN-OS HTML pages.
    incremental=False (default, manual trigger): deletes all existing finos_page chunks first,
    then re-embeds everything — a clean full re-index.
    incremental=True (scheduler): skips the delete and the embedding of chunks whose
    content_hash is already in Qdrant — only adds new/changed chunks (~90% skip rate
    on a typical Sunday run where most pages haven't changed).
    """
    started = time.time()
    docs = load_finos_pages(config.HTML_PAGES_DIR)
    if not docs:
        metrics.INGESTION_RESULT.labels(source="finos_pages", outcome="failure").inc()
        raise RuntimeError(f"No HTML pages found in {config.HTML_PAGES_DIR}")

    if not incremental:
        delete_by_doc_type("finos_page")
        sqlite_fts.delete_by_doc_type("finos_page")

    existing_hashes = (
        get_existing_hashes(doc_type="finos_page", namespace=config.PUBLIC_NAMESPACE)
        if incremental else set()
    )

    size_cfg = config.CHUNK_SIZES["finos_page"]
    all_chunk_texts: list[str] = []
    all_payloads: list[dict] = []
    total_redactions = 0
    skipped = 0

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
            h = _chunk_hash(c.text)
            if h in existing_hashes:
                skipped += 1
                continue
            all_chunk_texts.append(c.text)
            all_payloads.append(
                {
                    "text": c.text,
                    "content_hash": h,
                    "ingested_at": time.time(),
                    "namespace": config.PUBLIC_NAMESPACE,
                    "doc_type": "finos_page",
                    "doc_title": doc.title,
                    "page_key": doc.metadata.get("page_key"),
                    "section_heading": doc.metadata.get("section_heading", ""),
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
        "chunks_skipped": skipped,
        "incremental": incremental,
        "pii_redactions": total_redactions,
        "duration_sec": round(time.time() - started, 2),
    }


def _ingest_regulatory_docs(docs: list, regulator: str, incremental: bool = False) -> dict:
    """Shared ingestion body for all regulatory crawlers (SEBI, RBI, IRDAI, PFRDA).
    incremental=True: skips chunks already in Qdrant by content_hash (scheduler path).
    incremental=False: embeds and upserts everything (manual trigger path)."""
    started = time.time()
    if not docs:
        metrics.INGESTION_RESULT.labels(source=regulator.lower(), outcome="failure").inc()
        return {"fetched": 0, "chunks_created": 0, "chunks_skipped": 0,
                "duration_sec": round(time.time() - started, 2)}

    existing_hashes = (
        get_existing_hashes(doc_type="regulation", namespace=config.PUBLIC_NAMESPACE)
        if incremental else set()
    )

    size_cfg = config.CHUNK_SIZES["regulation"]
    all_chunk_texts: list[str] = []
    all_payloads: list[dict] = []
    total_redactions = 0
    skipped = 0

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
            h = _chunk_hash(ch.text)
            if h in existing_hashes:
                skipped += 1
                continue
            all_chunk_texts.append(ch.text)
            all_payloads.append(
                {
                    "text": ch.text,
                    "content_hash": h,
                    "ingested_at": time.time(),
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
        "chunks_skipped": skipped,
        "incremental": incremental,
        "pii_redactions": total_redactions,
        "duration_sec": round(time.time() - started, 2),
        "titles": [d.title for d in docs],
    }


def ingest_sebi_circulars_job(limit: int = 10, incremental: bool = False) -> dict:
    circulars = crawl_recent_circulars(limit=limit)
    result = _ingest_regulatory_docs(circulars, regulator="SEBI", incremental=incremental)
    result["circulars_fetched"] = result.pop("fetched")
    return result


def ingest_rbi_notifications_job(limit: int = 10, incremental: bool = False) -> dict:
    notifications = crawl_recent_rbi_notifications(limit=limit)
    result = _ingest_regulatory_docs(notifications, regulator="RBI", incremental=incremental)
    result["notifications_fetched"] = result.pop("fetched")
    return result


def ingest_irdai_circulars_job(limit: int = 10, incremental: bool = False) -> dict:
    circulars = crawl_recent_irdai_circulars(limit=limit)
    result = _ingest_regulatory_docs(circulars, regulator="IRDAI", incremental=incremental)
    result["circulars_fetched"] = result.pop("fetched")
    return result


def ingest_pfrda_circulars_job(limit: int = 10, incremental: bool = False) -> dict:
    circulars = crawl_recent_pfrda_circulars(limit=limit)
    result = _ingest_regulatory_docs(circulars, regulator="PFRDA", incremental=incremental)
    result["circulars_fetched"] = result.pop("fetched")
    return result


def _ingest_corporate_docs(filings: list[CorporateFiling], exchange: str, incremental: bool = False) -> dict:
    """Shared ingestion body for NSE and BSE corporate filing crawlers."""
    started = time.time()
    if not filings:
        metrics.INGESTION_RESULT.labels(source=exchange.lower(), outcome="failure").inc()
        return {"fetched": 0, "chunks_created": 0, "chunks_skipped": 0,
                "duration_sec": round(time.time() - started, 2)}

    existing_hashes = (
        get_existing_hashes(doc_type="corporate_filing", namespace=config.PUBLIC_NAMESPACE)
        if incremental else set()
    )

    size_cfg = config.CHUNK_SIZES["corporate_filing"]
    all_chunk_texts: list[str] = []
    all_payloads: list[dict] = []
    skipped = 0

    for f in filings:
        scrubbed_text, _ = scrub(f.text, strict=False)
        chunks = chunk_text(
            scrubbed_text,
            size_tokens=size_cfg["size"],
            overlap_tokens=size_cfg["overlap"],
            base_metadata={"doc_title": f.title, "source_url": f.detail_url},
        )
        for c in chunks:
            h = _chunk_hash(c.text)
            if h in existing_hashes:
                skipped += 1
                continue
            all_chunk_texts.append(c.text)
            all_payloads.append({
                "text":           c.text,
                "content_hash":   h,
                "ingested_at":    time.time(),
                "namespace":      config.PUBLIC_NAMESPACE,
                "doc_type":       "corporate_filing",
                "exchange":       f.exchange,
                "company":        f.company,
                "filing_date":    f.date,
                "doc_title":      f.title,
                "source_url":     f.detail_url,
                "finance_category": "corporate",
                **c.metadata,
            })

    chunks_created = 0
    if all_chunk_texts:
        vectors = embed_batch(all_chunk_texts)
        point_ids = upsert_chunks(vectors, all_payloads)
        sqlite_fts.index_chunks(point_ids, all_chunk_texts, all_payloads)
        chunks_created = len(point_ids)
        redis_cache.bump_kb_version()

    metrics.INGESTION_RESULT.labels(source=exchange.lower(), outcome="success").inc()
    return {
        "fetched":        len(filings),
        "chunks_created": chunks_created,
        "chunks_skipped": skipped,
        "incremental":    incremental,
        "duration_sec":   round(time.time() - started, 2),
        "companies":      list({f.company for f in filings}),
    }


def ingest_nse_filings_job(limit: int = 50, incremental: bool = False) -> dict:
    filings = crawl_recent_nse_filings(limit=limit)
    result  = _ingest_corporate_docs(filings, exchange="NSE", incremental=incremental)
    result["filings_fetched"] = result.pop("fetched")
    return result


def ingest_bse_filings_job(limit: int = 50, incremental: bool = False) -> dict:
    filings = crawl_recent_bse_filings(limit=limit)
    result  = _ingest_corporate_docs(filings, exchange="BSE", incremental=incremental)
    result["filings_fetched"] = result.pop("fetched")
    return result


def ingest_news_job(limit_per_feed: int = 20) -> dict:
    """Fetch news from all verified RSS feeds, chunk, embed, and upsert into the public namespace.
    News is always append-only (no delete step) and always incremental: chunks whose
    content_hash is already in Qdrant are skipped, so the every-2h scheduler runs fast
    when feeds haven't published new articles since the last run."""
    started = time.time()

    articles = fetch_all_news(limit_per_feed=limit_per_feed)
    if not articles:
        metrics.INGESTION_RESULT.labels(source="news_rss", outcome="failure").inc()
        return {"articles_fetched": 0, "chunks_created": 0, "chunks_skipped": 0, "duration_sec": 0.0}

    existing_hashes = get_existing_hashes(doc_type="news", namespace=config.PUBLIC_NAMESPACE)

    size_cfg = config.CHUNK_SIZES["news"]
    all_chunk_texts: list[str] = []
    all_payloads: list[dict] = []
    skipped = 0

    for article in articles:
        scrubbed_text, _ = scrub(article.text, strict=False)
        chunks = chunk_text(
            scrubbed_text,
            size_tokens=size_cfg["size"],
            overlap_tokens=size_cfg["overlap"],
            base_metadata={
                "doc_title": article.title,
                "source_url": article.detail_url,
                "finance_category": article.finance_category,
            },
        )
        for c in chunks:
            h = _chunk_hash(c.text)
            if h in existing_hashes:
                skipped += 1
                continue
            all_chunk_texts.append(c.text)
            all_payloads.append({
                "text": c.text,
                "content_hash": h,
                "ingested_at": time.time(),
                "namespace": config.PUBLIC_NAMESPACE,
                "doc_type": "news",
                "source": article.source,
                "doc_title": article.title,
                "source_url": article.detail_url,
                "finance_category": article.finance_category,
                **c.metadata,
            })

    chunks_created = 0
    if all_chunk_texts:
        vectors = embed_batch(all_chunk_texts)
        point_ids = upsert_chunks(vectors, all_payloads)
        sqlite_fts.index_chunks(point_ids, all_chunk_texts, all_payloads)
        chunks_created = len(point_ids)
        redis_cache.bump_kb_version()

    metrics.INGESTION_RESULT.labels(source="news_rss", outcome="success").inc()
    return {
        "articles_fetched": len(articles),
        "chunks_created": chunks_created,
        "chunks_skipped": skipped,
        "duration_sec": round(time.time() - started, 2),
        "sources": list({a.source for a in articles}),
    }
