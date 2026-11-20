"""Stage 2 of the two-stage guard (shadow only): a local LLM reads a message the router flagged and says whether it is a risky REQUEST.
Experiment and numbers: sml/TRACKER.md (judge prompt j2; on a fresh sealed set the judge cut false alarms 4.6x at no recall cost). This module only CLASSIFIES; the caller
(rag-engine/server.py /api/route) uses it for counters, never to change a reply. Off unless FINOS_ROUTER_JUDGE_SHADOW=1.
PRIVACY: the text is sent to the LOCAL Ollama only, is capped at MAX_CHARS, and is never logged, cached or stored here."""
import json
import os
import threading
import urllib.request

PROMPT_VERSION = "j2"
MAX_CHARS = 500
MODEL = os.environ.get("FINOS_ROUTER_JUDGE_MODEL", "qwen3:14b")
HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
if not HOST.startswith("http"):
    HOST = "http://" + HOST
JUDGE_PROMPT = """You are a safety classifier for a personal-finance assistant in India. The message may be English, Hindi (Devanagari) or Hinglish.
Decide whether the user is making a RISKY REQUEST:
ADVICE: the user asks the assistant to personally decide, recommend, predict or give a tip about what to buy, sell, invest in or do with money: "which fund should I buy", "should I put all my savings in gold", "kitna paisa equity me daalu meri age 28 hai", "will this stock go up", "is the market going to crash, should I sell", "is small cap safe now", "give me a hot tip for today", "how can I double my money quickly", "will I surely profit on this IPO". Asking for a stock tip, a market prediction or a guaranteed or quick return counts as ADVICE.
EVASION: the user asks HOW to do something illegal or deceptive with money, or asks for help doing it: evade tax, hide income or assets, launder money, move money through hawala, forge or fake documents or bills (for example to claim a deduction), dodge KYC, cheat a lender or insurer (e.g. "how do I hide cash income from the tax office", "make a bill for an expense I never had for 80D").
OTHER: everything else. This includes messages that only EXPLAIN or DEFINE (what is tax evasion, what does an advisor do, what is a fake KYC scam, what is the penalty for hiding income), ask what a law or limit says, ask how to REPORT fraud or black money, document help, calculators, market prices, app help, small talk and non-finance questions. A message that merely contains a risky-sounding word is OTHER.
Answer with exactly one word: ADVICE, EVASION or OTHER.
Message: """

_busy = threading.Semaphore(1)       # one judge call at a time: a slow 14B model must never pile up behind a busy endpoint


def enabled() -> bool:
    return os.environ.get("FINOS_ROUTER_JUDGE_SHADOW") == "1"


def judge(text: str, timeout: float = 60.0) -> str:
    """Returns "ADVICE", "EVASION", "OTHER", "BUSY" (another call was running: skipped) or raises on a transport error."""
    if not _busy.acquire(blocking=False):
        return "BUSY"
    try:
        body = json.dumps({"model": MODEL, "prompt": JUDGE_PROMPT + text[:MAX_CHARS] + "\nAnswer:", "stream": False, "think": False,
                           "options": {"temperature": 0, "num_predict": 6}}).encode()
        r = json.loads(urllib.request.urlopen(urllib.request.Request(HOST + "/api/generate", body, {"content-type": "application/json"}), timeout=timeout).read())
        w = str(r.get("response", "")).strip().upper()
        return "ADVICE" if w.startswith("ADVICE") else "EVASION" if w.startswith("EVASION") else "OTHER"
    finally:
        _busy.release()
