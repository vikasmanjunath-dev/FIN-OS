# FIN-OS QFT Chatbot Engine

> FastAPI · Ollama streaming · Session management  
> **Port:** 7474 | **Version:** v3.0 (Low Latency Optimized) | **Updated:** July 2026

The QFT (Quantum Finance Terminal) engine — the text-based AI backend that powers the `chat.html` and embedded chat widgets across FIN-OS pages.

> **Note:** For the full voice AI agent (WebSocket + STT + TTS), see `voiceagent/`. This module is the simpler text-only streaming backend.

---

## Folder Structure

```
chatbot/
├── brain.py        ← FastAPI server (entry point) — streaming LLM proxy
├── qft-engine.js   ← Browser-side client that talks to brain.py
└── qft-hud.css     ← Terminal / HUD styling for the chat UI
```

---

## What brain.py Does

`brain.py` is a low-latency streaming proxy between the browser and a local Ollama model.

**Request → Response flow:**

```
Browser (qft-engine.js)
  ↓  POST /chat  { messages, session_id }
brain.py
  ↓  POST http://localhost:11434/api/chat  (Ollama)
  ↑  token stream (Server-Sent Events)
Browser renders tokens live
```

### Key design choices

| Choice | Detail |
|---|---|
| Session cap | Max 1000 concurrent sessions (LRU eviction) |
| History cap | Last 8 turns per session (reduced from 20 for faster TTFT) |
| Streaming | Token-by-token SSE — first word appears in ~200ms |
| Persistent HTTP client | Single `httpx.AsyncClient` reused across all requests — avoids per-request TCP setup |
| Rate limiting | `slowapi` — prevents runaway browser loops |
| CORS | Whitelisted: `localhost:3000`, `:5173`, `:5500`, `127.0.0.1` variants |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/chat` | Send a message, get token stream (SSE) |
| GET | `/health` | Service status + uptime + active sessions |
| DELETE | `/sessions/{session_id}` | Clear a session's history |

### POST /chat — request body

```json
{
  "messages": [
    { "role": "user", "content": "What is a SIP?" }
  ],
  "session_id": "optional-uuid",
  "model": "qwen3:4b",
  "stream": true,
  "max_tokens": 2048
}
```

### SSE response format

```
data: {"delta": "A SIP"}
data: {"delta": " (Systematic"}
data: {"delta": " Investment Plan)"}
data: [DONE]
```

---

## qft-engine.js (Browser Client)

The browser-side counterpart. Handles:
- Opening the SSE connection to `brain.py`
- Rendering tokens live as they arrive
- Session ID persistence (localStorage)
- Abort / cancel on user action
- Error recovery and retry

---

## qft-hud.css

Terminal-aesthetic dark HUD styling used by `chat.html`:
- Monospace font (JetBrains Mono)
- Scanline effect
- Typing cursor animation
- Message bubble differentiation (user / AI)
- Responsive mobile layout

---

## Configuration (env vars)

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server address |
| `OLLAMA_MODEL` | `llama3.1` | Default model for general chat |
| `PORTFOLIO_MODEL` | `llama3.1` | Model for portfolio analysis queries |
| `ALLOWED_ORIGINS` | localhost variants | CORS whitelist |
| `MAX_HISTORY` | `8` | Turns kept per session |
| `OLLAMA_TIMEOUT` | `120` | Seconds to wait for first token |
| `MAX_SESSIONS` | `1000` | Max concurrent sessions (LRU eviction) |

---

## Setup

```bash
cd chatbot
# No dedicated venv needed — runs in the voiceagent venv or any env with FastAPI + httpx

pip install fastapi uvicorn httpx pydantic slowapi

# Start Ollama first
ollama serve
ollama pull qwen3:4b   # or whichever model you prefer

# Start brain.py
uvicorn brain:app --port 7474 --reload
```

---

## Difference from Voice Agent

| Feature | chatbot/brain.py | voiceagent/agent.py |
|---|---|---|
| Transport | HTTP / SSE | WebSocket |
| Input | Text (typed) | Audio (microphone) |
| Output | Text stream | Text + Audio (Edge TTS) |
| Wake word | ✗ | ✓ openwakeword |
| Memory | Session (RAM) | Session + Supabase cross-session |
| Mood detection | ✗ | ✓ |
| Intent detection | ✗ | ✓ |
| Calculator engine | ✗ | ✓ CalcEngine |
