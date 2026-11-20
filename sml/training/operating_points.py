"""F3 decision table (T3.2): what each router operating point costs in people-facing terms, on a SEALED set (information only; nothing is tuned here).
    rag-engine/.venv/bin/python sml/training/operating_points.py [version] [file] [--risky-share 0.03]
Per threshold: recall (+ Clopper-Pearson 95% lower bound), false-alarm rate (+ upper bound), and per 10,000 live messages (assumed risky share): refusals of harmless
questions, risky messages let through. Needs Ollama (bge-m3) for the embeddings; results written to sml/eval/router_operating_points_<version>.json."""
import json, sys, re
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "runtime")); sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "data"))
from router_predict import predict, DEFAULT_VERSION  # noqa: E402
from router_data import RISK  # noqa: E402
from scipy.stats import beta  # noqa: E402
ROOT = Path(__file__).resolve().parents[1]
THRS = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50, 0.60]

def cp_lo(k, n): return float(beta.ppf(0.05, k, n - k + 1)) if k > 0 else 0.0
def cp_hi(k, n): return float(beta.ppf(0.95, k + 1, n - k)) if k < n else 1.0

def table(rows, risky_share=0.03):
    """rows: [(is_risky, intent_is_risk_class, high_risk_mass)] -> list of dicts, one per threshold"""
    risky = [r for r in rows if r[0]]; benign = [r for r in rows if not r[0]]; out = []
    for t in THRS:
        flag = lambda r: r[1] or r[2] >= t
        k = sum(flag(r) for r in risky); f = sum(flag(r) for r in benign)
        rec, fa = k / len(risky), f / len(benign)
        out.append({"threshold": t, "recall": round(rec, 4), "recall_lo95": round(cp_lo(k, len(risky)), 4), "false_alarm": round(fa, 4), "false_alarm_hi95": round(cp_hi(f, len(benign)), 4),
                    "harmless_refused_per_10k": round(10000 * (1 - risky_share) * fa), "risky_missed_per_10k": round(10000 * risky_share * (1 - rec), 1)})
    return out

def main():
    a = [x for x in sys.argv[1:] if not x.startswith("--")]; version = a[0] if a and re.match(r"\d", a[0]) else DEFAULT_VERSION
    path = Path(next((x for x in a if x.endswith(".jsonl")), ROOT / "data" / "test_v8.jsonl"))
    share = float(sys.argv[sys.argv.index("--risky-share") + 1]) if "--risky-share" in sys.argv else 0.03
    rows = []
    for l in path.read_text().splitlines():
        if not l.strip(): continue
        r = json.loads(l); d = predict(r["text"], version, guard_mass=2.0)      # 2.0 = never flags by mass, so we read the raw intent and mass
        rows.append((r["intent"] in RISK, d["intent"] in RISK, d["high_risk_mass"]))
    res = {"version": version, "file": path.name, "n": len(rows), "risky_share_assumed": share, "table": table(rows, share)}
    out = ROOT / "eval" / f"router_operating_points_{version}.json"; out.write_text(json.dumps(res, indent=1))
    print(f"{path.name}: n={len(rows)}, assumed risky share {share:.0%} of live traffic")
    print("thr   recall (lo95)    false-alarm (hi95)   harmless refused/10k   risky missed/10k")
    for t in res["table"]:
        print(f"{t['threshold']:.2f}  {t['recall']:.3f} ({t['recall_lo95']:.3f})   {t['false_alarm']:.3f} ({t['false_alarm_hi95']:.3f})      {t['harmless_refused_per_10k']:>6}                {t['risky_missed_per_10k']}")

if __name__ == "__main__": main()
