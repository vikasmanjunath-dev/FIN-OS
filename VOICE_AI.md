# Voice AI — Complete Reference

> Version: 11 | Date: July 14, 2026  
> File: `voiceagent/agent.py` · WebSocket `ws://127.0.0.1:8765` (plain — no TLS) · UI: `voiceagent/index.html`  
> Wake-word: openwakeword "Hey Jarvis" opt-in (👂 toggle) — `HISTORY_TURNS=10`, `WS_HOST="127.0.0.1"`

---

## What Is Voice AI

FIN-OS Voice AI is a fully local, three-stage AI pipeline that responds to spoken Indian personal finance questions in real time. No cloud. No API keys. No audio leaves your machine.

```
Microphone → Whisper tiny (STT) → qwen2.5:3b via Ollama (LLM) → Edge Neural TTS → Speaker
```

It speaks English, Hindi, and Hinglish — auto-detected per message. It knows the user's portfolio, budget, goals, trade journal, and financial DNA from the browser context sent over WebSocket. It remembers facts across sessions via Supabase.

---

## Pipeline — Step by Step

```
1. Browser captures mic → encodes to WebM/Ogg → sends base64 over WebSocket
2. agent.py decodes audio → saves to temp file → STT.transcribe()
   └─ Whisper tiny (faster-whisper, beam_size=1, VAD filter)
   └─ returns (text, language: english|hindi|hinglish)
3. detect_lang(text) refines language detection using keyword + Devanagari scanning
4. Brain.respond(text, lang, memory, user_ctx)
   ├─ detectMood(text)           — picks one of 5 mood modes
   ├─ match intent patterns      — finds topical domain (market/budget/goal/tax/debt/retire)
   ├─ build system prompt        — SYSTEM_PROMPT + LANG_INJECT + intent hint + user_ctx
   ├─ semantic memory recall     — top-3 relevant past facts (pgvector)
   ├─ memory.get_profile_ctx()   — structured profile block
   └─ ollama.chat() streaming    — streams sentence by sentence
5. Each complete sentence → TTS.speak(sentence, lang) → edge_tts
6. Audio bytes → base64 → WebSocket message {type: "audio", data: "..."} → browser plays
7. Memory.add() stores turn → profile extraction → autosave every 5 min
```

---

## Configuration (top-level constants)

```python
OLLAMA_MODEL   = _pick_ollama_model()   # auto-selects by RAM; override with OLLAMA_MODEL env var
WHISPER_SIZE   = "tiny"                 # "small" or "base" for better accuracy (slower)
WHISPER_THREADS = 8                     # CPU threads
WS_HOST        = "127.0.0.1"           # WebSocket host (loopback only)
WS_PORT        = 8765                   # WebSocket port
PROXY_PORT     = 8767                   # HTTPS Ollama proxy (for Vercel HTTPS pages)
HISTORY_TURNS  = 10                     # turns kept in RAM
AUTOSAVE_INTERVAL = 300                 # Supabase autosave every 5 minutes
LLM_FIRST_TOKEN_TIMEOUT = 90            # seconds before giving up on LLM
```

### Ollama Options

```python
OLLAMA_OPTIONS = {
    "temperature":    0.75,
    "top_p":          0.92,
    "top_k":          40,
    "repeat_penalty": 1.10,
    "num_ctx":        32768,   # enlarged for full trade journal context
    "num_predict":    600,     # raised: qwen3 think tokens eat into budget
    "num_thread":     8,
    "num_keep":       12,
    "mirostat":       0,
}
OLLAMA_THINK = False           # top-level kwarg, not in options — disables qwen3 chain-of-thought
```

### TTS Settings

```python
TTS_RATE  = "+12%"              # natural pace (was +18% = too fast)
TTS_PITCH = "-3Hz"              # male register

EDGE_VOICES = {
    "english":  "en-IN-PrabhatNeural",   # Indian English male
    "hindi":    "hi-IN-MadhurNeural",    # Hindi male — warm and natural
    "hinglish": "en-IN-PrabhatNeural",   # Hinglish uses Indian English voice
}
```

---

## Model Auto-Selection

`_pick_ollama_model()` selects the best available model at startup based on RAM and installed models:

| RAM | Preferred model |
|-----|----------------|
| ≥ 16 GB | `qwen3:14b` |
| ≥ 10 GB | `qwen3:8b` |
| ≥ 6 GB | `qwen3:4b` |
| ≥ 4 GB | `qwen2.5:3b` |
| Fallback | First model in `ollama list` |

Override with `OLLAMA_MODEL=your-model` in `voiceagent/.env`.

---

## Language Detection

### Automatic detection flow

```
1. Any Devanagari character (U+0900–U+097F) found → "hindi"
2. Explicit Hinglish request ("hinglish", "mix karo") → "hinglish"
3. Explicit Hindi request ("hindi mein", "speak hindi") → "hindi"
4. Explicit English request ("in english", "angrezi") → "english"
5. ≥2 desi casual words in message → "hinglish"
   (yaar, bhai, kya, nahi, haan, paise, batao, dekho, matlab…)
6. Default → "english"
```

Whisper also detects language from audio. Both detections are combined — Devanagari script in the transcript always wins.

### Voice injection per language

| Mode | Voice | System prompt addition |
|------|-------|----------------------|
| english | en-IN-PrabhatNeural | "Reply in clean, confident Indian English. Finance terms like SIP, EMI natural. NO Hindi words." |
| hindi | hi-IN-MadhurNeural | "Reply in warm natural Hindi using Devanagari. Finance terms stay English as Indians say them." |
| hinglish | en-IN-PrabhatNeural | "Mix Hindi and English the way educated urban Indians speak. Finance terms English, emotions Hindi." |

---

## Mood / Emotion Detection

Five modes, detected via keyword scoring on the user's message. The winning mode's system prompt appendage is injected into every response.

| Mood | Trigger signals | Response adjustment |
|------|----------------|---------------------|
| `worried` | worried, anxious, scared, stressed, tension, panic, nervous | Open with 1 sentence of emotional validation + reassurance, then calm practical advice |
| `excited` | great, amazing, fantastic, love, excellent, perfect, fantastic | Match energy briefly for 1 sentence, then ground in real numbers |
| `frustrated` | frustrated, angry, irritated, hate, terrible, worst, useless | Acknowledge frustration explicitly, then pivot to the fix |
| `confused` | confused, unclear, don't understand, not clear, what do you mean | Explain simply with a real Indian example, check understanding |
| `hopeful` | hope, dream, wish, want to, planning to, trying to, someday | Encourage concretely: turn the dream into a ₹ number and a timeline |

Default (no strong signal) → confident, structured, data-driven tone.

---

## Intent Detection

Six domain patterns are matched against the user's message. The matching intent's hint is injected into the system prompt:

| Intent | Trigger keywords | Injected prompt hint |
|--------|----------------|---------------------|
| `market` | nifty, sensex, stock, portfolio, SIP, mutual fund, IPO | Reference benchmark returns. Always recommend Direct plans on Kuvera. |
| `budget` | budget, expense, spend, saving, rent, EMI, salary | Focus on actual cashflow. EMI < 40% of income rule. |
| `goal` | goal, house, retirement, FIRE, education, wedding, dream | Calculate the actual number needed. |
| `insurance` | insurance, term, health, ULIP, policy, claim | Compare term vs endowment with actual rupee numbers. |
| `tax` | tax, 80C, NPS, PPF, ITR, regime, TDS, refund | Use AY 2025-26 slabs. Be precise about deductions. |
| `debt` | debt, loan, credit card, outstanding, repay | Calculate total cost, not just monthly EMI. |

Specifically hard-coded intent rules in `Brain._INTENT_RULES` (regex list):

- **LIC/ULIP trap** → forces LIC vs Term+MF rupee comparison
- **F&O/trading** → references SEBI data (90% of F&O traders lose money)
- **SIP/MF** → always recommends Direct plans on Kuvera
- **Tax** → uses AY 2025-26 rules precisely
- **Debt/EMI** → calculates total cost, flags EMI > 35% income
- **Retirement/FIRE** → calculates corpus using 4% withdrawal rule
- **House/flat** → runs full rent-vs-buy math with actual numbers
- **Budget/expense** → uses actual cashflow data from context

---

## SYSTEM_PROMPT — Soul of the Voice AI

The voice agent's system prompt defines the persona:

```
You are FIN-OS — India's sharpest personal finance voice AI.
Think of yourself as that one brilliant friend who studied finance at IIM,
worked at a top fund for 5 years, and still talks to you exactly like a
real person would over chai.

CRITICAL VOICE RULES:
• DEFAULT: 2–3 sentences per response. Natural speech, never a lecture.
• EXCEPTION: If user says "explain in detail / step by step / elaborate" — 
  give a thorough, comprehensive answer. Do NOT cut short.
• ZERO markdown. No asterisks, bullets, hashtags. Pure spoken language.
• Never open with: "Sure!", "Great question!", "Of course!" — just answer.
• Lead with THE ANSWER first. Explanation second. Never bury the answer.
```

The prompt embeds:
- Nifty 50 benchmarks (12% CAGR), FD rates, PPF, EPF, Gold, Inflation
- New tax regime slabs (AY 2025-26) with exact thresholds
- "12 Laws of Indian Finance" for reference in answers
- "Desi Traps" — LIC, F&O, house pressure, car EMI — with prepared rupee math
- Specific app recommendations: Kuvera, Zerodha, Groww, Fi, INDmoney, ClearTax, Ditto

---

## UserContext — What the Browser Sends

When the user opens the voice UI, the frontend sends a `user_context` WebSocket message containing everything known about the user. The `UserContext` class ingests this and builds a rich LLM-readable block.

### Context sections

| Section | Source | Examples |
|---------|--------|---------|
| `identity` | Supabase `profiles` | name, email, member since, life stage |
| `profile` | Supabase + localStorage | income range, city, mindset, financial DNA, interests |
| `onboarding` | FIN-OS onboarding answers | age range, profession, money philosophy, risk appetite |
| `dna` | Financial DNA quiz | archetype, score, description |
| `financial.portfolio` | Stock engine | total value, P&L, holdings (up to 10), gainers, losers, sector mix, MF holdings |
| `financial.goals` | Supabase goals | up to 4 goals with progress % and target amount |
| `financial.transactions` | Budget React app | cashflow count, total income, total expense, net, top categories |
| `financial.health_score` | Alert engine | score/100, tier, headline, top 2 action tips |
| `budget_tracker` | finos-budget React app | monthly income, expense categories, goals, SIP, active alerts |
| `trade_journal` | TradeBook Pro | total P&L, win rate, profit factor, R:R ratio, streak, recent 3 trades, full context block |
| `watchlist` | User watchlist | up to 8 symbol names |
| `market.news_headlines` | app.py Flask | up to 4 live RBI/SEBI/market headlines |
| `focus_history` | sessionStorage | last 4 FIN-OS modules the user visited |
| `settings` | localStorage | language, persona, currency, risk level |

Security: once a `user_id` is bound to a session, any incoming context with a different `user_id` is rejected (prevents injection from other users on the same WebSocket server).

---

## Memory System — Three Layers

### Layer 1 — In-RAM Memory (zero latency)

`Memory` class — deque of last `HISTORY_TURNS × 2` messages, plus a `profile` dict extracted from conversation.

**Profile extraction** — auto-parsed from every user message:

| Field | Extracted from |
|-------|---------------|
| `name` | "my name is", "call me", "mera naam X hai" |
| `age` | "I'm 28", "age: 28", "28 years old", "28 saal" |
| `income` | "earn ₹80K", "salary 12 lakh", "CTC 15L" |
| `life_stage` | age → early_career / growth / family_phase / peak_income / pre_retirement |
| `retire_age` | "retire at 45", "retire by 50" |
| `wants_house` | "buy a house / flat / property" |
| `wants_fire` | "fire", "financial independence" |
| `wants_business` | "start a business / startup" |
| `wants_abroad` | "move abroad", "USA / UK / Canada" |
| `child_education` | "child's education / school / college" |
| `wedding_plan` | "wedding / shaadi in / next" |
| `married` | "I'm married", "my wife / husband" |
| `has_kids` | "my kid / child / son / daughter" |
| `dependent_parents` | "dependent parents / parent support" |
| `has_home_loan` | "home loan / housing loan" |
| `has_cc_debt` | "credit card debt / dues / outstanding" |
| `city_tier` | metro: Mumbai/Delhi/Bangalore…; metro_adjacent: Noida/Gurgaon… |

### Layer 2 — Persistent Memory (Supabase)

`MemoryStore` class — async REST client for the `agent_memories` Supabase table.

```
Table: agent_memories
  user_id        — UUID (primary key)
  profile        — JSON dict of extracted facts
  summary        — LLM-generated session summary (injected next session)
  mem_items      — last 20 conversation turns (role + content, 400 char cap per turn)
  total_sessions — running count
  total_messages — running count
  last_seen      — timestamp
```

**Lifecycle:**
- `load(user_id, memory)` — called on connect; restores profile + last 20 turns into RAM
- `save(user_id, memory)` — called every 5 minutes (autosave) and on disconnect
- `clear(user_id)` — wipes row (user clicked "Clear Memory")

Gracefully degrades to no-op if `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` are not set in `.env`.

### Layer 3 — Semantic Memory (pgvector)

`SemanticMemory` class — stores facts as 384-dim embeddings using `sentence-transformers/all-MiniLM-L6-v2`.

```
Table: memory_embeddings
  user_id    — UUID
  content    — text of the fact
  embedding  — vector(384)
  category   — 'general' | 'goal' | 'habit' | 'risk' | 'income'
```

Supabase RPC `match_memories(query_embedding, query_user_id, match_count)` does cosine similarity search. Top-3 results are prepended to the LLM prompt as `[RELEVANT MEMORIES]`.

Falls back to no-op if `sentence_transformers` is not installed or Supabase is not configured.

---

## STT — Whisper Configuration

```python
model = WhisperModel(
    "tiny",
    device="cpu",
    compute_type="int8",        # quantized for speed
    cpu_threads=8,
    download_root="./models",
)

segs, info = model.transcribe(
    path,
    beam_size=1,                # fastest
    vad_filter=True,            # silence stripping
    vad_parameters={"min_silence_duration_ms": 200, "speech_pad_ms": 50},
    initial_prompt="Financial assistant. Hindi aur English mein baat karte hain.",
    condition_on_previous_text=False,
    no_speech_threshold=0.5,
)
```

Language decision: if Whisper says `hi` with probability ≥ 55%, it's Hindi. Otherwise English. Then overridden by `detect_lang(text)` which scans the transcript for Devanagari characters.

**To improve accuracy at the cost of speed:** change `WHISPER_SIZE = "small"` or `"base"`.

---

## TTS — Edge Neural

Microsoft Edge TTS via `edge-tts` Python library. Runs async. Audio is streamed chunk-by-chunk and accumulated into a bytes buffer, then sent as base64 over WebSocket.

```python
async def speak(text, lang):
    voice = EDGE_VOICES[lang]    # e.g., "en-IN-PrabhatNeural"
    com   = edge_tts.Communicate(text, voice, rate="+12%", pitch="-3Hz")
    audio = b""
    async for chunk in com.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
    return audio   # MP3 bytes
```

TTS is warmed up on startup with a silent `"Ready."` call so the first real response has no cold-start lag.

---

## HTTPS Ollama Proxy (port 8767)

When FIN-OS is accessed via Vercel (HTTPS), the browser blocks HTTP calls to `localhost:11434` (mixed-content policy). The agent solves this by running a self-signed HTTPS reverse proxy on port 8767 that forwards all traffic to Ollama on `localhost:11434`.

```
Browser (HTTPS Vercel page)
  → https://127.0.0.1:8767/api/generate
     └─ HTTPS proxy (aiohttp, self-signed cert)
        → http://127.0.0.1:11434/api/generate (Ollama)
```

**First run:** cert + key are auto-generated at `voiceagent/.finos_cert.pem` and `.finos_key.pem`.  
**Browser trust:** navigate to `https://127.0.0.1:8767/` in the browser → click "Advanced" → "Proceed" to trust the self-signed cert. A simple "Cert Trusted" confirmation page is shown. Only needs to be done once per browser profile.

---

## WebSocket Protocol

Server: `ws://127.0.0.1:8765` (plain — no TLS on the WebSocket; TLS only on the Ollama proxy)

### Messages browser → server

| Type | Payload | Description |
|------|---------|-------------|
| `audio` | `{ data: "<base64>", format: "webm" }` | Raw audio chunk to transcribe |
| `user_context` | `{ user_id, identity, profile, financial, … }` | Full user context (sent on connect) |
| `text` | `{ text: "…" }` | Direct text message (skip STT) |
| `clear_memory` | `{}` | Wipes Supabase memory for this user |
| `ping` | `{}` | Keep-alive |

### Messages server → browser

| Type | Payload | Description |
|------|---------|-------------|
| `transcript` | `{ text: "…", lang: "english" }` | STT result |
| `response_start` | `{}` | LLM started generating |
| `response_chunk` | `{ text: "…" }` | Partial LLM text (for display) |
| `audio` | `{ data: "<base64>", format: "mp3" }` | TTS chunk to play |
| `response_end` | `{ full_text: "…" }` | LLM done; full response |
| `error` | `{ message: "…" }` | Error message |
| `pong` | `{}` | Ping response |

---

## Starting the Agent

```bash
cd voiceagent
pip install -r requirements.txt

# Also install Ollama and pull a model:
ollama pull qwen2.5:3b

# Run the agent (starts WebSocket :8765 + HTTPS proxy :8767):
python agent.py
```

Or via Docker:
```bash
docker build -t finos-voice .
docker run -p 8765:8765 -p 8767:8767 finos-voice
```

Or the convenience script:
```bash
bash voiceagent/run.sh
```

### .env file (optional)

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
OLLAMA_MODEL=qwen3:14b    # override auto-detection
```

---

## Requirements

```
faster-whisper     # Whisper STT
edge-tts           # Microsoft Edge TTS
ollama             # Python client for Ollama
websockets         # WebSocket server
aiohttp            # HTTPS proxy + web server
psutil             # RAM detection for model auto-select
httpx              # Supabase REST client (optional — enables persistent memory)
sentence-transformers  # pgvector semantic memory (optional)
python-dotenv      # .env loading (optional)
```

---

## Key Classes — Quick Reference

| Class | Purpose |
|-------|---------|
| `UserContext` | Ingests browser context payload, builds LLM-readable block via `.to_prompt()` |
| `Memory` | In-RAM deque of turns + profile extraction from conversation |
| `MemoryStore` | Async Supabase REST client — load/save/clear persistent memory |
| `SemanticMemory` | pgvector store/recall using `all-MiniLM-L6-v2` embeddings |
| `STT` | Wraps `faster-whisper` — `transcribe(path)` returns `(text, lang)` |
| `TTS` | Wraps `edge-tts` — `speak(text, lang)` returns MP3 bytes |
| `Brain` | Builds system prompt with intent + mood + language + user context; calls Ollama |

---

## The 12 Laws of Indian Finance (baked into SYSTEM_PROMPT)

The voice agent knows these and references them naturally in responses:

1. EMI is not affordability — it is mortgaging your future income
2. LIC endowment and ULIP are wealth destroyers — term + MF always wins
3. Direct MFs beat regular by 1–1.5% per year — ₹50L extra on ₹1Cr over 20 years
4. F&O trading destroys 90% of retail accounts per SEBI data
5. Your primary home and car are liabilities, not assets
6. The first ₹10L corpus is the hardest — after that compounding does the work
7. Insurance and investment must always be separate
8. Inflation at 6% means ₹1L today is worth ₹55K in 10 years

---

## Benchmarks Used in Responses

| Instrument | Benchmark | Notes |
|-----------|-----------|-------|
| Nifty 50 | 12% CAGR | 15-year average |
| Midcap funds | 14–15% CAGR | historically |
| Fixed Deposit | 6.5–7.5% | current rates |
| PPF | 7.1% tax-free | government-guaranteed |
| EPF | 8.25% | FY2024 |
| Gold | 8–9% in ₹ | long-term average |
| Inflation | 5–6% | Indian CPI average |
| Real estate (metro) | 5–6% CAGR | price appreciation only |

---

## Deployment Notes

- The agent binds to `127.0.0.1` only (not `0.0.0.0`) — it is never exposed to the internet
- Port 8765 (WebSocket) and 8767 (HTTPS proxy) must be open in local firewall if using Docker
- Port 8766 is reserved for `Portfolio Analyser/server.py` — do not use it here
- Supabase memory is optional — the agent works fully without it (in-RAM only)
- `ollama serve` must be running before starting `agent.py`
- The HTTPS proxy requires the browser to trust the self-signed cert once (visit `https://127.0.0.1:8767/` and click Proceed)
- On Vercel deployment: Arya sidebar panel also uses `:8767` proxy for its own Ollama calls
