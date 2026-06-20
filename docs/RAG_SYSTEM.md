# FIN-OS — RAG System (Master Reference)

> Version: 1.0 | Date: June 20, 2026 | Status: **Planning complete — Phase 1 not yet started**
> Target hardware: Apple M5 · 24 GB unified memory · 1 TB SSD (solo-dev local machine)

---

## What This Is

A fully local Retrieval-Augmented Generation engine that gives Arya (and the rest of FIN-OS) grounded, cited, hallucination-checked answers over: SEBI/RBI/AMFI regulations, the user's own uploaded financial documents, all 96 FIN-OS pages' content, fund fact sheets, and daily news — without sending any of it to a cloud API by default.

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

| Decision | Choice | Reason |
|---|---|---|
| Orchestration framework | LlamaIndex 0.10+ | Purpose-built for document RAG; native hybrid retrieval, SubQuestion multi-hop |
| Embedding model | `mxbai-embed-large` via Ollama | 1024-dim, MTEB 64.68, Metal-accelerated, zero extra ML framework |
| Vector store | Qdrant (local binary) | Fastest local HNSW; mmap'd segments; no network hop (vs. Supabase pgvector) |
| Sparse index | SQLite FTS5 + BM25 | Zero extra service; exact-match for section numbers like "80CCD(1B)" |
| Reranker | BGE-reranker-v2-m3 (PyTorch MPS) | Cross-encoder re-score of top-40 → top-8 |
| LLM (generation) | `qwen3:14b` via Ollama | Already in FIN-OS stack; 8.5 GB at Q4_K_M; ~50 tok/s on M5 |
| LLM (fast/utility) | `qwen3:8b` via Ollama | Query rewrite, HyDE, sub-question decomposition |
| Cloud fallback | Claude Sonnet 4.6 (API) | Only if Ollama is down; never used on user document namespace |
| API server | FastAPI, port **7476** | New `rag-engine/` module; clear of all existing ports |
| Metadata + user store | Supabase (existing project) | `rag_documents`, `rag_feedback` tables; RLS reused from existing auth |
| Containerization | None | Native Apple Silicon binaries only — no Docker, no Rosetta |

---

## The 6-Layer Pipeline (summary — full detail in [RAG_PIPELINE.md](RAG_PIPELINE.md))

```
1. INGESTION    PDF / HTML / CSV / JSON / DOCX loaders → SHA-256 de-dup → PII scrub
2. CHUNKING     Doc-type-aware splits (400 tok regulations / 200 tok news / row-per-table)
3. EMBEDDING    mxbai-embed-large (dense, 1024-dim) + BM25s (sparse) — dual index
4. STORAGE      Qdrant (vectors) + SQLite FTS5 (keyword) + Supabase (metadata + raw files)
5. RETRIEVAL    Query rewrite → HyDE → dense top-20 + BM25 top-20 → RRF fusion → rerank → top-8
6. GENERATION   Context assembly → qwen3:14b streaming → citation tagging → faithfulness check
```

---

## New Folder Structure

```
Initial Deployment/
├── rag-engine/                  ← NEW (port 7476)
│   ├── server.py
│   ├── config.py
│   ├── ingestion/{pipeline,loaders,chunker,pii,scheduler}.py
│   ├── embedding/{encoder,bm25}.py
│   ├── storage/{qdrant_store,sqlite_fts,supabase_meta,redis_cache}.py
│   ├── retrieval/{hybrid,reranker,hyde,multi_hop}.py
│   ├── generation/{prompt,assembler,streamer,citations,faithfulness}.py
│   ├── evaluation/{ragas_eval,benchmark}.py
│   ├── start-all.sh
│   └── requirements.txt
├── arya-ai/                     ← existing, gains HTTP calls to rag-engine:7476
├── document-ai/                 ← existing, feeds parsed docs into rag-engine ingestion
├── js/
│   ├── arya-rag-ui.js           ← NEW: source cards, citations, doc upload widget
│   └── arya-sidebar-panel.js    ← updated: +4 RAG agent tools
└── html/
    └── rag-explorer.html        ← NEW: admin/debug page to inspect indexed chunks
```

---

## What Arya Can Do After This Ships

| Today (no RAG) | After RAG |
|---|---|
| Generic answer from model's training data | Cites the actual SEBI circular / IT Act section, with date |
| Cannot read user's documents | "Your Form 16 shows ₹46,800 under 80C — here's what's left" |
| No way to verify currency of advice | Flags when a cited regulation has been superseded |
| Single-shot answer | Multi-hop: decomposes "how does the new NPS rule affect my 80CCD claim" into sub-questions |
| No source trail | Every claim tagged `[SOURCE_N]` → clickable source card |
| Can hallucinate silently | Post-generation NLI check flags unsupported claims with ⚠️ |

---

## Status

**Planning: complete.** No code written yet. Next action is Phase 1 in [RAG_PHASES.md](RAG_PHASES.md) — Qdrant setup, Supabase schema migration, and indexing the first 96 FIN-OS pages.
