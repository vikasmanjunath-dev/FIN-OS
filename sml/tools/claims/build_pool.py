"""Build the candidate pool of claims for the verifier gate set (D9). NEVER writes a label.
    rag-engine/.venv/bin/python sml/tools/claims/build_pool.py [--limit N] [--out FILE]        (needs the rag-engine server on :7476; generation takes ~7 s per question)
Pool = the 241 real claims already captured by sml/verifier/capture_real.py (kept, so a founder label on them can be compared with the two earlier labellers) + new claims from
the live engine's answers to the golden-set questions (English items and the draft Hindi / Hinglish items, which the public benchmark did not cover). Claim splitting, evidence windows
and retrieval are the SAME code and calls as capture_real.py (generation.prompt.select_window, /api/retrieve top 3, /api/query), so a new claim looks exactly like the old ones.
Each row: {claim_id, pool: existing|new, qid, question, evidence:[{title,text}], claim, answer_index, existing_idx (existing only)}. Order is shuffled with a fixed seed so the labelling
page shows a random mix; the page never shows any earlier label."""
from __future__ import annotations
import argparse, importlib.util, json, random, sys
from pathlib import Path
import httpx
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "rag-engine"))
from generation.prompt import select_window  # noqa: E402

spec = importlib.util.spec_from_file_location("capture_real", ROOT / "sml" / "verifier" / "capture_real.py")
CR = importlib.util.module_from_spec(spec); sys.modules["capture_real"] = CR; spec.loader.exec_module(CR)
SERVER = "http://localhost:7476"


def questions():
    g = ROOT / "sml" / "eval" / "golden"
    out = []
    for pat, tag in (("items_*.jsonl", "g"), ("draft_hi_*.jsonl", "h")):
        for f in sorted(g.glob(pat)):
            out += [(json.loads(l)["id"], json.loads(l)["question"]) for l in f.read_text(encoding="utf-8").splitlines() if l.strip()]
    return out


def existing_rows():
    rows = [json.loads(l) for l in (ROOT / "sml" / "verifier" / "real_claims_raw.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    return [dict(r, pool="existing", existing_idx=i) for i, r in enumerate(rows)]


def new_rows(qs, limit=None):
    rows = []
    for qid, q in (qs[:limit] if limit else qs):
        try:
            chunks = httpx.post(f"{SERVER}/api/retrieve", json={"query": q, "top_k": 3}, timeout=180).json()["chunks"]
            ans = httpx.post(f"{SERVER}/api/query", json={"query": q, "stream": False}, timeout=180).json()["answer"]
        except Exception as e:                       # keep going: one failed question must not lose the rest
            print("skip", qid, e, flush=True); continue
        ev = [{"title": c["doc_title"], "text": select_window(c["text"], q)} for c in chunks]
        rows += [{"pool": "new", "qid": qid, "question": q, "evidence": ev, "claim": s, "answer_index": i} for i, s in enumerate(CR.sentences(ans))]
        print(qid, len(rows), flush=True)
    return rows


def build(existing, new, seed=7):
    seen = {r["claim"].strip().lower() for r in existing}
    uniq = []
    for r in new:
        k = r["claim"].strip().lower()
        if k in seen: continue
        seen.add(k); uniq.append(r)
    allr = existing + uniq; random.Random(seed).shuffle(allr)
    for i, r in enumerate(allr, 1): r["claim_id"] = f"c{i:04d}"
    return allr


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--limit", type=int); ap.add_argument("--out", default=str(ROOT / "sml" / "verifier" / "pool_claims.jsonl")); a = ap.parse_args()
    pool = build(existing_rows(), new_rows(questions(), a.limit))
    Path(a.out).write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in pool) + "\n", encoding="utf-8")
    print("pool", len(pool), "claims:", sum(r["pool"] == "existing" for r in pool), "existing,", sum(r["pool"] == "new" for r in pool), "new ->", a.out)
