"""Run the best measured judge (qwen3:14b decomposition, ~13.5 s per claim) over pool_claims.jsonl so score_gate.py can score every claim you label,
not only the 241 old ones. Resumable (skips claim_ids already in the output) and read-only for the pool. HEAVY: about 3.7 h for 978 claims on this Mac and it
keeps a 14b model in memory, so start it only when nothing else needs Ollama:
    rag-engine/.venv/bin/python sml/verifier/judge_pool.py [--limit N] [--model qwen3:14b]      -> sml/verifier/pool_judge_qwen3_14b_decomp.jsonl ({claim_id, flag, verdict, sec})
The prompt is the same text as PROMPT_DECOMP in llm_judge_real.py (copied, not imported: that file runs its scoring at import time)."""
from __future__ import annotations
import argparse, json, re, time
from pathlib import Path
import httpx
HERE = Path(__file__).resolve().parent
PROMPT = """You are a strict fact-checker. Use ONLY the EVIDENCE, no outside knowledge.
Step 1: list every separate factual element of the CLAIM (each number, name, condition, direction such as allowed/not allowed, and any scope word like 'all' or 'only').
Step 2: for each element say FOUND (stated or directly implied in the evidence), WRONG (the evidence says something different) or MISSING (not in the evidence).
Step 3: final line exactly 'VERDICT: SUPPORTED' (all FOUND), 'VERDICT: CONTRADICTED' (any WRONG) or 'VERDICT: UNSUPPORTED' (none WRONG but any MISSING).
Be strict: an element taken from a neighbouring sentence about something else is MISSING or WRONG. Keep the whole answer under 90 words.

EVIDENCE:
{ev}

CLAIM: {claim}"""


def verdict(text: str) -> str:
    txt = re.sub(r"<think>.*?</think>", "", text, flags=re.S).upper()
    return "unsupported" if "UNSUPPORTED" in txt else "contradicted" if "CONTRADICTED" in txt else "supported" if "SUPPORTED" in txt else "error"


def evidence(r) -> str: return "\n\n".join(f"[{k + 1}] {e['title']}\n{e['text'].strip('… ')}" for k, e in enumerate(r["evidence"]))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--limit", type=int); ap.add_argument("--model", default="qwen3:14b"); a = ap.parse_args()
    out = HERE / f"pool_judge_{a.model.replace(':', '_')}_decomp.jsonl"
    done = {json.loads(l)["claim_id"] for l in out.read_text().splitlines()} if out.exists() else set()
    pool = [json.loads(l) for l in (HERE / "pool_claims.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    with open(out, "a") as fh:
        for n, r in enumerate(x for x in pool if x["claim_id"] not in done):
            if a.limit and n >= a.limit: break
            t0 = time.time(); resp = None
            for attempt in range(2):                      # a stalled Ollama call must not kill a multi-hour run; a claim that fails twice is skipped (not written) and retried next run
                try:
                    resp = httpx.post("http://localhost:11434/api/generate", json={"model": a.model, "prompt": PROMPT.format(ev=evidence(r), claim=r["claim"]), "stream": False, "think": False,
                                      "options": {"temperature": 0, "num_predict": 160}}, timeout=240).json()["response"]; break
                except Exception as e:  # noqa: BLE001
                    print("retry" if attempt == 0 else "skip", r["claim_id"], type(e).__name__, flush=True)
            if resp is None: continue
            v = verdict(resp); fh.write(json.dumps({"claim_id": r["claim_id"], "flag": v in ("unsupported", "contradicted"), "verdict": v, "sec": round(time.time() - t0, 1)}) + "\n"); fh.flush()
