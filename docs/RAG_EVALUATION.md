# FIN-OS RAG — Evaluation & Benchmarking Reference

> Version: 1.0 | Date: June 20, 2026
> Tooling: RAGAS + custom Indian-finance QA benchmark + Prometheus/Grafana

---

## 1. Retrieval Metrics

| Metric | Target | Definition |
|---|---|---|
| Hit Rate@5 | ≥ 0.85 | Fraction of queries where a relevant chunk appears in top-5 |
| MRR (Mean Reciprocal Rank) | ≥ 0.80 | Average of 1/rank of the first relevant chunk |
| NDCG@10 | ≥ 0.75 | Rank-weighted relevance quality of top-10 |
| Context Precision | ≥ 0.80 | Fraction of retrieved chunks that are actually relevant |
| Context Recall | ≥ 0.82 | Fraction of all relevant chunks that were retrieved |
| Latency P95 (retrieval only) | ≤ 400 ms | End-to-end through Layer 5, excluding generation |

## 2. Generation Metrics (RAGAS)

| Metric | Target | Definition |
|---|---|---|
| Faithfulness | ≥ 0.90 | Fraction of claims in the answer supported by retrieved context |
| Answer Relevancy | ≥ 0.85 | How directly the answer addresses the question |
| Answer Correctness | ≥ 0.80 | Compared against a curated ground-truth answer set |
| Hallucination Rate | ≤ 3% | Fraction of generated sentences failing the NLI entailment check |
| Citation Coverage | ≥ 95% | Fraction of factual sentences carrying a `[SOURCE_N]` tag |
| E2E Latency P95 | ≤ 2 sec | Full pipeline, query to first complete answer (non-streaming measure) |

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

## 6. Namespace Isolation Test (mandatory, run before every deploy)

A specific automated test that must pass before any change to retrieval code ships:

```python
# rag-engine/evaluation/test_namespace_isolation.py
def test_user_cannot_retrieve_other_users_documents():
    user_a_doc = upload_test_document(user_id=USER_A, content="USER_A_SECRET_MARKER")
    response = query_rag(query="SECRET_MARKER", user_id=USER_B)
    assert "USER_A_SECRET_MARKER" not in response["answer"]
    assert all(c["doc_id"] != user_a_doc["doc_id"] for c in response["citations"])
```

This is treated as a security regression test, not a normal unit test — a failure here blocks all other work until fixed.

## 7. Evaluation Cadence

| Check | Frequency |
|---|---|
| Namespace isolation test | Every code change to `retrieval/` or `storage/` |
| Indian finance benchmark (100 Q) | Every change to chunking, retrieval params, or prompts |
| Full RAGAS suite | Weekly |
| `rag_feedback` manual review | Weekly |
| Latency/Grafana check | Continuous (dashboard), manual review weekly |
