"""Validate a categoriser contributor file BEFORE it is used (F1 / TRACKER LT4). Strict on purpose: one personal-looking row rejects that row, and the report says why.
    rag-engine/.venv/bin/python sml/tools/categoriser/validate_rows.py rows_from_priya.jsonl [more.jsonl ...] [--write-clean clean.jsonl]
A row is {"description","amount_bucket","direction","channel","category","source"} (sml/categoriser/SPEC.md) and NOTHING else (no date, id, exact amount or account field).
Rejected: phone numbers (also +91, spaced or dashed), e-mail addresses, UPI handles, PAN, Aadhaar-like groups, any run of 5+ digits (account, card, order, reference numbers), alphanumeric order / reference ids
(ORD123, OD1234...), dates in any common form (2026-10-05, 05/10/2026, 5 Oct 2026, Oct 5), non-ASCII digits, extra fields, unknown category / bucket / direction / channel, empty or over-long descriptions, duplicates.
Prints: accepted and rejected counts per file, every rejection with line number and reason (never the offending text), per-category and per-person counts toward the 1,000-row target, and exits 1 if anything was rejected.
Nothing is sent anywhere; the script only reads the files you give it."""
from __future__ import annotations
import argparse, json, re, sys
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "sml" / "categoriser"))
from harness import CATEGORIES, BUCKETS  # noqa: E402

FIELDS = {"description", "amount_bucket", "direction", "channel", "category", "source"}
CHANNELS = {"upi", "card", "netbanking", "cash", "other"}
MONTHS = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
CHECKS = [
    ("e-mail address", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")),
    ("UPI handle", re.compile(r"[\w.\-]{2,}@[a-z]{2,}\b", re.I)),
    ("PAN", re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b", re.I)),
    ("Aadhaar-like number", re.compile(r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b")),
    ("phone number", re.compile(r"(?:\+?91[\s\-]?)?[6-9]\d{4}[\s\-]?\d{5}\b")),
    ("long digit run (5+)", re.compile(r"\d{5,}")),
    ("spaced / dashed digit run (8+ digits)", re.compile(r"(?:\d[\s\-./]?){8,}")),
    ("non-ASCII digit", re.compile(r"[٠-٩०-९০-৯]")),
    ("date", re.compile(rf"\b\d{{4}}[-/.]\d{{1,2}}[-/.]\d{{1,2}}\b|\b\d{{1,2}}[-/.]\d{{1,2}}[-/.]\d{{2,4}}\b|\b\d{{1,2}}(?:st|nd|rd|th)?[\s\-]+{MONTHS}\b[\s,\-]*\d{{0,4}}|\b{MONTHS}[\s\-]+\d{{1,2}}(?:st|nd|rd|th)?\b", re.I)),
    ("order / reference id", re.compile(r"\b(?:ord|order|od|ref|txn|utr|rrn|inv|bill|id|no)[\s#:.\-]*[A-Z]*\d{3,}\b|\b[A-Z]{1,4}\d{6,}[A-Z0-9]*\b|#\s?\d{3,}", re.I)),
]


def check_row(r):
    """List of reasons this row is rejected (empty = accepted)."""
    why = []
    if not isinstance(r, dict): return ["not a JSON object"]
    extra = sorted(set(r) - FIELDS)
    if extra: why.append("extra field(s): " + ", ".join(extra))
    missing = sorted(FIELDS - set(r))
    if missing: why.append("missing field(s): " + ", ".join(missing))
    if missing: return why
    d = r["description"]
    if not isinstance(d, str) or not d.strip(): why.append("empty description")
    elif len(d) > 80: why.append("description longer than 80 characters")
    else:
        for name, rx in CHECKS:
            if rx.search(d): why.append(f"description contains a {name}")
    if r["category"] not in CATEGORIES: why.append("category is not one of the 13")
    if r["amount_bucket"] not in BUCKETS: why.append("amount_bucket is not one of <100, 100-500, 500-2000, 2000-10000, 10000+")
    if r["direction"] not in ("debit", "credit"): why.append("direction is not debit or credit")
    if r["channel"] not in CHANNELS: why.append("channel is not upi, card, netbanking, cash or other")
    if not isinstance(r["source"], str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,20}", r["source"]): why.append("source is not a short label (letters, digits, - _)")
    return why


def validate_file(path):
    accepted, rejected, seen = [], [], set()
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    for i, l in enumerate(lines, 1):
        if not l.strip(): continue
        try: r = json.loads(l)
        except Exception: rejected.append((i, ["not valid JSON"])); continue
        why = check_row(r)
        if not why:
            k = (r["description"].strip().lower(), r["amount_bucket"], r["category"])
            if k in seen: why.append("duplicate of an earlier row")
            seen.add(k)
        (rejected if why else accepted).append((i, why) if why else r)
    return accepted, rejected


def main(argv=None):
    ap = argparse.ArgumentParser(); ap.add_argument("files", nargs="+"); ap.add_argument("--write-clean"); ap.add_argument("--target", type=int, default=1000); a = ap.parse_args(argv)
    allacc, bad = [], 0
    for f in a.files:
        acc, rej = validate_file(f); allacc += acc; bad += len(rej)
        print(f"{f}: {len(acc)} accepted, {len(rej)} rejected")
        for i, why in rej: print(f"  line {i}: " + "; ".join(why))
    byc = Counter(r["category"] for r in allacc); byp = Counter(r["source"] for r in allacc)
    print(f"\nTOTAL accepted {len(allacc)} of target {a.target} ({100 * len(allacc) / a.target:.0f}%), people: {len(byp)}" + ("" if len(byp) >= 3 else "  (the plan needs rows from 3-5 other people besides the founder)"))
    print("per category:"); [print(f"  {c:20s} {byc.get(c, 0):4d}") for c in CATEGORIES]
    print("per person:"); [print(f"  {p:20s} {n:4d}") for p, n in byp.most_common()]
    if a.write_clean: Path(a.write_clean).write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in allacc), encoding="utf-8"); print(f"clean rows written to {a.write_clean}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
