# FIN-OS RAG — Model Reference

> Version: 1.2 | Date: June 20, 2026 — extended through Phase 5: added `cross-encoder/nli-deberta-v3-base` (faithfulness guard) to the inventory, corrected the reranker's disk footprint (2.1 GB measured, not 590 MB) and a stale throughput figure that contradicted itself within this same file, corrected RRF candidate/top_k counts, and removed the fabricated "Claude Sonnet 4.6 cloud fallback" — that feature was never built, despite earlier drafts of this doc describing it as live
> All models run locally via Ollama (Metal) or PyTorch MPS. No API keys required for default operation.

---

## Model Inventory

**Speed column corrected from measured Phase 2 results** — original estimates assumed higher-bandwidth Apple Silicon than this machine actually has (likely base M5, not Pro/Max). See [RAG_HARDWARE.md](RAG_HARDWARE.md) §4 for the full original-vs-measured comparison.

| Model | Role | Backend | RAM | Speed (measured, this M5) |
|---|---|---|---|---|
| `qwen3:8b` | **Primary generation LLM (Phase 2 default — see note below)** | Ollama / Metal | 4.7 GB | ~20 tok/s decode |
| `qwen3:14b` | Available for harder synthesis where quality > speed | Ollama / Metal | 8.5 GB | ~7-11 tok/s decode |
| `mxbai-embed-large` | Primary dense embedding | Ollama / Metal | 1.2 GB | confirmed ~1,500 embed/s (matches estimate) |
| `nomic-embed-text` | Fallback/batch embedding | Ollama / Metal | 0.27 GB | not yet load-tested |

**Generation model default changed from `qwen3:14b` to `qwen3:8b` during Phase 2.** Decode speed roughly doubles (~20 vs ~7-11 tok/s) with acceptable quality loss for grounded, citation-constrained RAG answers — the model isn't doing open-ended reasoning, it's synthesizing from retrieved context, where `qwen3:8b` holds up well. `config.GENERATION_MODEL` controls this; switch back to `qwen3:14b` per-request for cases needing deeper synthesis (e.g. Phase 3 multi-hop).

**Critical setting: `think: false` on every Ollama call.** qwen3 models reason-by-default, generating hidden chain-of-thought tokens before the visible answer — measured 135 tokens generated for "what is 2+2?" with thinking on, vs. 3 tokens with it off (11.9s → 0.58s on that trivial prompt). This matches the convention already used in FIN-OS's existing `arya-ai.js`. Without this, every figure in this document would be meaningless.
| `BAAI/bge-reranker-v2-m3` | Cross-encoder reranker | sentence-transformers / MPS | 0.8 GB | ~6-12 pairs/s on real chunk lengths (see §5 — original ~200 pairs/s estimate assumed much shorter sequences) |
| `cross-encoder/nli-deberta-v3-base` | Faithfulness/NLI guard | sentence-transformers / MPS | 0.8 GB (714 MB disk; RAM not separately re-measured, assume similar to reranker) | **~16 pairs/sec measured** (real test: 14 pairs in 0.86s) — the ~150 pairs/sec previously here was an unverified guess and, consistent with every other un-measured throughput number in this project, turned out to be roughly 9x too optimistic |
| ~~Claude Sonnet 4.6~~ | ❌ Not built — no cloud fallback exists, see §7 | — | — | — |

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

**Bug found in Phase 2 — `device="mps"` in the constructor is silently ignored.** Verified via `model.model.device` reporting `cpu` despite passing `device="mps"`. An explicit `.to("mps")` call after construction is required:

```python
from sentence_transformers import CrossEncoder
import torch

device = "mps" if torch.backends.mps.is_available() else "cpu"
reranker = CrossEncoder("BAAI/bge-reranker-v2-m3", device=device, max_length=256)  # see note below on max_length
reranker.model.to(device)  # REQUIRED — constructor's device arg alone doesn't move the model
scores = reranker.predict([(query, chunk.text) for chunk in candidates])
```

**`max_length` reduced from 512 to 256 in Phase 2.** Measured on this M5 with real FIN-OS chunk text (~300 tokens avg): 512 took 2.33s for 14 pairs vs. 1.13s at 256 — attention cost scales ~O(n²), so halving sequence length roughly halves+ the cost. 256 tokens (~170-190 words) is enough for relevance scoring without the full chunk body.

| Parameter | Value |
|---|---|
| Input | (query, candidate_chunk) pairs |
| Output | Relevance score per pair |
| Backend | PyTorch MPS (`PYTORCH_ENABLE_MPS_FALLBACK=1` required) |
| Throughput (M5 MPS) | **~6-12 pairs/sec measured** (not the ~200 pairs/sec originally estimated here — see §5 above and the bug-fix note above; this row previously contradicted the corrected number elsewhere in this same file) |
| Disk footprint | **2.1 GB measured** (`du -sh` on the HF cache blob) — corrected from an earlier ~590 MB estimate; runtime RAM stays close to the ~0.8 GB estimate (0.71 GB measured peak RSS), only the on-disk weight size was wrong |
| Used for | Re-scoring up to ~20 RRF-fused candidates (`dense_k=10` + `sparse_k=10`, `retrieval/hybrid.py`) down to the final top-3 sent to generation by default (`QueryRequest.top_k=3`, reduced from an earlier top-8 default for latency — `/api/search`'s separate, simpler endpoint still defaults to top-8) |

---

## 6. `cross-encoder/nli-deberta-v3-base` — Faithfulness Guard

```bash
# Same sentence-transformers install covers this model
```

```python
from sentence_transformers import CrossEncoder
nli_model = CrossEncoder("cross-encoder/nli-deberta-v3-base", device=device)
nli_model.model.to(device)  # same MPS device-placement bug as the reranker (§5) — constructor arg alone isn't enough
# label order is NOT assumed — read dynamically from nli_model.model.config.id2label
# (verified: {0: 'contradiction', 1: 'entailment', 2: 'neutral'} on this model/version)
result = nli_model.predict([(source_chunk_text, generated_sentence)])
```

Used post-generation: each sentence in the model's answer is checked against its cited `[SOURCE_N]` chunk. If the NLI label is not `entailment`, the sentence is flagged ⚠️ in the rendered UI.

**Reliability caveat, found during real testing (Phase 5):** this model performs correctly on simple SNLI-style sentence pairs, but gives inconsistent results on real RBI/SEBI paraphrased financial text — in one test it flagged a *correct* date paraphrase as "neutral" (should be entailment), and flipped to "contradiction" when the premise was shortened slightly. Treat `flagged_sentences` in `/api/query`'s response as a noisy signal worth surfacing to a human, not a reliable automated hallucination filter for this domain. See [RAG_PHASES.md](RAG_PHASES.md) Phase 5 for the full writeup.

---

## 7. Claude Sonnet 4.6 — Cloud Fallback — ❌ NOT BUILT, never implemented

**Correction:** earlier drafts of this doc described the table below as a built feature. It never was. There is no Anthropic API call anywhere in `rag-engine` — grep confirms it. The design is preserved here only as a record of what was planned and explicitly **not** pursued, not as documentation of current behavior:

| Trigger condition (planned, not built) | Planned behavior |
|---|---|
| Ollama process unresponsive (health check fails 3×) | Would have routed the next request through the Anthropic API — no such routing exists; an unresponsive Ollama currently just makes the request fail/timeout |
| Document exceeds 32K context after assembly | Would have routed to Claude for the oversized request — no such routing exists; an oversized assembled prompt is currently just sent to Ollama as-is (mitigated in practice by the chunk-truncation and `top_k` limits in `generation/prompt.py`, which keep real prompts well under 32K) |
| **Would never have triggered for** | `namespace: user:{uuid}` queries — moot, since the feature doesn't exist. **There is currently no cloud fallback of any kind, which means there's also no privacy boundary to maintain around one** — the actual privacy guarantee is simpler: nothing in this system calls any cloud LLM, period. |

If this gets built later, the privacy boundary described above (hard-exclude `user:{uuid}` namespaces from ever reaching a cloud model) is still the right design — just not implemented yet.

---

## Model Swap-In Considerations

| If you want to upgrade later | Swap | Cost |
|---|---|---|
| Better embedding quality | `mxbai-embed-large` → `bge-m3` (multilingual incl. Hindi) | Re-embed entire corpus; ~35 min for 50K chunks |
| Faster generation | `qwen3:14b` → `qwen3:14b` MLX build | Requires `mlx-lm` instead of Ollama; ~30–50% faster decode, more setup |
| Larger context | `qwen3:14b` → `qwen3:30b` (Q4) | ~17 GB RAM — leaves only ~7 GB headroom, not recommended on 24 GB until other services are trimmed |
| Hindi-first responses | Add a language-routing step before generation, same `qwen3:14b` (already multilingual) | No model change — prompt-level only |
