# FIN-OS RAG — Implementation Phases

> Version: 1.0 | Date: June 20, 2026
> Total estimated timeline: ~9 weeks, solo developer. Each phase is independently shippable.

---

## Phase 1 — Foundation (2 weeks)

**Goal:** Storage, ingestion, and basic embedding working end-to-end for the simplest case.

| Deliverable | Detail |
|---|---|
| Qdrant collection live | `finos_chunks`, 1024-dim, Cosine — see [RAG_KNOWLEDGE_BASE.md](RAG_KNOWLEDGE_BASE.md) §4 |
| Supabase schema migrated | `rag_documents`, `rag_feedback` + RLS |
| `mxbai-embed-large` embedding pipeline | Via Ollama, batch 32 |
| PDF + HTML loaders | PyMuPDF, BeautifulSoup4 |
| `POST /api/ingest/finos-pages` | All 96 FIN-OS pages indexed |
| `POST /api/search` (basic, no rerank/HyDE) | Raw vector search, top-k |
| PII scrubber | presidio, runs before persistence |

**Exit criteria:** Can query "What is the FIRE number?" and get back relevant FIN-OS chunks with correct namespace tagging.

---

## Phase 2 — Core RAG (3 weeks)

**Goal:** Full hybrid retrieval + generation + streaming.

| Deliverable | Detail |
|---|---|
| BM25 sparse index | `bm25s` + SQLite FTS5 |
| RRF fusion | Dense + sparse merge |
| `BGE-reranker-v2-m3` integration | PyTorch MPS, top-40 → top-8 |
| Prompt templates | Indian finance persona, citation instructions, conflict-resolution few-shot |
| `POST /api/query` with SSE streaming | Full pipeline |
| Citation extraction | `[SOURCE_N]` tagging → structured citation objects |
| Redis query cache | 1hr TTL |

**Exit criteria:** Arya can answer a regulatory question end-to-end with citations and streaming, end-to-end latency under 3s P95.

---

## Phase 3 — Knowledge Base Expansion (2 weeks)

**Goal:** Real-world knowledge sources beyond FIN-OS's own content.

| Deliverable | Detail |
|---|---|
| SEBI/RBI/AMFI crawler | APScheduler daily job |
| AMFI NAV + fact sheet ingestion | JSON loader |
| `POST /api/upload` — user document upload | Private namespace, PII scrub strict mode |
| Namespace isolation enforced + tested | Mandatory test from [RAG_EVALUATION.md](RAG_EVALUATION.md) §6 |
| HyDE query expansion | `qwen3:8b` hypothetical-answer generation |
| `SubQuestionQueryEngine` multi-hop | LlamaIndex |
| News RSS ingestion | Every 2 hours |

**Exit criteria:** A user can upload their Form 16 and ask a question that correctly retrieves only their own document, never another user's.

---

## Phase 4 — Arya Integration (1 week)

**Goal:** Wire RAG into the existing Arya UI/agent system.

| Deliverable | Detail |
|---|---|
| 4 new Arya agent tools | `rag_query`, `rag_upload_doc`, `rag_search_regulations`, `rag_explain_statement` |
| `js/arya-rag-ui.js` | Source cards, faithfulness badges, upload widget, feedback buttons |
| `detectRagIntent()` router | Decides when Arya routes to RAG vs. direct Ollama |
| Voice-to-RAG routing (optional) | `voiceagent/agent.py` integration |
| Account-deletion cascade | Extend existing deletion flow to clear `rag_documents`/`rag_feedback`/Qdrant points |

**Exit criteria:** A real user, through the actual Arya sidebar panel (no curl, no admin page), can ask a regulatory question and get a cited, streamed answer.

---

## Phase 5 — Evaluation, Optimization & Monitoring (1 week)

**Goal:** Quality gates and visibility before treating this as production-ready.

| Deliverable | Detail |
|---|---|
| RAGAS suite wired up | Faithfulness, relevancy, context recall |
| 100-question Indian finance benchmark | Versioned, re-run on every retrieval/prompt change |
| Faithfulness/NLI guard live | `cross-encoder/nli-deberta-v3-base` |
| Prometheus `/api/metrics` | Latency histograms, cache hit rate, error counters |
| Grafana dashboard | P50/P95/P99 latency, ingestion volume, error rate |
| `rag_feedback` review workflow | Weekly manual pass |

**Exit criteria:** All targets in [RAG_EVALUATION.md](RAG_EVALUATION.md) met or explicitly tracked as known gaps.

---

## Phase 6 — Scalability Hardening (ongoing)

**Goal:** Production reliability beyond "works on my machine."

| Deliverable | Detail |
|---|---|
| Redis/RQ async ingestion workers | Decouple large batch ingestion from live query latency |
| Webhook-triggered re-index | On FIN-OS content deploy |
| Conflict detection refinement | Old vs. new circular surfacing, tested against real superseded-regulation cases |
| Cloud fallback (Claude API) wired with hard namespace exclusion | Public-namespace-only, per [RAG_SECURITY.md](RAG_SECURITY.md) §1 |
| Qdrant partitioning by namespace | If/when chunk count approaches the 1M mark in [RAG_KNOWLEDGE_BASE.md](RAG_KNOWLEDGE_BASE.md) §5 |
| Cold-start optimization | Index version management, warm-up scripts |

This phase has no fixed end date — it's the maintenance/scale-up track once Phases 1–5 are live.

---

## Dependency Graph

```
Phase 1 (Foundation)
   │
   ▼
Phase 2 (Core RAG) ──────┐
   │                      │
   ▼                      ▼
Phase 3 (KB Expansion)  Phase 5 (Evaluation) — can start once Phase 2 ships
   │                      │
   ▼                      │
Phase 4 (Arya Integration)│
   │                      │
   └──────────┬───────────┘
              ▼
      Phase 6 (Scalability) — ongoing
```

Phases 1+2 (5 weeks) deliver a working, demonstrable RAG system. Phase 5 (evaluation) can run in parallel with Phase 3/4 once Phase 2's pipeline exists, since it only needs a stable `/api/query` endpoint to benchmark against.
