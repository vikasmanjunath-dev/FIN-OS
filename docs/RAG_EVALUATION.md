# FIN-OS RAG — Evaluation & Benchmarking Reference

> Version: 1.4 | Date: June 21, 2026 (Phase 5: the Indian finance benchmark is now built — 10 real questions, 90% passing, see §7. RAGAS was attempted and genuinely abandoned, not just deferred — see §7a for why. Grafana remains not built by deliberate choice, not an open gap)
> Tooling: a real namespace isolation pytest + a 10-question Indian finance benchmark + Prometheus metrics (no RAGAS — tried, hit an upstream packaging bug; no Grafana — deliberate)

**Latency targets below were pre-build estimates.** Phase 2 implementation measured this M5's real prefill/decode throughput at roughly 7-10x slower than generically assumed (likely a base M5, not Pro/Max — see [RAG_HARDWARE.md](RAG_HARDWARE.md) §4 for the full measured comparison). Revised, hardware-honest targets: **retrieval ≤2.5 sec P95** (was 400ms), **E2E ≤8 sec P95 cache-miss / <50ms cache-hit** (was 2 sec). Streaming TTFT (2.6-8 sec measured) is the more meaningful smoothness metric than total E2E time on this hardware.

---

## 1. Retrieval Metrics

| Metric | Target | Definition |
|---|---|---|
| Hit Rate@5 | ≥ 0.85 | Fraction of queries where a relevant chunk appears in top-5 |
| MRR (Mean Reciprocal Rank) | ≥ 0.80 | Average of 1/rank of the first relevant chunk |
| NDCG@10 | ≥ 0.75 | Rank-weighted relevance quality of top-10 |
| Context Precision | ≥ 0.80 | Fraction of retrieved chunks that are actually relevant |
| Context Recall | ≥ 0.82 | Fraction of all relevant chunks that were retrieved |
| Latency P95 (retrieval + rerank) | **≤ 2.5 sec (revised; was ≤400ms)** | End-to-end through Layer 5 including reranking, excluding generation — measured ~1.1-2.5s with max_length=256 |

## 2. Generation Metrics (RAGAS)

| Metric | Target | Definition |
|---|---|---|
| Faithfulness | ≥ 0.90 (target — **not confidently met**, see Phase 5 caveat below) | Fraction of claims in the answer supported by retrieved context |
| Answer Relevancy | ≥ 0.85 | How directly the answer addresses the question |
| Answer Correctness | ≥ 0.80 | Compared against a curated ground-truth answer set |
| Hallucination Rate | ≤ 3% (per the NLI guard's own flags — see reliability caveat in [RAG_PHASES.md](RAG_PHASES.md) Phase 5) | Fraction of generated sentences failing the NLI entailment check |
| Citation Coverage | ≥ 95% | Fraction of factual sentences carrying a `[SOURCE_N]` tag |
| E2E Latency P95 | **≤ 8 sec cache-miss, <50ms cache-hit (revised; was ≤2 sec)** | Full pipeline, query to complete answer — measured 6-8s typical on this M5 post-optimization |
| Streaming TTFT | ≤ 8 sec, typically 2.6 sec | Time to first streamed token — the more representative "feels smooth" metric on this hardware |

## 3. Indian Finance Accuracy Benchmark

A curated 100-question test set spanning the domains FIN-OS actually serves, run after every retrieval/prompt change.

| Category | Target accuracy | Example question |
|---|---|---|
| Tax slab accuracy | 100% | "What's the tax on ₹12L income under the new regime?" |
| SEBI regulation Q&A | ≥ 90% | "What's the current TER cap for equity mutual funds?" |
| SIP/ELSS rules | ≥ 95% | "What's the lock-in period for ELSS investments?" |
| ITR form guidance | ≥ 88% | "Which ITR form do I use if I have capital gains and salary income?" |
| ₹ number format (L/Cr/K) | 100% | Any answer containing a rupee amount must render in L/Cr/K, never raw digits |
| Outdated circular detection | ≥ 85% | Questions deliberately referencing a superseded regulation — system must flag it |

The 100-question set is versioned in `rag-engine/evaluation/benchmark.py` and re-run as a regression gate before any change to chunking strategy, retrieval parameters, or prompt templates ships.

## 4. System Reliability Metrics

| Metric | Target |
|---|---|
| Ingestion success rate | ≥ 99% |
| Namespace isolation | 0 cross-user leaks (hard requirement, tested explicitly — see §6) |
| Cache hit rate | ≥ 40% |
| Uptime (local service) | ≥ 99.5% |
| PII detection rate | ≥ 99% |
| Daily re-index job success | ≥ 99% |

## 5. Tooling

- **RAGAS** (`pip install ragas`) — computes faithfulness, answer relevancy, context precision/recall against the benchmark set
- **Custom benchmark runner** (`rag-engine/evaluation/benchmark.py`) — runs the 100-question Indian finance set, diffs against the last passing run, fails CI-equivalent local check on regression
- **Prometheus** — `rag-engine` exposes `/api/metrics`; tracks request latency histograms (per pipeline stage), cache hit/miss counters, ingestion job success/failure counters
- **Grafana** — local dashboard reading from Prometheus; panels for P50/P95/P99 latency per stage, daily ingestion volume, error rate, cache hit rate trend
- **`rag_feedback` review** — weekly manual pass over all thumbs-down entries (see [RAG_KNOWLEDGE_BASE.md](RAG_KNOWLEDGE_BASE.md) §3); patterns in feedback notes drive targeted fixes (e.g., repeated "wrong tax regime" feedback → prompt template fix)

## 6. Namespace Isolation Test (mandatory, run before every deploy) — ✅ Built (Phase 5)

**Built for real** as `rag-engine/evaluation/test_namespace_isolation.py` — the sketch originally here (`upload_test_document`, `query_rag`, `doc_id` checks) was speculative and didn't match the actual storage API; replaced with the real implementation, which seeds one chunk directly into `user:{uuid}` namespace via `upsert_chunks`/`sqlite_fts.index_chunks` (the actual functions that exist), and checks retrieval via `hybrid_retrieve` (also actual):

```python
# rag-engine/evaluation/test_namespace_isolation.py — actual code, not a sketch
@pytest.fixture
def seeded_private_chunk():
    namespace = config.user_namespace(_USER_A)
    text = f"This is a private test document containing {_MARKER} for automated testing."
    vec = embed_batch([text])[0]
    payload = {"text": text, "namespace": namespace, "doc_type": _DOC_TYPE, "doc_title": "Pytest Isolation Test Doc"}
    point_ids = upsert_chunks([vec], [payload])
    sqlite_fts.index_chunks(point_ids, [text], [payload])
    yield
    delete_by_doc_type(_DOC_TYPE)          # self-cleaning — doesn't pollute the real corpus
    sqlite_fts.delete_by_doc_type(_DOC_TYPE)

def test_owner_can_retrieve_own_document(seeded_private_chunk):
    assert _marker_present(_USER_A) is True

def test_other_user_cannot_retrieve_it(seeded_private_chunk):
    assert _marker_present(_USER_B) is False

def test_anonymous_cannot_retrieve_it(seeded_private_chunk):
    assert _marker_present(None) is False
```

**Real run output:** `pytest evaluation/test_namespace_isolation.py -v` → `3 passed in 1.39s`. Confirmed self-cleaning: collection size unchanged before/after (`398` chunks both times, at the point this test was run — re-running it today would show `508` before/after instead, see [RAG_KNOWLEDGE_BASE.md](RAG_KNOWLEDGE_BASE.md) for why the total moved with zero new content; the test's self-cleaning guarantee is unaffected either way, since it asserts "unchanged," not a specific number).

Run it: `cd rag-engine && source .venv/bin/activate && pytest evaluation/test_namespace_isolation.py -v`

This is treated as a security regression test, not a normal unit test — a failure here blocks all other work until fixed.

## 7. Indian Finance Benchmark — ✅ Built, scoped to 10 real questions (not the originally-planned 100)

`rag-engine/evaluation/benchmark.py`. The originally-planned 100-question set was never authored at that size — instead, every question here was built by first retrieving real source text via `storage.sqlite_fts.search()`, confirming an exact fact in it, then writing a question whose answer is checked by substring match against that confirmed fact. No question's ground truth was assumed from memory or fabricated. Covers both `finos_page` (FIN-OS's own tax/insurance content) and `regulation` (real SEBI/RBI text) sources, plus one deliberately compound question.

Run: `cd rag-engine && source .venv/bin/activate && python3 evaluation/benchmark.py`

**Real measured result: 9/10 (90%).** The one failure is a genuine, informative finding, not benchmark noise:

> *"How is insurance cover calculated, and what is the NPS 80CCD(1B) deduction limit?"* — expected the answer to mention both "Total Debt" (the term-cover formula) and "₹50,000" (the NPS deduction). Got the NPS part right but answered the insurance-cover part from the wrong source: it described the ₹1L Section 80D *health insurance tax deduction* instead of the `Cover = (Annual Income × 20) + Total Debt` term-insurance-sizing formula.

**Root-caused, not just observed.** Inspected the actual retrieved chunks directly (bypassing generation): the correct Shield Protocol chunk (`Cover = (Annual Income × 20) + Total Debt`) **was** retrieved, ranked first, and present in the context sent to the model — multi-hop decomposition and retrieval both worked correctly. The failure is in **generation**: one of the four retrieved chunks is FIN-OS's tax-deductions-checklist page, which contains the line *"🏥 Health Insurance — 80D saves up to ₹1L. Cover parents too"* — and `qwen3:8b` answered "insurance cover" from that chunk's literal use of the word "Cover" instead of the Shield Protocol chunk's actual cover-sizing formula. This is a real model-quality limitation (lexical ambiguity across chunks, not a retrieval bug) — confirmed by testing the same sub-question in isolation, where it answers correctly every time. Not fixed this pass; documented as a genuine finding rather than silently re-rolling the question until it passed. See [RAG_PHASES.md](RAG_PHASES.md) Phase 5 for the full investigation trail.

## 7a. RAGAS — ❌ attempted, genuinely abandoned (not the same as "not gotten to yet")

`pip install ragas` (0.4.3, latest) pulled in `langchain`, `langgraph`, `instructor`, `datasets`, and the OpenAI SDK, then **failed to import**: `ragas/llms/base.py` does an unconditional `from langchain_community.chat_models.vertexai import ChatVertexAI`, and that submodule doesn't exist in the `langchain-community` version ragas itself pulled in (which prints its own "being sunset, no longer actively maintained" deprecation warning). This is an upstream bug in ragas's own packaging — found before ever reaching the actual question this was meant to test (can RAGAS run against local Ollama instead of OpenAI).

Tried the obvious fix: `pip install langchain-google-vertexai`. This pulled in **Google Cloud's entire AI Platform SDK** (`google-cloud-aiplatform`, `google-cloud-bigquery`, `google-cloud-storage`, and ~20 more packages) and **still didn't fix the import** — same error, identical traceback. It also silently bumped `cryptography` from 44.0.3 to 49.0.0, breaking `presidio-anonymizer`'s pinned `cryptography<44.1` requirement (presidio still worked when re-tested, but the version conflict was real, confirmed via `pip check`, not hypothetical).

Reverted everything: uninstalled ragas and the full transitive chain it pulled in, restored `cryptography==44.0.3`, confirmed `pip check` reports no broken requirements, and re-verified presidio still scrubs PAN/Aadhaar correctly afterward. `requirements.txt` does not list `ragas` — it was never in a state worth pinning.

**This is not "RAGAS doesn't support Ollama."** That question was never reached. The finding is narrower and more basic: this specific ragas release doesn't cleanly import in a normal Python 3.12 environment without pulling in an unrelated cloud SDK, and even then doesn't fix itself. Worth retrying with a different ragas version or after an upstream fix — not worth forcing further right now.

## 8. Prometheus Metrics (`GET /api/metrics`) — ✅ Built, Phase 5

`rag-engine/metrics.py` + a `/api/metrics` endpoint in `server.py`. Plain Prometheus exposition format — `prometheus-client`, no Grafana server stood up alongside it (deliberate scope call, see [RAG_PHASES.md](RAG_PHASES.md) Phase 5).

**Metrics exposed:**
| Metric | Type | Labels | What it tracks |
|---|---|---|---|
| `rag_request_latency_seconds` | Histogram | `endpoint` (`query`, `query_cached`, `query_stream`, `retrieve`, `search`, `upload`, `ingest_finos_pages`, `ingest_sebi_circulars`, `ingest_rbi_notifications`) | End-to-end latency. Streaming and async endpoints are timed manually rather than via the `.time()` decorator — see the code comments in `server.py` for why (the decorator would record near-zero time for both, for different reasons) |
| `rag_cache_hits_total` / `rag_cache_misses_total` | Counter | — | Redis cache hit/miss on `/api/query` (non-streaming only — the streaming path doesn't check cache) |
| `rag_ingestion_total` | Counter | `source`, `outcome` | Ingestion attempts by source (`finos_pages`, `sebi`, `rbi`, `user_upload`) and outcome (`success`/`failure`) |
| `rag_faithfulness_flagged_sentences_total` | Counter | — | Running count of sentences flagged by the NLI guard — an operational signal, not a quality score given the guard's known domain-reliability gap (see [RAG_PHASES.md](RAG_PHASES.md) Phase 5) |

**Real captured sample**, after one cache-miss query, one cache-hit repeat of the same query, and one finos-pages re-ingestion:
```
rag_request_latency_seconds_sum{endpoint="query"} 17.12339...      # cache miss, full pipeline
rag_request_latency_seconds_sum{endpoint="query_cached"} 0.00207...  # cache hit — ~8000x faster
rag_cache_hits_total 1.0
rag_cache_misses_total 1.0
rag_ingestion_total{outcome="success",source="finos_pages"} 1.0
rag_faithfulness_flagged_sentences_total 0.0
```
The cache-hit/cache-miss latency gap above (17.1s vs. 2ms) is the same finding documented qualitatively in [RAG_HARDWARE.md](RAG_HARDWARE.md) §4 ("cache hits are the real win for daily-use smoothness") — now with a number attached, and now continuously measurable rather than spot-checked.

## 9. Evaluation Cadence

| Check | Frequency |
|---|---|
| Namespace isolation test | Every code change to `retrieval/` or `storage/` |
| Indian finance benchmark | Every change to chunking, retrieval params, or prompts |
| Full RAGAS suite | Weekly, once built — see [RAG_PHASES.md](RAG_PHASES.md) Phase 5 for current status |
| `/api/metrics` check | Anytime — it's a live endpoint, not a scheduled job. No dashboard automates this; `curl`/a Prometheus scraper if you want it polled |
| `rag_feedback` manual review | Blocked — table doesn't exist, see [RAG_KNOWLEDGE_BASE.md](RAG_KNOWLEDGE_BASE.md) §3 |
