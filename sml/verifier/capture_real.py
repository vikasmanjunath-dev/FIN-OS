"""
Capture REAL claims from the engine's own answers (W2.5), so the verifier can be judged on what it will actually see.

For every public benchmark question: retrieve the top-3 chunks (same call the engine makes), build the exact context
windows the generator is shown (generation.prompt.select_window), get the engine's answer, split it into claim sentences,
and write one row per sentence: {qid, question, evidence: [3 windows with titles], claim, answer_index}.
Run with the rag-engine server up:  rag-engine/.venv/bin/python sml/verifier/capture_real.py
Output: sml/verifier/real_claims_raw.jsonl  (unlabelled; labelling is a separate step, see PLAN W2.5)
"""
import json, re, sys
from pathlib import Path
import httpx
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "rag-engine"))
from evaluation import benchmark as B          # noqa: E402
from generation.prompt import select_window    # noqa: E402

SERVER = "http://localhost:7476"
CITE = re.compile(r"\s*\[SOURCE_\d+\](?:,?\s*\[SOURCE_\d+\])*")
SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9₹\"'(])")


def sentences(answer: str):
    text = re.sub(r"[*_#`]+", "", answer)
    out = []
    for s in SPLIT.split(text.strip()):
        s = CITE.sub("", s).strip()
        if len(s.split()) >= 5:
            out.append(s)
    return out


def main():
    rows = []
    for q in B.QUESTIONS:
        try:
            chunks = httpx.post(f"{SERVER}/api/retrieve", json={"query": q["query"], "top_k": 3}, timeout=180).json()["chunks"]
            ans = httpx.post(f"{SERVER}/api/query", json={"query": q["query"], "stream": False}, timeout=180).json()["answer"]
        except Exception as e:
            print("skip", q["id"], e); continue
        ev = [{"title": c["doc_title"], "text": select_window(c["text"], q["query"])} for c in chunks]
        for i, s in enumerate(sentences(ans)):
            rows.append({"qid": q["id"], "question": q["query"], "evidence": ev, "claim": s, "answer_index": i})
    out = ROOT / "sml" / "verifier" / "real_claims_raw.jsonl"
    out.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n")
    print("wrote", len(rows), "claims from", len({r['qid'] for r in rows}), "questions ->", out)


if __name__ == "__main__":
    main()
