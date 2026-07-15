# FIN-OS RAG — Hardware Plan (Apple M5, 24 GB, 1 TB)

> Version: 1.3 | Date: June 21, 2026 — Phase 6: the documented 15-25s cold-start tax on the first `/api/query` after a restart is now fixed (model warmup moved to server startup, measured 8.4s combined); ingestion is now async via a separate RQ worker process, added to §5's service map
> Target machine: MacBook with Apple M5 · 24 GB unified memory · 1 TB SSD

---

## 1. Unified Memory Model

M5's unified memory architecture (UMA) means CPU, GPU (Metal), and Neural Engine all draw from the same 24 GB pool — there is no separate VRAM to budget. Every model below runs GPU-accelerated through Metal without any manual configuration beyond environment variables.

---

## 2. RAM Allocation (steady-state, all services running) — corrected for the actual Phase 1-5 build

| Component | Mechanism | RAM |
|---|---|---|
| macOS + background apps | — | ~4.5 GB |
| `qwen3:8b` Q4_K_M | Ollama, Metal GPU layers — **primary generation model**, changed from `qwen3:14b` in Phase 2 (see [RAG_MODELS.md](RAG_MODELS.md)) | 4.7 GB |
| `qwen3:14b` Q4_K_M | Ollama, Metal — kept loaded too in practice since Ollama's default 5-min keep-alive means both models tend to be resident if both get used (e.g. main chat still defaults to `qwen3:14b` per `arya-sidebar-panel.js`'s own `OLLAMA_MODEL` constant — a *different* model selection than rag-engine's) | 8.5 GB |
| `mxbai-embed-large` | Ollama, Metal | 1.2 GB |
| `BGE-reranker-v2-m3` | PyTorch MPS | 0.8 GB (measured peak RSS 0.71 GB — this RAM figure holds up; only the *disk* footprint estimate was wrong, see §3) |
| `cross-encoder/nli-deberta-v3-base` | PyTorch MPS — faithfulness guard, Phase 5 | ~0.4 GB |
| Qdrant | Local binary, index in RAM | 1.8 GB |
| Redis | Query cache | 1.0 GB |
| FastAPI (`rag-engine`) | Python process — **not** ×2 with LlamaIndex; LlamaIndex was never used (see [RAG_SYSTEM.md](RAG_SYSTEM.md) design decisions) | 0.5 GB |
| **Subtotal (if both qwen3 models loaded at once)** | | **~23.4 GB** |
| **Subtotal (typical — only one qwen3 model active)** | | **~14.7-18.5 GB** |

**This is tighter than the original plan assumed.** The original "never load two 14B+ models simultaneously" rule assumed disciplined model swapping; in practice, `qwen3:14b` (main chat, via `arya-sidebar-panel.js`) and `qwen3:8b` (rag-engine's default) are **different services with different model choices**, and Ollama's default keep-alive (~5 min, since `OLLAMA_KEEP_ALIVE` doesn't actually reach the GUI app — see §6) means both can end up resident together if both get used within that window. At ~23 GB combined, headroom shrinks to ~1 GB — survivable but tight, not the comfortable ≥5 GB originally planned. If this becomes a real problem, unload one explicitly: `curl http://localhost:11434/api/generate -d '{"model": "qwen3:14b", "keep_alive": 0}'`.

---

## 3. Storage Budget (1 TB SSD)

| Category | Items | Size |
|---|---|---|
| **AI models (Ollama + pip)** | qwen3:14b (8.5 GB), qwen3:8b (4.7 GB), mxbai-embed-large (670 MB), nomic-embed-text fallback (274 MB), **BGE-reranker-v2-m3 (2.1 GB — verified via `du -sh` on the actual HF cache; the original 590 MB estimate was wrong, this model is built on a much larger XLM-RoBERTa-large-class architecture)**, cross-encoder/nli-deberta-v3-base (Phase 5, 714 MB measured) | **~16.96 GB** |
| **Vector + index store** | Qdrant at 1M chunks × 1024-dim (~4.1 GB), SQLite FTS5 (~800 MB), Redis dump (~200 MB), metadata SQLite (~100 MB) | **~5.2 GB** |
| **Raw documents** | SEBI circulars 2015–2026 (~3 GB), RBI directions (~500 MB), AMFI fact sheets (~2 GB), news archive 6mo (~1 GB), FIN-OS exported HTML (~50 MB) | **~6.5 GB** |
| **Project + Python envs** | FIN-OS deployment (~500 MB), existing venvs (~3 GB), new rag-engine venv (~800 MB), user uploads (~1–5 GB), logs (~200 MB) | **~5.5 GB** |
| **Total (corrected)** | | **~34.2 GB** (was ~32 GB before the reranker size correction above) |
| **Free after install** | | **~966 GB** |

The "Vector + index store" and "Raw documents" rows above are still sized for a **future, much larger corpus** (1M chunks, full regulatory backfill) — the actual current corpus is 508 chunks (a few MB, not GB) across Qdrant + SQLite combined (see [RAG_KNOWLEDGE_BASE.md](RAG_KNOWLEDGE_BASE.md) for why this grew from 398 with zero new source documents — a global chunking change, not new content). Even tripling the *eventual* knowledge base (3 years of news, full NSE annual report archive, complete AMFI history) keeps total disk under 150 GB — no storage risk on a 1 TB drive, the original conclusion still holds even with the corrected model sizes.

Qdrant uses memory-mapped storage for segments that exceed configured RAM limits — on M5's SSD (≥5 GB/s sequential read) this is effectively transparent, with cold-start index load under 2 seconds.

---

## 4. Performance — Original Targets vs. Measured Reality (Phase 2, June 20 2026)

The figures below (prefill/decode speed, P95 target) were **pre-build estimates** based on generic Apple Silicon benchmarks. Phase 2 implementation measured the real numbers on this specific machine and they were substantially different — documented here for an honest record. This is very likely a **base M5** (not Pro/Max): base chips have far fewer GPU cores and much lower memory bandwidth, and LLM decode/prefill are bandwidth-bound.

| Metric | Original estimate | **Measured (this machine)** |
|---|---|---|
| `qwen3:14b` decode | ~50 tok/s | **~7-11 tok/s** |
| `qwen3:8b` decode | ~90 tok/s | **~20 tok/s** |
| Prompt prefill | ~2,500 tok/s | **~200-260 tok/s** |
| Reranker (BGE-v2-m3, real ~300-token chunks) | ~200 pairs/sec | **~6 pairs/sec at max_length=512, ~12 pairs/sec at max_length=256** |
| End-to-end simple query, cache miss | ≤ 3 sec P95 | **6-8 sec typical, streaming TTFT ~2.6-8 sec** |

**Root causes found and fixed along the way:**
1. **qwen3 "thinking" mode was on by default** — generated ~135 hidden reasoning tokens even for trivial prompts. Fixed: `think: false` in every Ollama call (matches the existing convention already used in `arya-ai.js`). This alone cut a trivial-prompt round trip from 11.9s to 0.58s.
2. **sentence-transformers' `CrossEncoder(device="mps")` silently did not move the model to MPS** — `model.model.device` reported `cpu` despite the constructor argument. Fixed with an explicit `.model.to("mps")` call after construction. Confirmed via `next(model.parameters()).device`.
3. **Prefill, not decode, is the dominant cost for a RAG prompt** — a ~2000-token context (system prompt + 5 chunks + history) costs 6-10 seconds of prefill alone at this hardware's real ~200-260 tok/s prefill rate. Mitigated by trimming context: `top_k` default reduced 8→3, each chunk truncated to 500 chars in the prompt, system prompt shortened. This dropped typical full-pipeline latency from ~12-16s to ~6-8s.
4. **Generation model switched from `qwen3:14b` to `qwen3:8b` by default** for the RAG pipeline — roughly 2x faster decode with acceptable quality for grounded, citation-constrained answers. `qwen3:14b` remains available for harder synthesis (e.g. Phase 3 multi-hop) where quality matters more than speed.
5. **Output length capped** — `num_predict: 120` in Ollama options, plus an explicit "3-4 sentences max" rule in the system prompt. Since decode is the one truly linear cost (~20 tok/s, very consistent), bounding output length is the most reliable lever for latency.

**What actually matters for "smooth" — streaming TTFT, not total time:** with SSE streaming, the user sees the first token after ~2.6-8 sec (varies with system load), then reads while the rest streams in at ~20 tok/s — comparable to or faster than reading speed. Total response time (6-8 sec typical) is higher than the original 3s target, but perceived latency is what the original target was actually trying to protect, and streaming substantially closes that gap.

**Cache hits are the real win for daily-use smoothness:** Redis caching (1hr TTL, invalidated on re-ingestion) makes any repeated query effectively instant (<5ms, measured). For a personal-use assistant, this matters more in practice than shaving the cache-miss tail.

### Original estimate tables (kept for the design rationale; see above for what's true on this machine)

### Embedding throughput
| Task | Throughput |
|---|---|
| `mxbai-embed-large` (Ollama, Metal, batch 32) | ~1,500 chunks/sec — **confirmed accurate**: 187 chunks embedded in the 18-19s full ingestion runs |
| FIN-OS 94 pages, cold index | ~45 sec estimate → **measured 18-19 sec actual** |

### Query latency (P50 / P95) — retrieval only, excludes generation
| Stage | Original estimate | Measured |
|---|---|---|
| Query embed | <5 ms / 10 ms | ~130 ms (includes httpx connection setup per call) |
| Qdrant HNSW search (187 vectors) | <10 ms / 25 ms | ~60 ms |
| SQLite BM25 search | <5 ms / 15 ms | <10 ms — accurate |
| Reranker (10+10 fused → top 3-5) | ~120 ms / 200 ms | **~1.1-2.5 sec** at max_length=256 (was ~5-13s at max_length=512 before the device fix + length cap) |
| Redis cache hit | <2 ms | confirmed <5ms |

Streaming is still the right call for perceived smoothness — first token arrives well before the full answer, and `qwen3:8b`'s ~20 tok/s decode is close to natural reading pace.

---

## 5. Service Map

| Port | Service | Role | Memory |
|---|---|---|---|
| 11434 | Ollama | LLM + embedding server (Metal) | 8.5–18+ GB depending on how many models are resident, see §2 |
| 6333 | Qdrant | Vector DB, REST + gRPC | ~1.8 GB |
| 6379 | Redis | Query cache | ~200 MB |
| **7476** | **rag-engine** | FastAPI, all RAG endpoints. **Built with CORS enabled** (`allow_origins=["*"]`, Phase 4) so the browser calls it directly | ~500 MB |
| — | **rag-ingestion worker** (Phase 6) | `rq worker rag-ingestion`, no HTTP port — pulls jobs from Redis. **Must run with `--worker-class rq.worker.SimpleWorker`** on macOS, see §8 | ~300-500 MB once it imports the same ingestion stack as the API server |
| 7475 | arya-ai | Existing Arya backend. **Does not proxy to rag-engine** — corrected from the original plan; `js/arya-sidebar-panel.js` calls rag-engine (7476) directly from the browser instead, see [RAG_INTEGRATION.md](RAG_INTEGRATION.md) | ~400 MB |
| 8765 | voice-agent | Existing WebSocket voice agent, not yet RAG-integrated | ~300 MB |
| 8000 | chatbot/brain | Existing QFT chatbot, unaffected | ~300 MB |

No port conflicts. No Docker. **Qdrant has no Homebrew formula** — confirmed during setup (`brew install qdrant` fails with "No available formula", no tap exists either) — it runs from the official GitHub release binary instead (see [RAG_SETUP.md](RAG_SETUP.md) §3). Redis is a real brew service. Ollama is the official `.app` installer, launched via `open -a Ollama`, not a brew service. The Phase 6 worker has no port of its own — it's a long-running process that polls Redis, not something to curl.

---

## 6. Environment Variables — ⚠️ only one of these three actually works, confirmed in Phase 4

```bash
export PYTORCH_ENABLE_MPS_FALLBACK=1   # sentence-transformers MPS safety net (reranker, NLI guard)
export OLLAMA_NUM_PARALLEL=2           # intended: concurrent Ollama requests — does NOT reach Ollama, see below
export OLLAMA_KEEP_ALIVE="-1"          # intended: keep models loaded permanently — does NOT reach Ollama, see below
```

**`PYTORCH_ENABLE_MPS_FALLBACK` works** — it's read by Python processes (the rag-engine server) launched from a shell where it's exported.

**`OLLAMA_NUM_PARALLEL` and `OLLAMA_KEEP_ALIVE` do not reach the running Ollama process on this machine, confirmed during Phase 4 — this was previously stated as "the single most important setting" in this doc, which was wrong.** Ollama runs as `/Applications/Ollama.app`, started via `open -a Ollama` (a GUI launch). GUI launches on macOS do not inherit variables `export`-ed in a shell — they get the ambient *login session* environment, not your terminal's. The standard macOS workaround was tried and also failed:
```bash
launchctl setenv OLLAMA_NUM_PARALLEL 2
launchctl setenv OLLAMA_KEEP_ALIVE "-1"
# quit Ollama, relaunch via open -a Ollama
```
Verified via `ps eww -p $(pgrep -x ollama) | grep OLLAMA` that neither variable appears in the live process's actual environment even after this. The likely real fix is Ollama's own in-app Settings UI (some versions expose env vars there) — not pursued, since it needs a GUI settings panel rather than something scriptable, and the system was instead built to tolerate Ollama's defaults (5-minute idle unload, default `num_parallel`) — see §8 and [RAG_PHASES.md](RAG_PHASES.md) Phase 4 for the resulting mitigations (longer client-side timeouts, explicit warmup calls, graceful degradation on timeout).

**Practical consequence:** the reranker and faithfulness-guard models (Python-side, unaffected by the Ollama issue above) used to add a ~15-25s tax to whichever request happened to be first after a restart. **Fixed in Phase 6** — `server.py`'s startup handler now explicitly warms both before accepting traffic (measured 8.4s combined on a machine with both already cached: 6.4s reranker + 2.0s NLI). This makes startup itself slower instead, which is the right tradeoff for a service that gets restarted occasionally but queried constantly. Expect Ollama itself to occasionally reload a model if more than ~5 minutes pass between requests — reload cost is a few seconds, not catastrophic, just not "permanently zero" as originally planned, and not something the Phase 6 fix touches (it's Python-side only).

---

## 7. Startup Script — this is the real, current file, not a sketch

`rag-engine/start-all.sh` (verified — this is what's actually on disk, corrected from an earlier, stale version of this doc that showed `brew services start ollama`/`qdrant`, neither of which is real):

```bash
#!/bin/zsh
# FIN-OS RAG Stack — M5 24GB startup script (Phase 1)
# Run: chmod +x start-all.sh && ./start-all.sh
set -e

export PYTORCH_ENABLE_MPS_FALLBACK=1
export OLLAMA_NUM_PARALLEL=2     # exported for completeness — does not actually reach
export OLLAMA_KEEP_ALIVE="-1"    # Ollama.app, see §6. Harmless to keep exporting.

echo "[1/4] Checking Ollama..."
if ! curl -s http://localhost:11434/api/tags > /dev/null; then
  open -a Ollama
  until curl -s http://localhost:11434/api/tags > /dev/null; do sleep 1; done
fi
echo "      ✓ Ollama up"

echo "[2/4] Checking Qdrant (binary at ~/qdrant-bin)..."
if ! curl -s http://localhost:6333/healthz > /dev/null; then
  cd ~/qdrant-bin
  nohup ./qdrant --config-path config.yaml > qdrant.log 2>&1 &
  disown
  cd - > /dev/null
  until curl -s http://localhost:6333/healthz > /dev/null; do sleep 1; done
fi
echo "      ✓ Qdrant up"

echo "[3/4] Checking Redis..."
brew services start redis 2>/dev/null || true
until redis-cli ping > /dev/null 2>&1; do sleep 1; done
echo "      ✓ Redis up"

echo "[4/4] Starting rag-engine on port 7476..."
cd "$(dirname "$0")"
source .venv/bin/activate
nohup uvicorn server:app --host 127.0.0.1 --port 7476 --log-level info > server.log 2>&1 &
disown

sleep 3
echo "✓ RAG stack running — http://localhost:7476/api/health"
curl -s http://localhost:7476/api/health && echo
```

Note: no `--workers 2` — confirmed (via `ps aux`) the server runs single-process in practice; that flag from an earlier draft was never actually load-bearing. **An explicit model warmup step was added in Phase 6** (the original plan's step 2, finally built) — `server.py`'s `@app.on_event("startup")` handler now calls both the reranker's and faithfulness model's `_get_model()` before the server reports healthy, so the ~8.4s combined cold-load cost lands on startup, not on a random user's first query. See §8 below.

Run once: `chmod +x rag-engine/start-all.sh`. Add to login items or a launchd plist for auto-start (see [RAG_SETUP.md](RAG_SETUP.md) §10).

---

## 8. Failure Modes & Headroom Checks

| Symptom | Cause | Fix |
|---|---|---|
| Swap usage > 0 | Headroom breached — both `qwen3:8b` (rag-engine) and `qwen3:14b` (main chat) resident at once, see §2 | Check `ollama ps`; explicitly unload one: `curl localhost:11434/api/generate -d '{"model":"qwen3:14b","keep_alive":0}'` |
| `/api/retrieve` or `/api/query` times out from the browser under concurrent use | Confirmed real, Phase 4: two separate `ollama runner` subprocesses (one per model) genuinely contend for the same M5 GPU when the main chat's generate call and rag-engine's embed/generate call run at the same time | This degrades gracefully by design (`js/arya-sidebar-panel.js`'s `fetchRagContext()` has a 4.5s timeout, falls back to no grounding context — note: this lives in the existing sidebar file, not a separate `arya-rag-ui.js`, which was never built, see [RAG_INTEGRATION.md](RAG_INTEGRATION.md)) — not usually worth chasing further; see [RAG_PHASES.md](RAG_PHASES.md) Phase 4 |
| TTFT inconsistent, sometimes fast sometimes slow | `OLLAMA_KEEP_ALIVE` doesn't actually apply on this machine (§6) — Ollama uses its real default (~5 min idle unload), so TTFT depends on how recently each model was used | Expected, not generally fixable without Ollama's own Settings UI (not pursued). Send a throwaway warmup query before anything latency-sensitive. |
| ~~First `/api/query` call after a `rag-engine` restart takes 15-25s~~ | **Fixed, Phase 6** — was: reranker + NLI faithfulness model both lazy-loading on first use, Python-side, unrelated to the Ollama issue above. Now: both are explicitly warmed in `server.py`'s startup handler before the server accepts traffic. | If you still see this, check the startup log for `[startup] reranker + faithfulness models warmed in ...s` — if that line is missing, you're running an older `server.py` without the fix. |
| Qdrant slow on cold start | Index larger than available mmap cache | Increase `qdrant`'s `optimizers.memmap_threshold` or accept ~2s cold load — it's one-time per restart |
| Ingestion stalls live queries | Batch embedding job competing for Ollama's single embedding queue | Not actually mitigated — the originally-planned "lower-priority Redis/RQ worker" for ingestion was never built; all ingestion is currently synchronous and will compete with live traffic. Acceptable for now since the corpus is small (508 chunks) and ingestion runs are infrequent/manual. |
