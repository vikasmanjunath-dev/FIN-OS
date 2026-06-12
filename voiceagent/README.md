# FIN-OS Voice Agent v10

> Fully local voice AI — faster-whisper STT · qwen2.5:3b via Ollama · Edge Neural TTS  
> WebSocket server on `wss://127.0.0.1:8765` (TLS) · Served as iframe by `finos-widget.js?v=7`

**Version:** 1.3 | **Updated:** June 7, 2026

---

## What It Does

The voice agent is a three-stage fully-local AI pipeline. It serves two clients:

1. **`finos-widget.js` iframe** — `voiceagent/index.html` loads as a sandboxed iframe on every FIN-OS page (all 96 HTML pages + all 88 calculators). Primary path.
2. **Direct Brave path** — `arya-tradebook.js`, `mindset-sim-hub.html`, `simulator-landing.html` connect directly.

```
🎤 Microphone
     ↓  MediaRecorder (WebM/Opus or WAV) → binary frames over wss://
faster-whisper tiny  (int8, 8 CPU threads, VAD filter)
     ↓ transcript
qwen2.5:3b via Ollama :11434  (streaming, num_ctx=8192, num_predict=400)
     ↓ token stream → audio_seq WebSocket messages
edge-tts Neural  (en-IN-PrabhatNeural / hi-IN-MadhurNeural)
     ↓ base64 MP3 chunks
🔊 AudioContext playback in browser
```

Everything runs on your machine. No paid API, no cloud inference, complete data privacy.

---

## Quick Start

### Prerequisites

```bash
brew install ollama ffmpeg      # macOS
# Linux: curl -fsSL https://ollama.com/install.sh | sh && sudo apt install ffmpeg

ollama pull qwen2.5:3b          # ~2 GB — fastest, recommended
# ollama pull qwen3:14b         # ~9 GB — max quality, slower
```

### First-time setup

```bash
cd voiceagent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env — add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
```

### Every time

```bash
# Terminal 1 — LLM server
ollama serve

# Terminal 2 — Voice agent
cd voiceagent
source .venv/bin/activate
python agent.py
```

### ONE-TIME BROWSER CERT TRUST (do once per browser profile, ever)

On first run, `agent.py` auto-generates `voiceagent/.finos_cert.pem` and `voiceagent/.finos_key.pem` using:

```bash
openssl req -x509 -newkey rsa:4096 -keyout .finos_key.pem -out .finos_cert.pem \
    -days 3650 -nodes -subj "/CN=127.0.0.1" \
    -addext "subjectAltName=IP:127.0.0.1,DNS:localhost"
```

The terminal prints:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ONE-TIME BROWSER TRUST STEP (only needed once ever):
  Open this URL in Brave/Chrome → click Advanced → Proceed:
  https://127.0.0.1:8765
  After accepting, reload finos1.vercel.app  ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

1. Open a new browser tab while `agent.py` is running.
2. Visit **`https://127.0.0.1:8765`**.
3. Click **Advanced → Proceed to 127.0.0.1 (unsafe)** (Chrome/Brave/Edge) or **Accept the Risk and Continue** (Firefox).
4. You see a plain WebSocket error page — that is correct. Trust is now stored permanently.
5. Close the tab. The widget on any FIN-OS page connects automatically.

### Expected startup output

```
INFO  fin-os: Listening on wss://127.0.0.1:8765
INFO  fin-os: Whisper tiny ready
INFO  fin-os: Ollama warmed up (qwen2.5:3b)
INFO  fin-os: TTS warmed up (en-IN-PrabhatNeural)
INFO  fin-os: Ready — FIN-OS AI is live ✅
```

Open `https://finos1.vercel.app` → click the AI FAB → widget shows **ONLINE** (green dot).

---

## Files

| File | Role |
|---|---|
| `agent.py` | WebSocket server — SSL setup, STT pipeline, LLM inference, TTS, memory, alerts |
| `index.html` | Voice agent UI (3-col: memory · chat orb · stats) + Navigation Engine (130+ routes) |
| `requirements.txt` | Python deps: `faster-whisper==1.2.1`, `ollama>=0.1.9`, `edge-tts>=6.1.9`, `websockets>=12.0`, `httpx>=0.27.0`, `python-dotenv>=1.0.1`, `psutil>=5.9.0`, `sentence-transformers>=2.7.0` |
| `schema.sql` | Supabase `agent_memories` table DDL |
| `.env.example` | Template for `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OLLAMA_MODEL` |
| `run.sh` | All-in-one launch helper |
| `.finos_cert.pem` | Auto-generated self-signed TLS cert (CN=127.0.0.1, RSA 4096, 10-year validity) |
| `.finos_key.pem` | Auto-generated private key (no passphrase) |

---

## Configuration

Constants are at the top of `agent.py`. Override `OLLAMA_MODEL` in `voiceagent/.env`.

### WebSocket / SSL

```python
WS_HOST = ""         # "" = all interfaces (IPv4 0.0.0.0 + IPv6 ::)
WS_PORT = 8765       # serves wss://127.0.0.1:8765

# SSL: _get_ssl_context() generates certs on first run via subprocess openssl
# Cert: voiceagent/.finos_cert.pem
# Key:  voiceagent/.finos_key.pem
```

### Model Picker

`_pick_ollama_model()` queries Ollama at startup. Preference order (smallest/fastest first):

```
qwen2.5:3b  (min RAM: 4 GB)   ← picked first
qwen3:4b    (min RAM: 6 GB)
qwen3:8b    (min RAM: 10 GB)
qwen3:14b   (min RAM: 16 GB)
```

Override: `OLLAMA_MODEL=qwen3:14b` in `voiceagent/.env`.

### Inference Options

```python
OLLAMA_OPTIONS = {
    "temperature":    0.75,
    "top_p":          0.92,
    "top_k":          40,
    "repeat_penalty": 1.10,
    "num_ctx":        8192,    # KV cache (was 32768 — reduced for 4x TTFT speedup)
    "num_predict":    400,     # max output tokens (was 600)
    "num_thread":     8,
    "num_keep":       0,       # KV reuse disabled
    "mirostat":       0,
}
OLLAMA_THINK = False           # suppress <think> blocks (required for qwen3)
HISTORY_TURNS = 5              # turns in RAM (was 10)
LLM_FIRST_TOKEN_TIMEOUT = 45  # seconds (was 90)
```

### TTS

```python
TTS_RATE  = "+12%"
TTS_PITCH = "-3Hz"
EDGE_VOICES = {
    "english":  "en-IN-PrabhatNeural",   # Indian English male
    "hindi":    "hi-IN-MadhurNeural",    # Hindi male
    "hinglish": "en-IN-PrabhatNeural",
}
```

### STT

```python
WHISPER_SIZE    = "tiny"    # int8 quantised — fastest
WHISPER_THREADS = 8
WHISPER_DIR     = "./models"
```

---

## WS_URL Selection in `index.html`

```javascript
const WS_URL = (function() {
  const p = new URLSearchParams(window.location.search);
  if (p.get('ws')) return p.get('ws');             // ?ws= override
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//127.0.0.1:8765`;               // explicit IPv4 (not localhost)
})();
```

- **HTTPS page (finos1.vercel.app):** `wss://127.0.0.1:8765`
- **HTTP page (local dev):** `ws://127.0.0.1:8765`

Explicit `127.0.0.1` avoids DNS resolution to `::1` (IPv6 loopback) on some macOS versions.

---

## Navigation Engine (`index.html`)

Intercepts navigation intent **before** messages are sent to Ollama.

```
User input (typed or voice)
  → detectNavIntent(text)
      ├─ NAV_TRIGGER regex (English + Hindi/Hinglish trigger words)
      └─ FINOS_PAGES[130+] keyword matching (longest match wins)
           ↓ match found
  → navigateTo(page)
      ├─ shows "📍 Navigating to [Label]..." bubble in chat
      └─ after 200ms: postMessage { type:'finos_navigate', url, label }
           ↓ received by finos-widget.js
  → closeWidget() → 240ms → window.location.href = url
```

Total latency: ~440ms. Covers all 96 HTML pages + all 88 calculators.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `OSError: [Errno 48] address already in use` | Old process on :8765 | `lsof -ti :8765 \| xargs kill -9` |
| Widget OFFLINE | Cert not trusted | Visit `https://127.0.0.1:8765` → Advanced → Proceed |
| Widget OFFLINE | agent.py not started | `cd voiceagent && python agent.py` |
| High latency | Wrong model or large ctx | Use `qwen2.5:3b`; check `num_ctx=8192` in agent.py |
| TTS silent | No internet | edge-tts needs internet; set `USE_PIPER=true` in .env |
| STT inaccurate | `tiny` model | `WHISPER_SIZE=small` in .env |
| SSL error at start | Cert files corrupt | Delete `.finos_cert.pem` + `.finos_key.pem` → restart |

---

## Latency Optimisation Table

| Parameter | Before | After | Effect |
|---|---|---|---|
| `num_ctx` | 32768 | **8192** | 4× faster first token (biggest win) |
| `HISTORY_TURNS` | 10 | **5** | Shorter prompt → faster prefill |
| `num_predict` | 600 | **400** | Faster per-turn completion |
| `num_keep` | 12 | **0** | Reduces VRAM pressure |
| `LLM_FIRST_TOKEN_TIMEOUT` | 90 s | **45 s** | Fail fast, surface errors sooner |
| Model picker order | largest-first | **smallest-first** | Prefers qwen2.5:3b for speed |
| `WS_HOST` | `"127.0.0.1"` | **`""`** | Binds IPv4 + IPv6 (fixes macOS localhost→::1) |
| Widget iframe load | on click | **2s preload** | Zero wait time on open |
| Context send delay | 800ms | **200ms** | Faster profile sync |
| Navigation delay | 1000ms | **200ms** | 5× faster navigation |
