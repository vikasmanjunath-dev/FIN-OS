"""Re-score mxbai vs bge-m3 on the draft Hindi / Hinglish questions from the REVIEWED verdicts only (TRACKER B23).
    rag-engine/.venv/bin/python sml/eval/golden/rescore_review.py golden_review_verdicts.json [--out FILE]
Only questions the reviewer marked `correct` count as evidence; `wrong_gold` and `bad_question` are excluded (and listed); unmarked questions are not scored. Reads the stored
ranks of both systems (pipeline runs run_mxbai_hi_draft_*.json and run_bge_m3_hi_draft_*.json, dense-only bakeoff_*.json). Ticked "also answers" chunks are reported as an
extra view for bge-m3 only (they exist only for the chunks bge-m3 retrieved), never mixed into the headline."""
from __future__ import annotations
import argparse, glob, json, random
from pathlib import Path
HERE = Path(__file__).resolve().parent


def load_ranks():
    def pipe(pat): f = sorted(glob.glob(str(HERE / pat))); return {x["id"]: x["rank"] for x in json.loads(Path(f[-1]).read_text())["items"]} if f else {}
    ids = [json.loads(l)["id"] for p in sorted(HERE.glob("draft_hi_*.jsonl")) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]
    out = {"pipeline_mxbai": pipe("run_mxbai_hi_draft_*.json"), "pipeline_bge_m3": pipe("run_bge_m3_hi_draft_*.json")}
    bk = sorted(glob.glob(str(HERE / "bakeoff_*.json")))
    if bk:
        res = json.loads(Path(bk[-1]).read_text())["results"]
        for name in ("mxbai_raw", "bge_m3_raw"):
            r = res.get(name, {}).get("hi_draft", {}).get("ranks", [])
            out["dense_" + name] = dict(zip(ids, r))
    return out


def recall(ranks, ids, k=5):
    ids = [i for i in ids if i in ranks]
    return (round(sum(1 for i in ids if ranks[i] and ranks[i] <= k) / len(ids), 4), len(ids)) if ids else (None, 0)


def rescore(verdicts, ranks=None):
    ranks = ranks or load_ranks(); items = verdicts.get("items", {})
    good = sorted(i for i, v in items.items() if v.get("verdict") == "correct")
    res = {"reviewer": verdicts.get("reviewer", ""), "reviewed": len(items), "counted_as_evidence": len(good),
           "excluded": {i: v["verdict"] for i, v in sorted(items.items()) if v.get("verdict") in ("wrong_gold", "bad_question")}, "systems": {}}
    for name, r in ranks.items(): res["systems"][name] = {f"recall@{k}": recall(r, good, k)[0] for k in (1, 3, 5)} | {"n": recall(r, good)[1]}
    for a, b in (("pipeline_mxbai", "pipeline_bge_m3"), ("dense_mxbai_raw", "dense_bge_m3_raw")):
        if a in ranks and b in ranks:
            ids = [i for i in good if i in ranks[a] and i in ranks[b]]
            if ids:
                d = [int(bool(ranks[b][i] and ranks[b][i] <= 5)) - int(bool(ranks[a][i] and ranks[a][i] <= 5)) for i in ids]; rnd = random.Random(0)
                bs = sorted(sum(d[rnd.randrange(len(d))] for _ in d) / len(d) for _ in range(2000))
                res[f"paired_{b}_minus_{a}_recall@5"] = {"diff": round(sum(d) / len(d), 4), "ci95": [round(bs[50], 4), round(bs[1949], 4)], "better": sum(x > 0 for x in d), "worse": sum(x < 0 for x in d), "n": len(ids)}
    also = {i: v.get("also_answers", []) for i, v in items.items() if v.get("verdict") == "correct" and v.get("also_answers")}
    res["bge_m3_pipeline_extra_view_also_answers"] = {"questions_with_ticked_chunks": len(also), "note": "chunks ticked as also answering are not in the headline numbers; they only show how much the anchor rule undercounts bge-m3"}
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("verdicts"); ap.add_argument("--out"); a = ap.parse_args()
    r = rescore(json.loads(Path(a.verdicts).read_text(encoding="utf-8")))
    print(json.dumps(r, indent=1, ensure_ascii=False))
    if a.out: Path(a.out).write_text(json.dumps(r, indent=1, ensure_ascii=False))
