"""
C18: is the TF-IDF half of the router good enough to be the browser-side guard? (no embedding model, no Ollama, CPU only, seconds)

The candidate is the TF-IDF head exactly as train_router_v2.py builds it: word 1-2 grams + char_wb 2-5 grams, logistic regression fit on
train + train_extra, C picked on dev by macro-F1. The guard rule is the existing one: regex OR (probability mass on the high-risk classes >= thr),
thr = the HIGHEST grid value whose DEV recall is >= 0.99. Everything is frozen (written to the output file) BEFORE test_v7 is touched; then
test_v7 is scored ONCE. The script refuses to run again if the output already holds a test_v7 result: the sealed set is spent after one look.

  rag-engine/.venv/bin/python sml/training/eval_tfidf_only.py

Gates (ROADMAP 3.3, router): macro-F1 >= 0.95, guard recall >= 0.99, false alarm <= 0.05, all on test_v7.
test_v5 and test_v6 are reported as exploratory only (the 0.4.x family has seen them).
"""
import argparse, json, re, sys
from pathlib import Path
import numpy as np
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import train_router as T                      # noqa: E402  (loaders, regex baseline, metrics)

HI = {"advice_seeking", "evasion_request"}
ap = argparse.ArgumentParser()
ap.add_argument("--with-extra2", action="store_true", help="also train on alt_train_extra2.jsonl (C23: look-alikes, Devanagari/Hinglish benign, indirect advice)")
ap.add_argument("--sealed", default="alt_test_v7.jsonl", help="the sealed set to score ONCE")
ap.add_argument("--out", default="alt_router_0.4.1_tfidf_only.json")
ARGS = ap.parse_args()
OUT = HERE.parent / "eval" / ARGS.out
SEALED = Path(ARGS.sealed).stem.replace("test_", "test_")
LOOKALIKE = re.compile(r"\b(advice|advis|evade|evasion|hide|hidden|black money|penalt|should|best|buy|sell|cheat|fake|forge|forged|launder)", re.I)


def main():
    if OUT.exists() and SEALED in json.loads(OUT.read_text()).get("scored", {}):
        sys.exit(f"{SEALED} is sealed and was already scored once ({OUT}). Not scoring it again.")
    S = {k: T.load(f) for k, f in (("train", "train.jsonl"), ("extra", "train_extra.jsonl"), ("dev", "dev.jsonl"), ("test5", "test_v5.jsonl"),
                                  ("test6", "test_v6.jsonl"))}
    S["train_all"] = S["train"] + S["extra"] + (T.load("alt_train_extra2.jsonl") if ARGS.with_extra2 else [])
    X = {k: [r["text"] for r in v] for k, v in S.items()}; Y = {k: [r["intent"] for r in v] for k, v in S.items()}
    wv = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True); cv = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True, min_df=2)
    feat = lambda ts, fit=False: hstack([(wv.fit_transform if fit else wv.transform)(ts), (cv.fit_transform if fit else cv.transform)(ts)]).tocsr()
    Xtr = feat(X["train_all"], fit=True)
    best = None
    for C in (5, 20, 50, 100):
        m = LogisticRegression(C=C, max_iter=4000).fit(Xtr, Y["train_all"]); f1 = f1_score(Y["dev"], m.predict(feat(X["dev"])), average="macro")
        if best is None or f1 > best[0]: best = (f1, C, m)
    dev_f1, C, model = best
    cls = list(model.classes_); hi_idx = [cls.index(c) for c in HI]

    def stats(texts, ys, thr):
        P = model.predict_proba(feat(texts)); mass = P[:, hi_idx].sum(1)
        regex = np.array([T.rules_predict(t) in HI for t in texts]); truth = np.array([y in HI for y in ys])
        flag = regex | (mass >= thr); flag_regex_only = regex
        pred = [cls[i] for i in P.argmax(1)]
        look = np.array([bool(LOOKALIKE.search(t)) and not h for t, h in zip(texts, truth)])
        return {"n": len(texts), "n_risky": int(truth.sum()), "n_benign": int((~truth).sum()),
                "macro_f1": round(float(f1_score(ys, pred, average="macro")), 4), "accuracy": round(float(np.mean(np.array(pred) == np.array(ys))), 4),
                "guard_recall": round(float((flag & truth).sum() / max(1, truth.sum())), 4), "guard_false_alarm": round(float((flag & ~truth).sum() / max(1, (~truth).sum())), 4),
                "false_alarm_on_risky_word_lookalikes": {"n": int(look.sum()), "rate": round(float((flag & look).sum() / max(1, look.sum())), 4)},
                "regex_only_recall": round(float((flag_regex_only & truth).sum() / max(1, truth.sum())), 4),
                "regex_only_false_alarm": round(float((flag_regex_only & ~truth).sum() / max(1, (~truth).sum())), 4), "_pred": pred}

    grid = [round(x, 2) for x in np.arange(0.05, 0.95, 0.05)]
    dev_rec = {t: stats(X["dev"], Y["dev"], t) for t in grid}
    ok = [t for t in grid if dev_rec[t]["guard_recall"] >= 0.99]
    thr = max(ok) if ok else min(grid, key=lambda t: (-dev_rec[t]["guard_recall"], dev_rec[t]["guard_false_alarm"]))
    strip = lambda d: {k: v for k, v in d.items() if k != "_pred"}
    rep = {"candidate": "router 0.4.1 TF-IDF head alone (word 1-2 + char_wb 2-5, LR)", "tfidf_C": C, "dev_macro_f1": round(float(dev_f1), 4),
           "guard_rule": "regex OR high-risk probability mass >= thr; thr = highest grid value with dev recall >= 0.99", "guard_threshold": thr, "met_dev_recall_99": bool(ok),
           "dev": strip(dev_rec[thr]), "exploratory": {s: strip(stats(X[s], Y[s], thr)) for s in ("test5", "test6")}, "scored": {}}
    OUT.write_text(json.dumps(rep, indent=1, ensure_ascii=False))                       # FROZEN: candidate, C and threshold are on disk before test_v7 is read

    t7 = T.load(ARGS.sealed); X7 = [r["text"] for r in t7]; Y7 = [r["intent"] for r in t7]; L7 = np.array([r.get("lang", "en") for r in t7])
    r7 = stats(X7, Y7, thr); pred = np.array(r7["_pred"]); y = np.array(Y7)
    r7 = strip(r7)
    r7["per_language"] = {l: {"n": int((L7 == l).sum()), "accuracy": round(float((pred[L7 == l] == y[L7 == l]).mean()), 4),
                              "macro_f1": round(float(f1_score(y[L7 == l], pred[L7 == l], average="macro")), 4)} for l in sorted(set(L7))}
    P7 = model.predict_proba(feat(X7)); mass = P7[:, hi_idx].sum(1); regex = np.array([T.rules_predict(t) in HI for t in X7]); flag = regex | (mass >= thr); truth = np.array([v in HI for v in Y7])
    r7["guard_recall_per_language"] = {l: round(float((flag & truth & (L7 == l)).sum() / max(1, (truth & (L7 == l)).sum())), 4) for l in sorted(set(L7))}
    r7["missed_risky"] = [{"text": X7[i], "intent": Y7[i], "predicted": str(pred[i])} for i in np.where(truth & ~flag)[0]][:40]
    r7["gates"] = {"macro_f1_>=_0.95": [r7["macro_f1"], r7["macro_f1"] >= 0.95], "guard_recall_>=_0.99": [r7["guard_recall"], r7["guard_recall"] >= 0.99],
                   "false_alarm_<=_0.05": [r7["guard_false_alarm"], r7["guard_false_alarm"] <= 0.05]}
    r7["verdict"] = "PASS" if all(v[1] for v in r7["gates"].values()) else "FAIL"
    rep["scored"][SEALED] = r7; rep["trained_with_extra2"] = ARGS.with_extra2
    OUT.write_text(json.dumps(rep, indent=1, ensure_ascii=False))
    print(json.dumps({"C": C, "thr": thr, "dev": rep["dev"], "exploratory": rep["exploratory"], SEALED: {k: v for k, v in r7.items() if k != "missed_risky"}}, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
