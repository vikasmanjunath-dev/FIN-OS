# FIN-OS Voice Agent v10

> Fully local voice AI — faster-whisper STT · qwen2.5:3b via Ollama · Edge Neural TTS  
> WebSocket server on `ws://127.0.0.1:8765` (plain — no SSL) · Served as iframe by `finos-widget.js?v=7`

**Version:** 1.4 | **Updated:** July 14, 2026

---

## What It Does

The voice agent is a three-stage fully-local AI pipeline. It serves two clients:

1. **`finos-widget.js` iframe** — `voiceagent/index.html` loads as a sandboxed iframe on every FIN-OS page (all 96 HTML pages + all 88 calculators). Primary path.
2. **Direct Brave path** — `arya-tradebook.js`, `mindset-sim-hub.html`, `simulator-landing.html` connect directly.

```
🎤 Microphone
     ↓  MediaRecorder (WebM/Opus or WAV) → binary frames over ws://
faster-whisper tiny  (int8, 8 CPU threads, VAD filter)
     ↓ transcript
qwen2.5:3b via Ollama :11434  (streaming, num_ctx=8192, num_predict=400)
     ↓ token stream → audio_seq WebSocket messages
edge-tts Neural  (en-IN-PrabhatNeural / hi-IN-MadhurNeural)
     ↓ base64 MP3 chunks
🔊 AudioContext playback in browser
```

Everything runs on your machine. No paid API, no cloud inference, complete data privacy.

### Wake word (opt-in)

Click 👂 to start hands-free activation — say **"Hey Jarvis"** and recording
starts automatically, same as clicking 🎙 yourself. Off by default; nothing
streams to the backend until you click it on, and clicking it off stops the
mic capture immediately.

"Hey Jarvis," not "Hey Arya" — [openwakeword](https://github.com/dscripka/openWakeWord)
(the local, no-API-key wake-word engine) ships pretrained models for `alexa`,
`hey_jarvis`, `hey_mycroft`, `hey_rhasspy`, `timer`, `weather`. There's no
pretrained "Hey Arya"; training one needs real recorded voice samples run
through openwakeword's own training pipeline. `hey_jarvis` is a stand-in —
swap `WAKE_WORD_MODEL` in `agent.py` once a custom model exists, nothing else
needs to change.

Still click-to-stop: detecting the wake word only auto-starts recording, the
same way clicking 🎙 always worked. There's no silence-based auto-stop here —
building one needs real human-voice threshold tuning this project can't do
without a live microphone, so it's left as a known, deliberate gap rather
than a guessed-at heuristic.

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

### Expected startup output

```
INFO  fin-os: Listening on ws://127.0.0.1:8765
INFO  fin-os: Whisper tiny ready
INFO  fin-os: Ollama warmed up (qwen2.5:3b)
INFO  fin-os: TTS warmed up (en-IN-PrabhatNeural)
INFO  fin-os: Ready — FIN-OS AI is live ✅
```

No browser cert trust step required — the agent runs on plain `ws://`, not `wss://` (TLS was reverted in June 2026; see progress.md Phase 14J for context).

Open `https://finos1.vercel.app` → click the AI FAB → widget shows **ONLINE** (green dot).

---

## Files

| File | Role |
|---|---|
| `agent.py` | WebSocket server (plain ws://) — STT pipeline, LLM inference, TTS, memory, wake-word opt-in |
| `index.html` | Voice agent UI (3-col: memory · chat orb · stats) + Navigation Engine (130+ routes) + 👂 wake-word toggle |
| `requirements.txt` | Python deps: `faster-whisper==1.2.1`, `ollama>=0.1.9`, `edge-tts>=6.1.9`, `websockets>=12.0`, `httpx>=0.27.0`, `python-dotenv>=1.0.1`, `psutil>=5.9.0`, `sentence-transformers>=2.7.0`, `openwakeword>=0.6.0` (+ `scipy<1.14` pin — version conflict with `numpy==1.26.4`; see requirements.txt comment) |
| `schema.sql` | Supabase `agent_memories` table DDL |
| `.env.example` | Template for `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OLLAMA_MODEL` |
| `run.sh` | All-in-one launch helper |

---

## Configuration

Constants are at the top of `agent.py`. Override `OLLAMA_MODEL` in `voiceagent/.env`.

### WebSocket

```python
WS_HOST = "127.0.0.1"   # IPv4 loopback only — no SSL, no external access
WS_PORT = 8765           # serves ws://127.0.0.1:8765 (plain, not wss://)
# No SSL context — agent.py does NOT call _get_ssl_context() or pass ssl= to websockets.serve()
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
HISTORY_TURNS = 10             # turns kept in RAM for context
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
const WS_URL = 'ws://127.0.0.1:8765';  // always plain ws://, regardless of page protocol
```

Always `ws://127.0.0.1:8765` — even from HTTPS pages on finos1.vercel.app. The agent uses no TLS. Explicit `127.0.0.1` avoids DNS resolution to `::1` (IPv6 loopback) on some macOS versions.

> **Note:** The `?ws=` query-param override and `wss://` auto-detection were removed when TLS support was reverted (Phase 14J, June 2026).

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
| Widget OFFLINE | agent.py not started | `cd voiceagent && python agent.py` |
| Widget OFFLINE | Wrong WS URL | Check browser console — must connect to `ws://127.0.0.1:8765` (not `wss://`) |
| High latency | Wrong model or large ctx | Use `qwen2.5:3b`; check `num_ctx=8192` in agent.py |
| TTS silent | No internet | edge-tts needs internet; set `USE_PIPER=true` in .env |
| STT inaccurate | `tiny` model | `WHISPER_SIZE=small` in .env |
| Wake-word false positives | Audio buffer state leak | Restart agent.py (model state resets on each new session) |

---

## Latency Optimisation Table

| Parameter | Before | After | Effect |
|---|---|---|---|
| `num_ctx` | 32768 | **8192** | 4× faster first token (biggest win) |
| `num_predict` | 600 | **400** | Faster per-turn completion |
| `num_keep` | 12 | **0** | Reduces VRAM pressure |
| `LLM_FIRST_TOKEN_TIMEOUT` | 90 s | **45 s** | Fail fast, surface errors sooner |
| Model picker order | largest-first | **smallest-first** | Prefers qwen2.5:3b for speed |
| `WS_HOST` | `""` (all interfaces) | **`"127.0.0.1"`** | IPv4 loopback only; no SSL, no external |
| Protocol | `wss://` (TLS) | **`ws://`** (plain) | No cert trust step, works immediately |
| Widget iframe load | on click | **2s preload** | Zero wait time on open |
| Context send delay | 800ms | **200ms** | Faster profile sync |
| Navigation delay | 1000ms | **200ms** | 5× faster navigation |
