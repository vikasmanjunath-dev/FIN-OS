# FIN-OS RAG — Model Reference

> Version: 1.0 | Date: June 20, 2026
> All models run locally via Ollama (Metal) or PyTorch MPS. No API keys required for default operation.

---

## Model Inventory

| Model | Role | Backend | RAM | Speed (M5) |
|---|---|---|---|---|
| `qwen3:14b` | Primary generation LLM | Ollama / Metal | 8.5 GB | ~50 tok/s decode |
| `qwen3:8b` | Query rewrite, HyDE, routing, sub-questions | Ollama / Metal | 4.7 GB | ~90 tok/s decode |
| `mxbai-embed-large` | Primary dense embedding | Ollama / Metal | 1.2 GB | ~1,500 embed/s |
| `nomic-embed-text` | Fallback/batch embedding | Ollama / Metal | 0.27 GB | ~3,000 embed/s |
| `BAAI/bge-reranker-v2-m3` | Cross-encoder reranker | sentence-transformers / MPS | 0.8 GB | ~200 pairs/s |
| `cross-encoder/nli-deberta-v3-base` | Faithfulness/NLI guard | sentence-transformers / MPS | ~0.4 GB | ~150 pairs/s |
| Claude Sonnet 4.6 | Cloud fallback only | Anthropic API | 0 (remote) | network-dependent |

---

## 1. `qwen3:14b` — Primary Generation

```bash
ollama pull qwen3:14b
```

| Parameter | Value |
|---|---|
| Quantization | Q4_K_M (Ollama default) |
| Context window | 32,768 tokens |
| Temperature (factual RAG mode) | 0.1 |
| Top-p | 0.9 |
| Used for | Final RAG answer generation, multi-hop synthesis |
| Keep-alive | `-1` (never unload — see [RAG_HARDWARE.md](RAG_HARDWARE.md) §6) |

Already present in the FIN-OS stack (used by `arya-ai.js` / voice agent). No new download needed if already pulled — verify with `ollama list`.

---

## 2. `qwen3:8b` — Fast Utility Model

```bash
ollama pull qwen3:8b
```

| Parameter | Value |
|---|---|
| Quantization | Q4_K_M |
| Context window | 32,768 tokens |
| Temperature (query rewrite) | 0.3 |
| Temperature (HyDE generation) | 0.4 |
| Used for | Query rewriting, HyDE hypothetical-answer generation, sub-question decomposition, follow-up chip generation |

Rationale for a separate small model: keeping `qwen3:14b` reserved for final-answer quality while routing every "helper" LLM call through the faster, lighter `qwen3:8b` keeps total latency down and avoids ever loading two large models concurrently.

---

## 3. `mxbai-embed-large` — Primary Embedding

```bash
ollama pull mxbai-embed-large
```

| Parameter | Value |
|---|---|
| Dimensions | 1024 |
| MTEB retrieval score | 64.68 |
| Max input | 512 tokens per chunk |
| Batch size | 32 |
| Called via | `POST http://localhost:11434/api/embed` |

Chosen over BGE-M3 specifically because it runs through Ollama's native Metal path with zero additional Python ML dependencies — BGE-M3 would require `sentence-transformers` + manual MPS device placement for comparable throughput.

---

## 4. `nomic-embed-text` — Fallback/Batch Embedding

```bash
ollama pull nomic-embed-text
```

| Parameter | Value |
|---|---|
| Dimensions | 768 |
| Used when | Large batch ingestion (e.g., 6-month news backfill) where throughput matters more than the marginal quality gain from `mxbai-embed-large` |
| Note | Chunks embedded with this model are tagged `embed_model: nomic-embed-text` in metadata — never mixed into the same Qdrant collection as `mxbai-embed-large` vectors without re-embedding, since cosine similarity across different embedding spaces is meaningless |

---

## 5. `BAAI/bge-reranker-v2-m3` — Cross-Encoder Reranker

```bash
pip install sentence-transformers
# Model auto-downloads on first use from HuggingFace Hub
```

```python
from sentence_transformers import CrossEncoder
import torch

device = "mps" if torch.backends.mps.is_available() else "cpu"
reranker = CrossEncoder("BAAI/bge-reranker-v2-m3", device=device, max_length=512)
scores = reranker.predict([(query, chunk.text) for chunk in candidates])
```

| Parameter | Value |
|---|---|
| Input | (query, candidate_chunk) pairs |
| Output | Relevance score per pair |
| Backend | PyTorch MPS (`PYTORCH_ENABLE_MPS_FALLBACK=1` required) |
| Throughput (M5 MPS) | ~200 pairs/sec |
| Used for | Re-scoring ~30 RRF-fused candidates down to the final top-8 sent to generation |

---

## 6. `cross-encoder/nli-deberta-v3-base` — Faithfulness Guard

```bash
# Same sentence-transformers install covers this model
```

```python
from sentence_transformers import CrossEncoder
nli_model = CrossEncoder("cross-encoder/nli-deberta-v3-base", device=device)
# label order: contradiction, entailment, neutral
result = nli_model.predict([(source_chunk_text, generated_sentence)])
```

Used post-generation: each sentence in the model's answer is checked against its cited `[SOURCE_N]` chunk. If the NLI label is not `entailment`, the sentence is flagged ⚠️ in the rendered UI.

---

## 7. Claude Sonnet 4.6 — Cloud Fallback (exception path only)

| Trigger condition | Behavior |
|---|---|
| Ollama process unresponsive (health check fails 3×) | `rag-engine` automatically routes the next request through Anthropic API |
| Document exceeds 32K context after assembly | Routed to Claude for the single oversized request only |
| **Never triggered for** | Any query touching `namespace: user:{uuid}` — user document content never leaves the machine, even on fallback. Fallback only applies to `public` namespace queries. |

This is a deliberate privacy boundary: the cloud fallback exists for availability, not for capability, and is hard-excluded from ever seeing private financial documents.

---

## Model Swap-In Considerations

| If you want to upgrade later | Swap | Cost |
|---|---|---|
| Better embedding quality | `mxbai-embed-large` → `bge-m3` (multilingual incl. Hindi) | Re-embed entire corpus; ~35 min for 50K chunks |
| Faster generation | `qwen3:14b` → `qwen3:14b` MLX build | Requires `mlx-lm` instead of Ollama; ~30–50% faster decode, more setup |
| Larger context | `qwen3:14b` → `qwen3:30b` (Q4) | ~17 GB RAM — leaves only ~7 GB headroom, not recommended on 24 GB until other services are trimmed |
| Hindi-first responses | Add a language-routing step before generation, same `qwen3:14b` (already multilingual) | No model change — prompt-level only |
