"""Stand-alone dense-retrieval comparison of embedding models on the golden set (ROADMAP B20/B21, TRACKER B14). Touches no live index.
    rag-engine/.venv/bin/python sml/eval/golden/embed_bakeoff.py [--cache DIR] [--out FILE]
Embeds every PUBLIC chunk of the local index (finos pages, regulation, news) with each model through Ollama, ranks them by cosine for every question and counts a hit when a
top-k chunk's text contains the item's `gold_anchor`. DENSE ONLY: no BM25, no reranker, so the numbers rank the models, they are not the pipeline's recall.
Setups: mxbai raw (what production does now), mxbai with its documented query prefix, bge-m3 raw, qwen3-embedding with its instruction prefix and raw.
Items: items_*.jsonl (English, 91) and draft_hi_*.jsonl (Hindi / Hinglish, UNREVIEWED agent-written, exploratory)."""
from __future__ import annotations
import argparse, hashlib, json, random, re, sqlite3, sys, time, urllib.request
from pathlib import Path
import numpy as np
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
norm = lambda s: re.sub(r"\s+", " ", s or "").strip().lower()
SETUPS = {
    "mxbai_raw": ("mxbai-embed-large", ""),
    "mxbai_prefix": ("mxbai-embed-large", "Represent this sentence for searching relevant passages: "),
    "bge_m3_raw": ("bge-m3", ""),
    "qwen3_instruct": ("qwen3-embedding:0.6b", "Instruct: Given a question about Indian personal finance, retrieve the passage that answers it\nQuery: "),
    "qwen3_raw": ("qwen3-embedding:0.6b", ""),
}


def embed(model, texts, base="http://127.0.0.1:11434"):
    out = []
    for i in range(0, len(texts), 16):
        req = urllib.request.Request(base + "/api/embed", data=json.dumps({"model": model, "input": texts[i:i + 16]}).encode(), headers={"Content-Type": "application/json"})
        out += json.loads(urllib.request.urlopen(req, timeout=600).read())["embeddings"]
    v = np.asarray(out, dtype=np.float32); return v / np.clip(np.linalg.norm(v, axis=1, keepdims=True), 1e-9, None)


def corpus():
    con = sqlite3.connect(ROOT / "rag-engine" / "rag_bm25.db")
    rows = con.execute("select text,payload_json from chunks_fts where namespace='public'").fetchall()
    return [(json.loads(pj).get("text") or t) for t, pj in rows]


def items(kind):
    pat = "items_*.jsonl" if kind == "en" else "draft_hi_*.jsonl"
    return [json.loads(l) for f in sorted(HERE.glob(pat)) for l in f.read_text(encoding="utf-8").splitlines() if l.strip()]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--cache", default="/tmp/claude-501/bakeoff_cache"); ap.add_argument("--out", default=str(HERE / "bakeoff_2026-10-26.json")); a = ap.parse_args()
    cache = Path(a.cache); cache.mkdir(parents=True, exist_ok=True)
    docs = corpus(); ndoc = [norm(d) for d in docs]; sets = {"en": items("en"), "hi_draft": items("hi")}
    print("chunks", len(docs), {k: len(v) for k, v in sets.items()}, flush=True)
    dvec = {}
    for model in sorted({m for m, _ in SETUPS.values()}):
        f = cache / (model.replace(":", "_") + "_" + hashlib.sha1(("".join(docs[:50])).encode()).hexdigest()[:8] + f"_{len(docs)}.npy")
        if f.exists(): dvec[model] = np.load(f)
        else:
            t = time.time(); dvec[model] = embed(model, docs); np.save(f, dvec[model]); print(model, "embedded chunks in", round(time.time() - t), "s", flush=True)
    res = {}
    for name, (model, prefix) in SETUPS.items():
        res[name] = {}
        for sname, its in sets.items():
            if not its: continue
            qv = embed(model, [prefix + it["question"] for it in its]); sim = qv @ dvec[model].T
            ranks = []
            for it, row in zip(its, sim):
                order = np.argsort(-row)[:20]; anchor = norm(it["gold_anchor"])
                ranks.append(next((r + 1 for r, j in enumerate(order) if anchor in ndoc[j]), None))
            res[name][sname] = {"ranks": ranks, **{f"recall@{k}": round(sum(1 for r in ranks if r and r <= k) / len(ranks), 4) for k in (1, 3, 5, 10)}}
        print(name, {s: {k: v for k, v in r.items() if k != "ranks"} for s, r in res[name].items()}, flush=True)
    comp = {}
    rnd = random.Random(0)
    for name in SETUPS:
        if name == "mxbai_raw": continue
        for sname in sets:
            if sname not in res[name]: continue
            A = [1 if (r and r <= 5) else 0 for r in res["mxbai_raw"][sname]["ranks"]]; B = [1 if (r and r <= 5) else 0 for r in res[name][sname]["ranks"]]
            d = [b - x for x, b in zip(A, B)]; bs = sorted(sum(d[rnd.randrange(len(d))] for _ in d) / len(d) for _ in range(2000))
            comp[f"{name} vs mxbai_raw | {sname} | recall@5"] = {"diff": round(sum(d) / len(d), 4), "ci95": [round(bs[50], 4), round(bs[1949], 4)], "better": sum(1 for x in d if x > 0), "worse": sum(1 for x in d if x < 0), "n": len(d)}
    out = {"chunks": len(docs), "setups": {k: list(v) for k, v in SETUPS.items()}, "results": {n: {s: {k: v for k, v in r.items()} for s, r in d.items()} for n, d in res.items()}, "paired_vs_mxbai_raw": comp}
    Path(a.out).write_text(json.dumps(out, indent=1)); print(json.dumps(comp, indent=1))


if __name__ == "__main__":
    main()
