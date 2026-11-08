"""Grow the verifier claim pool WITHOUT touching the existing rows, so labels already given (keyed by claim_id) stay valid. NEVER writes a label.
    rag-engine/.venv/bin/python sml/tools/claims/extend_pool.py [--questions 170] [--seed 11]      (needs the rag-engine server on :7476 and Ollama)
Steps (resumable, each step appends to a jsonl next to this file's output):
  1 questions: sample chunks from sml/verifier/chunks_cache.jsonl (<= 2 per document title, no recruitment notices, varied doc types) and have qwen3:8b write ONE
    realistic user question per chunk (about 1 in 4 in Hinglish). The chunk is only used to write the question; the answer comes from the live pipeline.
  2 claims: the SAME retrieve (/api/retrieve top 3 + select_window) and answer (/api/query) calls and claim splitter as build_pool.py.
  3 append: dedupe against the pool by claim text, shuffle only the NEW rows, give them ids after the current maximum, append to pool_claims.jsonl.
Why: sml/verifier/power.py shows 300 labels cannot confirm even a clearly good verifier; about 800 are needed."""
from __future__ import annotations
import argparse, importlib.util, json, random, re, sys
from collections import defaultdict
from pathlib import Path
import httpx
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "rag-engine"))
from generation.prompt import select_window  # noqa: E402

spec = importlib.util.spec_from_file_location("capture_real", ROOT / "sml" / "verifier" / "capture_real.py")
CR = importlib.util.module_from_spec(spec); sys.modules["capture_real"] = CR; spec.loader.exec_module(CR)
SERVER, OLLAMA = "http://localhost:7476", "http://localhost:11434"
POOL = ROOT / "sml" / "verifier" / "pool_claims.jsonl"
QFILE = Path(__file__).with_name("extra_questions.jsonl")
CFILE = Path(__file__).with_name("extra_claims_raw.jsonl")
PROMPT = """Write ONE realistic question that a person using an Indian personal-finance app might type, which the PASSAGE below can answer.
Rules: do not mention the passage, 'document' or 'text'; do not copy a long phrase; one sentence; {style}
Reply with the question only.

PASSAGE:
{text}"""
STYLES = ["plain English.", "plain English.", "plain English.", "casual Hinglish (Hindi written in English letters, as people text), like 'bhai ... kitna lagta hai?'."]


def pick_chunks(n, seed):
    rnd = random.Random(seed); by = defaultdict(list)
    for r in (json.loads(l) for l in open(ROOT / "sml" / "verifier" / "chunks_cache.jsonl", encoding="utf-8")):
        if len(r["text"]) < 500 or "recruit" in (r.get("title") or "").lower(): continue
        by[r["title"]].append(r)
    picks = []
    for t, rs in by.items(): picks += rnd.sample(rs, min(2, len(rs)))
    rnd.shuffle(picks); return picks[:n]


def make_question(text, style):
    r = httpx.post(f"{OLLAMA}/api/generate", json={"model": "qwen3:8b", "prompt": PROMPT.format(style=style, text=text[:1800]), "stream": False, "think": False,
                   "options": {"temperature": 0.7, "num_predict": 60}}, timeout=300).json()["response"]
    return re.sub(r"<think>.*?</think>", "", r, flags=re.S).strip().strip('"').split("\n")[0].strip()


def step_questions(n, seed):
    have = {json.loads(l)["chunk_id"] for l in QFILE.read_text().splitlines()} if QFILE.exists() else set()
    with open(QFILE, "a", encoding="utf-8") as fh:
        for i, ch in enumerate(pick_chunks(n, seed)):
            if ch["id"] in have: continue
            q = make_question(ch["text"], STYLES[i % 4])
            if 12 <= len(q) <= 220 and q.endswith("?"):
                fh.write(json.dumps({"qid": f"x{i:03d}", "chunk_id": ch["id"], "question": q}, ensure_ascii=False) + "\n"); fh.flush()
            print("q", i, q[:80], flush=True)


def step_claims():
    done = {json.loads(l)["qid"] for l in CFILE.read_text().splitlines()} if CFILE.exists() else set()
    with open(CFILE, "a", encoding="utf-8") as fh:
        for l in QFILE.read_text(encoding="utf-8").splitlines():
            d = json.loads(l)
            if d["qid"] in done: continue
            try:
                chunks = httpx.post(f"{SERVER}/api/retrieve", json={"query": d["question"], "top_k": 3}, timeout=180).json()["chunks"]
                ans = httpx.post(f"{SERVER}/api/query", json={"query": d["question"], "stream": False}, timeout=180).json()["answer"]
            except Exception as e:                        # one failed question must not lose the rest
                print("skip", d["qid"], e, flush=True); continue
            ev = [{"title": c["doc_title"], "text": select_window(c["text"], d["question"])} for c in chunks]
            rows = [{"pool": "new", "qid": d["qid"], "question": d["question"], "evidence": ev, "claim": s, "answer_index": i} for i, s in enumerate(CR.sentences(ans))]
            fh.write(json.dumps({"qid": d["qid"], "rows": rows}, ensure_ascii=False) + "\n"); fh.flush()
            print("c", d["qid"], len(rows), flush=True)


def step_append(seed):
    pool = [json.loads(l) for l in POOL.read_text(encoding="utf-8").splitlines() if l.strip()]
    seen = {r["claim"].strip().lower() for r in pool}
    new = []
    for l in CFILE.read_text(encoding="utf-8").splitlines():
        for r in json.loads(l)["rows"]:
            k = r["claim"].strip().lower()
            if k not in seen: seen.add(k); new.append(r)
    random.Random(seed).shuffle(new)
    top = max(int(r["claim_id"][1:]) for r in pool)
    for i, r in enumerate(new, top + 1): r["claim_id"] = f"c{i:04d}"
    with open(POOL, "a", encoding="utf-8") as fh:
        for r in new: fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    print("pool", len(pool), "->", len(pool) + len(new), f"(+{len(new)} new, ids c{top+1:04d}..c{top+len(new):04d})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--questions", type=int, default=170); ap.add_argument("--seed", type=int, default=11)
    ap.add_argument("--step", choices=["all", "questions", "claims", "append"], default="all"); a = ap.parse_args()
    if a.step in ("all", "questions"): step_questions(a.questions, a.seed)
    if a.step in ("all", "claims"): step_claims()
    if a.step in ("all", "append"): step_append(a.seed)
