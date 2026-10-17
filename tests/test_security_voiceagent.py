"""voiceagent security policy (voiceagent/security_policy.py) and its wiring in agent.py.
agent.py itself needs Whisper/Ollama/ffmpeg, so the rules live in a pure module that is tested here, and the wiring is checked by
reading the source (plus a compile check)."""
import importlib.util
import os
import py_compile
import re
import shutil
import stat
import subprocess
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VA = os.path.join(ROOT, "voiceagent")


@pytest.fixture(scope="module")
def sec():
    spec = importlib.util.spec_from_file_location("va_security_policy", os.path.join(VA, "security_policy.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


@pytest.mark.parametrize("origin,ok", [
    (None, True), ("", True), ("http://localhost:7474", True), ("https://localhost", True), ("http://127.0.0.1:8080", True),
    ("http://[::1]:3000", True), ("https://finos1.vercel.app", True),
    ("null", False), ("https://evil.example", False), ("http://localhost.evil.example", False), ("http://evil.example/localhost", False),
    ("https://finos1.vercel.app.evil.example", False), ("http://127.0.0.1.evil.example", False), ("file://", False),
])
def test_websocket_origin_policy(sec, origin, ok):
    assert sec.origin_allowed(origin) is ok


def test_extra_origins_come_from_the_environment_and_never_a_wildcard(sec, monkeypatch):
    monkeypatch.setenv("VOICE_ORIGINS", "https://app.example.com, *")
    assert sec.origin_allowed("https://app.example.com") and not sec.origin_allowed("https://other.example.com")


def test_cors_header_is_never_a_wildcard(sec):
    assert sec.cors_origin_for("https://evil.example") is None
    assert sec.cors_origin_for("http://localhost:3000") == "http://localhost:3000"
    assert sec.cors_origin_for(None) is None


@pytest.mark.parametrize("method,path,ok", [
    ("POST", "/api/chat", True), ("POST", "/api/generate", True), ("GET", "/api/tags", True), ("POST", "/api/embed", True),
    ("POST", "/api/pull", False), ("POST", "/api/create", False), ("DELETE", "/api/delete", False), ("POST", "/api/delete", False),
    ("POST", "/api/copy", False), ("POST", "/api/push", False), ("GET", "/api/blobs/sha256:abc", False), ("GET", "/", False),
    ("GET", "/api/chat", False), ("POST", "/api/chat/../pull", False),
])
def test_ollama_proxy_path_allow_list(sec, method, path, ok):
    assert sec.proxy_request_allowed(method, path) is ok


def test_audio_sniffing_and_size_cap(sec):
    wav = b"RIFF\x00\x00\x00\x00WAVEfmt "
    assert sec.audio_kind(wav) == "wav"
    assert sec.audio_kind(b"\x1a\x45\xdf\xa3....") == "webm" and sec.audio_kind(b"OggS....") == "ogg"
    assert sec.audio_kind(b"\x00\x00\x00\x18ftypmp42") == "mp4" and sec.audio_kind(b"ID3\x04") == "mp3"
    assert sec.audio_kind(b"") is None
    assert sec.audio_kind(b"#EXTM3U\n#EXT-X-MEDIA\nfile:///etc/passwd") is None          # a playlist, not audio
    assert sec.audio_kind(b"ffconcat version 1.0\nfile '/etc/hosts'") is None
    assert sec.audio_kind(wav + b"0" * sec.MAX_AUDIO_BYTES) is None
    assert sec.MAX_WS_MESSAGE_BYTES < 50_000_000
    assert "file,pipe" in sec.FFMPEG_INPUT_FLAGS


@pytest.mark.skipif(shutil.which("openssl") is None, reason="openssl not installed")
def test_dev_certificate_is_generated_per_machine_with_a_private_key(sec, tmp_path):
    cert, key = str(tmp_path / "c.pem"), str(tmp_path / "k.pem")
    assert sec.ensure_dev_cert(cert, key) is True
    assert stat.S_IMODE(os.stat(key).st_mode) == 0o600
    subject = subprocess.run(["openssl", "x509", "-in", cert, "-noout", "-subject", "-ext", "subjectAltName"], capture_output=True, text=True).stdout
    assert "127.0.0.1" in subject
    assert sec.ensure_dev_cert(cert, key) is False                                       # existing files are left alone


def test_agent_is_wired_to_the_policy_and_compiles(tmp_path):
    py_compile.compile(os.path.join(VA, "agent.py"), cfile=str(tmp_path / "a.pyc"), doraise=True)
    src = open(os.path.join(VA, "agent.py"), encoding="utf-8").read()
    assert "_sec.origin_allowed(origin)" in src and "_sec.proxy_request_allowed(" in src and "_sec.audio_kind(data)" in src
    assert "_sec.ensure_dev_cert(" in src and "*_sec.FFMPEG_INPUT_FLAGS" in src and "max_size=_sec.MAX_WS_MESSAGE_BYTES" in src
    assert not re.search(r'Access-Control-Allow-Origin"\s*:\s*"\*"', src), "wildcard CORS is back in the Ollama proxy"
    assert 'WS_HOST    = os.getenv("VOICE_WS_HOST", "127.0.0.1")' in src


def test_private_key_and_certificate_are_not_tracked_going_forward():
    ignore = open(os.path.join(VA, ".gitignore")).read()
    assert "*.pem" in ignore and ".env" in ignore
    for d in ("arya-ai", "alerts", "voiceagent"):
        di = open(os.path.join(ROOT, d, ".dockerignore")).read()
        assert ".env" in di and "*.pem" in di, d                 # `COPY . .` must not bake secrets into an image layer
