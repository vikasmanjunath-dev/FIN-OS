"""
Validate + merge independently written router data (sml/data/incoming/*.jsonl) into the dataset.

  dev_agentA.jsonl   -> dev.jsonl        (tune C and the guard threshold HERE)
  test_agentB.jsonl  -> test_v2.jsonl    (final, independent held-out; never tuned on)
  train_agentC.jsonl -> train_extra.jsonl

Rules enforced (a failure is reported, the offending rows are dropped, nothing is silently kept):
  * valid JSON, known intent, non-empty text
  * exact duplicates (case/space-insensitive) removed within and ACROSS every set, with priority
    test_v1 > test_v2 > dev > valid > train  (the more held-out a set, the more it keeps)
  * near-duplicates (character 4-gram Jaccard >= 0.7) between a TRAIN row and any dev/test row are dropped from TRAIN
Run:  rag-engine/.venv/bin/python sml/data/ingest_incoming.py
"""
from __future__ import annotations
import hashlib, json, re
from collections import Counter
from pathlib import Path

D = Path(__file__).resolve().parent
import sys; sys.path.insert(0, str(D))
from router_data import INTENTS, RISK

norm = lambda s: re.sub(r"\s+", " ", s.strip().lower())
def grams(s, n=4):
    s = norm(s); return {s[i:i + n] for i in range(max(1, len(s) - n + 1))}
def jac(a, b): return len(a & b) / max(1, len(a | b))

def load(p):
    rows, bad = [], 0
    if not p.exists(): return rows, -1
    for line in p.read_text().splitlines():
        if not line.strip(): continue
        try:
            r = json.loads(line)
            if r.get("intent") in INTENTS and isinstance(r.get("text"), str) and r["text"].strip():
                rows.append(r)
            else: bad += 1
        except Exception: bad += 1
    return rows, bad

def lang_of(t):
    if re.search(r"[ऀ-ॿ]", t): return "hi"
    return "hi_en" if re.search(r"\b(kya|mera|meri|kitna|kitni|mein|hai|nahi|karo|kaise|kahan|bata|mujhe|mai|maine|ke|ka|ki|hua|chahiye|paisa|kharch)\b", t.lower()) else "en"

def main():
    old_test = [json.loads(l) for l in (D / "natural_test.jsonl").read_text().splitlines() if l.strip()]
    valid = [json.loads(l) for l in (D / "valid.jsonl").read_text().splitlines() if l.strip()]
    train = [json.loads(l) for l in (D / "train.jsonl").read_text().splitlines() if l.strip()]
    inc = {k: load(D / "incoming" / f) for k, f in (("dev", "dev_agentA.jsonl"), ("test", "test_agentB.jsonl"), ("train", "train_agentC.jsonl"),
                                                    ("test3", "test_agentE.jsonl"), ("train_hi", "train_hi_agentD.jsonl"))}
    inc["train"] = (inc["train"][0] + inc["train_hi"][0], inc["train"][1] + max(0, inc["train_hi"][1]))   # Devanagari rows join the training extra
    def merged(files):
        rows, bad = [], 0
        for f in files:
            r, b_ = load(D / "incoming" / f); rows += r; bad += max(0, b_)
        return rows, bad
    # C14 round (Oct 25 2026): test_v4 = agents F,G,H (diagnostic, already looked at once); test_v5 = agents L,M (confirmatory gate set,
    # never looked at before the 0.4.0 training); train agents I,J,K are written to the failure areas seen on test_v4 and join the training extra.
    inc["test4"] = merged([f"test_agent{k}.jsonl" for k in "FGH"]); inc["test5"] = merged([f"test_agent{k}.jsonl" for k in "LM"])
    # C15 (Oct 25 2026): dev2 = agents N,O (more risky + risky-word look-alikes, used to re-choose the guard threshold; joins dev),
    # test6 = agents P,Q (confirmatory). Both give way to every older set in the dedupe priority so earlier sets never change.
    inc["dev2"] = merged([f"dev_agent{k}.jsonl" for k in "NO"]); inc["test6"] = merged([f"test_agent{k}.jsonl" for k in "PQ"])
    # C19 (Oct 26 2026): test_v7 = agents R..W, SEALED (scored once). Gives way to every older set, and additionally drops rows that are near-duplicates of ANY training row
    # (TRACKER H20). It is deliberately NOT added to `heldout` below, so train_extra and every older file stay byte-identical.
    inc["test7"] = merged([f"test_agent{k}.jsonl" for k in "RSTUVW"])
    # C20 (Oct 26 2026): router 0.5.0 TRAIN data, agents X,Y,Z, written AFTER test_v7 was scored. Goes to its own file train_extra2.jsonl (train_extra.jsonl stays byte-identical so 0.4.x
    # stays reproducible) and is filtered against EVERY held-out set including test_v7, by exact and near-duplicate match.
    inc["train2"] = merged([f"train_agent{k}.jsonl" for k in "XYZ"])
    # C20b (Oct 26 2026): dev3 = three more dev writers; kept in its OWN file dev3.jsonl so dev.jsonl stays byte-identical. Used (with dev) to choose the guard
    # threshold and blend weight of router 0.5.0 on enough risky messages. Never a test set.
    inc["dev3"] = merged([f"dev_agent{k}.jsonl" for k in ("a3", "b3", "c3")])
    # C22 (Oct 26 2026): test_v8 = six writers v81..v86, SEALED, the judge of router 0.5.1. Processed last; never feeds back into any other file.
    inc["test8"] = merged([f"test_agent{k}.jsonl" for k in ("v81", "v82", "v83", "v84", "v85", "v86")])
    tr2 = merged([f"train_agent{k}.jsonl" for k in "IJK"]); inc["train"] = (inc["train"][0] + tr2[0], inc["train"][1] + tr2[1])
    report = {"dropped": {}}
    # dev/test rows identical to ANY generated training or validation text are dropped too (found Oct 25 2026 by
    # sml/tests: 9 short messages such as 'hi', 'bye', 'reliance share price' sat in both a held-out and a training set)
    seen = {norm(r["text"]) for r in old_test} | {norm(r["text"]) for r in train} | {norm(r["text"]) for r in valid}
    out = {}
    for key, prio in (("test3", 0), ("test", 1), ("dev", 2), ("test4", 3), ("test5", 4), ("dev2", 5), ("test6", 6)):   # new sets give way to older ones so earlier reported held-out sets never change
        rows, bad = inc[key]
        keep, dup, kept_norm = [], 0, set()
        for r in rows:
            n = norm(r["text"])
            if n in seen or n in kept_norm: dup += 1; continue
            kept_norm.add(n)
            keep.append({"text": r["text"].strip(), "intent": r["intent"], "lang": lang_of(r["text"]), "risk": RISK.get(r["intent"], "low")}); 
        seen |= {norm(k["text"]) for k in keep}
        out[key] = keep; report["dropped"][key] = {"bad_rows": bad, "duplicates": dup, "kept": len(keep)}
    out["dev"] = out["dev"] + out["dev2"]   # dev2 joins dev after dedupe (it already gave way to every test set)
    # cross-set near-dups between dev and test (keep test pure: drop from dev)
    tg = [grams(r["text"]) for r in old_test + out["test"] + out["test3"] + out["test4"] + out["test5"] + out["test6"]]
    before = len(out["dev"])
    out["dev"] = [r for r in out["dev"] if max((jac(grams(r["text"]), g) for g in tg), default=0) < 0.7]
    report["dropped"]["dev_near_dup_of_test"] = before - len(out["dev"])
    # train extra: drop dup + near-dup vs every held-out set
    heldout = old_test + out["test"] + out["test3"] + out["test4"] + out["test5"] + out["test6"] + out["dev"] + valid
    hg = [grams(r["text"]) for r in heldout]
    rows, bad = inc["train"]; keep, dup, near = [], 0, 0
    trseen = {norm(r["text"]) for r in train}
    for r in rows:
        n = norm(r["text"])
        if n in seen or n in trseen: dup += 1; continue
        g = grams(r["text"])
        if max((jac(g, h) for h in hg), default=0) >= 0.7: near += 1; continue
        trseen.add(n); keep.append({"text": r["text"].strip(), "intent": r["intent"], "lang": r.get("lang") or lang_of(r["text"]), "risk": RISK.get(r["intent"], "low"), "template": "agentC"})
    out["train_extra"] = keep; report["dropped"]["train_extra"] = {"bad_rows": bad, "duplicates": dup, "near_duplicates_of_heldout": near, "kept": len(keep)}
    # test_v7 is processed AFTER train_extra and never feeds back into it (train_extra stays byte-identical, and the 0.4.x models were trained on it):
    # a test_v7 row identical to ANY training or earlier-set text, or a near-duplicate of a training row, is dropped from test_v7.
    rows7, bad7 = inc["test7"]
    taken = set(seen) | {norm(r["text"]) for r in keep}
    tr_g = [grams(r["text"]) for r in train + keep]
    kept7, dup7, near7 = [], 0, 0
    for r in rows7:
        n = norm(r["text"])
        if n in taken: dup7 += 1; continue
        if max((jac(grams(r["text"]), g) for g in tr_g), default=0) >= 0.7: near7 += 1; continue
        taken.add(n)
        kept7.append({"text": r["text"].strip(), "intent": r["intent"], "lang": lang_of(r["text"]), "risk": RISK.get(r["intent"], "low")})
    out["test7"] = kept7; report["dropped"]["test7"] = {"bad_rows": bad7, "duplicates_of_any_set_or_train": dup7, "near_duplicates_of_train": near7, "kept": len(kept7)}
    rows2, bad2 = inc["train2"]
    held_all = old_test + out["test"] + out["test3"] + out["test4"] + out["test5"] + out["test6"] + out["test7"] + out["dev"] + valid
    hg2 = [grams(r["text"]) for r in held_all]
    taken2 = {norm(r["text"]) for r in held_all} | {norm(r["text"]) for r in train} | {norm(r["text"]) for r in keep}
    keep2, dup2, near2 = [], 0, 0
    for r in rows2:
        n = norm(r["text"])
        if n in taken2: dup2 += 1; continue
        g = grams(r["text"])
        if max((jac(g, h) for h in hg2), default=0) >= 0.7: near2 += 1; continue
        taken2.add(n)
        keep2.append({"text": r["text"].strip(), "intent": r["intent"], "lang": lang_of(r["text"]), "risk": RISK.get(r["intent"], "low"), "template": "agent2"})
    out["train_extra2"] = keep2; report["dropped"]["train_extra2"] = {"bad_rows": bad2, "duplicates": dup2, "near_duplicates_of_heldout": near2, "kept": len(keep2)}
    rows3, bad3 = inc["dev3"]
    taken3 = taken2 | {norm(r["text"]) for r in keep2} | {norm(r["text"]) for r in out["dev"]}
    tg3 = [grams(r["text"]) for r in train + keep + keep2] + hg2
    keep3, dup3, near3 = [], 0, 0
    for r in rows3:
        n = norm(r["text"])
        if n in taken3: dup3 += 1; continue
        if max((jac(grams(r["text"]), g) for g in tg3), default=0) >= 0.7: near3 += 1; continue
        taken3.add(n)
        keep3.append({"text": r["text"].strip(), "intent": r["intent"], "lang": lang_of(r["text"]), "risk": RISK.get(r["intent"], "low")})
    out["dev3"] = keep3; report["dropped"]["dev3"] = {"bad_rows": bad3, "duplicates": dup3, "near_duplicates_of_train_or_heldout": near3, "kept": len(keep3)}
    rows8, bad8 = inc["test8"]
    taken8 = taken3 | {norm(r["text"]) for r in out["test7"]} | {norm(r["text"]) for r in keep3}
    tg8 = tg3 + [grams(r["text"]) for r in keep3]
    keep8, dup8, near8 = [], 0, 0
    for r in rows8:
        n = norm(r["text"])
        if n in taken8: dup8 += 1; continue
        if max((jac(grams(r["text"]), g) for g in tg8), default=0) >= 0.7: near8 += 1; continue
        taken8.add(n)
        keep8.append({"text": r["text"].strip(), "intent": r["intent"], "lang": lang_of(r["text"]), "risk": RISK.get(r["intent"], "low")})
    out["test8"] = keep8; report["dropped"]["test8"] = {"bad_rows": bad8, "duplicates_of_any_set_or_train": dup8, "near_duplicates_of_train_or_other_sets": near8, "kept": len(keep8)}
    sha = {}
    for name, rows in (("dev.jsonl", out["dev"]), ("test_v2.jsonl", out["test"]), ("test_v3.jsonl", out["test3"]), ("test_v4.jsonl", out["test4"]), ("test_v5.jsonl", out["test5"]), ("test_v6.jsonl", out["test6"]), ("test_v7.jsonl", out["test7"]), ("train_extra2.jsonl", out["train_extra2"]), ("dev3.jsonl", out["dev3"]), ("test_v8.jsonl", out["test8"]), ("train_extra.jsonl", out["train_extra"])):
        p = D / name; p.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n"); sha[name] = hashlib.sha256(p.read_bytes()).hexdigest()
    man = json.loads((D / "MANIFEST.json").read_text())
    man["counts"].update({"dev": len(out["dev"]), "test_v2": len(out["test"]), "test_v3": len(out["test3"]), "test_v4": len(out["test4"]), "test_v5": len(out["test5"]), "test_v6": len(out["test6"]), "test_v7": len(out["test7"]), "train_extra2": len(out["train_extra2"]), "dev3": len(out["dev3"]), "test_v8": len(out["test8"]), "train_extra": len(out["train_extra"])})
    man["sha256"].update(sha); man["incoming_report"] = report
    man["notes_v2"] = "dev/test_v2/train_extra written by three independent agents blind to this repo's data and to each other (Oct 2026); test_v2 is the independent held-out set."
    (D / "MANIFEST.json").write_text(json.dumps(man, indent=1))
    print(json.dumps(report, indent=1))
    for k in ("dev", "test", "test3", "test4", "test5", "test6", "test7", "train_extra"):
        print(k, dict(Counter(r["intent"] for r in out[k])), dict(Counter(r["lang"] for r in out[k])))

if __name__ == "__main__":
    main()
