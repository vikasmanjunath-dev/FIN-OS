# FIN-OS — RAG System (Master Reference)

> Version: 1.2 | Date: June 21, 2026 | Status: **Phases 1-5 built and verified** (Foundation, Core RAG, Knowledge Base Expansion, Arya Integration, Evaluation). This master reference had gone stale at Phase 2 while the linked sub-documents kept moving — corrected here. See [RAG_PHASES.md](RAG_PHASES.md) for the exact, honest per-phase status and what's genuinely still open.
> Target hardware: Apple M5 · 24 GB unified memory · 1 TB SSD (solo-dev local machine) — likely base M5, not Pro/Max; see [RAG_HARDWARE.md](RAG_HARDWARE.md) §4 for measured-vs-estimated performance

---

## What This Is

A fully local Retrieval-Augmented Generation engine that gives Arya grounded, cited answers with a (measurably imperfect) hallucination check, over: live SEBI circulars and RBI notifications, the user's own uploaded financial documents, and all 94 FIN-OS pages' content. AMFI, fund fact sheets, and daily news are not built — see Status below. No cloud API dependency at all, not just "by default" — there is no fallback path to one.

This document is the master index. Each subsystem has its own detailed reference:

| Document | Covers |
|---|---|
| [RAG_HARDWARE.md](RAG_HARDWARE.md) | M5 24GB RAM map, storage budget, performance targets, start script |
| [RAG_PIPELINE.md](RAG_PIPELINE.md) | The 6-layer pipeline — ingestion → chunking → embedding → storage → retrieval → generation |
| [RAG_MODELS.md](RAG_MODELS.md) | Every model used, exact configs, Ollama pull commands, benchmarks |
| [RAG_KNOWLEDGE_BASE.md](RAG_KNOWLEDGE_BASE.md) | All knowledge sources, namespace design, Supabase schema |
| [RAG_API.md](RAG_API.md) | Full FastAPI endpoint reference for `rag-engine` (port 7476) |
| [RAG_INTEGRATION.md](RAG_INTEGRATION.md) | How this wires into Arya, document-ai, finos-context.js |
| [RAG_SECURITY.md](RAG_SECURITY.md) | RLS, PII scrubbing, namespace isolation, threat model |
| [RAG_EVALUATION.md](RAG_EVALUATION.md) | RAGAS metrics, Indian-finance accuracy benchmark, targets |
| [RAG_SETUP.md](RAG_SETUP.md) | Exact commands to install and run the full stack from scratch |
| [RAG_PHASES.md](RAG_PHASES.md) | 6-phase build plan with durations and deliverables |

---

## Why FIN-OS Needs This

Arya today (`arya-sidebar-panel.js`, see [ARYA_AI.md](ARYA_AI.md)) answers from the LLM's parametric knowledge plus whatever context is manually assembled per page (`finos-context.js`). It cannot:

- Quote the actual text of a SEBI circular or IT Act section
- Read a user's uploaded ITR, Form 16, or CAS statement
- Tell the user definitively whether a regulation is still current
- Cite a source for any claim it makes
- Detect when it's making something up

RAG fixes all five by grounding generation in retrieved, indexed, namespace-isolated documents — with a faithfulness check on the output.

---

## Design Decisions (locked)

| Decision | Choice | Reason / Status |
|---|---|---|
| Orchestration framework | ~~LlamaIndex 0.10+~~ → **Direct Python** (FastAPI + custom modules) | **Changed in Phase 2 build, never revisited.** LlamaIndex was the original plan; the actual implementation uses direct `qdrant_client`/`sqlite3`/`httpx` calls instead — simpler, fewer dependencies, and proved sufficient even through Phase 3's multi-hop need (`retrieval/multi_hop.py` is a plain `qwen3:8b` decomposition call, no `SubQuestionQueryEngine` needed). |
| Embedding model | `mxbai-embed-large` via Ollama | 1024-dim, Metal-accelerated, zero extra ML framework. ✅ Built, confirmed working |
| Vector store | Qdrant (local binary) | Fastest local HNSW; no network hop (vs. Supabase pgvector). ✅ Built — note: no Homebrew formula exists, installed from official GitHub release binary |
| Sparse index | SQLite FTS5 native `bm25()`, table name `chunks_fts` | Zero extra service; exact-match for section numbers like "80CCD(1B)". ✅ Built — verified namespace isolation, including by a real passing pytest (Phase 5, see [RAG_EVALUATION.md](RAG_EVALUATION.md) §6) |
| Reranker | BGE-reranker-v2-m3 (PyTorch MPS) | Cross-encoder re-score of up to 20 RRF-fused candidates → top-3 by default. ✅ Built — found & fixed a real MPS device-placement bug. Disk footprint is 2.1GB measured (an earlier 590MB estimate was wrong). |
| LLM (generation) | **`qwen3:8b`** via Ollama (changed from `qwen3:14b` in Phase 2) | ~2x faster decode (~20 vs ~7-11 tok/s measured) with acceptable quality for grounded, citation-constrained answers. ✅ Built |
| LLM (fast/utility) | `qwen3:8b` via Ollama | Query rewrite, HyDE, sub-question decomposition. ✅ **Built and wired** (Phase 3) — `retrieval/hyde.py`, `retrieval/multi_hop.py`, both opt-in per-request. This row sat marked "not yet wired" for two phases past the fix that made it wrong; corrected here. |
| Faithfulness guard | `cross-encoder/nli-deberta-v3-base` (PyTorch MPS) | Post-generation NLI entailment check per cited sentence. 🟡 **Built** (Phase 5) — but measurably unreliable on real Indian regulatory/financial text (flags some correct paraphrases as non-entailment). Treat as a noisy review signal, not a trustworthy gate — see [RAG_PHASES.md](RAG_PHASES.md) Phase 5. |
| Cloud fallback | ~~Claude Sonnet 4.6 (API)~~ | ❌ **Never built.** [RAG_PHASES.md](RAG_PHASES.md)'s open-ended Phase 6 wishlist still lists this as a candidate idea for someday — but it's unscheduled, not in progress, and no Anthropic API call exists anywhere in `rag-engine` today. The system has zero cloud LLM dependency right now, full stop; earlier drafts of this and other docs overstated this as more concretely "planned" than it actually is. |
| API server | FastAPI, port **7476** | `rag-engine/` module; clear of all existing ports; CORS-enabled for direct browser calls (Phase 4). ✅ Built |
| Metadata + user store | Supabase (existing project) | `rag_documents`, `rag_feedback` tables; RLS reused from existing auth. ❌ **Still not built** — `schema.sql` was written in Phase 3 but never applied (no DB credentials available). This gap has now persisted across Phases 1-5 without blocking anything; namespace isolation works fine without it (enforced at the Qdrant/SQLite query level instead). |
| Session auth | Supabase Auth REST API (`/auth/v1/user`) | ✅ **Built** (Phase 3) — verifies live session tokens, not local JWT decoding. 60s in-process cache. See [RAG_SECURITY.md](RAG_SECURITY.md) §4. |
| Containerization | None | Native Apple Silicon binaries only — no Docker, no Rosetta. ✅ Confirmed |

---

## The 6-Layer Pipeline (summary — full detail in [RAG_PIPELINE.md](RAG_PIPELINE.md))

```
1. INGESTION    PDF/HTML loaders (PyMuPDF/BeautifulSoup) → PII scrub (presidio + PAN/Aadhaar regex)
                Sources: 94 FIN-OS pages, live SEBI circulars, live RBI notifications
2. CHUNKING     Sentence-boundary packing + a hard 1200-char ceiling backstop
                (added after dense regulatory tables broke the embedding model's token limit)
3. EMBEDDING    mxbai-embed-large (dense, 1024-dim) via Ollama — no separate BM25s package;
                sparse indexing is native SQLite FTS5 bm25(), done at storage time instead
4. STORAGE      Qdrant (vectors) + SQLite FTS5 (keyword, table `chunks_fts`) — NOT Supabase;
                metadata/raw-file storage in Supabase was planned, never applied
5. RETRIEVAL    Dense top-10 + BM25 top-10 → RRF fusion → rerank → top-3 by default
                Optional: HyDE (use_hyde), multi-hop decomposition (multi_hop) — both built, opt-in
6. GENERATION   Context assembly → qwen3:8b streaming → citation tagging → faithfulness/NLI check
```
Phases 1-5 built and verified — every stage above is real, running code, not a plan. The faithfulness check (step 6) works but is measurably unreliable on Indian regulatory text specifically; HyDE (step 5) works but didn't improve final ranking at this corpus's current size (508 chunks) — both caveats are detailed in [RAG_PHASES.md](RAG_PHASES.md).

---

## Folder Structure — this is the real, current layout, not the original plan

```
Initial Deployment/
├── rag-engine/                  (port 7476)
│   ├── server.py
│   ├── config.py
│   ├── schema.sql               written (Phase 3), never applied — see Design Decisions above
│   ├── ingestion/{loaders,chunker,pii,regulatory}.py
│   │                            no pipeline.py or scheduler.py — ingestion is endpoint-triggered,
│   │                            not a scheduled job; regulatory.py is the real SEBI+RBI crawler
│   ├── embedding/encoder.py     dense only — no separate bm25.py; sparse lives in storage/sqlite_fts.py
│   ├── storage/{qdrant_store,sqlite_fts,redis_cache,auth}.py
│   │                            no supabase_meta.py (never built); auth.py wasn't in the original
│   │                            plan at all — added in Phase 3 for live Supabase session verification
│   ├── retrieval/{hybrid,reranker,hyde,multi_hop}.py    — all real, all built
│   ├── generation/{prompt,streamer,citations,faithfulness}.py
│   │                            no separate assembler.py — prompt.py covers context assembly
│   ├── evaluation/test_namespace_isolation.py
│   │                            no ragas_eval.py or benchmark.py — neither was built
│   ├── start-all.sh
│   └── requirements.txt
├── js/
│   └── arya-sidebar-panel.js    updated in place: +2 RAG agent tools (rag_query,
│                                rag_search_regulations) + direct /api/retrieve injection
│                                into the main chat. No separate arya-rag-ui.js was built —
│                                turned out unnecessary, plain-text tool results sufficed.
└── (no rag-explorer.html — an admin/debug page for inspecting indexed chunks was
    planned, never built; use GET /api/health or query Qdrant directly instead)
```

Note: `arya-ai/` and `document-ai/` (existing services) were originally planned to integrate with rag-engine but don't — the real integration point is the browser calling rag-engine directly (port 7476) from `arya-sidebar-panel.js`, see [RAG_INTEGRATION.md](RAG_INTEGRATION.md).

---

## What Arya Can Actually Do Now (corrected — this used to be an aspirational table)

| Today (no RAG) | After RAG | Status |
|---|---|---|
| Generic answer from model's training data | Cites the actual SEBI circular / RBI notification, with date | ✅ Built and verified against live regulatory sites |
| Cannot read user's documents | Upload a PDF/TXT/MD/HTML into a private, namespace-isolated index | 🟡 Pipeline built and verified directly; no live authenticated HTTP upload exercised yet |
| No way to verify currency of advice | ~~Flags when a cited regulation has been superseded~~ | ❌ **Not built** — no conflict/supersession detection exists at all, this was a planning-stage aspiration that never got implemented |
| Single-shot answer | Multi-hop: decomposes a compound question into up to 2 sub-questions | ✅ Built, verified useful on a real compound question |
| No source trail | Every claim tagged `[SOURCE_N]`, mapped back to real chunk metadata | ✅ Built — plain-text source list in chat, not a clickable card UI (none was built, none turned out necessary) |
| Can hallucinate silently | Post-generation NLI check flags unsupported claims | 🟡 Built, but measurably unreliable on Indian regulatory/financial phrasing specifically — treat flags as a hint, not a verdict |

---

## Status

**Phases 1-5 built and verified.** Qdrant, Redis, and `rag-engine` (port 7476) are running locally; 508 chunks indexed (94 FIN-OS pages + live SEBI circulars + live RBI notifications) into both Qdrant and SQLite FTS5; hybrid retrieval + HyDE + multi-hop + reranking + streaming generation with citations + a faithfulness check are all confirmed working end-to-end against real queries. User document upload (PII-scrubbed, namespace-isolated), live Supabase session-token verification, and a Prometheus `/api/metrics` endpoint are built. Direct browser integration into Arya's sidebar chat, plus 2 Agent tool-calling functions, are built and verified in a real browser session.

Several real bugs were found and fixed along the way: qwen3's default "thinking" mode bloating generation; `sentence-transformers`' MPS device flag being silently ignored (twice — once for the reranker, again for the faithfulness model); a chunking gap that broke on dense regulatory tables and bilingual PDF headers; a fabricated PDF URL that 404'd before being replaced with a real crawled link. Real hardware measurement also revealed this M5's prefill/decode throughput is ~7-10x slower than generic estimates assumed (likely a base M5, not Pro/Max), and that the reranker's disk footprint (2.1GB) and the faithfulness model's throughput (~16 pairs/sec) were both significantly mis-estimated in earlier drafts of this documentation. See [RAG_PHASES.md](RAG_PHASES.md) for the full per-phase writeup.

**What's genuinely still open** (not "next phase," just open): broader regulatory sources (AMFI investigated and found infeasible — JS-rendered site; IT Act, IRDAI, PFRDA, NSE/BSE never attempted), the Supabase metadata registry (`schema.sql` written, never applied), an account-deletion cascade into RAG data, the RAGAS evaluation suite and 100-question benchmark, Prometheus/Grafana metrics, and the faithfulness guard's domain-reliability gap. None of these block current functionality — they're real gaps, not blockers.
