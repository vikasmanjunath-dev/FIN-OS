# FIN-OS Voice Agent — Technical Reference

> Version: 1.5 | Date: June 10, 2026  
> `voiceagent/agent.py` · WebSocket `:8765` (plain ws://) · UI `voiceagent/index.html`

---

## Overview

FIN-OS Voice Agent is a fully local, three-stage AI pipeline:

```
Microphone → Whisper tiny (STT) → qwen2.5:3b via Ollama (LLM, preferred) → Edge Neural TTS → Speaker
```

Everything runs on your machine. No external API calls. No cloud inference. Complete privacy.

The agent serves over **plain `ws://`** (no TLS — reverted to git HEAD). No SSL cert is generated. No browser cert-trust step is required.

---

## Configuration (`agent.py` top-level constants)

```python
OLLAMA_MODEL    = "qwen2.5:3b"        # LLM model — auto-selected by _pick_ollama_model(); overridden by .env
OLLAMA_THINK    = False               # qwen3: suppress <think> blocks (top-level kwarg)

WHISPER_SIZE    = "tiny"              # fastest; "small" or "base" for better accuracy
WHISPER_THREADS = 8                   # CPU threads for STT

WS_HOST = "127.0.0.1"                # IPv4 loopback only (NOT "" / all interfaces)
WS_PORT = 8765

HISTORY_TURNS   = 10                  # conversation turns kept in RAM
```

### Ollama Options

```python
OLLAMA_OPTIONS = {
    "temperature":    0.75,     # creativity (0 = deterministic, 1 = creative)
    "top_p":          0.92,
    "top_k":          40,
    "repeat_penalty": 1.10,
    "num_ctx":        8192,     # reduced for latency — was 32768
    "num_predict":    400,      # reduced for latency — was 600; detail mode bumps → 1200
    "num_thread":     8,
    "num_keep":       0,        # was 12 — set to 0 to reduce VRAM pressure
    "mirostat":       0,
}
```

### Configuration Summary (current values — reverted to git HEAD)

| Parameter | Current value | Notes |
|---|---|---|
| `WS_HOST` | `"127.0.0.1"` | IPv4 loopback only |
| `HISTORY_TURNS` | `10` | Restored; provides better context |
| `num_ctx` | `8192` | Smaller KV-cache vs original 32768 |
| `num_predict` | `400` | Voice needs 2–3 sentences |
| `num_keep` | `0` | KV-reuse disabled |
| `LLM_FIRST_TOKEN_TIMEOUT` | `45` | Fail fast |

### TTS Settings

```python
TTS_RATE  = "+12%"                    # speech speed offset
TTS_PITCH = "-3Hz"                    # pitch offset

EDGE_VOICES = {
    "english":  "en-IN-PrabhatNeural",
    "hindi":    "hi-IN-MadhurNeural",
    "hinglish": "en-IN-PrabhatNeural",
}
```

---

## WebSocket Setup (plain ws://)

The voice agent uses a plain (non-TLS) WebSocket. No SSL certificates are generated and no browser trust step is required.

`websockets.serve()` is called **without** `ssl=` argument:

```python
server = await websockets.serve(handler, WS_HOST, WS_PORT, max_size=50_000_000)
# WS_HOST = "127.0.0.1", WS_PORT = 8765
```

### Startup output

```
INFO  fin-os: Whisper tiny ready
INFO  fin-os: Ollama warmed up (qwen2.5:3b)
INFO  fin-os: TTS warmed up (en-IN-PrabhatNeural)
Listening on ws://127.0.0.1:8765
```

No cert trust step needed. Open `http://localhost:3000` → click AI FAB → widget connects immediately.

---

## Model Picker (Smallest-First for Latency)

`agent.py` queries Ollama for available models and picks the first match in this order:

```
qwen2.5:3b  →  qwen3:4b  →  qwen3:8b  →  qwen3:14b
```

This is smallest-first (lowest latency preferred). The old order was largest-first. If `OLLAMA_MODEL` is explicitly set in `.env`, that model is used directly without probing.

For maximum quality (slower), pull `qwen3:14b` and set `OLLAMA_MODEL=qwen3:14b` in `voiceagent/.env`.

---

## WS_URL (`index.html`)

`voiceagent/index.html` always connects to plain `ws://`:

```javascript
const WS_URL = 'ws://127.0.0.1:8765';
```

Explicit IPv4 address `127.0.0.1` is used (not `localhost`) to avoid IPv6 resolution issues. No protocol switching — always plain ws://.

The widget chip in `index.html` displays this URL.

---

## Navigation Engine (`index.html`)

### FINOS_PAGES array

`index.html` defines a `FINOS_PAGES` array containing 130+ entries. Each entry is:

```javascript
{ label: "Portfolio Analyser", url: "/html/portfolio-analyser.html", keywords: ["portfolio", "holdings", "stocks"] }
```

The array covers all 96 pages and all 88 calculators.

### `detectNavIntent(text)`

Called on every user message (both typed and voice) **before** the message is sent to the AI. Algorithm:

1. Lowercases the input text.
2. Tests against `NAV_TRIGGER` regex — a pattern covering Hindi and English trigger words:
   - English: `go to`, `open`, `take me to`, `navigate to`, `show me`, `launch`
   - Hindi/Hinglish: `chalo`, `kholo`, `dikhaao`, `le jao`
3. If the trigger regex matches, scans `FINOS_PAGES` for the best keyword match in the remaining text.
4. Returns the matching page entry, or `null` if no match.

### `navigateTo(page)` flow

When `detectNavIntent()` returns a match:

1. A chat bubble is shown immediately: `"📍 Navigating to [Page Label]..."`
2. After a 200ms delay, `navigateTo()` fires `window.parent.postMessage`:
   ```javascript
   { type: 'finos_navigate', url: '/html/portfolio-analyser.html', label: 'Portfolio Analyser' }
   ```
3. The message is received by `finos-widget.js` in the parent page (see Widget section below).
4. The AI is **not** called for navigation intents — `sendText()` and the `user_transcript` handler both check `detectNavIntent()` first and short-circuit if it returns a match.

### `CLOUD_MODE = false`

`index.html` sets `CLOUD_MODE = false`. The variables `chatHistory`, `cloudSR`, and `isCloudPending` are declared but unused. `buildSystemPrompt()` and `sendCloud()` are present in the code but never called. All traffic goes to local Ollama via the WebSocket.

---

## Profile Sync Deduplication (`_ctxSent` fix)

`index.html` sets `_ctxSent = true` **immediately** inside `applyCtxToUI()` after showing the "Profile synced" status message — before any async operation. This prevents the context from being sent 4× in quick succession when the iframe receives multiple `postMessage` events on load.

---

## WebSocket Protocol

### Connection

Browser connects to `ws://127.0.0.1:8765` (plain WebSocket, no SSL). The voice agent accepts one client at a time. On second connect, the old session is closed first.

### Message Types — Browser → Agent

All JSON messages are sent as text frames.

**Context message** (sent on connect / page change)
```json
{
  "type": "context",
  "context": {
    "_user_id": "uuid",
    "identity": {
      "name": "Rahul",
      "income_range": "10L-15L",
      "life_stage": "growth",
      "city": "Bangalore",
      "financial_dna": "wealth_builder",
      "mindset": "disciplined_saver"
    },
    "profile": { "age": 28 },
    "page": "portfolio_analyser",
    "portfolio": { "total_value": 850000, "pnl": 95000, "pnl_pct": 12.6 },
    "goals": [],
    "transactions": { "summary": {} },
    "health_score": { "score": 62, "tier": "GOOD" }
  }
}
```

**User context message** — sent by page on connect/reconnect to inject live state

```json
{
  "type": "user_context",
  "sync_phase": "full",
  "page_module": "trade_journal",
  "page": { "module": "trade_journal", "title": "TradeBook Pro" },
  "identity": { "name": "Vikas Manjunath" },
  "trade_journal": {
    "total_trades": 73,
    "total_pnl": 23952.76,
    "win_rate": 58.9,
    "avg_win": 1240.5,
    "avg_loss": -680.2,
    "profit_factor": 1.82,
    "capital": 500000,
    "weekly_target": 15000,
    "best_symbol": { "symbol": "BANKNIFTY CE", "pnl": 8400 },
    "worst_symbol": { "symbol": "NIFTY PE", "pnl": -3200 },
    "current_streak": "3 win",
    "recent_trades": [],
    "full_context": "━━━ TRADEBOOK PRO: COMPLETE JOURNAL CONTEXT ━━━\n..."
  }
}
```

`full_context` is a pre-formatted multi-section text block built by `buildFullTradeContext()` in `arya-tradebook.js`. It is injected verbatim into `UserContext.to_prompt()` so Arya can answer any specific trade query without the user repeating context.

For Mind Engine pages, the message uses `page_module: "mind_engine"` and `financial.custom` instead of `trade_journal`.

**Audio chunk message** (Brave path — MediaRecorder output)
```json
{ "type": "audio_chunk", "data": [82, 73, 70, 70, ...] }
```
Raw WebM/Opus bytes as a JSON integer array. The agent decodes, runs VAD, and transcribes with faster-whisper.

**Audio message** (legacy binary frame — standalone voice agent UI)

Raw PCM float32 audio chunks sent as binary WebSocket frames. The agent buffers them until silence is detected via VAD.

**Text message** (typed input)
```json
{ "type": "text_input", "text": "What should I do with my bonus?" }
```

**Ping** (keepalive)
```json
{ "type": "ping" }
```

### Message Types — Agent → Browser

**Status update**
```json
{ "type": "status", "state": "thinking", "label": "SOCH RAHA..." }
```

States: `idle` · `listening` · `thinking` · `speaking`

**Text token** (streamed during LLM generation)
```json
{ "type": "text", "token": "At your income level, ", "done": false }
```

Final token:
```json
{ "type": "text", "token": "", "done": true, "full": "At your income level, 25,000 per month in SIP makes sense." }
```

**Audio chunk** (streamed TTS output)
```json
{ "type": "audio", "data": "<base64 encoded MP3>", "lang": "english" }
```

**Memory update** (sent when new profile fact extracted)
```json
{
  "type": "memory",
  "items": ["[user] My name is Rahul", "[agent] Nice to meet you Rahul!", "[user] I earn 12 lakhs a year"],
  "profile": { "name": "Rahul", "income": "₹12L/yr", "income_num": 1200000 }
}
```

**Session restored** (on reconnect with persistent memory)
```json
{
  "type": "session_restored",
  "profile": {},
  "summary": "Rahul is a 28-year-old software engineer in Bangalore earning 15L/yr...",
  "turns": 47
}
```

**Error**
```json
{ "type": "error", "message": "Ollama connection failed" }
```

---

## Language Detection

Language is detected per-message from the text transcript:

| Priority | Condition | Result |
|---|---|---|
| 1 | Any Devanagari character in text | `hindi` |
| 2 | Explicit hinglish keyword (hinglish, mix karo…) | `hinglish` |
| 3 | Explicit hindi keyword (hindi, hindi mein…) | `hindi` |
| 4 | Explicit english keyword (english, angrezi…) | `english` |
| 5 | ≥2 desi casual words in message | `hinglish` |
| 6 | Default | `english` |

Desi casual words: yaar, bhai, kya baat, karo, dekho, matlab, nahi, haan, theek, bas, paise, batao, samjho, suno, and 15 more.

---

## Profile Extraction (In-RAM Memory)

The `MemoryStore` extracts structured facts from conversation text in real time.

### Patterns

| Key | Examples that match | Extracted value |
|---|---|---|
| `name` | "my name is Rahul", "main Priya hoon", "I'm Vikram" | "Rahul" |
| `income` | "I earn 12 lakhs", "salary is 80k a month" | `income: ₹12L/yr, income_num: 1200000` |
| `age` | Supabase `profiles.age` only — not from conversation text | age in years |
| `city` | "I live in Mumbai", "based in Hyderabad" | city name |
| `married` | "I'm married", "my wife…", "my husband…" | `💑 Married` |
| `kids` | "my son", "my daughter", "I have a kid" | `👶 Has kids` |
| `dep_parents` | "my dependent parents", "parent support karta hoon" | `👨‍👩‍👦 Dep. parents` |
| `single` | "I'm single", "I'm a bachelor" | `💁 Single` |
| Goal: house | "want to buy a house/flat" | house_goal |
| Goal: FIRE | "financial independence", "retire early", "FIRE goal" | fire_goal |
| Goal: business | "start a business/startup" | business_goal |
| Debt: home loan | "home loan EMI", "housing loan" | `home_loan_emi` |
| Debt: car loan | "car loan", "car EMI" | `car_loan` |
| Debt: credit card | "credit card debt", "CC bill" | `credit_card_debt` |

### Where age comes from

Age is **never** extracted from conversation text (too many false positives). It is pulled exclusively from `ctx.profile.age` (Supabase `profiles` table), but only if the value is a number > 10.

---

## Intent Detection (Financial Knowledge Injection)

`Brain._match_intent(text)` matches 10 intent rules. On match, topic-specific financial facts are appended to the system prompt, so the LLM gives more precise answers.

| Intent | Keywords | Facts injected |
|---|---|---|
| `lic_trap` | LIC, policy, endowment, ULIP | LIC vs ELSS return comparison, term plan advice |
| `fno_warning` | F&O, futures, options, expiry | SEBI 90% loss stat, margin risk |
| `sip_strategy` | SIP, mutual fund, index fund | Step-up SIP, direct vs regular, 1% extra compounding |
| `tax_planning` | tax, 80C, HRA, new regime | Old vs new regime, 80C waterfall, NPS 80CCD |
| `emi_reality` | EMI, home loan, car loan | True cost calculation, 50% income rule |
| `fire_path` | FIRE, financial independence, retire early | SWR 4%, corpus formula |
| `real_estate` | buy house, property, flat | Rent vs buy math, true cost of ownership |
| `ppf_nps` | PPF, NPS, EPF | Returns, tax treatment, lock-in |
| `windfall` | bonus, inheritance, sold shares, lump sum | Waterfall: emergency → debt → PPF → NPS → index |
| `beginner` | new to investing, first investment, where to start | 3-step starter path |

---

## Detail Mode

When the user asks for a detailed explanation, `num_predict` is bumped from 400 to 1200 and a detail instruction is appended to the system prompt.

Keywords that trigger detail mode:
```
detail, detailed, in detail, explain, elaborate, full explanation,
in depth, step by step, complete, everything, thoroughly, precise,
comprehensive, poori tarah, achhe se, vistaar, pura, samjhao
```

---

## Persistent Memory (Supabase)

### Storage

On disconnect, the `MemoryStore.save()` generates a session summary and writes to `agent_memories`:

```python
{
    "user_id": uuid,
    "profile": {
        "name": "Rahul",
        "income": "₹12L/yr",
        "income_num": 1200000,
        "city": "Bangalore",
        "goals": { "house": true, "fire": false },
        "debts": { "home_loan_emi": true }
    },
    "summary": "Rahul is a 28-year-old software engineer in Bangalore...",
    "mem_items": ["[user] message ...", "[agent] response ..."],
    "total_sessions": 7,
    "total_messages": 43
}
```

### Restore

On reconnect (with `user_id` in context):
1. `load_persistent_memory(user_id)` — fetches row from `agent_memories`
2. Profile facts injected into active memory
3. Last 20 turns loaded into `ConvHistory`
4. Summary sent to browser as `session_restored` message
5. Banner "🧠 MEMORY RESTORED" shown in UI

### Autosave

Every 5 minutes during an active session, memory is autosaved via a background asyncio task.

---

## Conversation History

`ConvHistory` keeps the last `HISTORY_TURNS` (10) turns in RAM as `{"role": "user"|"assistant", "content": "..."}` dicts. These are prepended to every LLM call as message history, so the model can reference what was just said.

On session restore, `ConvHistory` is pre-populated with the last 20 turns from persistent memory.

---

## System Prompt Structure

The full prompt is assembled per-request as:

```
[SYSTEM_PROMPT — persona + 8 laws + desi knowledge base + tone rules]

[CONTEXT BLOCK — built by UserContext.to_prompt()]
  User: Rahul | Age: 28 | Income: ₹12L/yr | Life Stage: Growth | City: Bangalore
  Health Score: 62/100 (GOOD)

  Portfolio: ₹8.5L total | +₹95K (+12.6%)
  Top Holdings: RELIANCE (+18%), INFY (+5%), TCS (-2%)

  Active Goals: Emergency fund (40%), House down payment (15%)

  Debts: Home loan EMI active

  Current Page: portfolio_analyser

[INTENT FACTS — if intent matched]
  [RELEVANT KNOWLEDGE — e.g., SIP step-up formula + direct vs regular math]

[DETAIL FLAG — if detail keywords detected]
  [USER EXPLICITLY ASKED FOR DETAIL — give thorough answer, do NOT cut short]

[CONVERSATION HISTORY — last 10 turns]
[USER: current message]
```

---

## Extending the Agent

### Add a new intent rule

In `Brain._INTENT_RULES` (list of dicts):
```python
{
    "id": "sgb_gold",
    "pattern": re.compile(r"\b(gold|SGB|sovereign gold|gold etf)\b", re.I),
    "facts": """
GOLD FACTS: SGB (Sovereign Gold Bond) gives 2.5% interest + gold appreciation.
Tax-free on redemption at maturity (8 years). Better than physical gold or Gold ETF.
"""
}
```

### Add a new profile pattern

In `MemoryStore._FAMILY_PATS`:
```python
(r"\bmy (?:partner|live-in)\b|\bi am in a (?:relationship|live-in)\b", "in_relationship"),
```

### Change the TTS voice

Edit `EDGE_VOICES` at the top of `agent.py`. Available Indian voices:
- `en-IN-PrabhatNeural` — male Indian English
- `en-IN-NeerjaNeural` — female Indian English
- `hi-IN-MadhurNeural` — male Hindi
- `hi-IN-SwaraNeural` — female Hindi

### Switch LLM

Change `OLLAMA_MODEL` in `voiceagent/.env` and run `ollama pull <model>`. For non-qwen3 models, set `OLLAMA_THINK = None` (or remove the `think` kwarg from all `ollama.chat()` calls). The `think` parameter is qwen3-specific.

---

---

## ProactiveBriefingEngine — Mood & Month Semantics (Arya v2)

`ProactiveBriefingEngine` in `agent.py` generates the daily dashboard brief. Critical month semantics (corrected June 8, 2026):

### `detect_mood(user_ctx)` — month classification

| Month | Classification | Rationale |
|---|---|---|
| January, February | `budget_season` (festive mood) | Union Budget presented Feb 1; Jan/Feb = anticipation season |
| March | `year_end_crunch` (deadline urgency) | March 31 = fiscal year-end, ITR advance tax, LIC premium deadlines |
| April | `new_year_start` (festive mood) | New financial year begins; goal-setting energy |
| October, November | `festive` (festive mood) | Diwali, Navratri — gifting and investment season |
| All others | `normal` | No special override |

⚠️ **Common confusion:** February is `budget_season` (festive), NOT `year_end_crunch`. March 31 tax deadline applies to March only.

### `SYSTEM_PROMPT` FESTIVE MODE text (corrected)

```
FESTIVE MODE (Budget Day Jan/Feb, Diwali Oct/Nov, new financial year April — NOT March, which is deadline urgency):
```

### `generate()` — avoid double `detect_mood()` call

```python
# CORRECT — mood computed once by caller and passed in
mood = ProactiveBriefingEngine.detect_mood(user_ctx)
brief = ProactiveBriefingEngine.generate(brain, user_ctx, anomalies, mood=mood)

# WRONG — was computing mood twice (once in generate(), once in build_dashboard_brief())
brief = ProactiveBriefingEngine.generate(brain, user_ctx, anomalies)
mood  = ProactiveBriefingEngine.detect_mood(user_ctx)  # ← redundant second call
```

`generate()` accepts an optional `mood` parameter. If not supplied (e.g. in direct/test invocations), it computes mood internally as a fallback.

---

## Logs

```bash
tail -f voiceagent/agent.log
```

Key log lines:
```
INFO  fin-os.memory: Persistent memory: ENABLED  (Supabase ...)
INFO  fin-os: Whisper tiny ready
INFO  fin-os: Ollama warmed up (qwen2.5:3b)
INFO  fin-os: TTS warmed up (en-IN-PrabhatNeural)
Listening on ws://127.0.0.1:8765
INFO  fin-os: [session] user abc123 connected
INFO  fin-os: [stt] "what should I do with my HDFC SIP?"  (0.31s)
INFO  fin-os: [llm] first token 0.19s | total 2.3s | 312 tokens
INFO  fin-os: [tts] sentence 1 audio 0.38s
INFO  fin-os: [memory] saved → Supabase (session 7, 43 msgs)
```
