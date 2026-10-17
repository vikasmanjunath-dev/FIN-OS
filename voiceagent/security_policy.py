"""
Voice agent - pure security policy helpers (no heavy imports, so they can be unit-tested without Whisper / Ollama / sockets).

  * origin_allowed()      which web pages may open the WebSocket (cross-site WebSocket hijacking: any site the user visits could
                          otherwise connect to wss://127.0.0.1:8765, talk to the agent and claim any user id);
  * proxy_request_allowed / cors_origin_for   the HTTPS-to-Ollama proxy on :8767 forwarded EVERY path with `Allow-Origin: *`, so any
                          web page could pull, create or delete models and run the LLM; now chat/generate/embed/tags/version only;
  * audio_kind()          size cap and container sniffing for microphone uploads before they are handed to ffmpeg;
  * ensure_dev_cert()     the TLS key used to be a committed file; each machine now generates its own on first run.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess

MAX_AUDIO_BYTES = 8 * 1024 * 1024          # ~4 minutes of 16 kHz mono WAV; browser recordings are far smaller
MAX_WS_MESSAGE_BYTES = 16 * 1024 * 1024    # was 50 MB

_LOCAL = re.compile(r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?$")
DEFAULT_ORIGINS = ("https://finos1.vercel.app",)


def _extra_origins() -> tuple:
    return tuple(o.strip() for o in os.getenv("VOICE_ORIGINS", "").split(",") if o.strip() and o.strip() != "*")


def origin_allowed(origin: str | None) -> bool:
    """True for local pages, the production site and VOICE_ORIGINS. A request with NO Origin header is not a browser page
    (a script or the test client) and is allowed; `Origin: null` (file:// pages, sandboxed frames) is not."""
    if origin is None or origin == "":
        return True
    return bool(_LOCAL.match(origin)) or origin in DEFAULT_ORIGINS or origin in _extra_origins()


def cors_origin_for(origin: str | None) -> str | None:
    """The value for Access-Control-Allow-Origin, or None (send no CORS header)."""
    return origin if origin and origin_allowed(origin) else None


_PROXY_ALLOWED = {
    ("POST", "/api/chat"), ("POST", "/api/generate"), ("POST", "/api/embed"), ("POST", "/api/embeddings"),
    ("GET", "/api/tags"), ("GET", "/api/version"),
}


def proxy_request_allowed(method: str, path: str) -> bool:
    return (method.upper(), path.rstrip("/") or "/") in _PROXY_ALLOWED


def audio_kind(data: bytes) -> str | None:
    """'wav' | 'webm' | 'ogg' | 'mp4' | 'mp3' for a recognised container, None otherwise (also None when empty or too big)."""
    if not data or len(data) > MAX_AUDIO_BYTES:
        return None
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "wav"
    if data[:4] == b"\x1a\x45\xdf\xa3":
        return "webm"
    if data[:4] == b"OggS":
        return "ogg"
    if data[4:8] == b"ftyp":
        return "mp4"
    if data[:3] == b"ID3" or data[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return "mp3"
    return None


# ffmpeg is told to read plain local files only: no http/tcp/udp/concat/subfile protocols a crafted "audio" file could name.
FFMPEG_INPUT_FLAGS = ["-protocol_whitelist", "file,pipe"]


def ensure_dev_cert(cert_path: str, key_path: str) -> bool:
    """Create a self-signed certificate for 127.0.0.1 / localhost if either file is missing. Returns True if it created one.
    The private key is written with mode 0600 and must never be committed (voiceagent/.gitignore lists *.pem)."""
    if os.path.exists(cert_path) and os.path.exists(key_path):
        return False
    openssl = shutil.which("openssl")
    if not openssl:
        raise RuntimeError("openssl is needed to create the local TLS certificate (%s / %s missing)" % (cert_path, key_path))
    old = os.umask(0o077)
    try:
        subprocess.run([openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "825", "-subj", "/CN=127.0.0.1",
                        "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost", "-keyout", key_path, "-out", cert_path],
                       check=True, capture_output=True, timeout=60)
    finally:
        os.umask(old)
    os.chmod(key_path, 0o600)
    return True
