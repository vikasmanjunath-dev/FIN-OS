"""Turn the founder's claim labels into the verifier gate set and compare them with the two earlier labellers (D9).
    rag-engine/.venv/bin/python sml/tools/claims/claims_report.py --labels claim_labels.jsonl [--pool sml/verifier/pool_claims.jsonl] [--out-dir sml/verifier]
Reads: the pool (build_pool.py) and the labels file the page downloads ({"claim_id","label"}, label supported | not_supported | unsure).
Writes (verifier format, only decided claims; `unsure` is left out and counted):
  gate_claims_D9.jsonl   raw rows like real_claims_raw.jsonl (qid, question, evidence, claim, answer_index) + claim_id, pool
  gate_labels_D9.jsonl   {"idx", "label"} aligned with gate_claims_D9.jsonl, label supported | unsupported ("unsupported" = not supported: contradicted or not stated)
  gate_summary_D9.json   counts, progress toward the gate (>= 300 decided, >= 100 not supported), kappa vs the two earlier labellers on the claims they all labelled
Kappa is binary (supported vs not supported): the earlier labels `contradicted` and `unsupported` both collapse to not supported. Nothing here changes a label or invents one."""
from __future__ import annotations
import argparse, json
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
V = ROOT / "sml" / "verifier"


def load(path):
    return [json.loads(l) for l in Path(path).read_text(encoding="utf-8").splitlines() if l.strip()]


def earlier_labels(vdir=V):
    def collapse(*names):
        d = {}
        for n in names:
            for r in load(vdir / n): d[r["idx"]] = "supported" if r["label"] == "supported" else "not_supported"
        return d
    return collapse("labels_A1.jsonl", "labels_A2.jsonl"), collapse("labels_B1.jsonl", "labels_B2.jsonl")


def kappa(a, b):
    n = len(a)
    if n == 0: return None
    po = sum(x == y for x, y in zip(a, b)) / n; ca, cb = Counter(a), Counter(b)
    pe = sum(ca[c] * cb[c] for c in set(a) | set(b)) / (n * n)
    return 1.0 if pe == 1 else round((po - pe) / (1 - pe), 4)


def build(pool, labels, A=None, B=None):
    by = {r["claim_id"]: r for r in pool}
    bad = sorted(k for k in labels if k not in by)
    decided = [(by[k], v) for k, v in labels.items() if k in by and v in ("supported", "not_supported")]
    decided.sort(key=lambda x: x[0]["claim_id"])
    out = {"labelled_total": len(labels), "unsure": sum(1 for v in labels.values() if v == "unsure"), "unknown_claim_ids": bad, "decided": len(decided),
           "supported": sum(1 for _, v in decided if v == "supported"), "not_supported": sum(1 for _, v in decided if v == "not_supported")}
    out["gate"] = {"decided_target": 300, "not_supported_target": 100, "met": out["decided"] >= 300 and out["not_supported"] >= 100}
    out["by_pool"] = {p: sum(1 for r, _ in decided if r["pool"] == p) for p in ("existing", "new")}
    if A is not None and B is not None:
        both = [(r, v) for r, v in decided if r["pool"] == "existing" and r.get("existing_idx") in A and r.get("existing_idx") in B]
        f = [v for _, v in both]; a = [A[r["existing_idx"]] for r, _ in both]; b = [B[r["existing_idx"]] for r, _ in both]
        agreed = [(x, y, z) for x, y, z in zip(f, a, b) if y == z]
        out["kappa_vs_earlier_labellers_binary"] = {"claims_compared": len(both), "founder_vs_A": kappa(f, a), "founder_vs_B": kappa(f, b), "A_vs_B": kappa(a, b),
                                                    "founder_vs_agreed_A_and_B": kappa([x for x, _, _ in agreed], [y for _, y, _ in agreed]), "n_agreed_A_B": len(agreed),
                                                    "founder_agrees_with_A": sum(x == y for x, y in zip(f, a)), "founder_agrees_with_B": sum(x == y for x, y in zip(f, b))}
    return decided, out


def write(decided, out, out_dir):
    out_dir = Path(out_dir); claims, labs = [], []
    for i, (r, v) in enumerate(decided):
        claims.append({k: r.get(k) for k in ("qid", "question", "evidence", "claim", "answer_index", "claim_id", "pool")})
        labs.append({"idx": i, "label": "supported" if v == "supported" else "unsupported"})
    (out_dir / "gate_claims_D9.jsonl").write_text("".join(json.dumps(c, ensure_ascii=False) + "\n" for c in claims), encoding="utf-8")
    (out_dir / "gate_labels_D9.jsonl").write_text("".join(json.dumps(l) + "\n" for l in labs), encoding="utf-8")
    (out_dir / "gate_summary_D9.json").write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--labels", required=True); ap.add_argument("--pool", default=str(V / "pool_claims.jsonl")); ap.add_argument("--out-dir", default=str(V)); a = ap.parse_args()
    labs = {}
    for r in load(a.labels):
        if r.get("label") in ("supported", "not_supported", "unsure"): labs[r["claim_id"]] = r["label"]
    A, B = earlier_labels()
    decided, out = build(load(a.pool), labs, A, B); write(decided, out, a.out_dir)
    print(json.dumps(out, indent=1))
