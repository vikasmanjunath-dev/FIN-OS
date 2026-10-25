"""
Co-location check (W2.7): catches a number that appears in the evidence but in a sentence about something else.
For every number in the claim: find the evidence sentences containing it; flag the claim if (a) no sentence has it, or
(b) the best such sentence shares too little of the claim's other content words (overlap < theta).
Pure and deterministic; no model. Evaluated on the REAL labelled claims: rag-engine/.venv/bin/python sml/verifier/colocation.py
"""
import json, re, collections
from pathlib import Path
import experiments as X     # content(), sentences()

HERE = Path(__file__).resolve().parent
NUM = re.compile(r"(?:₹|rs\.?\s*)?\d[\d,]*(?:\.\d+)?\s*(?:%|lakh|lakhs|crore|cr|k|years?|months?|days?)?", re.I)
YEARISH = re.compile(r"^(19|20)\d\d$")


def norm_num(s):
    s = s.lower().replace("₹", "").replace("rs.", "").replace("rs", "").replace(",", "").strip()
    m = re.match(r"(\d+(?:\.\d+)?)\s*(%|lakhs?|crore|cr|k|years?|months?|days?)?", s)
    if not m: return None
    v = float(m.group(1)); u = (m.group(2) or "")
    u = {"lakh": "l", "lakhs": "l", "crore": "c", "cr": "c", "year": "y", "years": "y", "month": "m", "months": "m", "day": "d", "days": "d"}.get(u, u)
    return (round(v, 4), u)


def numbers(text):
    out = []
    for m in NUM.finditer(text):
        n = norm_num(m.group(0))
        if n is None: continue
        raw = m.group(0).strip()
        if YEARISH.match(raw) or (n[0] < 10 and n[1] == "" ) or "[" in text[max(0, m.start() - 1):m.start()]:   # bare small numbers and years carry no checkable meaning
            continue
        out.append((n, raw))
    return out


def check(claim, evidence_text, theta):
    """returns (flag, reason)"""
    cnums = numbers(claim)
    if not cnums: return False, "no checkable number"
    sents = X.sentences(evidence_text) or [evidence_text]
    cwords = set(X.content(claim))
    for n, raw in cnums:
        hit = []
        for s in sents:
            if n in [a for a, _ in numbers(s)] or (n[1] == "" and any(a[0] == n[0] for a, _ in numbers(s))):
                sw = set(X.content(s)); other = {w for w in cwords if not re.fullmatch(r"[\d.,]+", w)}
                hit.append(len(other & sw) / max(1, len(other)))
        if not hit: return True, f"number {raw} not in evidence"
        if max(hit) < theta: return True, f"number {raw} only in unrelated sentence (overlap {max(hit):.2f})"
    return False, "ok"


def main():
    rows = [json.loads(l) for l in open(HERE / "real_claims_raw.jsonl")]
    def lab(*ns):
        d = {}
        for n in ns:
            for l in open(HERE / n): x = json.loads(l); d[x["idx"]] = x["label"]
        return d
    LA, LB = lab("labels_A1.jsonl", "labels_A2.jsonl"), lab("labels_B1.jsonl", "labels_B2.jsonl")
    agree = [i for i in range(len(rows)) if LA[i] == LB[i]]
    ev = [" ".join(e["text"].strip("… ") for e in r["evidence"]) for r in rows]
    gold = lambda i: LA[i] != "supported"
    res = {"n_agreed": len(agree), "n_with_number": sum(1 for i in agree if numbers(rows[i]["claim"])), "sweep": []}
    for theta in (0.0, 0.15, 0.25, 0.35, 0.5):
        flags = {i: check(rows[i]["claim"], ev[i], theta)[0] for i in agree}
        tp = sum(flags[i] and gold(i) for i in agree); fp = sum(flags[i] and not gold(i) for i in agree); fn = sum((not flags[i]) and gold(i) for i in agree); tn = sum((not flags[i]) and not gold(i) for i in agree)
        res["sweep"].append({"theta": theta, "precision": round(tp / max(1, tp + fp), 3), "recall": round(tp / max(1, tp + fn), 3), "false_flag_rate": round(fp / max(1, fp + tn), 3), "tp": tp, "fp": fp, "fn": fn, "tn": tn})
    res["not_supported_with_number_share"] = round(sum(1 for i in agree if gold(i) and numbers(rows[i]["claim"])) / max(1, sum(1 for i in agree if gold(i))), 3)
    (HERE / "colocation_results.json").write_text(json.dumps(res, indent=1)); print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
