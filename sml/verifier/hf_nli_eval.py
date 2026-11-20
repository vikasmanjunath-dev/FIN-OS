"""Test a public Hugging Face NLI model as the 'not supported' verifier on the 224 claims with two-labeller agreement (the only real gold we have).
    rag-engine/.venv/bin/python sml/verifier/hf_nli_eval.py MODEL_ID        (plain weights only; never uses trust_remote_code)
Premise = every 2-sentence window of the retrieved evidence; score = max entailment probability over windows (a claim is supported if ONE window entails it).
Threshold chosen on one half of the rows, judged on the other half, and the reverse (2-fold, so no row both tunes and scores). Prints P/R with exact bounds (score_gate)."""
from __future__ import annotations
import importlib.util, json, re, sys
from pathlib import Path
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("sg", HERE / "score_gate.py"); SG = importlib.util.module_from_spec(spec); spec.loader.exec_module(SG)


def labs(*ns):
    d = {}
    for n in ns:
        for l in open(HERE / n): x = json.loads(l); d[x["idx"]] = x["label"]
    return d


def windows(ev):
    out = []
    for e in ev:
        sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", e["text"].strip("… ")) if len(s.strip()) > 15]
        out += [" ".join(sents[i:i + 2]) for i in range(0, max(1, len(sents) - 1))] or [e["text"][:600]]
    return out[:40]


def main(model_id):
    tok = AutoTokenizer.from_pretrained(model_id); m = AutoModelForSequenceClassification.from_pretrained(model_id).eval()
    dev = "mps" if torch.backends.mps.is_available() else "cpu"; m.to(dev)
    lab = {i: l.lower() for i, l in m.config.id2label.items()}; ent = [i for i, l in lab.items() if l.startswith("entail")][0]
    A, B = labs("labels_A1.jsonl", "labels_A2.jsonl"), labs("labels_B1.jsonl", "labels_B2.jsonl")
    pool = [json.loads(l) for l in open(HERE / "pool_claims.jsonl") if l.strip()]
    rows = [r for r in pool if r.get("existing_idx") is not None and A.get(r["existing_idx"]) == B.get(r["existing_idx"])]
    gold, score = {}, {}
    for r in rows:
        ws = windows(r["evidence"]); best = 0.0
        for i in range(0, len(ws), 16):
            enc = tok(ws[i:i + 16], [r["claim"]] * len(ws[i:i + 16]), truncation=True, max_length=384, padding=True, return_tensors="pt").to(dev)
            with torch.no_grad(): best = max(best, torch.softmax(m(**enc).logits, -1)[:, ent].max().item())
        gold[r["claim_id"]] = A[r["existing_idx"]] != "supported"; score[r["claim_id"]] = best
    ids = sorted(gold); folds = [ids[0::2], ids[1::2]]; pred = {}
    for k in (0, 1):
        tune, test = folds[k], folds[1 - k]
        best_t, best_f = 0.5, -1
        for t in [x / 100 for x in range(2, 99, 2)]:                     # pick the threshold with the best F-beta (recall-weighted, beta 1.5) on the tuning half
            tp = sum(score[i] < t and gold[i] for i in tune); fp = sum(score[i] < t and not gold[i] for i in tune); fn = sum(score[i] >= t and gold[i] for i in tune)
            p, r = tp / max(1, tp + fp), tp / max(1, tp + fn); f = (1 + 1.5**2) * p * r / max(1e-9, 1.5**2 * p + r)
            if f > best_f: best_f, best_t = f, t
        for i in test: pred[i] = score[i] < best_t
        print(f"fold {k}: threshold {best_t}", flush=True)
    s = SG.score(gold, pred)
    print(model_id, "->", s["call"], "n", s["n"], "P", s["precision"], s["precision_ci"], "R", s["recall"], s["recall_ci"])
    (HERE / f"hf_nli_{model_id.replace('/', '_')}.json").write_text(json.dumps({"scores": score, "gold": gold, "result": s}))


if __name__ == "__main__": main(sys.argv[1])
