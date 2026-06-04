# FIN-OS Voice Agent — WebSocket Protocol

> Version: 1.2 | Date: June 5, 2026  
> `ws://127.0.0.1:8765` · Server: `voiceagent/agent.py`

There are two browser clients that connect to this server:

| Client | Source | When used |
|---|---|---|
| **Standalone voice agent** | `voiceagent/index.html` | `finos-widget.js` opens it as an iframe — all browsers |
| **Arya Brave path** | `arya-tradebook.js`, `mindset-sim-hub.html`, `simulator-landing.html` | Only in Brave (auto-detected) |

Both use the same WS endpoint and message protocol.

---

## Connection

The browser connects to `ws://127.0.0.1:8765`. The server accepts one client at a time. If a second connection arrives, the previous session is cleanly closed first.

The connection is local-only (`127.0.0.1`). It cannot be reached from external IPs by design.

### Connection lifecycle

```
Browser → ws://127.0.0.1:8765
  Server: accept connection, sends "ready" message
  Browser: sends "user_context" message with page state
  Server: loads persistent memory if user_id matches
  ... conversation ...
  Browser: disconnects (tab close / page change)
  Server: saves session to Supabase, clears RAM
```

---

## Message Frames

- **JSON messages** — sent as UTF-8 text frames
- **Audio from browser** — sent as binary frames (raw PCM float32)
- **Audio to browser** — base64-encoded MP3 inside a JSON text frame

---

## Browser → Agent Messages

### `user_context`

Sent immediately after connection (and on page navigation / session start) to inject live page state into every LLM response. Replaces the older `context` message format.

```json
{
  "type": "user_context",
  "sync_phase": "full",
  "page_module": "trade_journal",
  "page": { "module": "trade_journal", "title": "TradeBook Pro — Trade Journal" },
  "identity": { "name": "Vikas Manjunath" },
  "trade_journal": {
    "total_trades": 73,
    "total_pnl": 23952.76,
    "win_rate": 58.9,
    "avg_win": 1240.5,
    "avg_loss": 680.2,
    "profit_factor": 1.82,
    "capital": 500000,
    "weekly_target": 15000,
    "best_symbol": { "symbol": "BANKNIFTY CE", "pnl": 8400 },
    "worst_symbol": { "symbol": "NIFTY PE", "pnl": -3200 },
    "current_streak": "3 win",
    "recent_trades": [
      { "symbol": "NIFTY CE", "type": "Long", "net": 1250, "date": "2024-05-15" }
    ],
    "full_context": "━━━ TRADEBOOK PRO: COMPLETE JOURNAL CONTEXT ━━━\n[all trades + all breakdowns]"
  }
}
```

**Mind Engine variant** (sent from `mindset-sim-hub.html` / `simulator-landing.html`):
```json
{
  "type": "user_context",
  "sync_phase": "full",
  "page_module": "mind_engine",
  "page": { "module": "mind_engine", "title": "FIN-OS Mind Engine" },
  "identity": { "name": "Vikas" },
  "financial": {
    "custom": {
      "module": "mind_engine",
      "discipline_score": 72,
      "xp": 2400,
      "sessions": 18,
      "fomo_blocked": 5,
      "archetype": "The Analyst",
      "brain_state": "Calm & Focused"
    }
  }
}
```

`full_context` is a pre-formatted multi-section text block (built by `buildFullTradeContext()` in `arya-tradebook.js`) containing every individual trade plus all per-symbol/strategy/emotion/regime breakdowns. `UserContext.to_prompt()` in `agent.py` injects it verbatim into the system prompt.

---

### `context` (legacy — standalone voice agent UI)

Sent by `voiceagent/index.html` via the `finos-context.js` pipeline. Older format — still handled by `agent.py`.

```json
{
  "type": "context",
  "context": {
    "_user_id": "3e8f2a1b-...",

```json
{
  "type": "context",
  "context": {
    "_user_id": "3e8f2a1b-...",
    "_sync_phase": "full",
    "identity": {
      "name": "Rahul Sharma",
      "income_range": "10L-15L",
      "life_stage": "growth",
      "city": "Bangalore",
      "financial_dna": "wealth_builder",
      "mindset": "disciplined_saver",
      "risk_tolerance": "moderate",
      "interests": ["investing", "tax", "real_estate"]
    },
    "profile": {
      "age": 28,
      "has_home_loan": true,
      "has_sip": true,
      "has_ppf": false,
      "has_nps": false,
      "has_term_insurance": false,
      "emergency_fund_months": 4
    },
    "page": "portfolio_analyser",
    "portfolio": {
      "total_value": 850000,
      "total_cost": 755000,
      "pnl": 95000,
      "pnl_pct": 12.6,
      "holdings_count": 12,
      "stocks_count": 8,
      "mf_count": 4,
      "top_holdings": [
        { "symbol": "RELIANCE", "value": 210000, "pnl_pct": 18.2 },
        { "symbol": "INFY", "value": 145000, "pnl_pct": 5.1 }
      ],
      "top_gainers": [
        { "symbol": "RELIANCE", "pnl_pct": 18.2 }
      ],
      "top_losers": [
        { "symbol": "HDFCBANK", "pnl_pct": -4.3 }
      ],
      "sector_breakdown": [
        { "sector": "Technology", "pct": 32 },
        { "sector": "Finance", "pct": 25 }
      ]
    },
    "goals": [
      { "name": "Emergency Fund", "target": 360000, "current": 145000, "progress_pct": 40.3 },
      { "name": "House Down Payment", "target": 2000000, "current": 300000, "progress_pct": 15 }
    ],
    "transactions": {
      "summary": {
        "total_income_90d": 375000,
        "total_expense_90d": 248000,
        "top_categories": [
          { "category": "rent", "amount": 45000 },
          { "category": "food", "amount": 18000 }
        ]
      }
    },
    "health_score": {
      "score": 62,
      "tier": "GOOD",
      "tips": ["Open a term insurance", "Max your 80C"]
    },
    "budget_app": {
      "monthly_budget": 80000,
      "spent_this_month": 67000,
      "savings_rate": 0.22
    }
  }
}
```

All fields are optional. The agent degrades gracefully if any are missing.

---

### `text_input`

Typed input from Arya Brave path (chat input box).

```json
{
  "type": "text_input",
  "text": "Should I buy a house or continue renting?"
}
```

### `text` (legacy — standalone voice agent)

```json
{
  "type": "text",
  "text": "Should I buy a house or continue renting?"
}
```

---

### `audio_chunk` (Brave path)

WebM/Opus audio bytes captured by `MediaRecorder` in the browser. Sent after silence is detected by the RMS watcher. The agent decodes the audio, runs VAD, and transcribes with faster-whisper.

```json
{
  "type": "audio_chunk",
  "data": [82, 73, 70, 70, 0, 0, ...]
}
```

`data` is a `Uint8Array` serialised as a JSON integer array.

---

### `audio` (binary frame — legacy standalone agent)

Raw PCM float32 audio data. Sent continuously from the browser AudioWorkletProcessor while microphone is active. The server buffers it and runs VAD to detect end-of-speech.

No JSON wrapper — pure binary WebSocket frame.

---

### `ping`

Keepalive. The server resets its inactivity timer on receipt.

```json
{ "type": "ping" }
```

---

### `clear_memory`

Clears in-RAM memory for the current session. Does not delete Supabase persistent memory.

```json
{ "type": "clear_memory" }
```

---

## Agent → Browser Messages

Two sets of message types exist — the **Brave/Arya path** (used by `arya-tradebook.js`, `mindset-sim-hub.html`, `simulator-landing.html`) and the **standalone voice agent** (`voiceagent/index.html`). They share the same WS server but use different message schemas.

---

### Brave / Arya Path Messages

#### `ready`

First message sent after connection is established. Tells the browser the backend is online and which model is loaded.

```json
{ "type": "ready", "model": "qwen3:14b" }
```

Browser uses `model` to update the status label ("Local AI · qwen3").

---

#### `state`

Pipeline state transitions. Browser updates mic button, wave animation, and status text.

```json
{ "type": "state", "state": "thinking" }
```

| `state` value | Browser action |
|---|---|
| `thinking` | Show thinking dots, stop mic, set status "THINKING…" |
| `transcribing` | Set status "UNDERSTANDING…", hide wave |
| `speaking` | Set status "ARYA IS SPEAKING", show wave, mic btn → 🔊 |
| `idle` | `_bvBusy = false`; resume mic after 1.4s if listening |

---

#### `pipeline_start`

Sent when audio processing begins (after receiving `audio_chunk`). Browser stops capture immediately so recording doesn't continue during processing.

```json
{ "type": "pipeline_start" }
```

---

#### `user_transcript`

STT result from faster-whisper. Displayed in chat as a user bubble.

```json
{ "type": "user_transcript", "text": "What is my win rate this month?" }
```

Not sent for `text_input` messages (browser already showed the bubble).

---

#### `token`

Single LLM output token, streamed in real time. Browser appends to the active chat bubble.

```json
{ "type": "token", "text": "Your win rate" }
```

Tokens arrive continuously until `reply_done`.

---

#### `reply_done`

LLM response is complete. Browser finalises the chat bubble.

```json
{ "type": "reply_done" }
```

---

#### `audio_seq`

One MP3 chunk of TTS audio, identified by sequence index. Browser buffers chunks and plays them in order.

```json
{
  "type": "audio_seq",
  "seq": 0,
  "data": "//NExAAA..."
}
```

- `seq` — 0-based chunk index
- `data` — base64-encoded MP3 audio

Browser queues chunks and plays each one as soon as the previous finishes (`_bvDrain` → `_bvPlayMp3`).

---

#### `audio_seq_done`

Signals that all MP3 chunks have been sent. Browser knows the total count and can detect when playback is complete.

```json
{ "type": "audio_seq_done", "total": 3 }
```

When `_bvSeqNext >= total`, `_bvAllDone()` runs — resets state, reopens mic after 1.4s.

---

#### `tts_fallback`

Edge TTS failed or is unavailable. Browser falls back to `window.speechSynthesis`.

```json
{ "type": "tts_fallback", "text": "Your win rate this month is 62 percent." }
```

---

#### `status` (Brave path)

Informational message — displayed as an AI chat bubble.

```json
{ "type": "status", "text": "Context loaded — I know all your trades." }
```

---

### Standalone Voice Agent Messages (`voiceagent/index.html`)

#### `status`

Sent when the agent changes state. Browser updates the orb animation and label.

```json
{
  "type": "status",
  "state": "thinking",
  "label": "SOCH RAHA..."
}
```

| State | Orb label | Meaning |
|---|---|---|
| `idle` | READY HAI | Waiting for input |
| `listening` | SUN RAHA... | VAD active, capturing audio |
| `transcribing` | SAMAJH RAHA... | Whisper processing |
| `thinking` | SOCH RAHA... | LLM generating |
| `speaking` | BOL RAHA... | TTS playing |
| `recording` | REC ON BHAI! | Manual record mode |

---

#### `text` (streaming)

LLM output tokens streamed as they are generated.

```json
{ "type": "text", "token": "At your income level, ", "done": false }
```

Final token:
```json
{ "type": "text", "token": "", "done": true, "full": "At your income level, 25,000 per month in SIP is the right move." }
```

---

#### `audio`

One TTS-rendered audio chunk, sent per sentence.

```json
{
  "type": "audio",
  "data": "//NExAAA...",
  "lang": "english",
  "sentence_idx": 0
}
```

- `lang` — `"english"` | `"hindi"` | `"hinglish"`
- `sentence_idx` — 0-based; browser plays in order

---

### `memory`

Sent whenever new facts are extracted from the conversation and profile state changes.

```json
{
  "type": "memory",
  "items": [
    "[user] My name is Rahul",
    "[agent] Great to meet you, Rahul!",
    "[user] I earn around 12 lakhs per year"
  ],
  "profile": {
    "name": "Rahul",
    "income": "₹12L/yr",
    "income_num": 1200000,
    "city": null,
    "goals": {},
    "debts": {},
    "family": {}
  }
}
```

The browser uses `items` to update the memory feed panel and `profile` to update the profile card.

---

### `session_restored`

Sent after a successful persistent memory load (user had a previous session saved in Supabase).

```json
{
  "type": "session_restored",
  "profile": {
    "name": "Rahul",
    "income": "₹12L/yr",
    "city": "Bangalore"
  },
  "summary": "Rahul is a 28-year-old software engineer in Bangalore earning ~12L/yr. Discussed SIP strategy and home loan prepayment in last session. Has HDFC home loan. Goal: buy a larger flat in 3 years.",
  "turns": 47,
  "sessions": 6
}
```

The browser shows the "🧠 MEMORY RESTORED" banner and pre-populates the profile card.

---

### `error`

Sent when a non-recoverable error occurs.

```json
{
  "type": "error",
  "message": "Ollama connection refused — is Ollama running?",
  "code": "OLLAMA_DOWN"
}
```

**Error codes:**
- `OLLAMA_DOWN` — Ollama process not running or model not pulled
- `STT_FAILED` — Whisper failed to process audio
- `MEMORY_LOAD_FAILED` — Supabase read error on connect
- `MEMORY_SAVE_FAILED` — Supabase write error on disconnect
- `AUDIO_DECODE_FAILED` — TTS failed to generate audio

---

## Timing and Latency

| Stage | Typical Time |
|---|---|
| Audio VAD silence detection | 0.5–1.5s after speech ends |
| Whisper tiny transcription | 200–400ms |
| LLM first token | 150–250ms |
| TTS first sentence | 350–500ms |
| **Total: first audio heard** | ~1.0–2.2s |

The pipeline is streaming end-to-end:
- LLM tokens stream in as generated
- Each sentence is TTS'd as soon as punctuation is detected
- Audio chunks are streamed to browser before the full response is complete

---

## Security Notes

1. The WebSocket server only binds to `127.0.0.1` — not reachable from outside the machine.
2. `_user_id` from the context message is bound to the session. Subsequent messages from a different `user_id` are rejected.
3. Audio is processed in RAM only — no transcripts written to disk.
4. LLM conversation history is cleared from RAM on disconnect.
5. Persistent memory write uses the Supabase service-role key from `.env` only.
