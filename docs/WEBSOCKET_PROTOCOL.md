# FIN-OS Voice Agent — WebSocket Protocol

> `ws://localhost:8765` · Server: `voiceagent/agent.py`

---

## Connection

The browser connects to `ws://localhost:8765`. The server accepts one client at a time. If a second connection arrives, the previous session is cleanly closed first.

The connection is local-only (`127.0.0.1`). It cannot be reached from external IPs by design.

### Connection lifecycle

```
Browser → ws://localhost:8765
  Server: accept connection
  Server: sends greeting if prior memory exists
  Browser: sends "context" message with user state
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

### `context`

Sent immediately after connection to give the agent the user's full financial state. Also sent again if the user navigates to a different page.

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

### `text`

Typed input (alternative to microphone).

```json
{
  "type": "text",
  "text": "Should I buy a house or continue renting?"
}
```

---

### `audio` (binary frame)

Raw PCM float32 audio data. Sent continuously from the browser AudioWorkletProcessor while microphone is active. The server buffers it and runs VAD (Voice Activity Detection) to detect end-of-speech.

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

### `status`

Sent when the agent changes state. The browser uses this to update the orb animation and label.

```json
{
  "type": "status",
  "state": "thinking",
  "label": "SOCH RAHA..."
}
```

**State values:**

| State | Orb label | Meaning |
|---|---|---|
| `idle` | READY HAI | Waiting for input |
| `listening` | SUN RAHA... | VAD active, capturing audio |
| `transcribing` | SAMAJH RAHA... | Whisper processing |
| `thinking` | SOCH RAHA... | LLM generating |
| `speaking` | BOL RAHA... | TTS playing |
| `recording` | REC ON BHAI! | Manual record mode |

---

### `text` (streaming)

LLM output tokens streamed as they are generated. Each message has `done: false` until the last token.

```json
{
  "type": "text",
  "token": "At your income level, ",
  "done": false
}
```

Final message of a response:
```json
{
  "type": "text",
  "token": "",
  "done": true,
  "full": "At your income level, 25,000 per month in SIP is the right move."
}
```

The browser accumulates tokens and displays them in the chat bubble. On `done: true` it renders the full text.

---

### `audio`

One TTS-rendered audio chunk, sent per sentence. The browser decodes the base64 MP3 and queues it for sequential playback.

```json
{
  "type": "audio",
  "data": "//NExAAA...",
  "lang": "english",
  "sentence_idx": 0
}
```

- `data` — base64-encoded MP3 audio
- `lang` — `"english"` | `"hindi"` | `"hinglish"` (determines which voice was used)
- `sentence_idx` — 0-based index; browser plays in order

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
