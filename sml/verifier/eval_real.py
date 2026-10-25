"""
W2.5: judge the verifier variants on REAL claims (the engine's own answers) with two independent labelers.
    rag-engine/.venv/bin/python sml/verifier/eval_real.py
Inputs : real_claims_raw.jsonl, labels_A1/A2.jsonl (labeler A), labels_B1/B2.jsonl (labeler B)
Output : real_eval_results.json (+ a printed summary). 'Not supported' (the positive class) = contradicted or unsupported.
tau is the value tuned on SYNTHETIC validation data (experiments_results.json); it is NOT re-tuned on real labels here
(too few rows to split honestly); a precision-recall sweep over tau is reported so its transfer can be judged.
"""
import json, collections, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import experiments as X

rows = [json.loads(l) for l in open(HERE / "real_claims_raw.jsonl")]
def labels(*names):
    d = {}
    for n in names:
        for l in open(HERE / n):
            r = json.loads(l); d[r["idx"]] = r["label"]
    return d
LA, LB = labels("labels_A1.jsonl", "labels_A2.jsonl"), labels("labels_B1.jsonl", "labels_B2.jsonl")
assert len(LA) == len(LB) == len(rows) == 241, (len(LA), len(LB), len(rows))
CL = ["supported", "contradicted", "unsupported"]

# ---- agreement
agree = [i for i in range(len(rows)) if LA[i] == LB[i]]
po = len(agree) / len(rows)
pa = collections.Counter(LA.values()); pb = collections.Counter(LB.values())
pe = sum(pa[c] / len(rows) * pb[c] / len(rows) for c in CL)
kappa = (po - pe) / (1 - pe)
bin_agree = sum(1 for i in range(len(rows)) if (LA[i] == "supported") == (LB[i] == "supported")) / len(rows)
out = {"n": len(rows), "agree_3class": round(po, 3), "kappa_3class": round(kappa, 3), "agree_supported_vs_not": round(bin_agree, 3),
       "label_counts_A": dict(pa), "label_counts_B": dict(pb), "agreed_counts": dict(collections.Counter(LA[i] for i in agree))}

# ---- model scores
ev = [" ".join(e["text"].strip("… ") for e in r["evidence"]) for r in rows]
idf = X.build_idf(ev)
results = {}
for variant in ("full", "top1", "top2"):
    pairs = [(X.premise(variant, r["claim"], ev[i], idf), r["claim"]) for i, r in enumerate(rows)]
    order, logits = X.run_nli(pairs)
    probs = [X.softmax(l) for l in logits]
    results[variant] = {"margin": [X.margin(p, order) for p in probs], "argmax_ent": [order[max(range(3), key=lambda k: p[k])] == "entailment" for p in probs]}

def prf(flag, idxs, gold_not_supported):
    tp = sum(1 for i in idxs if flag[i] and gold_not_supported(i)); fp = sum(1 for i in idxs if flag[i] and not gold_not_supported(i))
    fn = sum(1 for i in idxs if not flag[i] and gold_not_supported(i)); tn = sum(1 for i in idxs if not flag[i] and not gold_not_supported(i))
    p = tp / max(1, tp + fp); r = tp / max(1, tp + fn)
    return {"precision": round(p, 3), "recall": round(r, 3), "false_flag_rate_on_supported": round(fp / max(1, fp + tn), 3), "tp": tp, "fp": fp, "fn": fn, "tn": tn}

tau = json.load(open(HERE / "experiments_results.json"))["variants"]["top1"]["tau_val_extractive"]["tau"]
sets = {"agreed": (agree, lambda i: LA[i] != "supported"), "labeler_A": (range(len(rows)), lambda i: LA[i] != "supported"), "labeler_B": (range(len(rows)), lambda i: LB[i] != "supported")}
out["tau_from_synthetic"] = tau; out["base_rate_not_supported_agreed"] = round(sum(1 for i in agree if LA[i] != "supported") / max(1, len(agree)), 3)
out["variants"] = {}
for v, r in results.items():
    rules = {"argmax(entailment)": [not a for a in r["argmax_ent"]], f"margin<tau({tau})": [m < tau for m in r["margin"]]}
    out["variants"][v] = {rule: {s: prf(flag, ids, g) for s, (ids, g) in sets.items()} for rule, flag in rules.items()}
out["tau_sweep_top1_agreed"] = [{"tau": t, **prf([m < t for m in results["top1"]["margin"]], agree, sets["agreed"][1])} for t in (-0.9, -0.7, -0.5, -0.4161, -0.3, -0.1, 0.1)]
# per true class recall of 'flag' (top1 + tau) on the agreed set
flag = [m < tau for m in results["top1"]["margin"]]
out["top1_tau_recall_by_class_agreed"] = {c: round(sum(1 for i in agree if LA[i] == c and flag[i]) / max(1, sum(1 for i in agree if LA[i] == c)), 3) for c in CL}
(HERE / "real_eval_results.json").write_text(json.dumps(out, indent=1))
print(json.dumps({k: out[k] for k in ("n", "agree_3class", "kappa_3class", "agree_supported_vs_not", "agreed_counts", "base_rate_not_supported_agreed")}, indent=1))
for v, d in out["variants"].items():
    for rule, s in d.items(): print(f"{v:5s} {rule:22s} agreed: P {s['agreed']['precision']} R {s['agreed']['recall']} falseflag {s['agreed']['false_flag_rate_on_supported']} | A: P {s['labeler_A']['precision']} R {s['labeler_A']['recall']} | B: P {s['labeler_B']['precision']} R {s['labeler_B']['recall']}")
print("by class (top1+tau):", out["top1_tau_recall_by_class_agreed"])
