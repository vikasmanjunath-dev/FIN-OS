# FIN-OS Voice Agent v10

> Fully local voice AI — faster-whisper STT · qwen3:14b via Ollama · Edge Neural TTS  
> WebSocket server on `ws://127.0.0.1:8765` · UI on `http://localhost:8080`

---

## What It Does

The voice agent is a three-stage local AI pipeline. It serves two kinds of clients:

1. **Standalone UI** (`index.html`) — opened as an iframe by `finos-widget.js` on every FIN-OS page
2. **Arya Brave path** — Brave blocks Google STT and CDN-loaded Whisper, so `arya-tradebook.js`, `mindset-sim-hub.html`, and `simulator-landing.html` connect here directly

```
🎤 Microphone
     ↓  (MediaRecorder / binary frames from browser)
faster-whisper tiny   →  STT (CPU int8, 8 threads, VAD filter)
     ↓
qwen3:14b via Ollama  →  LLM  ← user_context injected here (all trades / page state)
     ↓
Edge Neural TTS       →  en-IN-PrabhatNeural / hi-IN-MadhurNeural
     ↓  (base64 MP3 chunks streamed as audio_seq messages)
🔊 Speaker
```

Everything runs on your machine. No paid API, no cloud inference, complete privacy.

---

## Quick Start

```bash
cd voiceagent

# First time
./run.sh setup          # creates venv, installs deps, downloads Whisper model

# Every time
ollama serve            # terminal 1 — LLM
./run.sh start          # terminal 2 — WS server (:8765) + HTTP server (:8080)

# Open browser
open http://localhost:8080
```

Or manually:
```bash
pip install -r requirements.txt
python agent.py         # WS server on :8765
python -m http.server 8080 --directory .   # UI on :8080
```

---

## Files

| File | Role |
|---|---|
| `agent.py` | WebSocket server — full STT + LLM + TTS pipeline, all AI logic |
| `index.html` | Standalone voice agent UI (3-column: memory · chat orb · stats) |
| `requirements.txt` | Python deps: faster-whisper, ollama, edge-tts, websockets, httpx, python-dotenv |
| `schema.sql` | Supabase `agent_memories` table — persistent cross-session memory |
| `.env.example` | Template for `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` |
| `run.sh` | All-in-one launch script (setup / start / stop / restart) |

---

## Configuration

Edit constants at the top of `agent.py`:

```python
OLLAMA_MODEL    = "qwen3:14b"     # must be pulled: ollama pull qwen3:14b
OLLAMA_THINK    = False           # suppress qwen3 <think> blocks (top-level kwarg)

WHISPER_SIZE    = "tiny"          # tiny / base / small — trade speed vs accuracy
WHISPER_THREADS = 8               # CPU threads for STT

WS_HOST = "127.0.0.1"
WS_PORT = 8765

OLLAMA_OPTIONS = {
    "num_ctx":     32768,         # enlarged for full trade journal context
    "num_predict": 600,           # raised for qwen3 think budget
    "temperature": 0.75,
    "top_p":       0.92,
}

TTS_RATE  = "+12%"
TTS_PITCH = "-3Hz"

EDGE_VOICES = {
    "english":  "en-IN-PrabhatNeural",   # Indian English male
    "hindi":    "hi-IN-MadhurNeural",    # Hindi male
    "hinglish": "en-IN-PrabhatNeural",
}
```

---

## WebSocket Protocol

See [`docs/WEBSOCKET_PROTOCOL.md`](../docs/WEBSOCKET_PROTOCOL.md) for the full message schema.

### Key messages (Arya Brave path)

**Browser → Agent**
| Type | Payload | When |
|---|---|---|
| `user_context` | page state + trade journal / Mind Engine data | on connect, session start |
| `audio_chunk` | `{ data: [int...] }` WebM bytes | after silence detected |
| `text_input` | `{ text: "..." }` | typed chat message |

**Agent → Browser**
| Type | Payload | When |
|---|---|---|
| `ready` | `{ model: "qwen3:14b" }` | on connect |
| `state` | `{ state: "thinking\|transcribing\|speaking\|idle" }` | pipeline transitions |
| `user_transcript` | `{ text: "..." }` | STT result |
| `token` | `{ text: "..." }` | LLM streaming token |
| `reply_done` | — | LLM response complete |
| `audio_seq` | `{ seq: 0, data: "<base64 mp3>" }` | one TTS chunk |
| `audio_seq_done` | `{ total: 3 }` | all chunks sent |
| `tts_fallback` | `{ text: "..." }` | use browser speechSynthesis instead |

---

## User Context — Trade Journal

When Arya is on the TradeBook Pro page (Brave path), `arya-tradebook.js` sends a `user_context` message containing:

- `trade_journal.full_context` — a complete pre-formatted text block with every trade, all per-symbol/strategy/emotion/regime/monthly/day-of-week breakdowns, settings, and rules
- `trade_journal.total_pnl`, `win_rate`, `profit_factor`, `best_symbol`, `worst_symbol`, `current_streak`

`UserContext.to_prompt()` in `agent.py` injects `full_context` verbatim into the system prompt so Arya can answer any specific trade query without the user repeating context. `num_ctx: 32768` accommodates the full trade list.

---

## Language Detection

Auto-detected per message:

| Priority | Condition | Voice |
|---|---|---|
| 1 | Devanagari characters | `hi-IN-MadhurNeural` |
| 2 | Explicit hinglish/hindi keywords | respective voice |
| 3 | ≥ 2 desi casual words (yaar, bhai, karo…) | `en-IN-PrabhatNeural` (Hinglish) |
| 4 | Default | `en-IN-PrabhatNeural` (English) |

---

## Persistent Memory (Supabase)

On disconnect: LLM generates a 120-word factual session summary → saved to `agent_memories`.  
On reconnect: profile + last 20 turns + summary restored → "🧠 MEMORY RESTORED" banner shown.  
Autosave: every 5 minutes during active session.

```bash
# One-time setup — run in Supabase SQL Editor:
cat voiceagent/schema.sql
```

### `.env` setup

```bash
cp .env.example .env
```
```
SUPABASE_URL=https://oeapcyucnduhwpgxfknb.supabase.co
SUPABASE_SERVICE_KEY=eyJhbG...   # Supabase → Settings → API → service_role
```

Persistent memory is gracefully disabled if these are not set.

---

## Standalone UI Features

`index.html` — 3-column layout:

- **Memory panel** — profile card (name, income, goals, debts) + memory feed
- **Chat orb** — desi state labels: READY HAI / SOCH RAHA... / BOL RAHA... / SUN RAHA...
- **Stats panel** — USER / SYNC / MEM / STT / LLM / TTS / LANG / TURNS / LATENCY

Additional controls:
- Persona toggle — YAAR (casual) / GURU (wise) / STRICT (direct)
- Language selector — English / Hinglish / हिंदी
- Voice speed slider — 0.6× to 2.0×
- "ALERTS SUNO" button — reads pending financial alerts aloud
- Quick chips — 5 preset Hinglish question shortcuts

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Ollama connection refused` | Run `ollama serve` in a separate terminal |
| `faster-whisper not found` | `pip install faster-whisper` or run `./run.sh setup` |
| `edge-tts not found` | `pip install edge-tts` |
| No audio in Brave | Confirm `voiceagent/run.sh start` is running; check `ws://127.0.0.1:8765` |
| Arya shows "Backend offline" | Start voiceagent — text chat still works if only `ollama serve` is running |
| Slow first response | Whisper model downloads on first run (~40MB) — subsequent runs are instant |
| `num_ctx too small` error | Already set to 32768 — reduce trade count or switch to a smaller model |

---

## Logs

```bash
tail -f agent.log
```

Key lines:
```
INFO  fin-os: Whisper tiny ready
INFO  fin-os: Ollama warmed up (qwen3:14b)
INFO  fin-os: TTS warmed up (en-IN-PrabhatNeural)
INFO  websockets.server: server listening on 127.0.0.1:8765
INFO  fin-os: [stt] "what is my win rate?" (0.31s)
INFO  fin-os: [llm] first token 0.19s | total 2.3s | 312 tokens
INFO  fin-os: [tts] sentence 1 audio 0.38s
INFO  fin-os: [memory] saved → Supabase (session 7, 43 msgs)
```
