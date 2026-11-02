"""Evaluation harness + rule baseline for the transaction categoriser (ROADMAP I1). See SPEC.md.
    rag-engine/.venv/bin/python sml/categoriser/harness.py --rows rows.jsonl [--json out.json] [--predictions preds.jsonl]
The baseline is the app's own `FinosBudget.canonicalCategory` (js/finos-budget.js), run through node, so the number is what users get today.
A future model plugs in through --predictions (one {"category": ...} per input row, same order)."""
from __future__ import annotations
import argparse, json, random, re, subprocess, sys
from collections import Counter, defaultdict
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
CATEGORIES = ["Food & Dining", "Groceries", "Transport", "Shopping", "Bills & Utilities", "Housing", "EMI & Loans", "Subscriptions", "Health", "Entertainment", "Education", "Travel", "Other"]
BUCKETS = {"<100", "100-500", "500-2000", "2000-10000", "10000+"}
PRIVACY = [(re.compile(r"\d{10,}"), "10+ digit run"), (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "e-mail"), (re.compile(r"[\w.\-]{2,}@[a-z]{2,}\b", re.I), "UPI handle"),
           (re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"), "PAN"), (re.compile(r"\b\d{4}\s\d{4}\s\d{4}\b"), "Aadhaar-like group"), (re.compile(r"[^\x00-\x7f]*[٠-٩०-९][^\x00-\x7f]*"), "non-ASCII digit"),
           (re.compile(r"(?:\d[\s\-]?){12,}"), "spaced digit run")]


def load_rows(path):
    rows, errs = [], []
    for i, l in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if not l.strip(): continue
        try: r = json.loads(l)
        except Exception: errs.append((i, "not JSON")); continue
        if r.get("category") not in CATEGORIES: errs.append((i, f"unknown category {r.get('category')!r}")); continue
        if r.get("amount_bucket") not in BUCKETS: errs.append((i, f"bad amount_bucket {r.get('amount_bucket')!r}")); continue
        if r.get("direction") not in ("debit", "credit"): errs.append((i, "bad direction")); continue
        d = str(r.get("description", ""))
        hit = next((name for rx, name in PRIVACY if rx.search(d)), None)
        if hit: errs.append((i, f"description looks personal ({hit}): row rejected")); continue
        rows.append(r)
    return rows, errs


def baseline(descriptions):
    """FinosBudget.canonicalCategory for each description, via node (one process for all rows)."""
    js = "const B=require(process.argv[1]);const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(d.map(x=>B.canonicalCategory(x))));"
    out = subprocess.run(["node", "-e", js, str(ROOT / "js" / "finos-budget.js")], input=json.dumps(descriptions), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def boot(pairs, key, n=1000, seed=0):
    rnd = random.Random(seed); vals = []
    for _ in range(n):
        s = [pairs[rnd.randrange(len(pairs))] for _ in pairs]; vals.append(key(s))
    vals.sort(); return [round(vals[int(0.025 * n)], 4), round(vals[int(0.975 * n) - 1], 4)]


def evaluate(rows, preds):
    gold = [r["category"] for r in rows]; n = len(rows)
    covered = [i for i, p in enumerate(preds) if p != "Other"]
    acc_all = sum(g == p for g, p in zip(gold, preds)) / n
    acc_cov = (sum(gold[i] == preds[i] for i in covered) / len(covered)) if covered else float("nan")
    per = {}
    for c in CATEGORIES:
        tp = sum(g == c and p == c for g, p in zip(gold, preds)); fp = sum(g != c and p == c for g, p in zip(gold, preds)); fn = sum(g == c and p != c for g, p in zip(gold, preds))
        per[c] = {"support": tp + fn, "precision": round(tp / max(1, tp + fp), 3), "recall": round(tp / max(1, tp + fn), 3), "f1": round(2 * tp / max(1, 2 * tp + fp + fn), 3)}
    pairs = list(zip(gold, preds))
    conf = Counter((g, p) for g, p in pairs if g != p).most_common(10)
    by_src = defaultdict(list)
    for r, p in zip(rows, preds): by_src[r.get("source", "?")].append(r["category"] == p)
    return {"n": n, "coverage": round(len(covered) / n, 4), "accuracy_all_rows": round(acc_all, 4), "accuracy_all_ci95": boot(pairs, lambda s: sum(a == b for a, b in s) / len(s)),
            "accuracy_on_covered_rows": None if not covered else round(acc_cov, 4), "other_predicted": n - len(covered), "true_other": sum(g == "Other" for g in gold),
            "per_category": per, "top_confusions": [{"gold": a, "pred": b, "n": k} for (a, b), k in conf], "by_source": {k: [len(v), round(sum(v) / len(v), 3)] for k, v in by_src.items()},
            "gate_C": {"rows_needed": 300, "rows": n, "accuracy_target": 0.90, "coverage_target": 0.85,
                       "met": bool(covered and n >= 300 and acc_cov >= 0.90 and len(covered) / n >= 0.85)}}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--rows", required=True); ap.add_argument("--json"); ap.add_argument("--predictions")
    a = ap.parse_args()
    rows, errs = load_rows(a.rows)
    for i, e in errs: print(f"  line {i}: {e}", file=sys.stderr)
    if not rows: sys.exit("no usable rows")
    synthetic = any(str(r.get("source", "")).startswith("synthetic") for r in rows)
    preds = ([json.loads(l)["category"] for l in Path(a.predictions).read_text().splitlines() if l.strip()] if a.predictions else baseline([r["description"] for r in rows]))
    if len(preds) != len(rows): sys.exit("predictions and rows differ in length")
    res = evaluate(rows, preds); res["system"] = "predictions file" if a.predictions else "rules (FinosBudget.canonicalCategory)"; res["rejected_rows"] = len(errs)
    if synthetic: res["WARNING"] = "SYNTHETIC rows: plumbing check only, these numbers must not be quoted as performance"
    print(json.dumps({k: res[k] for k in res if k not in ("per_category",)}, indent=1, ensure_ascii=False))
    if a.json: Path(a.json).write_text(json.dumps(res, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
