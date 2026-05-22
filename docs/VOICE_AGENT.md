# FIN-OS Voice Agent — Technical Reference

> `voiceagent/agent.py` · WebSocket `:8765` · UI `voiceagent/index.html`

---

## Overview

FIN-OS Voice Agent is a fully local, three-stage AI pipeline:

```
Microphone → Whisper tiny (STT) → qwen3:14b via Ollama (LLM) → Edge Neural TTS → Speaker
```

Everything runs on your machine. No external API calls. No cloud inference. Complete privacy.

---

## Configuration (`agent.py` top-level constants)

```python
OLLAMA_MODEL    = "qwen3:14b"         # LLM model (must be pulled in Ollama)
OLLAMA_THINK    = False               # qwen3: suppress <think> blocks (top-level kwarg)

WHISPER_SIZE    = "tiny"              # fastest; "small" or "base" for better accuracy
WHISPER_THREADS = 8                   # CPU threads for STT

WS_HOST = "127.0.0.1"
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
    "num_ctx":        4096,     # context window (tokens)
    "num_predict":    400,      # default max output tokens
    # detail mode bumps num_predict → 1200 dynamically
    "num_thread":     8,
    "num_keep":       12,
    "mirostat":       0,
}
```

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

## WebSocket Protocol

### Connection

Browser connects to `ws://localhost:8765`. The voice agent accepts one client at a time. On second connect, the old session is closed first.

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
    "profile": {
      "age": 28
    },
    "page": "portfolio_analyser",
    "portfolio": {
      "total_value": 850000,
      "pnl": 95000,
      "pnl_pct": 12.6,
      "top_holdings": [ ... ],
      "top_gainers": [ ... ],
      "top_losers": [ ... ],
      "sector_breakdown": [ ... ]
    },
    "goals": [ ... ],
    "transactions": { "summary": { ... } },
    "health_score": { "score": 62, "tier": "GOOD" }
  }
}
```

**Audio message** (binary frame, repeated)

Raw PCM float32 audio chunks sent as binary WebSocket frames. The agent buffers them until silence is detected via VAD.

**Text message** (typed input)
```json
{
  "type": "text",
  "text": "What should I do with my bonus?"
}
```

**Ping** (keepalive)
```json
{ "type": "ping" }
```

### Message Types — Agent → Browser

**Status update**
```json
{
  "type": "status",
  "state": "thinking",
  "label": "SOCH RAHA..."
}
```

States: `idle` · `listening` · `thinking` · `speaking`

**Text token** (streamed during LLM generation)
```json
{
  "type": "text",
  "token": "At your income level, ",
  "done": false
}
```

Final token:
```json
{
  "type": "text",
  "token": "",
  "done": true,
  "full": "At your income level, 25,000 per month in SIP makes sense."
}
```

**Audio chunk** (streamed TTS output)
```json
{
  "type": "audio",
  "data": "<base64 encoded MP3>",
  "lang": "english"
}
```

**Memory update** (sent when new profile fact extracted)
```json
{
  "type": "memory",
  "items": [
    "[user] My name is Rahul",
    "[agent] Nice to meet you Rahul!",
    "[user] I earn 12 lakhs a year"
  ],
  "profile": {
    "name": "Rahul",
    "income": "₹12L/yr",
    "income_num": 1200000
  }
}
```

**Session restored** (on reconnect with persistent memory)
```json
{
  "type": "session_restored",
  "profile": { ... },
  "summary": "Rahul is a 28-year-old software engineer in Bangalore earning 15L/yr...",
  "turns": 47
}
```

**Error**
```json
{
  "type": "error",
  "message": "Ollama connection failed"
}
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
    "mem_items": [
        "[user] message ...",
        "[agent] response ...",
        ...
    ],
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
Physical gold: making charges 8-20%, storage risk, no yield.
Gold ETF: no interest, but liquid and no storage. Track gold price 1:1.
"""
}
```

### Add a new profile pattern (agent.py)

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

Change `OLLAMA_MODEL` and run `ollama pull <model>`. For non-qwen3 models, set `OLLAMA_THINK = None` (or remove the `think` kwarg from all `ollama.chat()` calls). The `think` parameter is qwen3-specific.

---

## Logs

```bash
tail -f voiceagent/agent.log
```

Key log lines:
```
INFO  fin-os.memory: Persistent memory: ENABLED  (Supabase ...)
INFO  fin-os: Whisper tiny ready
INFO  fin-os: Ollama warmed up (qwen3:14b)
INFO  fin-os: TTS warmed up (en-IN-PrabhatNeural)
INFO  fin-os: Ready — http://localhost:8080
INFO  websockets.server: server listening on 127.0.0.1:8765
INFO  fin-os: [session] user abc123 connected
INFO  fin-os: [stt] "what should I do with my HDFC SIP?"  (0.31s)
INFO  fin-os: [llm] first token 0.19s | total 2.3s | 312 tokens
INFO  fin-os: [tts] sentence 1 audio 0.38s
INFO  fin-os: [memory] saved → Supabase (session 7, 43 msgs)
```
