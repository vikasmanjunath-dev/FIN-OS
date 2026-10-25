"""Score a FROZEN router version on a fresh, never-tuned test set (sml/PLAN.md C10). Nothing is fit or tuned here.
    rag-engine/.venv/bin/python sml/training/eval_fresh.py [version] [file ...]   (version defaults to the predictor's DEFAULT_VERSION)
Default files: sml/data/incoming/test_agent{F,G,H}.jsonl. Rows identical (case/space-insensitive) to ANY existing
train/valid/dev/test text are dropped and counted, so the score cannot be inflated by leakage.
Reports accuracy, macro-F1 with a 1,000x bootstrap 95% CI, per-intent F1, top confusions, per-language accuracy and the
risk guard (recall on advice/evasion, false-alarm rate on the rest) at the version's preset threshold."""
from __future__ import annotations
import json, re, sys, random
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "sml" / "data"
sys.path.insert(0, str(ROOT / "sml" / "runtime")); sys.path.insert(0, str(D))
from router_predict import predict, DEFAULT_VERSION  # noqa: E402
from router_data import INTENTS, RISK  # noqa: E402

norm = lambda s: re.sub(r"\s+", " ", s.strip().lower())
def lang(t):
    if re.search(r"[ऀ-ॿ]", t): return "hi"
    return "hi_en" if re.search(r"\b(kya|mera|meri|kitna|kitni|mein|hai|nahi|karo|kaise|kahan|bata|mujhe|mai|maine|ke|ka|ki|hua|chahiye|paisa|kharch)\b", t.lower()) else "en"

def macro_f1(y, p):
    f = []
    for c in INTENTS:
        tp = sum(a == c and b == c for a, b in zip(y, p)); fp = sum(a != c and b == c for a, b in zip(y, p)); fn = sum(a == c and b != c for a, b in zip(y, p))
        f.append(0.0 if tp == 0 else 2 * tp / (2 * tp + fp + fn))
    return sum(f) / len(f), f

def main():
    args = sys.argv[1:]; version = args[0] if args and re.match(r"\d", args[0]) else DEFAULT_VERSION
    files = [Path(a) for a in args if not re.match(r"\d", a)] or [D / "incoming" / f"test_agent{k}.jsonl" for k in "FGH"]
    existing = set()
    for f in D.glob("*.jsonl"):
        existing |= {norm(json.loads(l)["text"]) for l in f.read_text().splitlines() if l.strip()}
    rows, bad, leak, seen = [], 0, 0, set()
    for f in files:
        for l in f.read_text().splitlines():
            if not l.strip(): continue
            try: r = json.loads(l)
            except Exception: bad += 1; continue
            if r.get("intent") not in INTENTS or not str(r.get("text", "")).strip(): bad += 1; continue
            n = norm(r["text"])
            if n in existing or n in seen: leak += 1; continue
            seen.add(n); rows.append(r)
    preds = [predict(r["text"], version) for r in rows]
    y = [r["intent"] for r in rows]; p = [d["intent"] for d in preds]
    acc = sum(a == b for a, b in zip(y, p)) / len(y); mf, per = macro_f1(y, p)
    rnd = random.Random(0); bs = []
    for _ in range(1000):
        idx = [rnd.randrange(len(y)) for _ in y]; bs.append(macro_f1([y[i] for i in idx], [p[i] for i in idx])[0])
    bs.sort()
    risky = [i for i, r in enumerate(y) if r in RISK]; benign = [i for i in range(len(y)) if y[i] not in RISK]
    rec = sum(preds[i]["needs_guard"] for i in risky) / max(1, len(risky)); fa = sum(preds[i]["needs_guard"] for i in benign) / max(1, len(benign))
    conf = Counter((a, b) for a, b in zip(y, p) if a != b).most_common(10)
    bylang = {}
    for r, a, b in zip(rows, y, p): bylang.setdefault(lang(r["text"]), []).append(a == b)
    out = {"version": version, "n": len(rows), "dropped_bad": bad, "dropped_leak_or_dup": leak, "accuracy": round(acc, 4),
           "macro_f1": round(mf, 4), "macro_f1_ci95": [round(bs[24], 4), round(bs[974], 4)],
           "per_intent_f1": {c: round(f, 3) for c, f in zip(INTENTS, per)},
           "guard": {"risky_n": len(risky), "recall": round(rec, 4), "benign_n": len(benign), "false_alarm": round(fa, 4)},
           "by_lang": {k: [len(v), round(sum(v) / len(v), 3)] for k, v in bylang.items()},
           "top_confusions": [[a, b, n] for (a, b), n in conf],
           "wrong": [{"text": r["text"], "gold": a, "pred": b} for r, a, b in zip(rows, y, p) if a != b]}
    print(json.dumps(out, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
