"""C25: feasibility of the embedding head (mxbai-embed-large via Ollama) and the TF-IDF+embedding blend as the router guard. NO sealed set is touched.
Everything (C, blend weight, guard threshold) is chosen on DEV only, by the same rules as train_router_v2.py; then the frozen candidate is reported on dev,
test_v5, test_v6 and the two SPENT sealed sets test_v7 and test_v8 as EXPLORATORY numbers (they were already looked at, so they cannot be a gate). If it looks
promising, a fresh sealed set (test_v9) is the real test.   rag-engine/.venv/bin/python sml/training/eval_embed_head.py [--with-extra2]"""
import argparse, json, sys
from pathlib import Path
import numpy as np
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score
HERE = Path(__file__).resolve().parent; sys.path.insert(0, str(HERE))
import train_router as T                      # noqa: E402
HI = {"advice_seeking", "evasion_request"}
ap = argparse.ArgumentParser(); ap.add_argument("--with-extra2", action="store_true"); ARGS = ap.parse_args()
sets = {"train": "train.jsonl", "extra": "train_extra.jsonl", "dev": "dev.jsonl", "test5": "test_v5.jsonl", "test6": "test_v6.jsonl", "test7": "alt_test_v7.jsonl", "test8": "alt_test_v8.jsonl"}
S = {k: T.load(f) for k, f in sets.items()}
S["train_all"] = S["train"] + S["extra"] + (T.load("alt_train_extra2.jsonl") if ARGS.with_extra2 else [])
X = {k: [r["text"] for r in v] for k, v in S.items()}; Y = {k: [r["intent"] for r in v] for k, v in S.items()}
wv = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True); cv = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True, min_df=2)
feat = lambda ts, fit=False: hstack([(wv.fit_transform if fit else wv.transform)(ts), (cv.fit_transform if fit else cv.transform)(ts)]).tocsr()
TF = {"train_all": feat(X["train_all"], fit=True)}; TF.update({k: feat(X[k]) for k in ("dev", "test5", "test6", "test7", "test8")})
cache = HERE / ".embed_cache.npz"
E = {k: T.norm_rows(T.embed_texts(X[k], cache)) for k in ("train_all", "dev", "test5", "test6", "test7", "test8")}
def pick(fit, grid, Xd):
    best = None
    for C in grid:
        m = fit(C); f1 = f1_score(Y["dev"], m.predict(Xd), average="macro")
        if best is None or f1 > best[0]: best = (f1, C, m)
    return best
tf_f1, tf_C, tf_m = pick(lambda C: LogisticRegression(C=C, max_iter=4000).fit(TF["train_all"], Y["train_all"]), (5, 20, 50, 100), TF["dev"])
em_f1, em_C, em_m = pick(lambda C: LogisticRegression(C=C, max_iter=4000).fit(E["train_all"], Y["train_all"]), (5, 20, 100, 300), E["dev"])
cls = list(em_m.classes_); assert cls == list(tf_m.classes_); hi = [cls.index(c) for c in HI]
prob = lambda s, w: w * em_m.predict_proba(E[s]) + (1 - w) * tf_m.predict_proba(TF[s])
best_w = max((0.0, 0.5, 0.7, 1.0), key=lambda w: f1_score(Y["dev"], [cls[i] for i in prob("dev", w).argmax(1)], average="macro"))
def stats(s, w, thr):
    P = prob(s, w); pred = [cls[i] for i in P.argmax(1)]; mass = P[:, hi].sum(1); ys = Y[s]
    regex = np.array([T.rules_predict(t) in HI for t in X[s]]); truth = np.array([y in HI for y in ys]); flag = regex | (mass >= thr)
    return {"n": len(ys), "macro_f1": round(float(f1_score(ys, pred, average="macro")), 4), "guard_recall": round(float((flag & truth).sum() / max(1, truth.sum())), 4),
            "guard_false_alarm": round(float((flag & ~truth).sum() / max(1, (~truth).sum())), 4)}
grid = [round(x, 2) for x in np.arange(0.05, 0.95, 0.05)]
res = {}
for name, w in (("embed_only", 1.0), ("blend", best_w)):
    ok = [t for t in grid if stats("dev", w, t)["guard_recall"] >= 0.99]
    thr = max(ok) if ok else min(grid, key=lambda t: (-stats("dev", w, t)["guard_recall"], stats("dev", w, t)["guard_false_alarm"]))
    res[name] = {"embed_weight": w, "guard_threshold": thr, "met_dev_recall_99": bool(ok), "sets": {s: stats(s, w, thr) for s in ("dev", "test5", "test6", "test7", "test8")}}
rep = {"trained_with_extra2": ARGS.with_extra2, "tfidf_C": tf_C, "embed_C": em_C, "chosen_blend_weight_on_dev": best_w, "results": res,
       "note": "dev is the only selection set; test5/test6 are exploratory; test7/test8 are SPENT sealed sets, exploratory only. Not a gate."}
out = HERE.parent / "eval" / ("alt_router_embed_head_exploratory%s.json" % ("_extra2" if ARGS.with_extra2 else ""))
out.write_text(json.dumps(rep, indent=1)); print(json.dumps(rep, indent=1))
