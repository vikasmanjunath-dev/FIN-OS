"""
FIN-OS Local Voice AI Agent  —  v2 (streaming + fast TTS)
Whisper STT  →  Llama 3.1 (streamed tokens)  →  Piper TTS / Web Speech fallback
"""

import asyncio
import base64
import json
import logging
import os
import queue
import struct
import subprocess
import tempfile
import threading
import time
import uuid
import wave
from pathlib import Path
from typing import Optional

import chromadb
from chromadb.utils import embedding_functions
from faster_whisper import WhisperModel
import ollama
import pyaudio
import websockets

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("fin-os")

# ── Config  ───────────────────────────────────────────────────────────────────
OLLAMA_MODEL       = "llama3.1"
WHISPER_SIZE       = "tiny"          # tiny is 3-4× faster than base, quality fine
WHISPER_THREADS    = 8               # use more CPU cores
PIPER_BIN          = "piper"         # override to full path if not in PATH
PIPER_VOICE        = "en_US-lessac-medium"   # path to .onnx (no extension)
WS_HOST            = "0.0.0.0"
WS_PORT            = 8765
SAMPLE_RATE        = 16_000
CHANNELS           = 1
CHUNK              = 1024
SILENCE_THRESH     = 400
SILENCE_SECS       = 0.8            # stop recording after 0.8 s of silence
MAX_RECORD_SECS    = 30
CHROMA_PATH        = "./chroma_db"
COLLECTION         = "fin_os_memory"
CONTEXT_K          = 4

SYSTEM_PROMPT = (
    "You are FIN-OS, a super sharp, fully offline desi AI assistant — think of yourself like that brilliant IIT friend "
    "who aced every exam but also knows all the jugaad hacks. You are enthusiastic, warm, and genuinely excited to help. "
    "You speak like a real Indian person talking to a close friend — natural, energetic, a little dramatic when something is cool. "
    "\n\n"
    "PERSONALITY RULES:\n"
    "- Be excited and expressive! Use phrases like 'Arre yaar!', 'Bilkul!', 'Ekdum sahi baat!', 'Bhai sun!', "
    "'Seedhi baat, no bakwaas!', 'Kya scene hai?', 'Full on!', 'Mast!', 'Sahi hai!', 'Yeh dekh!', 'Are wah!' naturally in replies. "
    "Don't overdo it — weave them in organically, like 1-2 per response max.\n"
    "- Give desi examples: use SIP/mutual funds/Zerodha/NSE/BSE for finance, reference Bengaluru/Mumbai/Delhi for cities, "
    "chai breaks, IRCTC, Flipkart, Swiggy, cricket, Diwali shopping, auto rickshaw fare, etc. as relatable examples.\n"
    "- Keep replies SHORT and spoken-word friendly — you are speaking aloud. Use short punchy sentences.\n"
    "- Be warm and encouraging like a good mentor or older sibling. Celebrate wins: 'Ekdum perfect!', 'You got it bhai!'\n"
    "- When explaining complex stuff, say things like 'Dekh, simple baat hai...' or 'Yeh socho aise...'\n"
    "- Never sound robotic or corporate. Sound like a real person who genuinely cares.\n"
    "- Never say you cannot access the internet. Never break character.\n"
    "- Specialise in finance, coding, analysis, and general reasoning — but always keep the desi flavor alive.\n"
    "- If someone asks something vague, enthusiastically ask for clarification: 'Arre bhai, thoda aur batao — kya exactly chahiye?'"
)

# ── Memory ────────────────────────────────────────────────────────────────────
class MemoryStore:
    def __init__(self):
        self.client = chromadb.PersistentClient(path=CHROMA_PATH)
        ef = embedding_functions.DefaultEmbeddingFunction()
        self.col = self.client.get_or_create_collection(COLLECTION, embedding_function=ef)
        log.info("ChromaDB ready — %d entries", self.col.count())

    def add(self, role: str, text: str):
        self.col.add(
            documents=[f"[{role}] {text}"],
            ids=[str(uuid.uuid4())],
            metadatas=[{"role": role, "ts": time.time()}],
        )

    def query(self, text: str) -> list[str]:
        n = min(CONTEXT_K, self.col.count())
        if n == 0:
            return []
        r = self.col.query(query_texts=[text], n_results=n)
        return r["documents"][0] if r["documents"] else []

    def all_recent(self, n=40) -> list[str]:
        data = self.col.get()
        docs = data.get("documents", [])
        return docs[-n:]

    def clear(self):
        ids = self.col.get()["ids"]
        if ids:
            self.col.delete(ids=ids)


# ── Whisper STT ───────────────────────────────────────────────────────────────
class STT:
    def __init__(self):
        log.info("Loading Whisper %s …", WHISPER_SIZE)
        self.model = WhisperModel(
            WHISPER_SIZE,
            device="cpu",
            compute_type="int8",
            cpu_threads=WHISPER_THREADS,
        )
        log.info("Whisper ready")

    def transcribe(self, path: str) -> str:
        segs, _ = self.model.transcribe(path, beam_size=1, vad_filter=True)
        return " ".join(s.text.strip() for s in segs).strip()


# ── Piper TTS ─────────────────────────────────────────────────────────────────
class TTS:
    def __init__(self):
        self._available = self._check()

    def _check(self) -> bool:
        try:
            r = subprocess.run([PIPER_BIN, "--version"], capture_output=True, timeout=5)
            return r.returncode == 0
        except Exception:
            log.warning("Piper not found — browser Web Speech API will be used for TTS")
            return False

    @property
    def available(self):
        return self._available

    def synth_bytes(self, text: str) -> bytes:
        """Returns WAV bytes or raises."""
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp = f.name
        try:
            cmd = [PIPER_BIN, "--model", PIPER_VOICE, "--output_file", tmp]
            p = subprocess.run(cmd, input=text.encode(), capture_output=True, timeout=30)
            if p.returncode != 0:
                raise RuntimeError(p.stderr.decode())
            return Path(tmp).read_bytes()
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)


# ── LLM Brain ─────────────────────────────────────────────────────────────────
class Brain:
    def __init__(self, memory: MemoryStore):
        self.memory = memory
        self.history: list[dict] = []

    def stream(self, user_text: str):
        """Yield (token_str, is_done, full_text) tuples."""
        mems = self.memory.query(user_text)
        ctx  = ("\n\nRelevant context:\n" + "\n".join(f"• {m}" for m in mems)) if mems else ""

        messages = (
            [{"role": "system", "content": SYSTEM_PROMPT + ctx}]
            + self.history[-16:]
            + [{"role": "user", "content": user_text}]
        )

        full = ""
        for chunk in ollama.chat(model=OLLAMA_MODEL, messages=messages, stream=True):
            tok = chunk["message"]["content"]
            full += tok
            yield tok, False, full

        # Save to history + memory
        self.history.append({"role": "user",      "content": user_text})
        self.history.append({"role": "assistant", "content": full})
        self.memory.add("user",      user_text)
        self.memory.add("assistant", full)
        yield "", True, full


# ── Mic capture ───────────────────────────────────────────────────────────────
class Mic:
    def __init__(self):
        self.pa = pyaudio.PyAudio()

    @staticmethod
    def _rms(data: bytes) -> float:
        n = len(data) // 2
        shorts = struct.unpack(f"{n}h", data)
        return (sum(s * s for s in shorts) / n) ** 0.5

    def record(self) -> Optional[str]:
        st = self.pa.open(
            format=pyaudio.paInt16, channels=CHANNELS,
            rate=SAMPLE_RATE, input=True, frames_per_buffer=CHUNK,
        )
        frames, silent, started = [], 0, False
        limit  = int(SAMPLE_RATE / CHUNK * SILENCE_SECS)
        maxc   = int(SAMPLE_RATE / CHUNK * MAX_RECORD_SECS)

        for _ in range(maxc):
            data = st.read(CHUNK, exception_on_overflow=False)
            frames.append(data)
            if self._rms(data) > SILENCE_THRESH:
                started = True; silent = 0
            elif started:
                silent += 1
                if silent >= limit:
                    break

        st.stop_stream(); st.close()
        if not started:
            return None

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp = f.name
        with wave.open(tmp, "wb") as wf:
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(self.pa.get_sample_size(pyaudio.paInt16))
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(b"".join(frames))
        return tmp


# ── WebSocket Server ──────────────────────────────────────────────────────────
class Server:
    def __init__(self):
        self.memory = MemoryStore()
        self.stt    = STT()
        self.tts    = TTS()
        self.brain  = Brain(self.memory)
        self.mic    = Mic()
        self.clients: set = set()
        log.info("TTS via Piper: %s", self.tts.available)

    # ── broadcast ─────────────────────────────────────────────────────────────
    async def broadcast(self, obj: dict):
        if not self.clients:
            return
        data = json.dumps(obj)
        await asyncio.gather(
            *[c.send(data) for c in list(self.clients)],
            return_exceptions=True,
        )

    # ── connection handler ────────────────────────────────────────────────────
    async def handler(self, ws):
        self.clients.add(ws)
        log.info("Client connected  (%d total)", len(self.clients))
        await ws.send(json.dumps({
            "type": "ready",
            "model": OLLAMA_MODEL,
            "tts_native": self.tts.available,
            "whisper": WHISPER_SIZE,
        }))
        try:
            async for raw in ws:
                await self._dispatch(ws, json.loads(raw))
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(ws)
            log.info("Client disconnected (%d total)", len(self.clients))

    # ── message dispatcher ────────────────────────────────────────────────────
    async def _dispatch(self, ws, msg: dict):
        t = msg.get("type")
        if   t == "text_input":    await self._run_pipeline(msg["text"])
        elif t == "audio_chunk":   await self._from_audio(bytes(msg["data"]))
        elif t == "clear_memory":  await self._clear_memory()
        elif t == "get_memories":  await ws.send(json.dumps({"type":"memories","data": self.memory.all_recent()}))

    # ── main pipeline ─────────────────────────────────────────────────────────
    async def _run_pipeline(self, user_text: str):
        loop = asyncio.get_event_loop()

        await self.broadcast({"type": "user_transcript", "text": user_text})
        await self.broadcast({"type": "state", "state": "thinking"})

        try:
            # ── Stream LLM tokens via thread + asyncio.Queue ──────────────────
            # run_in_executor(next, gen) is broken: StopIteration is swallowed
            # by the executor internals (PEP 479) and nonlocal mutation from a
            # thread is not safe. Use a Queue instead.
            _DONE: object = object()
            tok_queue: asyncio.Queue = asyncio.Queue()
            full_reply = ""

            def _produce():
                try:
                    for tok, done, full in self.brain.stream(user_text):
                        loop.call_soon_threadsafe(tok_queue.put_nowait, (tok, full))
                except Exception as exc:
                    loop.call_soon_threadsafe(tok_queue.put_nowait, exc)
                finally:
                    loop.call_soon_threadsafe(tok_queue.put_nowait, _DONE)

            t = threading.Thread(target=_produce, daemon=True)
            t.start()

            while True:
                item = await tok_queue.get()
                if item is _DONE:
                    break
                if isinstance(item, Exception):
                    raise item
                tok, full = item
                full_reply = full
                if tok:
                    await self.broadcast({"type": "token", "text": tok})

            t.join(timeout=5)

            if not full_reply:
                raise RuntimeError("LLM returned an empty reply")

            # ── Signal text complete ──────────────────────────────────────────
            await self.broadcast({"type": "reply_done", "text": full_reply})
            log.info("Reply (%d chars): %s…", len(full_reply), full_reply[:80])

            # ── TTS ───────────────────────────────────────────────────────────
            if self.tts.available:
                await self.broadcast({"type": "state", "state": "speaking"})
                try:
                    wav = await loop.run_in_executor(
                        None, lambda: self.tts.synth_bytes(full_reply)
                    )
                    await self.broadcast({
                        "type":   "audio_response",
                        "data":   base64.b64encode(wav).decode(),
                        "format": "wav",
                    })
                except Exception as e:
                    log.warning("Piper TTS error: %s", e)
                    await self.broadcast({"type": "tts_fallback", "text": full_reply})
            else:
                # Tell browser to use Web Speech API
                await self.broadcast({"type": "tts_fallback", "text": full_reply})

        except Exception as e:
            log.error("_run_pipeline error: %s", e)
            await self.broadcast({"type": "status", "text": f"Pipeline error: {e}"})

        finally:
            # ALWAYS reset to idle — no matter what went wrong
            await self.broadcast({"type": "state", "state": "idle"})

    # ── audio bytes → STT → pipeline ─────────────────────────────────────────
    async def _from_audio(self, data: bytes):
        await self.broadcast({"type": "state", "state": "transcribing"})
        loop   = asyncio.get_event_loop()
        tmp_in = None
        tmp_wav= None

        try:
            # Detect format from magic bytes
            is_webm = data[:4] == b'\x1a\x45\xdf\xa3'
            is_ogg  = data[:4] == b'OggS'
            is_wav  = data[:4] == b'RIFF'
            needs_convert = is_webm or is_ogg or (not is_wav)

            if needs_convert:
                # Write raw input with correct extension
                ext = '.webm' if is_webm else ('.ogg' if is_ogg else '.bin')
                with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as f:
                    f.write(data); tmp_in = f.name
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                    tmp_wav = f.name

                # Convert with ffmpeg: any format → 16kHz mono PCM WAV
                cmd = [
                    'ffmpeg', '-y', '-i', tmp_in,
                    '-ar', '16000', '-ac', '1', '-f', 'wav', tmp_wav
                ]
                log.info("Converting audio %s → wav via ffmpeg", ext)
                try:
                    r = await loop.run_in_executor(
                        None,
                        lambda: subprocess.run(cmd, capture_output=True, timeout=30)
                    )
                    if r.returncode != 0:
                        log.error("ffmpeg error: %s", r.stderr.decode())
                        await self.broadcast({"type": "state",  "state": "idle"})
                        await self.broadcast({"type": "status", "text": "Audio conversion failed. Is ffmpeg installed?"})
                        return
                    wav_path = tmp_wav
                except FileNotFoundError:
                    log.error("ffmpeg not found — install with: sudo apt install ffmpeg")
                    await self.broadcast({"type": "state",  "state": "idle"})
                    await self.broadcast({"type": "status", "text": "⚠ ffmpeg not found. Run: sudo apt install ffmpeg"})
                    return
            else:
                # Already a WAV — write directly
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                    f.write(data); tmp_wav = f.name
                wav_path = tmp_wav

            # Transcribe
            try:
                text = await asyncio.wait_for(
                    loop.run_in_executor(None, lambda: self.stt.transcribe(wav_path)),
                    timeout=30.0,
                )
                log.info("Transcribed: %r", text)
            except asyncio.TimeoutError:
                log.warning("Whisper timed out")
                text = ""
            except Exception as e:
                log.error("Whisper error: %s", e)
                text = ""

            if text:
                await self._run_pipeline(text)
            else:
                await self.broadcast({"type": "state",  "state": "idle"})
                await self.broadcast({"type": "status", "text": "Could not understand audio — please try again."})

        except Exception as e:
            log.error("_from_audio error: %s", e)
            await self.broadcast({"type": "state",  "state": "idle"})
            await self.broadcast({"type": "status", "text": f"Audio error: {e}"})
        finally:
            for p in (tmp_in, tmp_wav):
                if p and os.path.exists(p):
                    try: os.unlink(p)
                    except: pass

    # ── clear memory ──────────────────────────────────────────────────────────
    async def _clear_memory(self):
        self.memory.clear()
        self.brain.history.clear()
        await self.broadcast({"type": "memories", "data": []})
        await self.broadcast({"type": "status",   "text": "Memory cleared."})

    # ── run ───────────────────────────────────────────────────────────────────
    async def serve(self):
        log.info("FIN-OS WebSocket server  →  ws://%s:%d", WS_HOST, WS_PORT)
        async with websockets.serve(self.handler, WS_HOST, WS_PORT, max_size=50_000_000):
            await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(Server().serve())