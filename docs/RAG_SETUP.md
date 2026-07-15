# FIN-OS RAG — Local Setup Guide

> Version: 1.4 | Date: June 21, 2026 — Phase 6: server startup now warms the reranker/NLI models before accepting traffic (measured 8.4s); all three batch ingest endpoints are now async and require a separate `rq worker` process (`--worker-class SimpleWorker` required on macOS — a real fork-crash bug, not a style choice, see Phase 6 in RAG_PHASES.md)
> Target: Apple M5, 24 GB unified memory, 1 TB SSD. No Docker required.

This guide gets the full RAG stack running from scratch, in order. Follow sequentially — each step depends on the previous one.

---

## Prerequisites

```bash
python3 --version      # need 3.10+
ollama --version        # need latest — install if missing

# Redis is on Homebrew. Qdrant is NOT — brew install qdrant fails
# ("No available formula") and there's no qdrant/qdrant tap either.
# See step 3 below for the real install method (official GitHub binary).
brew install redis
```

If Ollama is already running for the existing voice agent / Arya backend (it's an app at `/Applications/Ollama.app`, not a brew service), skip the install — just confirm models below are pulled. Start it with `open -a Ollama` if it's not running.

---

## 1. Pull Required Models

```bash
ollama pull qwen3:8b            # primary RAG generation (changed from 14b — see RAG_MODELS.md), ~4.7 GB
ollama pull qwen3:14b           # available for harder synthesis later, ~8.5 GB (may already be pulled)
ollama pull mxbai-embed-large   # primary embedding, ~670 MB
ollama pull nomic-embed-text    # fallback embedding, ~274 MB — pulled but not yet exercised

ollama list   # confirm all 4 are present
```

**Critical, easy to miss:** qwen3 models reason-by-default ("thinking" mode), generating hidden chain-of-thought tokens before the visible answer. Every Ollama call in this build passes `"think": false` — without it, a trivial prompt that should take <1s took 11.9s in testing. This isn't optional for usable latency.

---

## 2. Set Required Environment Variables — ⚠️ does not actually work for the Ollama.app GUI, confirmed

Add to `~/.zshrc` (persists across terminal sessions):

```bash
echo 'export PYTORCH_ENABLE_MPS_FALLBACK=1' >> ~/.zshrc
echo 'export OLLAMA_NUM_PARALLEL=2' >> ~/.zshrc
echo 'export OLLAMA_KEEP_ALIVE="-1"' >> ~/.zshrc
source ~/.zshrc
```

`PYTORCH_ENABLE_MPS_FALLBACK` works fine — it's read by Python processes you launch from this same shell (the rag-engine server). **`OLLAMA_NUM_PARALLEL`/`OLLAMA_KEEP_ALIVE` do not actually reach Ollama on this machine**, confirmed during Phase 4: Ollama runs as `/Applications/Ollama.app`, started via `open -a Ollama` (a GUI launch), which does not inherit shell-exported variables. Also tried the macOS-standard workaround:
```bash
launchctl setenv OLLAMA_NUM_PARALLEL 2
launchctl setenv OLLAMA_KEEP_ALIVE "-1"
# then quit and relaunch Ollama.app
```
**This also did not take** — verified via `ps eww -p $(pgrep -x ollama) | grep OLLAMA` showing neither variable present in the running process's actual environment, even after `launchctl setenv` + a full app restart. The real, unresolved fix is likely Ollama's own in-app Settings UI (some versions expose environment variables there) — not attempted, since driving a GUI settings panel wasn't worth it via computer-use for this. **Practical consequence:** Ollama uses its defaults (5-minute idle unload, default parallelism). This is survivable — see [RAG_HARDWARE.md](RAG_HARDWARE.md) §4 and [RAG_PHASES.md](RAG_PHASES.md) Phase 4 for how the rest of the system was adapted around it (longer timeouts, warmup calls, graceful degradation) rather than fighting it further.

---

## 3. Install and Start Qdrant — official binary, NOT Homebrew

```bash
mkdir -p ~/qdrant-bin && cd ~/qdrant-bin
curl -L -o qdrant.tar.gz https://github.com/qdrant/qdrant/releases/download/v1.18.2/qdrant-aarch64-apple-darwin.tar.gz
tar -xzf qdrant.tar.gz && rm qdrant.tar.gz && chmod +x qdrant

mkdir -p storage
cat > config.yaml << 'EOF'
storage:
  storage_path: ./storage
service:
  http_port: 6333
  grpc_port: 6334
log_level: INFO
EOF

nohup ./qdrant --config-path config.yaml > qdrant.log 2>&1 &
disown
sleep 3
curl http://localhost:6333/healthz   # expect: "healthz check passed"
```

Storage lives at `~/qdrant-bin/storage` (this guide's choice — not Qdrant's own default location, since there's no installed-package default when running from a raw binary). Check for a newer release at `https://github.com/qdrant/qdrant/releases` before pinning v1.18.2 long-term.

---

## 4. Start Redis

```bash
brew services start redis
redis-cli ping   # expect: PONG
```

---

## 5. Create the `rag-engine` Project

```bash
cd "Initial Deployment"
mkdir -p rag-engine/{ingestion,embedding,storage,retrieval,generation,evaluation}
cd rag-engine

python3 -m venv .venv
source .venv/bin/activate
```

`requirements.txt` — **this is the actual file as built through Phase 5** (verified working, pinned versions). LlamaIndex, `bm25s`, `pdfminer.six`, and Supabase were in the original plan but turned out unnecessary for this scope — see [RAG_SYSTEM.md](RAG_SYSTEM.md) design decisions table for why LlamaIndex specifically was dropped. **No separate package was needed for the SEBI/RBI crawler (Phase 3) or the faithfulness guard (Phase 5)** — both reuse `httpx`/`beautifulsoup4` and `sentence-transformers` already in the file:
```
# Phase 1
fastapi==0.115.6
uvicorn[standard]==0.34.0
httpx==0.28.1
qdrant-client==1.12.1
pymupdf==1.25.1
beautifulsoup4==4.12.3
presidio-analyzer==2.2.358
presidio-anonymizer==2.2.358
python-dotenv==1.0.1
pydantic==2.10.4

# Phase 2 — Hybrid retrieval, reranking, generation
sentence-transformers==3.3.1
torch==2.5.1
redis==5.2.1

# Phase 3 — User document upload, Supabase auth
python-multipart==0.0.20

# Phase 5 — Evaluation
pytest==8.3.4
```

```bash
pip install -r requirements.txt
python3 -m spacy download en_core_web_sm   # presidio needs this — NOT en_core_web_lg
                                            # (the default is a 400MB model we don't need;
                                            # explicit small-model config is in ingestion/pii.py)
```

The faithfulness guard's NLI model (`cross-encoder/nli-deberta-v3-base`) and the reranker (`BGE-reranker-v2-m3`) both auto-download from HuggingFace Hub on first use — no manual pull step needed. **As of Phase 6, both are explicitly warmed up in `server.py`'s startup handler** (measured 8.4s combined on a machine that already has them cached locally — 6.4s reranker + 2.0s NLI), so this cost is paid once at server boot, not on whichever real request happens to land first. Startup itself takes a little longer as a result; `/api/health` won't report `"ok"` until warmup finishes.

**Still genuinely not needed — add only when you reach the phase that uses them:**
- `pandas`, `openpyxl`, `python-docx` — table/Excel/DOCX loaders (not built yet)
- `easyocr` — scanned PDF OCR (not built yet)
- `apscheduler` — was planned for SEBI/RBI crawler scheduling, but the crawler that got built (Phase 3) uses a manual `POST /api/ingest/{sebi-circulars,rbi-notifications}` trigger instead — no scheduler exists or is currently planned to be added
- `supabase` — once the `rag_documents`/`rag_feedback` schema migration actually happens (Phase 1 gap, still open — see [RAG_PHASES.md](RAG_PHASES.md))
- `ragas`, `prometheus-client` — evaluation tooling (Phase 5 — RAGAS suite and metrics endpoint still not built; only the faithfulness guard and namespace isolation pytest are)
- `langdetect` — multilingual routing (not yet needed; current corpus is English-only — RBI's Devanagari headers are stripped, not translated, see [RAG_PHASES.md](RAG_PHASES.md) Phase 3)

> **MPS note for `sentence-transformers`/`torch`:** Apple Silicon wheels include MPS support by default via `pip install torch` (no special index needed as of current PyTorch releases). Verify with:
> ```bash
> python3 -c "import torch; print(torch.backends.mps.is_available())"   # expect: True
> ```

---

## 6. Supabase Schema Migration — ⚠️ NOT YET DONE in the actual Phase 1+2 build

This step was in the original plan but was **skipped** during the real Phase 1+2 build — it's not required for anything that currently works (ingestion, hybrid retrieval, generation, citations all run without it). It becomes necessary before Phase 3's user-document upload, since that's what needs per-user document tracking and RLS-backed namespace isolation at the database level (today, namespace isolation is enforced only at the Qdrant/SQLite query level, which is verified working but doesn't give you a document registry or feedback table).

When you do reach that point, run the SQL from [RAG_KNOWLEDGE_BASE.md](RAG_KNOWLEDGE_BASE.md) §3 (`rag_documents`, `rag_feedback` tables + RLS policies) against the existing FIN-OS Supabase project via the SQL editor, or save as `rag-engine/schema.sql` and apply:

```bash
psql "$SUPABASE_DB_URL" -f schema.sql
```

Reuses the existing Supabase project (`oeapcyucnduhwpgxfknb`) — no new project needed.

---

## 7. Create the Qdrant Collection

Not a separate manual step in practice — `rag-engine/server.py`'s `@app.on_event("startup")` handler calls `ensure_collection()` automatically, which creates `finos_chunks` (1024-dim, Cosine, HNSW m=16/ef_construct=128) if it doesn't already exist. Starting the server (step 8) handles this.

---

## 8. First Index Run — FIN-OS Pages

`rag-engine/server.py` is implemented through Phase 6 (see [RAG_PHASES.md](RAG_PHASES.md)). **Two processes are required as of Phase 6** — the API server, and a separate ingestion worker (ingestion is async now; nothing processes a queued job without a worker running):

```bash
cd rag-engine && source .venv/bin/activate
uvicorn server:app --host 127.0.0.1 --port 7476 &
# Startup now takes ~8s longer than it used to — server.py warms the reranker
# and faithfulness models before reporting healthy (Phase 6, see §1 above).
until curl -s http://localhost:7476/api/health > /dev/null; do sleep 1; done

# --worker-class SimpleWorker is required on macOS, not optional — RQ's default
# Worker forks a subprocess per job, and jobs.py transitively imports torch (via
# presidio's spaCy dependency), which makes fork() crash on macOS once Metal/MPS
# has touched anything. See RAG_PHASES.md Phase 6 for the full root-cause writeup.
rq worker rag-ingestion --worker-class rq.worker.SimpleWorker --url redis://localhost:6379 &

curl -X POST http://localhost:7476/api/ingest/finos-pages
```

**Real measured result:** `{"job_id": "d26f82b6-...", "status": "queued"}` — ingestion is async (Phase 6), so this returns immediately rather than blocking. Poll it:
```bash
curl http://localhost:7476/api/ingest/status/d26f82b6-6a44-4568-b5fa-0dd28389cd7c
```
**Real result once finished:** `{"pages_processed": 94, "chunks_created": 297, "pii_redactions": 0, "duration_sec": 21.26}` — pages_processed is 94 (the count of `html/*.html`; `index.html`/`login.html` aren't included by this endpoint yet). `chunks_created` was originally measured at 187 in earlier Phase 1+2 testing — grew to 297 after a Phase 3 chunking fix applied globally with zero content change, see [RAG_KNOWLEDGE_BASE.md](RAG_KNOWLEDGE_BASE.md).

---

## 8a. Optional — Ingest Real Regulatory Content (Phase 3, async since Phase 6)

```bash
curl -X POST http://localhost:7476/api/ingest/sebi-circulars -H "Content-Type: application/json" -d '{"limit": 5}'
curl -X POST http://localhost:7476/api/ingest/rbi-notifications -H "Content-Type: application/json" -d '{"limit": 4}'
```

Both return `{"job_id", "status": "queued"}` immediately and crawl the **live** SEBI/RBI websites in the background — real network calls, not fixtures. Poll `GET /api/ingest/status/{job_id}` for results. **Real measured results once finished:** SEBI returned `{"circulars_fetched": 5, "chunks_created": 30, "duration_sec": 9.11}`; RBI returned `{"chunks_created": 181, "duration_sec": 16.09}` (after a chunking bug fix — see [RAG_PHASES.md](RAG_PHASES.md) Phase 3 if you hit a 400 error from Ollama's embed endpoint in the job's `error` field, that's the same issue, already fixed in `ingestion/chunker.py`'s `_MAX_CHUNK_CHARS` cap). AMFI is not implemented — their site is JS-rendered.

---

## 9. Verify End-to-End

```bash
curl -X POST http://localhost:7476/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "How is insurance cover calculated in FIN-OS?", "stream": false}'
```

Returns an answer citing FIN-OS's own page content with `[SOURCE_N]` tags, plus a `flagged_sentences` array (Phase 5's faithfulness guard — see [RAG_PHASES.md](RAG_PHASES.md) Phase 5 for an honest caveat on its reliability before treating a non-empty result as proof of anything) — confirmed working. **Expect 6-8 seconds on a cache miss, including the first one** — the reranker/NLI cold-load tax that used to land on the first real request is now paid during server startup instead (Phase 6 fix — `server.py`'s startup handler warms both models before accepting traffic; see [RAG_HARDWARE.md](RAG_HARDWARE.md) §4). Repeat the exact same query and it returns in under 5ms (cache hit).

---

## 9a. Run the Namespace Isolation Test (Phase 5)

```bash
cd rag-engine && source .venv/bin/activate
pytest evaluation/test_namespace_isolation.py -v
```

**Real measured result:** `3 passed in 1.39s`. This is a security regression test, not optional — see [RAG_EVALUATION.md](RAG_EVALUATION.md) §6. It's self-cleaning (seeds a test chunk, deletes it after), confirmed via `collection_size` in `/api/health` being unchanged before and after.

---

## 10. Auto-Start on Login (launchd)

Create `~/Library/LaunchAgents/com.finos.rag-engine.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.finos.rag-engine</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-c</string>
    <string>cd "/Users/vkm/Desktop/Finos/Initial Deployment/rag-engine" && ./start-all.sh</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/finos-rag-engine.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/finos-rag-engine.error.log</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.finos.rag-engine.plist
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ollama pull` hangs | Check internet; M5 download speed should pull qwen3:14b (~8.5GB) in a few minutes on broadband |
| `torch.backends.mps.is_available()` returns `False` | Update macOS to latest; confirm Python is arm64 native (`python3 -c "import platform; print(platform.machine())"` should print `arm64`, not `x86_64` under Rosetta) |
| Qdrant healthz fails | `ps aux \| grep qdrant` — confirm the binary process is running; check `~/qdrant-bin/qdrant.log` (no brew service exists for Qdrant — it's a raw binary, see step 3) |
| Port 7476 already in use | `lsof -i :7476` to find the conflicting process; this port should be unused by any existing FIN-OS service per [RAG_HARDWARE.md](RAG_HARDWARE.md) §5 |
| High latency on first query after idle, or `OLLAMA_KEEP_ALIVE`/`OLLAMA_NUM_PARALLEL` seem to have no effect | **Expected on this machine — confirmed not fixable via env vars.** Ollama.app (GUI launch via `open -a Ollama`) doesn't inherit shell-exported vars, and `launchctl setenv` + restart was tried and confirmed (via `ps eww`) to still not work. See step 2's full writeup. Don't keep retrying env var tweaks — the system is built to tolerate Ollama's defaults instead (longer timeouts, warmup calls). |
| Server takes ~8s longer than expected to start, `/api/health` doesn't go "ok" right away | **Expected, fixed in Phase 6.** `server.py`'s startup handler now explicitly warms both the reranker and the faithfulness NLI model before the server accepts traffic (measured 8.4s combined: 6.4s reranker + 2.0s NLI) — this used to silently tax whichever real query happened to be first; now it's paid once at boot instead. If you see a 15-25s+ first-query delay *despite* a clean startup log showing `[startup] reranker + faithfulness models warmed in ...s`, something else is wrong — file it as a real regression, not this known cost. |
| `brew install qdrant` says "No available formula" | Expected — there is no Homebrew formula or tap for Qdrant. Use the official GitHub binary release per step 3, not brew |
| `POST /api/ingest/sebi-circulars` or `rbi-notifications` returns a 400 from Ollama embed | Almost certainly the dense-table/Devanagari chunking issue fixed in `ingestion/chunker.py`'s `_MAX_CHUNK_CHARS` (1200) and `ingestion/regulatory.py`'s Devanagari-line stripping — confirm you have the current code, not a copy from before Phase 3's chunker fix. See [RAG_PHASES.md](RAG_PHASES.md) Phase 3 for the full root cause. |
| Browser console shows a CORS error calling `localhost:7476` | Shouldn't happen — `CORSMiddleware` with `allow_origins=["*"]` is built into `server.py` (Phase 4). If you see this, confirm you're running the current `server.py`, not an older copy from before Phase 4. |
| `POST /api/ingest/*` returns `{"status":"queued"}` and never progresses | **No worker running.** Check `GET /api/health`'s `ingest_workers_running` field — if `0`, start one: `rq worker rag-ingestion --worker-class rq.worker.SimpleWorker --url redis://localhost:6379` (Phase 6). Queued jobs sit forever with no symptom otherwise — this field exists specifically to make that visible. |
| RQ worker crashes immediately with `objc[...]: +[MPSGraphObject initialize] may have been in progress...Crashing instead` | **You're missing `--worker-class rq.worker.SimpleWorker`.** RQ's default `Worker` forks a subprocess per job; `jobs.py` transitively imports torch via `ingestion.pii` → presidio → spaCy → `thinc`, and forking after torch has touched Metal/MPS crashes on macOS. This is not optional or a "sometimes" issue — confirmed it crashes every time without the flag. See [RAG_PHASES.md](RAG_PHASES.md) Phase 6. |
