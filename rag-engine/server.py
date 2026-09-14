"""
FIN-OS RAG Engine — FastAPI server.
Port 7476. See docs/RAG_API.md for the full planned endpoint surface.

Phase 1: /api/health, /api/ingest/finos-pages, /api/search (raw vector search)
Phase 2 (this revision): hybrid retrieval (dense+BM25 via RRF) + reranking +
  streaming generation + citations + query cache — /api/query
"""
from __future__ import annotations
import json
import tempfile
import time
import uuid
from pathlib import Path

import httpx
import redis
from rq import Queue
from rq.job import Job
from rq.worker import Worker
from rq.exceptions import NoSuchJobError
from fastapi import FastAPI, HTTPException, Header, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import config
import metrics
import jobs
import scheduler
from storage import conversation
from fastapi import Response
from ingestion.loaders import load_pdf, load_html
from ingestion.chunker import chunk_text
from ingestion.pii import scrub
from embedding.encoder import embed_batch
from storage.qdrant_store import (
    ensure_collection,
    upsert_chunks,
    search,
    collection_size,
    get_client,
)
from storage import sqlite_fts, redis_cache

# RQ needs a raw (non-decode_responses) Redis connection — separate from
# storage/redis_cache.py's client, which decodes to str for the query cache's
# own use. Same Redis server (config.REDIS_HOST/PORT), different connection,
# because RQ pickles job payloads as bytes.
_rq_redis = redis.Redis(host=config.REDIS_HOST, port=config.REDIS_PORT)
_ingest_queue = Queue("rag-ingestion", connection=_rq_redis)
from storage.auth import verify_user_matches, AuthError
from retrieval.hybrid import hybrid_retrieve
from retrieval.multi_hop import multi_hop_retrieve
from retrieval import reranker
from retrieval.reranker import rerank
from generation.prompt import build_prompt
from ingestion.amfi import search_nav
from generation.streamer import stream_generate
from generation.citations import extract_citations
from generation import faithfulness
from generation.faithfulness import check_faithfulness


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return authorization[7:].strip()

app = FastAPI(title="FIN-OS RAG Engine", version="0.3.0-phase4")

# Phase 4: arya-sidebar-panel.js calls this server directly from the browser
# (FIN-OS pages served from Vercel or a local dev server, never this origin).
# Mirrors the exact pattern already used by arya-ai/server.py (port 7475) —
# dev-open, not a new security posture for this project.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    ensure_collection()
    # Phase 6 cold-start fix: the reranker and faithfulness NLI model both
    # lazy-load on first use (~15-25s combined, measured — see docs/RAG_HARDWARE.md
    # §8 and docs/RAG_SETUP.md's troubleshooting table). Paying that cost here,
    # once, at boot, instead of on whichever user's request happens to be first.
    # This makes startup itself slower (~15-25s before /api/health goes "ok"),
    # which is the right tradeoff — start-all.sh already polls /api/health in a
    # loop expecting some startup delay, so this doesn't surprise anything.
    started = time.time()
    reranker._get_model()
    faithfulness._get_model()
    print(f"[startup] reranker + faithfulness models warmed in {time.time() - started:.1f}s")
    scheduler.start_scheduler()


@app.on_event("shutdown")
def _shutdown():
    scheduler.stop_scheduler()


# ── Schemas ──────────────────────────────────────────────────────────────
class SearchRequest(BaseModel):
    query: str
    user_id: str | None = None
    top_k: int = 8


class QueryRequest(BaseModel):
    query: str
    user_id: str | None = None
    session_id: str | None = None  # Phase 7: multi-turn conversation memory (Redis TTL 2h)
    top_k: int = 3  # measured prefill on this M5 is the dominant latency cost
                     # (~200-260 tok/s, not ~2500 — see docs/RAG_HARDWARE.md); fewer
                     # chunks in context directly cuts it. 8 is still available if a
                     # caller explicitly wants broader context at the cost of latency.
    stream: bool = True
    use_hyde: bool = False    # +4-7s; measured no ranking improvement on this corpus
                               # size (187 chunks) — see docs/RAG_PHASES.md Phase 3.
                               # Off by default, available if you want to re-test as
                               # the corpus grows (Phase 3 regulatory ingestion).
    multi_hop: bool = False   # +2-5s even for simple questions (decomposition check
                               # alone costs ~0.4-2s); genuinely helps compound
                               # questions (verified) but not worth the tax otherwise.
    doc_type: str | None = None  # Phase 4: e.g. "regulation" — restricts to that
                                  # doc_type only, lets rag_search_regulations (Arya
                                  # tool) actually differ from rag_query, not just rename it.


# ── Endpoints ────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    status = {"status": "ok", "ollama": "unknown", "qdrant": "unknown", "collection_size": 0}

    try:
        r = httpx.get(f"{config.OLLAMA_BASE_URL}/api/tags", timeout=3.0)
        status["ollama"] = "up" if r.status_code == 200 else "down"
    except Exception:
        status["ollama"] = "down"

    try:
        status["collection_size"] = collection_size()
        status["qdrant"] = "up"
    except Exception:
        status["qdrant"] = "down"

    if status["ollama"] != "up" or status["qdrant"] != "up":
        status["status"] = "degraded"

    # Informational only — does NOT affect overall "status", since a missing
    # worker doesn't break query serving, only ingestion. But it's a real,
    # silent failure mode otherwise: POST /api/ingest/* would happily return
    # job_id="queued" forever with nothing ever processing it. See
    # docs/RAG_SETUP.md for starting `rq worker rag-ingestion`.
    try:
        status["ingest_workers_running"] = len(Worker.all(connection=_rq_redis))
    except Exception:
        status["ingest_workers_running"] = "unknown"

    status["scheduler"] = scheduler.get_scheduler_status()

    return status


@app.get("/api/metrics")
def metrics_endpoint():
    """Prometheus exposition format. See metrics.py — no Grafana stood up alongside this,
    just the scrapeable text endpoint. Phase 5, RAG_PHASES.md."""
    body, content_type = metrics.render()
    return Response(content=body, media_type=content_type)


@app.post("/api/ingest/finos-pages")
def ingest_finos_pages():
    """
    Enqueues a re-index of all FIN-OS HTML pages into the 'public' namespace —
    Phase 6: this used to run inline and block the request for ~18s; now it
    returns immediately and an `rq worker rag-ingestion` process does the work.
    See docs/RAG_API.md and GET /api/ingest/status/{job_id} below.
    """
    job = _ingest_queue.enqueue(jobs.ingest_finos_pages_job, job_timeout="10m")
    return {"job_id": job.id, "status": "queued"}


@app.post("/api/upload")
async def upload_endpoint(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    finance_category: str | None = Form(None),
    authorization: str | None = Header(None),
):
    """
    Ingests a user document into their private namespace (Phase 3).
    See docs/RAG_API.md and docs/RAG_SECURITY.md §3 for the PII-scrub policy this enforces.
    Requires a verified Supabase session token matching user_id — no anonymous uploads.
    """
    # Manual timing, not the @metrics.REQUEST_LATENCY...time() decorator used elsewhere —
    # this endpoint is `async def`, and that decorator's Timer.__call__ does `return
    # func(*args, **kwargs)` inside a sync `with` block, which for a coroutine function
    # returns an unawaited coroutine immediately, recording ~0s instead of real latency.
    _started = time.time()
    try:
        verify_user_matches(_bearer_token(authorization), user_id)
    except AuthError as e:
        raise HTTPException(status_code=403, detail=f"namespace_violation: {e}")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in (".pdf", ".txt", ".md", ".html", ".htm"):
        raise HTTPException(status_code=400, detail=f"unsupported file type: {suffix or '(none)'}")

    raw_bytes = await file.read()
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw_bytes)
        tmp_path = Path(tmp.name)

    try:
        if suffix == ".pdf":
            doc = load_pdf(tmp_path)
        elif suffix in (".html", ".htm"):
            doc = load_html(tmp_path)
        else:
            doc = type("D", (), {})()  # lightweight stand-in for LoadedDocument
            doc.text = raw_bytes.decode("utf-8", errors="ignore")
            doc.title = file.filename or "user document"
    finally:
        tmp_path.unlink(missing_ok=True)

    if not doc.text.strip():
        raise HTTPException(status_code=422, detail="no extractable text found in uploaded file")

    # strict=True: user documents (ITR, Form 16, bank statements) get the strictest
    # PII scrub pass — see docs/RAG_SECURITY.md §3.
    scrubbed_text, redactions = scrub(doc.text, strict=True)

    size_cfg = config.CHUNK_SIZES["user_doc"]
    doc_id = str(uuid.uuid4())
    chunks = chunk_text(
        scrubbed_text,
        size_tokens=size_cfg["size"],
        overlap_tokens=size_cfg["overlap"],
        base_metadata={"doc_title": doc.title, "doc_id": doc_id, "source_filename": file.filename},
    )
    if not chunks:
        raise HTTPException(status_code=422, detail="document produced no chunks after PII scrubbing")

    namespace = config.user_namespace(user_id)
    chunk_texts = [c.text for c in chunks]
    payloads = [
        {
            "text": c.text,
            "namespace": namespace,
            "doc_type": "user_doc",
            "doc_title": doc.title,
            "doc_id": doc_id,
            "finance_category": finance_category,
            **c.metadata,
        }
        for c in chunks
    ]

    vectors = embed_batch(chunk_texts)
    point_ids = upsert_chunks(vectors, payloads)
    sqlite_fts.index_chunks(point_ids, chunk_texts, payloads)
    redis_cache.bump_kb_version()

    metrics.INGESTION_RESULT.labels(source="user_upload", outcome="success").inc()
    metrics.REQUEST_LATENCY.labels(endpoint="upload").observe(time.time() - _started)
    return {
        "doc_id": doc_id,
        "status": "ingested",
        "chunks_created": len(point_ids),
        "pii_redactions": redactions,
        "namespace": namespace,
    }


class CrawlRequest(BaseModel):
    limit: int = 10


@app.post("/api/ingest/sebi-circulars")
def ingest_sebi_circulars(req: CrawlRequest):
    """
    Enqueues a crawl of the SEBI circulars listing (downloads each circular's
    PDF, chunks, embeds, indexes as doc_type='regulation'). Phase 6: async via
    RQ, was inline/blocking. See GET /api/ingest/status/{job_id}.
    """
    job = _ingest_queue.enqueue(jobs.ingest_sebi_circulars_job, req.limit, job_timeout="10m")
    return {"job_id": job.id, "status": "queued"}


@app.post("/api/ingest/rbi-notifications")
def ingest_rbi_notifications(req: CrawlRequest):
    """
    Enqueues a crawl of RBI's notification listing (each PDF fetched directly,
    no intermediate detail page, unlike SEBI). Phase 6: async via RQ, was
    inline/blocking. See GET /api/ingest/status/{job_id}.
    """
    job = _ingest_queue.enqueue(jobs.ingest_rbi_notifications_job, req.limit, job_timeout="10m")
    return {"job_id": job.id, "status": "queued"}


@app.post("/api/ingest/irdai-circulars")
def ingest_irdai_circulars(req: CrawlRequest):
    """Enqueues a crawl of IRDAI's circular listing (https://irdai.gov.in/circulars).
    PDFs download directly from the listing row's td[5] link — no detail-page hop.
    Verified live July 17 2026: real PDF downloads cleanly at ~360KB, 17K chars of text."""
    job = _ingest_queue.enqueue(jobs.ingest_irdai_circulars_job, req.limit, job_timeout="10m")
    return {"job_id": job.id, "status": "queued"}


@app.post("/api/ingest/pfrda-circulars")
def ingest_pfrda_circulars(req: CrawlRequest):
    """Enqueues a crawl of PFRDA's circular listing (https://pfrda.org.in/regulatory-framework/circulars).
    Each circular links to a detail page with a single PDF link. Verified live July 17 2026."""
    job = _ingest_queue.enqueue(jobs.ingest_pfrda_circulars_job, req.limit, job_timeout="10m")
    return {"job_id": job.id, "status": "queued"}


@app.post("/api/ingest/nse-filings")
def ingest_nse_filings(req: CrawlRequest):
    """
    Enqueues a crawl of recent NSE corporate announcements.
    Uses NSE's /api/home-corporate-announcements endpoint (session-cookie auth handled
    internally, same pattern as arya-ai's market data layer). Announcement subject
    text — not PDF downloads — is indexed for retrieval (see ingestion/corporate.py).
    Verified endpoint pattern: arya-ai/data/news.py get_announcements() uses the same path.
    """
    job = _ingest_queue.enqueue(jobs.ingest_nse_filings_job, req.limit, job_timeout="5m")
    return {"job_id": job.id, "status": "queued"}


@app.post("/api/ingest/bse-filings")
def ingest_bse_filings(req: CrawlRequest):
    """
    Enqueues a crawl of recent BSE corporate announcements from api.bseindia.com.
    No session cookie required — BSE's AnnSubCategoryGetData endpoint accepts requests
    with a Referer header. Uses a 7-day rolling window (strPrevDate/strToDate params).
    Announcement headline text indexed for retrieval (see ingestion/corporate.py).
    """
    job = _ingest_queue.enqueue(jobs.ingest_bse_filings_job, req.limit, job_timeout="5m")
    return {"job_id": job.id, "status": "queued"}


@app.post("/api/ingest/news")
def ingest_news():
    """Enqueues a news RSS fetch from 5 verified Indian financial news feeds
    (Mint Markets, Mint Money, MoneyControl, NDTV Profit, Hindu Business Line).
    Fetches up to 20 articles per feed, deduplicates by title, chunks at 200 tokens.
    Verified live July 17 2026: 4 of 5 feeds return 18–60 articles each."""
    job = _ingest_queue.enqueue(jobs.ingest_news_job, job_timeout="5m")
    return {"job_id": job.id, "status": "queued"}


@app.get("/api/ingest/status/{job_id}")
def ingest_status(job_id: str):
    """Poll an ingestion job enqueued by one of the three endpoints above."""
    try:
        job = Job.fetch(job_id, connection=_rq_redis)
    except NoSuchJobError:
        raise HTTPException(status_code=404, detail=f"no such job: {job_id}")

    response = {"job_id": job_id, "status": job.get_status()}
    if job.is_finished:
        response["result"] = job.return_value()
    elif job.is_failed:
        response["error"] = str(job.exc_info).splitlines()[-1] if job.exc_info else "unknown error"
    return response


@app.post("/api/search")
@metrics.REQUEST_LATENCY.labels(endpoint="search").time()
def search_endpoint(req: SearchRequest, authorization: str | None = Header(None)):
    """Raw vector search — no rerank, no HyDE, no generation. Phase 1 scope.
    Auth check added Phase 3 — this endpoint accepts user_id same as /api/query and
    had the same namespace_violation exposure until this was wired in."""
    try:
        verify_user_matches(_bearer_token(authorization), req.user_id)
    except AuthError as e:
        raise HTTPException(status_code=403, detail=f"namespace_violation: {e}")

    query_vec = embed_batch([req.query])[0]
    results = search(query_vec, user_id=req.user_id, top_k=req.top_k)
    return {"query": req.query, "results": results}


def _retrieve_and_rerank(
    query: str, user_id: str | None, top_k: int, use_hyde: bool = False, multi_hop: bool = False, doc_type: str | None = None
) -> tuple[list[dict], list[str]]:
    """Shared by both streaming and non-streaming /api/query paths.
    See docs/RAG_PIPELINE.md Layer 5: hybrid retrieve (dense+BM25 via RRF) -> rerank.
    Returns (ranked_chunks, sub_questions) — sub_questions is [query] unless multi_hop
    decomposition actually found a compound question."""
    if multi_hop:
        sub_questions, merged = multi_hop_retrieve(query, user_id=user_id, top_k_per_hop=max(2, top_k // 2 or 1))
        return merged[:top_k], sub_questions

    candidates = hybrid_retrieve(query, user_id=user_id, dense_k=10, sparse_k=10, use_hyde=use_hyde, doc_type=doc_type)
    return rerank(query, candidates, top_k=top_k), [query]


@app.post("/api/retrieve")
@metrics.REQUEST_LATENCY.labels(endpoint="retrieve").time()
def retrieve_endpoint(req: QueryRequest, authorization: str | None = Header(None)):
    """
    Phase 4 — hybrid retrieve + rerank with NO generation step. Built for
    js/arya-sidebar-panel.js's main Chat tab: that tab makes a single direct
    Ollama call per message (see sendMessage()/streamFromOllama() — it does not
    use the AgentTools/ReAct loop at all, that's a separate "Agent" tab). Rather
    than running a second full LLM generation here, this returns just the
    ranked chunks so the frontend can inject them as context into the ONE
    Ollama call the main chat already makes — see RAG_INTEGRATION.md for why
    this differs from the original (speculative) design.
    """
    try:
        verify_user_matches(_bearer_token(authorization), req.user_id)
    except AuthError as e:
        raise HTTPException(status_code=403, detail=f"namespace_violation: {e}")

    ranked_chunks, _ = _retrieve_and_rerank(req.query, req.user_id, req.top_k, use_hyde=req.use_hyde, doc_type=req.doc_type)
    return {
        "query": req.query,
        "chunks": [
            {
                "text": c["payload"].get("text", ""),
                "doc_title": c["payload"].get("doc_title", "Unknown"),
                "doc_type": c["payload"].get("doc_type", "unknown"),
                "section_heading": c["payload"].get("section_heading", ""),
                "source": c["payload"].get("source_path") or c["payload"].get("source_url"),
            }
            for c in ranked_chunks
        ],
    }


@app.post("/api/query")
def query_endpoint(req: QueryRequest, authorization: str | None = Header(None)):
    """
    Full RAG pipeline per docs/RAG_API.md: hybrid retrieve -> rerank -> generate -> citations.
    HyDE/query-rewrite and multi-hop sub-questions are Phase 3 scope (docs/RAG_PHASES.md).

    Auth (Phase 3, see docs/RAG_SECURITY.md §4): if `user_id` is set, the request must
    carry a Supabase session token (Authorization: Bearer <token>) verified to belong
    to that exact user_id, via Supabase Auth's /auth/v1/user endpoint. Public-only
    queries (user_id=None) require no auth — this closes the previously-documented gap
    where any caller could pass any user_id and read that namespace.
    """
    try:
        verify_user_matches(_bearer_token(authorization), req.user_id)
    except AuthError as e:
        raise HTTPException(status_code=403, detail=f"namespace_violation: {e}")

    started = time.time()

    if not req.stream:
        cached = redis_cache.get_cached(req.query, req.user_id)
        if cached:
            cached["cache_hit"] = True
            metrics.CACHE_HITS.inc()
            metrics.REQUEST_LATENCY.labels(endpoint="query_cached").observe(time.time() - started)
            return cached
        metrics.CACHE_MISSES.inc()

    # Phase 7: load conversation history for multi-turn context
    history = conversation.get_history(req.session_id) if req.session_id else []

    ranked_chunks, sub_questions = _retrieve_and_rerank(
        req.query, req.user_id, req.top_k, use_hyde=req.use_hyde, multi_hop=req.multi_hop, doc_type=req.doc_type
    )
    prompt = build_prompt(req.query, ranked_chunks, history=history)

    if req.stream:
        # Manual timing, recorded when the generator actually finishes — not via the
        # @metrics...time() decorator used on sync endpoints elsewhere. A decorator on
        # query_endpoint itself would only measure how long it takes to construct and
        # return this StreamingResponse object (near-instant); the generator below runs
        # lazily, after the response has already been returned to the caller.
        def event_stream():
            full_answer = []
            for token in stream_generate(prompt):
                full_answer.append(token)
                yield f"event: token\ndata: {json.dumps({'text': token})}\n\n"

            answer_text = "".join(full_answer)
            if req.session_id:
                conversation.append_turn(req.session_id, req.query, answer_text)
            citations = extract_citations(answer_text, ranked_chunks)
            yield f"event: citations\ndata: {json.dumps({'sources': citations})}\n\n"
            flagged = check_faithfulness(answer_text, ranked_chunks)
            metrics.FAITHFULNESS_FLAGS.inc(len(flagged))
            yield f"event: faithfulness\ndata: {json.dumps({'flagged_sentences': flagged})}\n\n"
            metrics.REQUEST_LATENCY.labels(endpoint="query_stream").observe(time.time() - started)
            if len(sub_questions) > 1:
                yield f"event: sub_questions\ndata: {json.dumps({'questions': sub_questions})}\n\n"
            yield f"event: done\ndata: {{}}\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    answer_text = "".join(stream_generate(prompt))
    if req.session_id:
        conversation.append_turn(req.session_id, req.query, answer_text)
    citations = extract_citations(answer_text, ranked_chunks)
    flagged_sentences = check_faithfulness(answer_text, ranked_chunks)
    metrics.FAITHFULNESS_FLAGS.inc(len(flagged_sentences))
    metrics.REQUEST_LATENCY.labels(endpoint="query").observe(time.time() - started)
    result = {
        "answer": answer_text,
        "citations": citations,
        "flagged_sentences": flagged_sentences,
        "latency_ms": round((time.time() - started) * 1000),
        "retrieval_count": len(ranked_chunks),
        "cache_hit": False,
        "sub_questions": sub_questions if len(sub_questions) > 1 else None,
    }
    redis_cache.set_cached(req.query, req.user_id, result)
    return result


@app.get("/api/amfi/nav")
def amfi_nav_endpoint(q: str, top_k: int = 5):
    """
    Live AMFI NAV lookup — fetches https://www.amfiindia.com/spages/NAVAll.txt
    (cached 1h, updated daily by AMFI) and returns fuzzy-matched fund records.
    No auth required — AMFI data is public.

    Example: GET /api/amfi/nav?q=sbi+bluechip&top_k=3
    """
    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="q parameter required")
    try:
        results = search_nav(q.strip(), top_k=min(top_k, 20))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AMFI fetch failed: {e}")
    return {
        "query": q,
        "results": [
            {
                "scheme_code": r.scheme_code,
                "scheme_name": r.scheme_name,
                "nav": r.nav,
                "date": r.date,
                "isin_growth": r.isin_growth,
                "isin_div":    r.isin_div,
                "match_score": r.score,
            }
            for r in results
        ],
    }


class FeedbackRequest(BaseModel):
    query: str
    answer: str        # first 200 chars stored as excerpt
    vote: str          # "up" or "down"
    session_id: str | None = None
    comment: str | None = None


@app.post("/api/feedback")
def feedback_endpoint(req: FeedbackRequest):
    """
    Record a user thumbs-up / thumbs-down on a RAG answer. Phase 7.

    Stored in Redis at key `rag:feedback:{ts}:{session_id}`, TTL 30 days,
    so a weekly evaluation batch can read recent feedback without unbounded
    growth. GET /api/feedback/summary aggregates across all stored keys.
    """
    if req.vote not in ("up", "down"):
        raise HTTPException(status_code=400, detail="vote must be 'up' or 'down'")

    client = redis_cache.get_client()
    record = {
        "query": req.query,
        "answer_excerpt": req.answer[:200],
        "vote": req.vote,
        "session_id": req.session_id,
        "comment": req.comment,
        "ts": time.time(),
    }
    key = f"rag:feedback:{int(time.time())}:{req.session_id or 'anon'}"
    client.set(key, json.dumps(record), ex=86400 * 30)

    metrics.FEEDBACK_VOTES.labels(vote=req.vote).inc()
    return {"status": "recorded"}


@app.get("/api/feedback/summary")
def feedback_summary():
    """
    Aggregate all stored feedback records (last 30 days).
    Returns counts by vote and the 20 most-recent entries for inspection.
    """
    client = redis_cache.get_client()
    keys = client.keys("rag:feedback:*")
    records = []
    for k in keys:
        raw = client.get(k)
        if raw:
            try:
                records.append(json.loads(raw))
            except Exception:
                pass

    records.sort(key=lambda r: r.get("ts", 0), reverse=True)
    up   = sum(1 for r in records if r.get("vote") == "up")
    down = sum(1 for r in records if r.get("vote") == "down")
    return {
        "total": len(records),
        "up": up,
        "down": down,
        "approval_rate": round(up / len(records), 3) if records else None,
        "recent": records[:20],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=config.SERVER_PORT)
