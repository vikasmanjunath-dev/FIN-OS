"""D10 answer-checking slice: do the figures in generated answers agree with sml/rules/figures.json? OFFLINE and REPORT-ONLY.
Nothing here blocks or edits an answer: figures.json is "what the app says", a CA has not confirmed it (ROADMAP D10).
For every claim that mentions a governed topic (80C, 80D, 80CCD(1B), LTCG/STCG on equity, property LTCG, standard deduction, 87A rebate, cess)
and states a rupee amount or a percentage, the stated numbers must include an allowed value for that topic. A claim that does not is a CANDIDATE conflict,
split by where its number came from:
  not_in_evidence  the number is not in the retrieved evidence either: likely invented or borrowed by the model (the failure the numeric check cannot see
                   when the number is elsewhere in the sources)
  in_evidence      the retrieved evidence states that number: the corpus and the table disagree (stale source, different regime or year, or a table error)
    python3 sml/tools/answer_figures_check.py [pool.jsonl ...]       writes sml/eval/answer_figures_report.json
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
UNIT = {"lakh": 1e5, "lac": 1e5, "lakhs": 1e5, "crore": 1e7, "crores": 1e7, "cr": 1e7, "k": 1e3, "thousand": 1e3, "l": 1e5}
MONEY = re.compile(r"(₹|rs\.?|inr|rupees?)?\s*(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|cr|k|thousand|l)?\b", re.I)
PCT = re.compile(r"(\d+(?:\.\d+)?)\s*(?:%|per\s?cent|percent)", re.I)


def numbers(text: str):
    """[(value, 'INR'|'percent', position)]. Bare numbers under 1,000 and years are ignored unless they carry a rupee sign or a lakh/crore/k unit."""
    out = [(float(m.group(1)), "percent", m.start()) for m in PCT.finditer(text)]
    pct_spans = [m.span() for m in PCT.finditer(text)]
    for m in MONEY.finditer(text):
        if any(s <= m.start(2) < e for s, e in pct_spans): continue
        cur, raw, unit = m.group(1), m.group(2).replace(",", ""), (m.group(3) or "").lower()
        try: v = float(raw)
        except ValueError: continue
        if unit: v *= UNIT.get(unit, 1)
        elif not cur and (v < 1000 or 1900 <= v <= 2100): continue
        out.append((v, "INR", m.start(2)))
    return out


# group: (pattern the claim must match, optional second pattern it must also match, unit governed, allowed values)
GROUPS = {
    "80C": (r"\b80\s?C\b(?!\s?CD)", None, "INR", {150000}),
    "80D": (r"\b80\s?D\b", None, "INR", {25000, 50000, 75000, 100000}),           # self 25k / parents 50k and their sums
    "80CCD1B": (r"80\s?CCD\s?\(?1B\)?", None, "INR", {50000}),
    "LTCG_equity_rate": (r"\bLTCG\b|long[- ]term capital gains?", r"equity|shares?|mutual funds?|stocks?", "percent", {12.5}),
    "LTCG_equity_exemption": (r"\bLTCG\b|long[- ]term capital gains?", r"equity|shares?|mutual funds?|stocks?", "INR", {125000}),
    "STCG_equity_rate": (r"\bSTCG\b|short[- ]term capital gains?", r"equity|shares?|mutual funds?|stocks?", "percent", {20}),
    "property_LTCG_rate": (r"\bLTCG\b|long[- ]term capital gains?", r"property|real estate|house|flat|land", "percent", {12.5}),
    "std_deduction": (r"standard deduction", None, "INR", {50000, 75000}),
    "rebate_87A": (r"\b87\s?A\b|rebate|no tax up to|zero tax", r"lakh|income", "INR", {1200000, 1275000}),
    "cess": (r"\bcess\b", None, "percent", {4}),
}


NEAR_BY_GROUP = {"cess": 12}   # cess is almost always written next to other rates ("30% plus surcharge and cess"), so only a number touching the word counts
NEAR = 70   # characters: a number only counts for a topic when it sits this close to the topic's keyword


def check_claim(claim: str, evidence_text: str = ""):
    nums = numbers(claim); ev = {(round(v, 4), u) for v, u, _ in numbers(evidence_text)}
    matched = {}
    for name, (pat, also, unit, allowed) in GROUPS.items():
        ms = [m.start() for m in re.finditer(pat, claim, re.I)]
        if ms and (not also or re.search(also, claim, re.I)): matched[name] = ms
    found = []
    for name, ms in matched.items():
        _, _, unit, allowed = GROUPS[name]
        ok = set(allowed)
        for other in matched:                                   # a claim about 80C plus 80CCD(1B) may state their sum or either figure
            o = GROUPS[other]
            if other != name and o[2] == unit:
                ok |= set(o[3]) | {a + b for a in allowed for b in o[3]}
        stated = sorted({v for v, u, pos in nums if u == unit and any(abs(pos - m) <= NEAR_BY_GROUP.get(name, NEAR) for m in ms)})
        bad = [v for v in stated if v not in ok]
        if stated and bad and not any(v in ok for v in stated):
            found.append({"group": name, "stated": bad, "allowed": sorted(allowed),
                          "where": "in_evidence" if all((round(v, 4), unit) in ev for v in bad) else "not_in_evidence"})
    return found


def run(paths):
    rows = [json.loads(l) for p in paths for l in Path(p).read_text(encoding="utf-8").splitlines() if l.strip()]
    hits = []
    for r in rows:
        ev = " ".join(e["text"] for e in r.get("evidence", []))
        for f in check_claim(r["claim"], ev): hits.append({"claim_id": r.get("claim_id"), "claim": r["claim"], **f})
    return rows, hits


if __name__ == "__main__":
    paths = sys.argv[1:] or [str(ROOT / "sml" / "verifier" / "pool_claims.jsonl")]
    rows, hits = run(paths)
    by = {}
    for h in hits: by[h["where"]] = by.get(h["where"], 0) + 1
    rep = {"claims_scanned": len(rows), "candidate_conflicts": len(hits), "by_where": by, "hits": hits}
    (ROOT / "sml" / "eval" / "answer_figures_report.json").write_text(json.dumps(rep, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{len(rows)} claims scanned, {len(hits)} candidate conflicts {by}")
    for h in hits[:12]: print(f"  [{h['where']}] {h['group']} stated {h['stated']} allowed {h['allowed']}: {h['claim'][:110]}")
