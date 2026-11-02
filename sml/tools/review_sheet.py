"""Label review for the router datasets (ROADMAP K2 / founder decision F4).
    rag-engine/.venv/bin/python sml/tools/review_sheet.py make  --sets test_v8,dev3 --n 200 --seed 1 --out review/
    rag-engine/.venv/bin/python sml/tools/review_sheet.py score --key review/key.csv --sheets review/sheet_alice.csv review/sheet_bob.csv

make:  writes `sheet.csv` (id, text, label, unsure) with NO original label shown, and `key.csv` (id, set, original label). Give each reviewer their own copy of
       sheet.csv, filled in on their own; never show them key.csv. The sample is stratified by original intent and seeded, so it can be re-made.
score: agreement of each reviewer with the original label (rate + Wilson interval), Cohen's kappa between reviewers, per-intent disagreement, and the list of
       rows to adjudicate (any two labels differ, or a reviewer marked it unsure). Adjudicated labels are the founder's call; nothing here edits a dataset.
Valid labels: the 13 intents in sml/docs/LABELLING_GUIDE.md. Datasets are read only."""
from __future__ import annotations
import argparse, csv, json, math, random, sys
from collections import Counter, defaultdict
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]; D = ROOT / "sml" / "data"
sys.path.insert(0, str(D))
from router_data import INTENTS  # noqa: E402


def load_set(name):
    p = D / (name if name.endswith(".jsonl") else f"{name}.jsonl")
    return [json.loads(l) for l in p.read_text().splitlines() if l.strip()]


def make(sets, n, seed, out, langs=None):
    rng = random.Random(seed)
    rows = [dict(r, _set=s) for s in sets for r in load_set(s) if not langs or r.get("lang") in langs]
    by = defaultdict(list)
    for r in rows: by[r["intent"]].append(r)
    per = max(1, n // len(by)); pick = []
    for c in sorted(by):
        xs = by[c][:]; rng.shuffle(xs); pick += xs[:per]
    rng.shuffle(pick)
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    with open(out / "sheet.csv", "w", newline="", encoding="utf-8") as f, open(out / "key.csv", "w", newline="", encoding="utf-8") as g:
        w, k = csv.writer(f), csv.writer(g); w.writerow(["id", "text", "label", "unsure"]); k.writerow(["id", "set", "original_label"])
        for i, r in enumerate(pick, 1):
            w.writerow([i, r["text"], "", ""]); k.writerow([i, r["_set"], r["intent"]])
    return len(pick)


def wilson(k, n, z=1.96):
    if n == 0: return (0.0, 1.0)
    p = k / n; d = 1 + z * z / n; c = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def kappa(a, b):
    n = len(a)
    if n == 0: return float("nan")
    po = sum(x == y for x, y in zip(a, b)) / n; ca, cb = Counter(a), Counter(b)
    pe = sum(ca[c] * cb[c] for c in set(a) | set(b)) / (n * n)
    return 1.0 if pe == 1 else (po - pe) / (1 - pe)


def read_sheet(path):
    out = {}
    for r in csv.DictReader(open(path, encoding="utf-8")):
        lab = (r.get("label") or "").strip()
        if lab and lab not in INTENTS: raise SystemExit(f"{path}: row {r['id']}: '{lab}' is not one of the 13 intents")
        out[int(r["id"])] = (lab, (r.get("unsure") or "").strip().lower() in ("1", "y", "yes", "x", "true"), r["text"])
    return out


def score(key, sheets):
    orig = {int(r["id"]): (r["original_label"], r["set"]) for r in csv.DictReader(open(key, encoding="utf-8"))}
    rev = [read_sheet(s) for s in sheets]
    res = {"n_sampled": len(orig), "reviewers": {}}
    for s, r in zip(sheets, rev):
        done = [i for i, (lab, _, _) in r.items() if lab]
        agree = sum(r[i][0] == orig[i][0] for i in done); lo, hi = wilson(agree, len(done))
        res["reviewers"][Path(s).name] = {"labelled": len(done), "agree_with_original": agree, "rate": round(agree / max(1, len(done)), 4), "wilson95": [round(lo, 4), round(hi, 4)],
                                          "unsure": sum(r[i][1] for i in done)}
    if len(rev) >= 2:
        both = [i for i in rev[0] if rev[0][i][0] and rev[1].get(i, ("",))[0]]
        res["kappa_between_first_two"] = round(kappa([rev[0][i][0] for i in both], [rev[1][i][0] for i in both]), 4); res["n_both_labelled"] = len(both)
    dis = Counter(); adjudicate = []
    for i, (o, st) in orig.items():
        labs = [r[i][0] for r in rev if i in r and r[i][0]]; uns = any(r[i][1] for r in rev if i in r)
        if uns or any(l != o for l in labs) or len(set(labs)) > 1:
            adjudicate.append({"id": i, "set": st, "original": o, "reviewers": labs, "unsure": uns, "text": rev[0][i][2] if i in rev[0] else ""})
            for l in labs:
                if l != o: dis[(o, l)] += 1
    res["top_disagreements"] = [{"original": a, "reviewer": b, "n": n} for (a, b), n in dis.most_common(10)]
    res["to_adjudicate"] = adjudicate
    return res


def main():
    ap = argparse.ArgumentParser(); sp = ap.add_subparsers(dest="cmd", required=True)
    m = sp.add_parser("make"); m.add_argument("--sets", required=True); m.add_argument("--n", type=int, default=200); m.add_argument("--seed", type=int, default=1); m.add_argument("--out", required=True); m.add_argument("--langs", help="comma list of lang codes to keep, e.g. hi,hi_en")
    s = sp.add_parser("score"); s.add_argument("--key", required=True); s.add_argument("--sheets", nargs="+", required=True)
    a = ap.parse_args()
    if a.cmd == "make": print(f"wrote {make(a.sets.split(','), a.n, a.seed, a.out, a.langs.split(',') if a.langs else None)} rows to {a.out}/sheet.csv (+ key.csv: keep it away from the reviewers)")
    else: print(json.dumps(score(a.key, a.sheets), indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
