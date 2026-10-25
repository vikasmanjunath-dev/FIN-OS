"""
Router v2 training (blueprint Part 8/9). Run after sml/data/ingest_incoming.py:
    rag-engine/.venv/bin/python sml/training/train_router_v2.py --version 0.5.0   (an existing version is never overwritten without --overwrite)

Differences from v1 (which stays reproducible):
  * train = templated train + 650 independently written messages (train_extra)
  * hyper-parameters (C, ensemble weight) and the guard threshold are chosen on `dev` (agent-written), NOT on any test set
  * two held-out test sets: natural_v1 (written by the same person who wrote the templates) and test_v2 (independent writer);
    gates are judged on both combined. Neither is ever used for fitting or tuning.
  * final artifacts are refit on train + valid + dev.
"""
from __future__ import annotations
import argparse, json, sys, time
from pathlib import Path
import numpy as np, joblib
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, accuracy_score

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import train_router as T                      # reuse loaders / baseline / metrics
from router_data import INTENTS               # noqa: E402  (train_router put sml/data on sys.path)
import config                                 # noqa: E402  (rag-engine; the same embedding model the runtime uses)

HI = {"advice_seeking", "evasion_request"}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--version", required=True)
    ap.add_argument("--overwrite", action="store_true", help="allow replacing the artifacts of an existing version (versions are frozen once a model card exists)")
    a = ap.parse_args()
    out = HERE.parents[0] / "models" / "router" / a.version
    if (out / "embed_lr.npz").exists() and not a.overwrite:
        sys.exit(f"refusing to overwrite router {a.version}: {out} already has a model. Pick a new --version, or pass --overwrite on purpose.")
    S = {k: T.load(f) for k, f in (("train", "train.jsonl"), ("extra", "train_extra.jsonl"), ("valid", "valid.jsonl"),
                                  ("dev", "dev.jsonl"), ("nat1", "natural_test.jsonl"), ("test2", "test_v2.jsonl"), ("test3", "test_v3.jsonl"),
                                  ("test4", "test_v4.jsonl"), ("test5", "test_v5.jsonl"), ("test6", "test_v6.jsonl"))}
    S["train_all"] = S["train"] + S["extra"]
    X = {k: [r["text"] for r in v] for k, v in S.items()}; Y = {k: [r["intent"] for r in v] for k, v in S.items()}
    # `test` = the two sets used for the v0.2 numbers (comparable); `all` = test + the fresh test_v3 (never tuned on)
    X["test"] = X["nat1"] + X["test2"]; Y["test"] = Y["nat1"] + Y["test2"]
    X["all"] = X["test"] + X["test3"]; Y["all"] = Y["test"] + Y["test3"]
    L = {"test": [r.get("lang", "en") for r in S["nat1"] + S["test2"]], "all": [r.get("lang", "en") for r in S["nat1"] + S["test2"] + S["test3"]]}
    rep = {"version": a.version, "counts": {k: len(v) for k, v in X.items()}, "chosen_on": "dev", "results": {}}

    wv = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True); cv = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True, min_df=2)
    feat = lambda ts, fit=False: hstack([(wv.fit_transform if fit else wv.transform)(ts), (cv.fit_transform if fit else cv.transform)(ts)]).tocsr()
    Xtr = feat(X["train_all"], fit=True)
    cache = HERE / ".embed_cache.npz"
    E = {k: T.norm_rows(T.embed_texts(X[k], cache)) for k in ("train_all", "valid", "dev", "nat1", "test2", "test3", "test4", "test5", "test6")}
    E["test"] = np.vstack([E["nat1"], E["test2"]]); E["all"] = np.vstack([E["test"], E["test3"]])
    TF = {k: feat(X[k]) for k in ("valid", "dev", "nat1", "test2", "test3", "test4", "test5", "test6", "test", "all")}

    def pick(fit_fn, grid, Xdev, label):
        best = None
        for C in grid:
            m = fit_fn(C); f1 = f1_score(Y["dev"], m.predict(Xdev), average="macro")
            if best is None or f1 > best[0]: best = (f1, C, m)
        rep[label + "_C"] = best[1]; rep[label + "_dev_macro_f1"] = round(best[0], 3); return best[2]
    tf_m = pick(lambda C: LogisticRegression(C=C, max_iter=4000).fit(Xtr, Y["train_all"]), (5, 20, 50, 100), TF["dev"], "tfidf")
    em_m = pick(lambda C: LogisticRegression(C=C, max_iter=4000).fit(E["train_all"], Y["train_all"]), (5, 20, 100, 300), E["dev"], "embed")
    cls = list(em_m.classes_); assert cls == list(tf_m.classes_)
    P = lambda s: {"tf": tf_m.predict_proba(TF[s]), "em": em_m.predict_proba(E[s])}
    PD = P("dev"); best_w = max((0.0, 0.5, 0.7, 1.0), key=lambda w: f1_score(Y["dev"], [cls[i] for i in (w * PD["em"] + (1 - w) * PD["tf"]).argmax(1)], average="macro"))
    rep["ensemble_embed_weight"] = best_w
    blend = lambda s: best_w * P(s)["em"] + (1 - best_w) * P(s)["tf"]

    for s in ("valid", "dev", "nat1", "test2", "test3", "test4", "test5", "test6", "test", "all"):
        rep["results"].setdefault("rules", {})[s] = T.evaluate("rules", Y[s], [T.rules_predict(t) for t in X[s]])
        rep["results"].setdefault("tfidf_lr", {})[s] = T.evaluate("tfidf_lr", Y[s], tf_m.predict(TF[s]))
        rep["results"].setdefault("embed_lr", {})[s] = T.evaluate("embed_lr", Y[s], em_m.predict(E[s]))
        rep["results"].setdefault("chosen_blend", {})[s] = T.evaluate("chosen_blend", Y[s], [cls[i] for i in blend(s).argmax(1)])

    # guard rule = regex OR (probability mass on high-risk classes >= thr); thr tuned on dev only
    himass = lambda s: blend(s)[:, [cls.index(c) for c in HI]].sum(1)
    regex_hi = lambda s: np.array([T.rules_predict(t) in HI for t in X[s]])
    truth_hi = lambda s: np.array([y in HI for y in Y[s]])
    def guard_stats(s, thr):
        f = regex_hi(s) | (himass(s) >= thr); t = truth_hi(s)
        return {"recall": round(float((f & t).sum() / max(1, t.sum())), 3), "false_alarm_rate": round(float((f & ~t).sum() / max(1, (~t).sum())), 3), "n_risky": int(t.sum()), "n_benign": int((~t).sum())}
    grid = [round(x, 2) for x in np.arange(0.05, 0.95, 0.05)]
    ok = [t for t in grid if guard_stats("dev", t)["recall"] >= 0.99]
    thr = max(ok) if ok else min(grid, key=lambda t: (-guard_stats("dev", t)["recall"], guard_stats("dev", t)["false_alarm_rate"]))
    rep["guard_threshold"] = {"chosen_on_dev": thr, "rule": "regex OR high-risk probability mass >= threshold", "met_dev_recall_99": bool(ok)}
    rep["guard"] = {s: guard_stats(s, thr) for s in ("dev", "nat1", "test2", "test3", "test4", "test5", "test6", "test", "all")}
    rep["guard_curve_test"] = [{"thr": t, **guard_stats("test", t)} for t in (0.1, 0.2, 0.3, 0.4, 0.5)]
    # out-of-sample confirmation: the SAME thresholds on test_v3, which nothing was tuned on
    rep["guard_curve_test3"] = [{"thr": t, **guard_stats("test3", t)} for t in (0.1, 0.2, 0.3, 0.4, 0.5)]
    # per-language accuracy on combined test for the chosen blend
    pred = np.array([cls[i] for i in blend("all").argmax(1)]); y = np.array(Y["all"]); lg = np.array(L["all"])
    rep["lang_accuracy_test"] = {l: round(float((pred[lg == l] == y[lg == l]).mean()), 3) for l in set(L["test"]) if (lg == l).sum() >= 10}
    mf = rep["results"]["chosen_blend"]["all"]["macro_f1"]
    rep["gates"] = {"macro_f1_target_0.95": {"value": mf, "met": mf >= 0.95}, "high_risk_recall_target_0.99": {"value": rep["guard"]["all"]["recall"], "met": rep["guard"]["all"]["recall"] >= 0.99}}

    # C14: test_v5 (never looked at before training) is the confirmatory gate set; test_v4 was seen once (diagnostic)
    mf5 = rep["results"]["chosen_blend"]["test5"]["macro_f1"]
    rep["gates_test5"] = {"macro_f1_target_0.95": {"value": mf5, "met": mf5 >= 0.95}, "high_risk_recall_target_0.99": {"value": rep["guard"]["test5"]["recall"], "met": rep["guard"]["test5"]["recall"] >= 0.99}}
    # C15: test_v6 is the confirmatory set for the threshold chosen on the enlarged dev (curve below is information, never used to choose)
    mf6 = rep["results"]["chosen_blend"]["test6"]["macro_f1"]
    rep["gates_test6"] = {"macro_f1_target_0.95": {"value": mf6, "met": mf6 >= 0.95}, "high_risk_recall_target_0.99": {"value": rep["guard"]["test6"]["recall"], "met": rep["guard"]["test6"]["recall"] >= 0.99},
                          "false_alarm_target_0.05": {"value": rep["guard"]["test6"]["false_alarm_rate"], "met": rep["guard"]["test6"]["false_alarm_rate"] <= 0.05}}
    rep["guard_curve_test6"] = [{"thr": t, **guard_stats("test6", t)} for t in (0.1, 0.15, 0.2, 0.3, 0.4, 0.5)]
    rep["guard_curve_dev"] = [{"thr": t, **guard_stats("dev", t)} for t in (0.1, 0.15, 0.2, 0.3, 0.4, 0.5)]
    out.mkdir(parents=True, exist_ok=True)
    Xall = X["train_all"] + X["valid"] + X["dev"]; Yall = Y["train_all"] + Y["valid"] + Y["dev"]
    tf_f = LogisticRegression(C=rep["tfidf_C"], max_iter=4000).fit(feat(Xall, fit=True), Yall)
    em_f = LogisticRegression(C=rep["embed_C"], max_iter=4000).fit(np.vstack([E["train_all"], E["valid"], E["dev"]]), Yall)
    joblib.dump({"word": wv, "char": cv, "lr": tf_f, "classes": list(tf_f.classes_), "embed_weight": best_w}, out / "tfidf_lr.joblib")
    np.savez(out / "embed_lr.npz", coef=em_f.coef_, intercept=em_f.intercept_, classes=np.array(em_f.classes_), embed_model=config.EMBED_MODEL, guard_threshold=thr, embed_weight=best_w)
    (out / "eval.json").write_text(json.dumps(rep, indent=1, ensure_ascii=False))
    brief = {m: {s: (r["accuracy"], r["acc_ci95"], r["macro_f1"]) for s, r in rep["results"][m].items() if s in ("dev", "nat1", "test2", "test3", "test4", "test5", "test6", "test", "all")} for m in rep["results"]}
    print(json.dumps({"counts": rep["counts"], "C": [rep["tfidf_C"], rep["embed_C"]], "w": best_w, "guard_thr": thr, "guard": rep["guard"], "gates": rep["gates"], "gates_test5": rep["gates_test5"], "gates_test6": rep["gates_test6"], "guard_curve_dev": rep["guard_curve_dev"], "guard_curve_test6": rep["guard_curve_test6"], "lang": rep["lang_accuracy_test"]}, indent=1))
    print(json.dumps(brief, indent=1)); print("saved", out)


if __name__ == "__main__":
    main()
