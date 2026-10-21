"""
Train + evaluate the intent router (blueprint Part 8 T1/T2, Part 9 gates).  Run from repo root:
    rag-engine/.venv/bin/python sml/training/train_router.py [--version 0.1.0]

Models compared on the SAME two test sets:
  rules      the behaviour FIN-OS has today (regex advice/evasion guards + a keyword RAG gate), the baseline to beat
  tfidf_lr   word 1-2 grams + char 2-5 grams -> logistic regression (rung 1; runs anywhere, ~100 KB)
  embed_lr   mxbai-embed-large (Ollama, already on this machine) -> logistic regression (rung 2 head)
Splits: train = templated; valid = held-out TEMPLATES (tune here); natural_test = hand-written (never tuned on).
Nothing is tuned on natural_test. Its N is small, so a bootstrap 95 % interval is reported with every score.
"""
from __future__ import annotations
import argparse, hashlib, json, re, sys, time
from pathlib import Path
import numpy as np
import joblib
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, classification_report, confusion_matrix

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "sml" / "data"
sys.path.insert(0, str(ROOT / "rag-engine"))
sys.path.insert(0, str(ROOT / "sml" / "data"))
from router_data import INTENTS, RISK  # noqa: E402


def load(name):
    return [json.loads(l) for l in (DATA / name).read_text().splitlines() if l.strip()]


# ── rules baseline: ported from js/arya-guardrails.js (EVASION, ADVICE_ASK) and detectRagIntent ──────────────
EVASION = re.compile(r"\b(?:evade|evading|evasion|hide\s+(?:my\s+)?(?:income|money|assets)|black\s+money|unaccounted|without\s+(?:paying\s+tax|declaring)|fake\s+(?:rent\s+receipts?|bills?|invoices?|80c|hra)|forge|backdate|launder)", re.I)
ADVICE = re.compile(r"\b(?:should\s+i|can\s+i|is\s+it\s+(?:good|safe|wise)\s+to|what\s+should\s+i)\b[^.?!\n]{0,40}\b(?:buy|sell|invest\s+in|exit|hold|short|put\s+money)\b|\bwhich\s+(?:stock|fund|mutual fund|crypto)\b", re.I)
RAG = re.compile(r"\b(section\s?\d|circular|notification|sebi|rbi|amfi|regulation|regulatory|kcc|directions?|rule\b|act\b|compliance|directive)\b", re.I)


def rules_predict(t: str) -> str:
    if EVASION.search(t):
        return "evasion_request"
    if ADVICE.search(t):
        return "advice_seeking"
    if RAG.search(t):
        return "regulation_question"
    return "concept_explainer"      # a rules-only system has no other route: everything else falls to general chat/RAG


# ── features ────────────────────────────────────────────────────────────────────────────────────────────────
def embed_texts(texts, cache_path: Path):
    from embedding.encoder import embed_batch
    cache = {}
    if cache_path.exists():
        z = np.load(cache_path, allow_pickle=True)
        cache = dict(zip(z["keys"].tolist(), z["vecs"]))
    key = lambda s: hashlib.sha1(s.encode()).hexdigest()
    todo = [t for t in dict.fromkeys(texts) if key(t) not in cache]
    for i in range(0, len(todo), 32):
        for t, v in zip(todo[i:i + 32], embed_batch(todo[i:i + 32])):
            cache[key(t)] = np.asarray(v, dtype=np.float32)
    np.savez(cache_path, keys=np.array(list(cache.keys())), vecs=np.stack(list(cache.values())))
    return np.stack([cache[key(t)] for t in texts])


def norm_rows(x):
    return x / np.clip(np.linalg.norm(x, axis=1, keepdims=True), 1e-9, None)


# ── metrics ──────────────────────────────────────────────────────────────────────────────────────────────────
def boot_ci(y, p, n=2000, seed=0):
    rng = np.random.default_rng(seed)
    y, p = np.asarray(y), np.asarray(p)
    accs = [accuracy_score(y[idx], p[idx]) for idx in (rng.integers(0, len(y), len(y)) for _ in range(n))]
    return float(np.percentile(accs, 2.5)), float(np.percentile(accs, 97.5))


def risk_recall(y, p):
    out = {}
    for c in ("advice_seeking", "evasion_request"):
        tp = sum(1 for a, b in zip(y, p) if a == c and b == c)
        fn = sum(1 for a, b in zip(y, p) if a == c and b != c)
        fp = sum(1 for a, b in zip(y, p) if a != c and b == c)
        out[c] = {"recall": round(tp / max(1, tp + fn), 3), "precision": round(tp / max(1, tp + fp), 3)}
    # "blocked-or-flagged": a high-risk input predicted as EITHER high-risk class still reaches a guard
    hi = [i for i, a in enumerate(y) if a in ("advice_seeking", "evasion_request")]
    out["high_risk_caught_by_any_guard"] = round(sum(1 for i in hi if p[i] in ("advice_seeking", "evasion_request")) / max(1, len(hi)), 3)
    return out


def evaluate(name, y, p, proba=None):
    lo, hi = boot_ci(y, p)
    r = {"model": name, "n": len(y), "accuracy": round(accuracy_score(y, p), 3), "acc_ci95": [round(lo, 3), round(hi, 3)],
         "macro_f1": round(f1_score(y, p, average="macro", labels=INTENTS, zero_division=0), 3), "risk": risk_recall(y, p)}
    per = classification_report(y, p, labels=INTENTS, output_dict=True, zero_division=0)
    r["per_intent_f1"] = {k: round(per[k]["f1-score"], 2) for k in INTENTS}
    cm = confusion_matrix(y, p, labels=INTENTS)
    pairs = sorted(((int(cm[i, j]), INTENTS[i], INTENTS[j]) for i in range(len(INTENTS)) for j in range(len(INTENTS)) if i != j and cm[i, j]), reverse=True)[:6]
    r["top_confusions"] = [{"n": n, "true": a, "pred": b} for n, a, b in pairs]
    return r


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--version", default="0.1.0"); args = ap.parse_args()
    tr, va, na = load("train.jsonl"), load("valid.jsonl"), load("natural_test.jsonl")
    X = {k: [r["text"] for r in v] for k, v in (("train", tr), ("valid", va), ("natural", na))}
    Y = {k: [r["intent"] for r in v] for k, v in (("train", tr), ("valid", va), ("natural", na))}
    report = {"version": args.version, "data": json.loads((DATA / "MANIFEST.json").read_text())["counts"], "results": {}}
    models = {}

    # rules
    for split in ("valid", "natural"):
        report["results"].setdefault("rules", {})[split] = evaluate("rules", Y[split], [rules_predict(t) for t in X[split]])

    # tfidf
    wv = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, lowercase=True, min_df=1)
    cv = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True, lowercase=True, min_df=2)
    feat = lambda texts, fit=False: hstack([(wv.fit_transform if fit else wv.transform)(texts), (cv.fit_transform if fit else cv.transform)(texts)]).tocsr()
    Xtr = feat(X["train"], fit=True)
    best = None
    for C in (1, 5, 20, 50):
        m = LogisticRegression(C=C, max_iter=3000).fit(Xtr, Y["train"])
        f1 = f1_score(Y["valid"], m.predict(feat(X["valid"])), average="macro")
        if best is None or f1 > best[0]: best = (f1, C, m)
    tf_model = best[2]
    report["tfidf_C"] = best[1]
    for split in ("valid", "natural"):
        report["results"].setdefault("tfidf_lr", {})[split] = evaluate("tfidf_lr", Y[split], tf_model.predict(feat(X[split])))
    models["tfidf_lr"] = (tf_model, lambda ts: tf_model.predict_proba(feat(ts)))

    # embeddings
    cache = ROOT / "sml" / "training" / ".embed_cache.npz"
    t0 = time.time()
    E = {k: norm_rows(embed_texts(X[k], cache)) for k in X}
    report["embed_seconds"] = round(time.time() - t0, 1)
    best = None
    for C in (1, 5, 20, 100):
        m = LogisticRegression(C=C, max_iter=3000).fit(E["train"], Y["train"])
        f1 = f1_score(Y["valid"], m.predict(E["valid"]), average="macro")
        if best is None or f1 > best[0]: best = (f1, C, m)
    em_model = best[2]
    report["embed_C"] = best[1]
    for split in ("valid", "natural"):
        report["results"].setdefault("embed_lr", {})[split] = evaluate("embed_lr", Y[split], em_model.predict(E[split]))

    # ensemble: average probabilities (both models share class order)
    P = {s: (tf_model.predict_proba(feat(X[s])) + em_model.predict_proba(E[s])) / 2 for s in ("valid", "natural")}
    cls = list(tf_model.classes_)
    for split in ("valid", "natural"):
        report["results"].setdefault("ensemble", {})[split] = evaluate("ensemble", Y[split], [cls[i] for i in P[split].argmax(1)])

    # abstain threshold: tuned on VALID only, reported on natural
    thr_rows = []
    for thr in (0.0, 0.3, 0.4, 0.5, 0.6, 0.7):
        res = {}
        for split in ("valid", "natural"):
            conf = P[split].max(1); pred = np.array([cls[i] for i in P[split].argmax(1)]); y = np.array(Y[split]); keep = conf >= thr
            res[split] = {"coverage": round(float(keep.mean()), 3), "acc_on_kept": round(float((pred[keep] == y[keep]).mean()), 3) if keep.any() else None}
        thr_rows.append({"threshold": thr, **res})
    report["ensemble_abstain"] = thr_rows

    out = ROOT / "sml" / "models" / "router" / args.version
    out.mkdir(parents=True, exist_ok=True)
    # final artifacts are refit on train+valid (natural_test stays untouched)
    allX, allY = X["train"] + X["valid"], Y["train"] + Y["valid"]
    Xall = feat(allX, fit=True); tf_final = LogisticRegression(C=report["tfidf_C"], max_iter=3000).fit(Xall, allY)
    em_final = LogisticRegression(C=report["embed_C"], max_iter=3000).fit(np.vstack([E["train"], E["valid"]]), allY)
    joblib.dump({"word": wv, "char": cv, "lr": tf_final, "classes": list(tf_final.classes_)}, out / "tfidf_lr.joblib")
    np.savez(out / "embed_lr.npz", coef=em_final.coef_, intercept=em_final.intercept_, classes=np.array(em_final.classes_), embed_model="mxbai-embed-large")
    (out / "eval.json").write_text(json.dumps(report, indent=1, ensure_ascii=False))
    print(json.dumps({m: {s: {k: report["results"][m][s][k] for k in ("accuracy", "acc_ci95", "macro_f1")} for s in ("valid", "natural")} for m in report["results"]}, indent=1))
    print("saved", out)


if __name__ == "__main__":
    main()
