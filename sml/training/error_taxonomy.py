"""C17-style error taxonomy of the TF-IDF-only candidate (see eval_tfidf_only.py) on test_v7. Diagnostic only: it reads the spent sealed set to say WHAT to write
for training (patterns, never the rows themselves) and what a new candidate must fix. Writes sml/eval/alt_router_0.4.1_tfidf_only_errors.json.
  rag-engine/.venv/bin/python sml/training/error_taxonomy.py"""
import json, re, sys
from collections import Counter, defaultdict
from pathlib import Path
import numpy as np
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
HERE = Path(__file__).resolve().parent; sys.path.insert(0, str(HERE))
import train_router as T                      # noqa: E402
HI = {"advice_seeking", "evasion_request"}
cfg = json.loads((HERE.parent / "eval" / "alt_router_0.4.1_tfidf_only.json").read_text())
C, thr = cfg["tfidf_C"], cfg["guard_threshold"]
tr = T.load("train.jsonl") + T.load("train_extra.jsonl"); t7 = T.load("alt_test_v7.jsonl")
wv = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True); cv = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True, min_df=2)
feat = lambda ts, fit=False: hstack([(wv.fit_transform if fit else wv.transform)(ts), (cv.fit_transform if fit else cv.transform)(ts)]).tocsr()
m = LogisticRegression(C=C, max_iter=4000).fit(feat([r["text"] for r in tr], fit=True), [r["intent"] for r in tr]); cls = list(m.classes_)
X = [r["text"] for r in t7]; Y = [r["intent"] for r in t7]; P = m.predict_proba(feat(X)); pred = [cls[i] for i in P.argmax(1)]
mass = P[:, [cls.index(c) for c in HI]].sum(1); regex = np.array([T.rules_predict(t) in HI for t in X]); flag = regex | (mass >= thr)
conf = Counter((y, p) for y, p in zip(Y, pred) if y != p)
per = {c: {"n": Y.count(c), "recall": round(sum(1 for y, p in zip(Y, pred) if y == c and p == c) / max(1, Y.count(c)), 3), "precision": round(sum(1 for y, p in zip(Y, pred) if p == c and y == c) / max(1, pred.count(c)), 3)} for c in cls}
fa = [(X[i], Y[i], pred[i], round(float(mass[i]), 2)) for i in range(len(X)) if flag[i] and Y[i] not in HI]
fa_by_intent = Counter(y for _, y, _, _ in fa)
words = Counter(w for t, *_ in fa for w in set(re.findall(r"[a-zA-Zऀ-ॿ']{3,}", t.lower())))
benign_words = Counter(w for t, y in zip(X, Y) if y not in HI for w in set(re.findall(r"[a-zA-Zऀ-ॿ']{3,}", t.lower())))
triggers = sorted(((w, n, round(n / benign_words[w], 2)) for w, n in words.items() if n >= 6), key=lambda x: -x[1])[:25]
miss = [(X[i], Y[i], pred[i]) for i in range(len(X)) if Y[i] in HI and not flag[i]]
low_margin = sum(1 for i in range(len(X)) if Y[i] != pred[i] and P[i].max() >= 0.6)
rep = {"per_intent": per, "top_confusions": [{"true": a, "pred": b, "n": n} for (a, b), n in conf.most_common(12)],
       "false_alarms": {"n": len(fa), "by_true_intent": dict(fa_by_intent.most_common()), "trigger_words": [{"word": w, "in_false_alarms": n, "share_of_benign_with_word": s} for w, n, s in triggers]},
       "missed_risky": {"n": len(miss), "by_true_intent": dict(Counter(y for _, y, _ in miss)), "predicted_as": dict(Counter(p for *_, p in miss).most_common())},
       "wrong_but_confident": low_margin, "examples_false_alarm": [{"text": t, "true": y, "pred": p, "risk_mass": s} for t, y, p, s in fa[:15]], "examples_missed": [{"text": t, "true": y, "pred": p} for t, y, p in miss[:15]]}
(HERE.parent / "eval" / "alt_router_0.4.1_tfidf_only_errors.json").write_text(json.dumps(rep, indent=1, ensure_ascii=False))
print(json.dumps({k: rep[k] for k in ("per_intent", "top_confusions", "false_alarms", "missed_risky", "wrong_but_confident")}, ensure_ascii=False)[:3800])
