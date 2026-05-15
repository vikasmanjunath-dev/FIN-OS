# FIN-OS · Local Voice AI Agent

> Fully offline voice AI running Llama 3.1 via Ollama — with memory, TTS, and a real-time dashboard.

```
┌─────────────────────────────────────────────────────────────────┐
│                     FIN-OS VOICE AI STACK                       │
├──────────────────┬───────────────────┬──────────────────────────┤
│  CAPTURE LAYER   │   BRAIN LAYER     │   OUTPUT LAYER           │
│  PyAudio / Mic   │  Llama 3.1+Ollama │  Piper TTS → WAV         │
│  faster-whisper  │  ChromaDB Memory  │  WebSocket → Browser     │
│  WebSocket STT   │  Context Window   │  HTML/CSS/JS Dashboard   │
└──────────────────┴───────────────────┴──────────────────────────┘
```

---

## Prerequisites

| Requirement    | Min Version  | Install                                         |
|---------------|-------------|--------------------------------------------------|
| Python         | 3.10+       | https://python.org                               |
| Ollama         | 0.1.x+      | `curl -fsSL https://ollama.com/install.sh \| sh` |
| PortAudio      | system lib  | `sudo apt install portaudio19-dev` (Linux)       |
| Piper TTS      | latest      | Auto-downloaded by `run.sh setup`                |

---

## Quick Start

```bash
# 1. Clone / place files in a directory
# 2. Make run.sh executable
chmod +x run.sh

# 3. Full setup (downloads model, voice, installs deps)
./run.sh setup

# 4. Start everything
./run.sh start

# 5. Open browser
open http://localhost:8080
```

---

## Architecture

```
Browser (index.html)
  │
  │  WebSocket ws://localhost:8765
  │
agent.py (Python)
  ├── AudioCapture   (PyAudio)          ← local mic
  ├── SpeechRecognizer (faster-whisper) ← STT
  ├── LLMBrain (Ollama + Llama 3.1)    ← reasoning
  ├── MemoryStore (ChromaDB)            ← vector memory
  └── TextToSpeech (Piper)             ← TTS → WAV → base64 → browser
```

### Message Protocol (WebSocket JSON)

**Client → Server**
```json
{ "type": "text_input",   "text": "..."      }
{ "type": "audio_chunk",  "data": [...]      }   ← Uint8Array WAV bytes
{ "type": "clear_memory"                     }
{ "type": "get_memories"                     }
```

**Server → Client**
```json
{ "type": "ready",            "model": "llama3.1"     }
{ "type": "user_transcript",  "text": "..."           }
{ "type": "thinking"                                  }
{ "type": "assistant_reply",  "text": "..."           }
{ "type": "synthesizing"                              }
{ "type": "audio_response",   "data": "<base64>",  "format": "wav" }
{ "type": "idle"                                      }
{ "type": "memories",         "data": [...]          }
```

---

## Configuration (agent.py)

```python
OLLAMA_MODEL        = "llama3.1"          # any Ollama model
WHISPER_MODEL_SIZE  = "base"              # tiny/base/small/medium/large-v3
PIPER_VOICE         = "en_US-lessac-medium"
WS_HOST             = "0.0.0.0"
WS_PORT             = 8765
SILENCE_THRESHOLD   = 500                 # mic sensitivity (RMS)
SILENCE_DURATION    = 1.5                 # seconds of quiet to stop recording
CONTEXT_K           = 5                  # memory entries injected per turn
```

---

## Voice Models for Piper

Download from: https://huggingface.co/rhasspy/piper-voices

```bash
# Example: British female
curl -L ".../en/en_GB/alba/medium/en_GB-alba-medium.onnx" -o piper/en_GB-alba-medium.onnx
curl -L ".../en/en_GB/alba/medium/en_GB-alba-medium.onnx.json" -o piper/en_GB-alba-medium.onnx.json
# Update PIPER_VOICE in agent.py
```

---

## FIN-OS Integration

The system prompt (`SYSTEM_PROMPT` in agent.py) defines the agent personality.
To integrate with your FIN-OS modules:

```python
SYSTEM_PROMPT = """You are FIN-OS...
You have access to the following modules:
- /fin/portfolio  — portfolio analysis
- /fin/screener   — stock screener
- /fin/risk       — risk calculator
Always respond concisely as if speaking aloud."""
```

---

## Files

```
voice_ai/
├── agent.py          ← Main WebSocket server + orchestration
├── index.html        ← Advanced HTML/CSS/JS frontend
├── requirements.txt  ← Python dependencies
├── run.sh            ← Setup & launch script
├── README.md         ← This file
├── chroma_db/        ← Persistent vector memory (auto-created)
└── piper/            ← Piper binary + voice models (auto-created)
```

---

## Troubleshooting

**"Piper failed"** — Ensure the `.onnx` file path matches `PIPER_VOICE` in agent.py.

**"Ollama connection refused"** — Run `ollama serve` in a separate terminal.

**No mic audio** — Check browser permissions. Use HTTPS or localhost.

**Slow responses** — Switch `WHISPER_MODEL_SIZE` to `"tiny"` for speed.

**ChromaDB error** — Delete `chroma_db/` folder and restart.
