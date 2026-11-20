#!/usr/bin/env python3
"""Choose the action-ladder thresholds for router 0.5.1 (ROADMAP E7/E9, founder decision F3: note false alarm <= 5%, block false alarm <= 2%).

RULE, FIXED BEFORE ANY NUMBER WAS LOOKED AT (written 2026-11-08):
  * ladder action fires only when the router's PREDICTED intent is advice_seeking or evasion_request (the advisory of E8 already works this way: a
    high risk mass behind some other predicted class does not trigger anything)
  * mass = P(advice_seeking) + P(evasion_request); a "note" needs mass >= t_note, a "block" needs predicted evasion_request and mass >= t_block
  * thresholds are chosen on dev + dev3 (805 rows) with an HONEST head: the 0.5.1 settings (C, blend weight) fitted on train + train_extra + train_extra2
    + valid only, so the dev rows were never seen by the model that scores them (the shipped 0.5.1 was refit on dev, which would flatter the rates)
  * t_note = the smallest threshold on a 0.01 grid whose dev false alarm (benign rows with an action) is <= 5%
  * t_block = the smallest threshold >= t_note whose dev block false alarm (benign rows that would be blocked) is <= 2% AND whose dev block precision
    (blocked rows that really are evasion requests) is >= 0.95 (a refusal is harsher than a note, so it must also be precise)
  * held-out sets (test_v7 diagnostic, test_v8 scored once for the older guard rule) are only REPORTED with the chosen thresholds, never used to choose;
    the ladder stays a CANDIDATE until a new sealed set (test_v9) confirms it
Run:  rag-engine/.venv/bin/python sml/training/choose_ladder.py 0.5.1 [--write]
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
import numpy as np
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import train_router as T          # noqa: E402  (loaders, embedding cache; adds sml/data and rag-engine to sys.path)
sys.path.insert(0, str(HERE.parents[0] / "runtime"))

HI = {"advice_seeking", "evasion_request"}
TARGETS = {"note_false_alarm": 0.05, "block_false_alarm": 0.02, "block_precision": 0.95}
GRID = [round(x, 2) for x in np.arange(0.05, 0.96, 0.01)]


def stats(intent, mass, truth, t_note, t_block):
    """rows = predicted intents, high-risk masses, true intents; returns the false alarm / recall numbers at one threshold pair"""
    intent = np.asarray(intent); mass = np.asarray(mass); truth = np.asarray(truth)
    risky = np.array([y in HI for y in truth]); benign = ~risky
    pred_hi = np.array([p in HI for p in intent])
    note = pred_hi & (mass >= t_note)
    block = (intent == "evasion_request") & (mass >= t_block)
    nb = max(1, int(benign.sum())); nr = max(1, int(risky.sum())); ne = max(1, int((truth == "evasion_request").sum()))
    return {"n": int(len(truth)), "n_benign": int(benign.sum()), "n_risky": int(risky.sum()),
            "note_false_alarm": round(float((note & benign).sum() / nb), 4),
            "note_recall": round(float((note & risky).sum() / nr), 4),
            "block_false_alarm": round(float((block & benign).sum() / nb), 4),
            "block_precision": round(float((block & (truth == "evasion_request")).sum() / max(1, int(block.sum()))), 4),
            "block_recall_evasion": round(float((block & (truth == "evasion_request")).sum() / ne), 4),
            "blocked": int(block.sum()), "noted": int((note & ~block).sum())}


def choose(intent, mass, truth):
    t_note = next((t for t in GRID if stats(intent, mass, truth, t, 1.01)["note_false_alarm"] <= TARGETS["note_false_alarm"]), None)
    if t_note is None: raise SystemExit("no threshold meets the note false-alarm target on dev")
    def ok(t):
        s = stats(intent, mass, truth, t_note, t)
        return s["block_false_alarm"] <= TARGETS["block_false_alarm"] and s["block_precision"] >= TARGETS["block_precision"]
    t_block = next((t for t in GRID if t >= t_note and ok(t)), None)
    if t_block is None: raise SystemExit("no threshold meets the block targets on dev")
    return t_note, t_block


def honest_dev_probs(ev, cache):
    ld = lambda f: T.load(f)
    train = ld("train.jsonl") + ld("train_extra.jsonl") + ld("train_extra2.jsonl") + ld("valid.jsonl")
    dev = ld("dev.jsonl") + ld("dev3.jsonl")
    Xt, Yt = [r["text"] for r in train], [r["intent"] for r in train]; Xd, Yd = [r["text"] for r in dev], [r["intent"] for r in dev]
    wv = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True); cv = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True, min_df=2)
    Ft = hstack([wv.fit_transform(Xt), cv.fit_transform(Xt)]).tocsr(); Fd = hstack([wv.transform(Xd), cv.transform(Xd)]).tocsr()
    tf = LogisticRegression(C=ev["tfidf_C"], max_iter=4000).fit(Ft, Yt)
    Et = T.norm_rows(T.embed_texts(Xt, cache)); Ed = T.norm_rows(T.embed_texts(Xd, cache))
    em = LogisticRegression(C=ev["embed_C"], max_iter=4000).fit(Et, Yt)
    cls = list(em.classes_); assert cls == list(tf.classes_)
    w = ev["ensemble_embed_weight"]; P = w * em.predict_proba(Ed) + (1 - w) * tf.predict_proba(Fd)
    return np.array([cls[i] for i in P.argmax(1)]), P[:, [cls.index(c) for c in sorted(HI)]].sum(1), np.array(Yd), len(Xt), len(Xd)


def shipped_probs(version, name):
    import router_predict
    rows = T.load(name); intent, mass = [], []
    for r in rows:
        d = router_predict.predict(r["text"], version=version); intent.append(d["intent"]); mass.append(d["high_risk_mass"])
    return np.array(intent), np.array(mass), np.array([r["intent"] for r in rows])


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("version"); ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    mdir = HERE.parents[0] / "models" / "router" / a.version
    ev = json.loads((mdir / "eval.json").read_text())
    intent, mass, truth, ntr, nde = honest_dev_probs(ev, HERE / ".embed_cache.npz")
    t_note, t_block = choose(intent, mass, truth)
    dev = stats(intent, mass, truth, t_note, t_block)
    curve = [{"t": t, **{k: v for k, v in stats(intent, mass, truth, t, t).items() if k in ("note_false_alarm", "note_recall", "block_false_alarm", "block_precision", "block_recall_evasion")}} for t in (0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9)]
    diag = {}
    for name in ("test_v7.jsonl", "test_v8.jsonl"):
        i2, m2, y2 = shipped_probs(a.version, name); diag[name[:-6]] = stats(i2, m2, y2, t_note, t_block)
    out = {"version": a.version, "targets": TARGETS, "t_note": t_note, "t_block": t_block, "status": "CANDIDATE: confirm on a new sealed set (test_v9) before any default-on",
           "chosen_on": f"dev + dev3 ({nde} rows) with an honest head fitted on {ntr} rows (train + train_extra + train_extra2 + valid), settings of {a.version}",
           "rule": "action only when predicted intent is advice_seeking or evasion_request; note: mass >= t_note; block: predicted evasion_request and mass >= t_block; t_note = smallest threshold with dev false alarm <= 5%; t_block = smallest threshold >= t_note with dev block false alarm <= 2% and block precision >= 0.95",
           "dev": dev, "dev_curve": curve, "diagnostic_shipped_model": diag,
           "diagnostic_note": "test_v7 is diagnostic for 0.5.x; test_v8 was scored once for the older guard rule, so this is a second look with a different rule and is NOT a confirmation"}
    print(json.dumps(out, indent=1))
    if a.write:
        (mdir / "ladder.json").write_text(json.dumps(out, indent=1))
        (HERE.parents[0] / "eval" / f"router_{a.version}_ladder.json").write_text(json.dumps(out, indent=1))
        print("written", mdir / "ladder.json")


if __name__ == "__main__":
    main()
