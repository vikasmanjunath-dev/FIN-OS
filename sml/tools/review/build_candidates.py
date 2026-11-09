"""Candidate messages for the BLIND router label review (K2/F4, TRACKER LT2). Writes two files, never touches a dataset:
    rag-engine/.venv/bin/python sml/tools/review/build_candidates.py [--n 250] [--seed 3] [--out-dir sml/tools/review]
  router_candidates.jsonl       {item_id, text}                          <- what the reviewer sees (no label, no router output)
  router_candidates_key.jsonl   {item_id, set, row_index, current_label, router_0_4_1, router_0_5_1, conf_0_4_1, conf_0_5_1, reason}   <- keep away from the reviewer
Pool: dev, dev3, test_v5..test_v8 (read only). A row is a candidate when a router disagrees with its label, or a router's confidence is under 0.6 (boundary cases);
a seeded sample of 40 rows where both routers agree with the label with confidence >= 0.9 is added as CONTROLS (reason "control") so the reviewer's agreement on easy rows is visible.
Order is shuffled with the seed; the first --n rows are written."""
from __future__ import annotations
import argparse, json, random, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]; D = ROOT / "sml" / "data"
sys.path.insert(0, str(ROOT / "sml" / "runtime"))
SETS = ["dev", "dev3", "test_v5", "test_v6", "test_v7", "test_v8"]


def candidates(rows, preds_a, preds_b, rnd, controls=40, conf_below=0.6):
    """rows: [{set,row_index,text,intent}], preds_*: [(intent, confidence)] aligned with rows. Returns (picked rows with reasons, controls)."""
    picked, easy = [], []
    for r, (ia, ca), (ib, cb) in zip(rows, preds_a, preds_b):
        why = []
        if ia != r["intent"]: why.append("0.4.1 disagrees")
        if ib != r["intent"]: why.append("0.5.1 disagrees")
        if ca < conf_below: why.append("0.4.1 low confidence")
        if cb < conf_below: why.append("0.5.1 low confidence")
        d = dict(r, router_0_4_1=ia, router_0_5_1=ib, conf_0_4_1=round(ca, 3), conf_0_5_1=round(cb, 3))
        if why: picked.append(dict(d, reason="; ".join(why)))
        elif ca >= 0.9 and cb >= 0.9: easy.append(dict(d, reason="control"))
    rnd.shuffle(easy)
    return picked, easy[:controls]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--n", type=int, default=250); ap.add_argument("--seed", type=int, default=3); ap.add_argument("--out-dir", default=str(Path(__file__).resolve().parent)); a = ap.parse_args()
    from router_predict import predict  # noqa: E402  (needs Ollama for the embeddings)
    rows = [dict(json.loads(l), set=s, row_index=i) for s in SETS for i, l in enumerate((D / f"{s}.jsonl").read_text(encoding="utf-8").splitlines()) if l.strip()]
    pa = [(lambda d: (d["intent"], d["confidence"]))(predict(r["text"], "0.4.1")) for r in rows]
    pb = [(lambda d: (d["intent"], d["confidence"]))(predict(r["text"], "0.5.1")) for r in rows]
    rnd = random.Random(a.seed); picked, ctl = candidates(rows, pa, pb, rnd)
    rnd.shuffle(picked); allr = picked[:max(0, a.n - len(ctl))] + ctl; rnd.shuffle(allr)      # all controls are kept, boundary rows fill the rest
    out = Path(a.out_dir); out.mkdir(parents=True, exist_ok=True)
    with open(out / "router_candidates.jsonl", "w", encoding="utf-8") as f, open(out / "router_candidates_key.jsonl", "w", encoding="utf-8") as g:
        for i, r in enumerate(allr, 1):
            iid = f"r{i:04d}"
            f.write(json.dumps({"item_id": iid, "text": r["text"]}, ensure_ascii=False) + "\n")
            g.write(json.dumps({"item_id": iid, "set": r["set"], "row_index": r["row_index"], "current_label": r["intent"], "router_0_4_1": r["router_0_4_1"], "router_0_5_1": r["router_0_5_1"],
                                "conf_0_4_1": r["conf_0_4_1"], "conf_0_5_1": r["conf_0_5_1"], "reason": r["reason"]}, ensure_ascii=False) + "\n")
    print(f"wrote {len(allr)} candidates ({len(picked)} boundary/disputed found in {len(rows)} rows, {sum(1 for r in allr if r['reason'] == 'control')} controls in the file)")


if __name__ == "__main__":
    main()
