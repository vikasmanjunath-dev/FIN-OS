"""Typed golden set: retrieval recall@k harness (ROADMAP B18). Retrieval only, no generation.
    rag-engine/.venv/bin/python sml/eval/golden/harness.py check                       # anchors exist in the live index, overlap and duplicate checks
    rag-engine/.venv/bin/python sml/eval/golden/harness.py run --out run_mxbai.json     # needs the rag-engine server on :7476
    rag-engine/.venv/bin/python sml/eval/golden/harness.py compare run_a.json run_b.json   # paired bootstrap of recall@5 difference
Items (items_*.jsonl): {id, question, gold_anchor, gold_doc_title, must_contain, category}. An item is a HIT at rank r when the r-th retrieved chunk's text contains
`gold_anchor` (whitespace-insensitive). The anchor is a verbatim span from the chunk that answers the question, so a re-index that keeps the text keeps the gold.
The set is a design/evidence set for the embedding comparison (ROADMAP P4): compare systems on the SAME items, never tune a system on them and then quote the score."""
from __future__ import annotations
import argparse, glob, json, math, random, re, sqlite3, sys, urllib.request
from collections import defaultdict
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
norm = lambda s: re.sub(r"\s+", " ", s or "").strip().lower()


def load_items(kind="en"):
    """kind "en": the reviewed-by-check English items; "hi": the DRAFT Hindi / Hinglish items (agent-written, unreviewed: exploratory only)."""
    items = []
    for f in sorted(glob.glob(str(HERE / ("items_*.jsonl" if kind == "en" else "draft_hi_*.jsonl")))):
        for l in Path(f).read_text(encoding="utf-8").splitlines():
            if l.strip(): items.append(json.loads(l))
    return items


def grams(t, n=4):
    w = norm(re.sub(r"[^\w\s]", " ", t)).split(); return {" ".join(w[i:i + n]) for i in range(len(w) - n + 1)}


def public_chunks():
    con = sqlite3.connect(ROOT / "rag-engine" / "rag_bm25.db")
    return [(json.loads(pj).get("doc_title"), json.loads(pj).get("text") or t) for t, pj in
            con.execute("select text,payload_json from chunks_fts where namespace='public' and doc_type in ('finos_page','regulation')")]


def check():
    items = load_items(); chunks = public_chunks(); idx = [(d, norm(t)) for d, t in chunks]
    bad, rep = [], {"n": len(items), "missing_anchor": [], "multi_doc_anchor": [], "title_mismatch": [], "question_copies_chunk": [], "duplicate_questions": []}
    seen = set()
    for it in items:
        a = norm(it["gold_anchor"]); hits = [d for d, t in idx if a in t]
        if not hits: rep["missing_anchor"].append(it["id"]); continue
        if len(set(hits)) > 1: rep["multi_doc_anchor"].append(it["id"])
        if it.get("gold_doc_title") not in hits: rep["title_mismatch"].append(it["id"])
        qg = grams(it["question"]); cg = set().union(*(grams(t) for d, t in chunks if norm(t).find(a) >= 0))
        if qg & cg: rep["question_copies_chunk"].append(it["id"])
        q = norm(it["question"])
        if q in seen: rep["duplicate_questions"].append(it["id"])
        seen.add(q)
    rep["by_category"] = {c: sum(1 for i in items if i.get("category") == c) for c in sorted({i.get("category") for i in items})}
    print(json.dumps(rep, indent=1)); return rep


def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=120).read())


def wilson(k, n, z=1.96):
    if not n: return [0.0, 1.0]
    p = k / n; d = 1 + z * z / n; c = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [round(max(0, c - h), 4), round(min(1, c + h), 4)]


def run(out, base="http://127.0.0.1:7476", k=5, kind="en"):
    items = load_items(kind); res = []
    for it in items:
        r = post(base + "/api/retrieve", {"query": it["question"], "top_k": k})
        rank = next((i + 1 for i, c in enumerate(r["chunks"]) if norm(it["gold_anchor"]) in norm(c["text"])), None)
        res.append({"id": it["id"], "category": it.get("category"), "rank": rank})
    summ = {"n": len(res), **{f"recall@{j}": round(sum(1 for x in res if x["rank"] and x["rank"] <= j) / len(res), 4) for j in (1, 3, 5)}}
    summ["recall@5_ci95"] = wilson(sum(1 for x in res if x["rank"]), len(res))
    bycat = defaultdict(list)
    for x in res: bycat[x["category"]].append(bool(x["rank"]))
    summ["by_category_recall@5"] = {c: [len(v), round(sum(v) / len(v), 3)] for c, v in sorted(bycat.items())}
    out_obj = {"summary": summ, "items": res}
    Path(out).write_text(json.dumps(out_obj, indent=1)); print(json.dumps(summ, indent=1)); return out_obj


def compare(a, b, n=2000):
    A = {x["id"]: bool(x["rank"]) for x in json.loads(Path(a).read_text())["items"]}; B = {x["id"]: bool(x["rank"]) for x in json.loads(Path(b).read_text())["items"]}
    ids = sorted(set(A) & set(B)); d = [int(B[i]) - int(A[i]) for i in ids]; rnd = random.Random(0); bs = []
    for _ in range(n): bs.append(sum(d[rnd.randrange(len(d))] for _ in d) / len(d))
    bs.sort(); r = {"n": len(ids), "recall@5_a": round(sum(A[i] for i in ids) / len(ids), 4), "recall@5_b": round(sum(B[i] for i in ids) / len(ids), 4),
                    "diff_b_minus_a": round(sum(d) / len(d), 4), "ci95": [round(bs[int(.025 * n)], 4), round(bs[int(.975 * n) - 1], 4)], "only_a": sum(1 for x in d if x < 0), "only_b": sum(1 for x in d if x > 0)}
    print(json.dumps(r, indent=1)); return r


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("cmd", choices=["check", "run", "compare"]); ap.add_argument("files", nargs="*"); ap.add_argument("--out", default=str(HERE / "run_latest.json")); ap.add_argument("--set", default="en", choices=["en", "hi"])
    a = ap.parse_args()
    if a.cmd == "check": check()
    elif a.cmd == "run": run(a.out, kind=a.set)
    else: compare(*a.files[:2])
