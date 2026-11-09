"""Where does the shipped router go wrong, and where can its confidence not be trusted? (ROADMAP C17)
    rag-engine/.venv/bin/python sml/training/error_taxonomy.py [version]
Scores a FROZEN router on every held-out test set (dev is excluded: the shipped model was refit on it). Nothing is fit or tuned here.
Output: sml/eval/router_<ver>_taxonomy.json (per-intent precision/recall, confusion pairs, calibration bins, error rate by language and length,
and the wrong messages grouped by confusion pair, as a writing brief for the next TRAIN data; never as test data)."""
from __future__ import annotations
import json, sys
from collections import Counter, defaultdict
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]; D = ROOT / "sml" / "data"
sys.path.insert(0, str(ROOT / "sml" / "runtime")); sys.path.insert(0, str(D))
from router_predict import predict, DEFAULT_VERSION  # noqa: E402
from router_data import INTENTS  # noqa: E402
version = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_VERSION
SETS = ["natural_test"] + [f"test_v{i}" for i in range(2, 7)]
rows = []
for s in SETS:
    for l in (D / f"{s}.jsonl").read_text().splitlines():
        if l.strip():
            r = json.loads(l); d = predict(r["text"], version)
            rows.append({"set": s, "text": r["text"], "gold": r["intent"], "pred": d["intent"], "conf": d["confidence"], "lang": r.get("lang", "en"),
                         "guard": d["needs_guard"], "risky": r["intent"] in ("advice_seeking", "evasion_request"), "top3": [t[0] for t in d["top3"]]})
n = len(rows); wrong = [r for r in rows if r["gold"] != r["pred"]]
per = {}
for c in INTENTS:
    tp = sum(r["gold"] == c and r["pred"] == c for r in rows); fp = sum(r["gold"] != c and r["pred"] == c for r in rows); fn = sum(r["gold"] == c and r["pred"] != c for r in rows)
    per[c] = {"support": tp + fn, "precision": round(tp / max(1, tp + fp), 3), "recall": round(tp / max(1, tp + fn), 3), "f1": round(2 * tp / max(1, 2 * tp + fp + fn), 3)}
pairs = Counter((r["gold"], r["pred"]) for r in wrong)
bins = [(0, .5), (.5, .7), (.7, .85), (.85, .95), (.95, 1.01)]
cal = []
for lo, hi in bins:
    b = [r for r in rows if lo <= r["conf"] < hi]
    cal.append({"conf_range": [lo, min(hi, 1.0)], "n": len(b), "accuracy": round(sum(r["gold"] == r["pred"] for r in b) / max(1, len(b)), 3), "mean_confidence": round(sum(r["conf"] for r in b) / max(1, len(b)), 3)})
lang = defaultdict(list); length = defaultdict(list)
for r in rows:
    lang[r["lang"]].append(r["gold"] == r["pred"]); length["<=20 chars" if len(r["text"]) <= 20 else "21-50" if len(r["text"]) <= 50 else ">50"].append(r["gold"] == r["pred"])
risky = [r for r in rows if r["risky"]]; missed = [r for r in risky if not r["guard"]]
benign = [r for r in rows if not r["risky"]]; fa = [r for r in benign if r["guard"]]
out = {"version": version, "sets": SETS, "n": n, "accuracy": round(1 - len(wrong) / n, 4), "errors": len(wrong), "per_intent": per,
       "top_confusions": [{"gold": a, "pred": b, "n": k} for (a, b), k in pairs.most_common(15)], "calibration": cal,
       "error_rate_by_language": {k: {"n": len(v), "error_rate": round(1 - sum(v) / len(v), 3)} for k, v in sorted(lang.items())},
       "error_rate_by_length": {k: {"n": len(v), "error_rate": round(1 - sum(v) / len(v), 3)} for k, v in length.items()},
       "gold_in_top3_when_wrong": round(sum(r["gold"] in r["top3"] for r in wrong) / max(1, len(wrong)), 3),
       "guard": {"risky_n": len(risky), "missed": len(missed), "benign_n": len(benign), "false_alarms": len(fa), "false_alarm_rate": round(len(fa) / len(benign), 4),
                 "false_alarm_by_gold_intent": dict(Counter(r["gold"] for r in fa).most_common())},
       "missed_risky": [{"set": r["set"], "text": r["text"], "gold": r["gold"], "pred": r["pred"], "conf": r["conf"]} for r in missed],
       "wrong_by_pair": {f"{a} -> {b}": [{"set": r["set"], "text": r["text"], "conf": r["conf"]} for r in wrong if (r["gold"], r["pred"]) == (a, b)] for (a, b), _ in pairs.most_common(8)}}
(ROOT / "sml" / "eval").mkdir(exist_ok=True)
(ROOT / "sml" / "eval" / f"router_{version}_taxonomy.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
print(json.dumps({k: out[k] for k in ("n", "accuracy", "errors", "top_confusions", "calibration", "error_rate_by_language", "error_rate_by_length", "gold_in_top3_when_wrong", "guard")}, indent=1, ensure_ascii=False)[:5000])
print({c: v["f1"] for c, v in per.items()})
