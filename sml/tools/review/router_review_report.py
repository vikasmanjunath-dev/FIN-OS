"""Agreement, disagreements and proposed label changes for the blind router review (K2/F4, TRACKER LT2).
    report : rag-engine/.venv/bin/python sml/tools/review/router_review_report.py report --key router_candidates_key.jsonl --labels reviewer.jsonl [--labels2 second.jsonl] [--out-dir DIR]
    resolve: rag-engine/.venv/bin/python sml/tools/review/router_review_report.py resolve --key router_candidates_key.jsonl --resolutions resolutions.jsonl
Report: Cohen's kappa and raw agreement of the reviewer against the CURRENT labels (all rows, controls only, boundary rows only), of two reviewers against each other when both files are given,
the disagreements (text, set, current label, reviewer label(s), the routers' guesses) in `router_review_disagreements.jsonl` for the founder to resolve; `unsure` is excluded from kappa and counted.
Resolve: the founder writes {"item_id", "final_label"} lines (final_label one of the 13 intents). The result goes to a SEPARATE file `sml/data/proposed/label_changes_proposed.jsonl`
({set, row_index, text, old_label, new_label}) and NOTHING in sml/data/*.jsonl is ever opened for writing: applying a change would invalidate every score reported on that set and is a
founder decision recorded in the TRACKER first."""
from __future__ import annotations
import argparse, json, sys
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]; D = ROOT / "sml" / "data"
sys.path.insert(0, str(D))
from router_data import INTENTS  # noqa: E402


def load(p): return [json.loads(l) for l in Path(p).read_text(encoding="utf-8").splitlines() if l.strip()]


def kappa(a, b):
    n = len(a)
    if n == 0: return None
    po = sum(x == y for x, y in zip(a, b)) / n; ca, cb = Counter(a), Counter(b); pe = sum(ca[c] * cb[c] for c in set(a) | set(b)) / (n * n)
    return 1.0 if pe == 1 else round((po - pe) / (1 - pe), 4)


def read_labels(path):
    out = {}
    for r in load(path):
        if r.get("label") in INTENTS + ["unsure"]: out[r["item_id"]] = r["label"]
    return out


def report(key, labels, labels2=None, texts=None):
    k = {r["item_id"]: r for r in key}
    res = {"items_in_key": len(k), "labelled": len(labels), "unsure": sum(1 for v in labels.values() if v == "unsure"), "unknown_item_ids": sorted(i for i in labels if i not in k)}
    dec = [(i, v) for i, v in labels.items() if i in k and v != "unsure"]
    def sub(f): 
        xs = [(i, v) for i, v in dec if f(k[i])]
        return {"n": len(xs), "agreement": round(sum(v == k[i]["current_label"] for i, v in xs) / len(xs), 4) if xs else None, "kappa": kappa([v for _, v in xs], [k[i]["current_label"] for i, _ in xs])}
    res["vs_current_labels"] = {"all": sub(lambda r: True), "controls_only": sub(lambda r: r["reason"] == "control"), "boundary_only": sub(lambda r: r["reason"] != "control")}
    if labels2 is not None:
        both = [i for i in labels if i in labels2 and i in k and labels[i] != "unsure" and labels2[i] != "unsure"]
        res["reviewer_vs_reviewer"] = {"n": len(both), "agreement": round(sum(labels[i] == labels2[i] for i in both) / len(both), 4) if both else None, "kappa": kappa([labels[i] for i in both], [labels2[i] for i in both])}
    dis = []
    for i, v in labels.items():
        if i not in k: continue
        r = k[i]; others = [labels2[i]] if labels2 and i in labels2 else []
        if v == "unsure" or v != r["current_label"] or any(o != r["current_label"] for o in others):
            dis.append({"item_id": i, "set": r["set"], "row_index": r["row_index"], "text": (texts or {}).get(i, ""), "current_label": r["current_label"], "reviewer": v, "reviewer2": others[0] if others else None,
                        "router_0_4_1": r["router_0_4_1"], "router_0_5_1": r["router_0_5_1"], "reason": r["reason"]})
    res["disagreements"] = len(dis); res["top_confusions"] = [{"current": a, "reviewer": b, "n": n} for (a, b), n in Counter((d["current_label"], d["reviewer"]) for d in dis if d["reviewer"] != "unsure").most_common(10)]
    return res, dis


def resolve(key, resolutions, texts=None):
    k = {r["item_id"]: r for r in key}; changes, skipped = [], []
    for r in resolutions:
        i, fl = r.get("item_id"), r.get("final_label")
        if i not in k or fl not in INTENTS: skipped.append(i); continue
        if fl != k[i]["current_label"]:
            changes.append({"set": k[i]["set"], "row_index": k[i]["row_index"], "text": (texts or {}).get(i, ""), "old_label": k[i]["current_label"], "new_label": fl})
    return changes, skipped


def source_texts(key):
    cache, out = {}, {}
    for r in key:
        if r["set"] not in cache: cache[r["set"]] = [json.loads(l) for l in (D / f"{r['set']}.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
        out[r["item_id"]] = cache[r["set"]][r["row_index"]]["text"]
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); sp = ap.add_subparsers(dest="cmd", required=True)
    a1 = sp.add_parser("report"); a1.add_argument("--key", required=True); a1.add_argument("--labels", required=True); a1.add_argument("--labels2"); a1.add_argument("--out-dir", default=".")
    a2 = sp.add_parser("resolve"); a2.add_argument("--key", required=True); a2.add_argument("--resolutions", required=True)
    a = ap.parse_args(); key = load(a.key); texts = source_texts(key)
    if a.cmd == "report":
        res, dis = report(key, read_labels(a.labels), read_labels(a.labels2) if a.labels2 else None, texts)
        Path(a.out_dir, "router_review_disagreements.jsonl").write_text("".join(json.dumps(d, ensure_ascii=False) + "\n" for d in dis), encoding="utf-8"); print(json.dumps(res, indent=1))
    else:
        ch, sk = resolve(key, load(a.resolutions), texts); out = D / "proposed"; out.mkdir(exist_ok=True)
        (out / "label_changes_proposed.jsonl").write_text("".join(json.dumps(c, ensure_ascii=False) + "\n" for c in ch), encoding="utf-8")
        print(f"{len(ch)} proposed label changes written to {out / 'label_changes_proposed.jsonl'} (no dataset file was touched); skipped {len([s for s in sk if s])} invalid resolutions")
