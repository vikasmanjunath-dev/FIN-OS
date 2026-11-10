"""Score verifier options against the founder's labels and make the gate call. Reads labels only; never writes one.
    python3 sml/verifier/score_gate.py LABELS.jsonl [--pool sml/verifier/pool_claims.jsonl] [--preds NAME=FILE ...]
LABELS.jsonl is the export of sml/tools/claims/label_claims.html: {"claim_id", "label": supported | not_supported | unsure}; unsure rows are left out.
A prediction file (--preds) is either a judge file from llm_judge_real.py ({"idx", "verdict"}, matched to pool rows through existing_idx, so it covers the 241
existing pool rows only) or {"claim_id", "flag": true|false} for any pool row. 'flag' means the verifier says "not supported".
Gate (ROADMAP 3.3, V): precision of "not supported" >= 0.90 AND recall >= 0.80. Exact (Clopper-Pearson) 95% bounds decide, three ways:
  GO            both LOWER bounds clear the gate
  NO-GO         a point estimate or UPPER bound is already below the gate (more labels cannot rescue it)
  NEED MORE     the gate is inside the interval: the data cannot tell yet (sml/verifier/power.py says how many labels that takes)"""
from __future__ import annotations
import argparse, json, sys
from math import comb
from pathlib import Path
HERE = Path(__file__).resolve().parent
P_GATE, R_GATE = 0.90, 0.80


def _tail_ge(m, k, n): return sum(comb(n, i) * m**i * (1 - m)**(n - i) for i in range(k, n + 1))


def bounds(k, n, a=0.05):
    """Exact two-sided 90% / one-sided 95% interval (lower, upper) for k of n."""
    if n == 0: return (0.0, 1.0)
    lo, hi = 0.0, 1.0
    for _ in range(40):                                  # lower: P(X >= k | p) = a
        m = (lo + hi) / 2; lo, hi = (m, hi) if _tail_ge(m, k, n) < a else (lo, m)
    lower = lo if k else 0.0
    lo, hi = 0.0, 1.0
    for _ in range(40):                                  # upper: P(X <= k | p) = a
        m = (lo + hi) / 2; lo, hi = (lo, m) if (1 - _tail_ge(m, k + 1, n)) < a else (m, hi)
    return (round(lower, 4), round(hi if k < n else 1.0, 4))


def load_labels(path):
    out = {}
    for l in Path(path).read_text(encoding="utf-8").splitlines():
        if l.strip():
            r = json.loads(l)
            if r["label"] in ("supported", "not_supported"): out[r["claim_id"]] = r["label"] == "not_supported"
    return out


def load_preds(path, pool):
    by_idx = {r["existing_idx"]: r["claim_id"] for r in pool if r.get("existing_idx") is not None}
    out = {}
    for l in Path(path).read_text(encoding="utf-8").splitlines():
        if not l.strip(): continue
        r = json.loads(l)
        if "claim_id" in r and "flag" in r: out[r["claim_id"]] = bool(r["flag"])
        elif "idx" in r and r["idx"] in by_idx and r.get("verdict") != "error": out[by_idx[r["idx"]]] = r["verdict"] != "supported"
    return out


def score(gold, pred):
    ids = [i for i in gold if i in pred]
    tp = sum(pred[i] and gold[i] for i in ids); fp = sum(pred[i] and not gold[i] for i in ids)
    fn = sum((not pred[i]) and gold[i] for i in ids)
    p_k, p_n, r_k, r_n = tp, tp + fp, tp, tp + fn
    pb, rb = bounds(p_k, p_n), bounds(r_k, r_n)
    p, r = (p_k / p_n if p_n else 0.0), (r_k / r_n if r_n else 0.0)
    if pb[0] >= P_GATE and rb[0] >= R_GATE: call = "GO"
    elif p_n == 0 or r_n == 0 or pb[1] < P_GATE or rb[1] < R_GATE or p < P_GATE - 0.1 or r < R_GATE - 0.2: call = "NO-GO"
    else: call = "NEED MORE"
    return {"n": len(ids), "not_supported_labelled": r_n, "flagged": p_n, "precision": round(p, 3), "precision_ci": pb, "recall": round(r, 3), "recall_ci": rb, "call": call}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("labels"); ap.add_argument("--pool", default=str(HERE / "pool_claims.jsonl"))
    ap.add_argument("--preds", nargs="*", default=[], help="NAME=FILE"); a = ap.parse_args()
    pool = [json.loads(l) for l in Path(a.pool).read_text(encoding="utf-8").splitlines() if l.strip()]
    gold = load_labels(a.labels); neg = sum(gold.values())
    print(f"{len(gold)} labelled (supported/not_supported), {neg} not supported ({neg / max(1, len(gold)):.0%}); {len(pool) - len(gold)} pool rows unlabelled or unsure")
    for spec in a.preds or [f"qwen3:14b decomposition={HERE / 'llm_judge_qwen3_14b_decomp.jsonl'}"]:
        name, f = spec.rsplit("=", 1); s = score(gold, load_preds(f, pool))
        print(f"{s['call']:10} {name}: n={s['n']} P {s['precision']} {s['precision_ci']}  R {s['recall']} {s['recall_ci']}  (not-supported labelled {s['not_supported_labelled']}, flagged {s['flagged']})")
