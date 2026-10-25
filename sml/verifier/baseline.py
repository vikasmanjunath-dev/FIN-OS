"""W2.2 baseline: the engine's CURRENT faithfulness guard (rag-engine/generation/faithfulness.py) on test.jsonl,
plus the numeric detector (numeric_flags_test.json from numeric_baseline.js) and their union.
Same model, same device logic, same (premise=evidence, hypothesis=claim) input, same argmax over logits and
label read from model.config.id2label. Guard rule: sentence is OK only if label == entailment. One process,
batches of 8, model freed at the end."""
import json, sys, os, gc, subprocess, collections
from pathlib import Path
HERE = Path(__file__).parent
ROOT = HERE.parents[1]
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / "rag-engine"))

def run_nli(rows, bs=8):
    import torch
    from generation.faithfulness import _get_model   # read-only import; exact engine loader
    model, _ = _get_model()
    id2label = model.model.config.id2label
    out = []
    for i in range(0, len(rows), bs):
        b = rows[i:i + bs]
        sc = model.predict([(r["evidence"], r["claim"]) for r in b])
        for s in sc:
            k = int(s.argmax()); out.append((id2label[k].lower(), float(s[k])))
    del model; gc.collect()
    try:
        import torch; torch.mps.empty_cache()
    except Exception: pass
    return out

def prf(tp, fp, fn):
    p = tp / (tp + fp) if tp + fp else 0.0; r = tp / (tp + fn) if tp + fn else 0.0
    return p, r, (2 * p * r / (p + r) if p + r else 0.0)

def main():
    rows = [json.loads(l) for l in open(HERE / "test.jsonl")]
    cache = HERE / "nli_preds_test.json"
    if cache.exists(): preds = json.load(open(cache))
    else:
        preds = run_nli(rows); json.dump(preds, open(cache, "w"))
    subprocess.run(["node", str(HERE / "numeric_baseline.js"), "test"], check=True, capture_output=True)
    nflag = json.load(open(HERE / "numeric_flags_test.json"))
    labels = ["entailed", "contradicted", "unsupported"]
    res = {}
    # 1. 3-way mapping of NLI output: entailment->entailed, contradiction->contradicted, neutral->unsupported
    m3 = {"entailment": "entailed", "contradiction": "contradicted", "neutral": "unsupported"}
    cm = {a: collections.Counter() for a in labels}
    for r, (lab, _) in zip(rows, preds): cm[r["label"]][m3[lab]] += 1
    res["confusion_3way(true->pred)"] = {a: dict(cm[a]) for a in labels}
    res["per_class"] = {}
    for c in labels:
        tp = cm[c][c]; fp = sum(cm[a][c] for a in labels if a != c); fn = sum(cm[c][b] for b in labels if b != c)
        p, r, f = prf(tp, fp, fn); res["per_class"][c] = dict(precision=p, recall=r, f1=f, support=sum(cm[c].values()))
    # 2. headline: decision 'not supported' (positive) = true label in {contradicted, unsupported}
    def headline(flag):
        tp = sum(1 for r, f in zip(rows, flag) if f and r["label"] != "entailed")
        fp = sum(1 for r, f in zip(rows, flag) if f and r["label"] == "entailed")
        fn = sum(1 for r, f in zip(rows, flag) if not f and r["label"] != "entailed")
        tn = sum(1 for r, f in zip(rows, flag) if not f and r["label"] == "entailed")
        p, rc, f1 = prf(tp, fp, fn)
        return dict(tp=tp, fp=fp, fn=fn, tn=tn, precision=p, recall=rc, f1=f1, entailed_false_flag_rate=fp / max(1, fp + tn))
    nli_flag = [lab != "entailment" for lab, _ in preds]
    comb = [a or b for a, b in zip(nli_flag, nflag)]
    res["headline_not_supported"] = {"nli_alone": headline(nli_flag), "numeric_alone": headline(nflag), "combined_or": headline(comb)}
    # 3. headline restricted to the 'contradicted' positives only (hardest, the guard's real job) - entailed are negatives
    def sub(flag, keep):
        idx = [i for i, r in enumerate(rows) if keep(r)]
        tp = sum(1 for i in idx if flag[i] and rows[i]["label"] != "entailed"); fn = sum(1 for i in idx if not flag[i] and rows[i]["label"] != "entailed")
        fp = sum(1 for i in idx if flag[i] and rows[i]["label"] == "entailed")
        p, rc, f1 = prf(tp, fp, fn); return dict(precision=p, recall=rc, n_pos=tp + fn)
    res["contradicted_vs_entailed_only"] = {k: sub(f, lambda r: r["label"] != "unsupported") for k, f in (("nli_alone", nli_flag), ("numeric_alone", nflag), ("combined_or", comb))}
    # 4. recall by sub-population
    def rec(flag, keep):
        idx = [i for i, r in enumerate(rows) if keep(r)]; return sum(bool(flag[i]) for i in idx) / max(1, len(idx)), len(idx)
    groups = {"unsupported": lambda r: r["label"] == "unsupported", "contradicted_all": lambda r: r["label"] == "contradicted",
              "contra_number": lambda r: r["change_type"] == "number", "contra_number_percent_or_rupee": lambda r: r["change_type"] == "number" and r["change"].split(":")[0] in ("percent", "rupee"),
              "contra_number_other_kinds": lambda r: r["change_type"] == "number" and r["change"].split(":")[0] not in ("percent", "rupee"),
              "contra_polarity": lambda r: r["change_type"] == "polarity", "contra_negation": lambda r: r["change_type"] == "negation"}
    res["recall_by_group"] = {g: {k: dict(zip(("recall", "n"), rec(f, keep))) for k, f in (("nli", nli_flag), ("numeric", nflag), ("combined", comb))} for g, keep in groups.items()}
    res["nli_label_counts_by_true_class"] = {c: dict(collections.Counter(l for r, (l, _) in zip(rows, preds) if r["label"] == c)) for c in labels}
    (HERE / "baseline_results.json").write_text(json.dumps(res, indent=2))
    print(json.dumps(res, indent=2))

if __name__ == "__main__":
    main()
