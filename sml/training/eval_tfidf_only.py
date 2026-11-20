"""Is a TF-IDF-only router (no embeddings, so it can run in the browser) good enough? ROADMAP C18 / Gate J inputs.
    rag-engine/.venv/bin/python sml/training/eval_tfidf_only.py [version] [out.json]
Honest protocol: the SHIPPED head was refit on train+valid+dev, so dev is in-sample for it. The threshold is therefore chosen on dev with a head fit
on train+train_extra ONLY (pre-refit), using the existing rule (highest threshold with dev recall >= 0.99). Test sets are exploratory (v5, v6 were
already used by the 0.4.x family) and never used to choose anything; the confirmation is the sealed test_v7 (C19)."""
from __future__ import annotations
import gzip, json, sys
from pathlib import Path
import numpy as np
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score

ROOT = Path(__file__).resolve().parents[2]; D = ROOT / "sml" / "data"
sys.path.insert(0, str(ROOT / "sml" / "runtime")); sys.path.insert(0, str(D))
from router_data import INTENTS  # noqa: E402
from tfidf_head import TfidfHead  # noqa: E402
HI = ("advice_seeking", "evasion_request")
version = sys.argv[1] if len(sys.argv) > 1 else "0.4.1"
out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "sml" / "eval" / f"router_{version}_tfidf_only.json"
L = lambda f: [json.loads(l) for l in (D / f).read_text().splitlines() if l.strip()]
sets = {"dev": L("dev.jsonl"), "natural_test": L("natural_test.jsonl"), **{f"test_v{i}": L(f"test_v{i}.jsonl") for i in range(2, 7)}}
train = L("train.jsonl") + L("train_extra.jsonl")
ev = json.loads((ROOT / "sml" / "models" / "router" / version / "eval.json").read_text())
C = ev["tfidf_C"]

# pre-refit head, same hyper-parameters as the shipped one
wv = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True); cv = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True, min_df=2)
feat = lambda ts, fit=False: hstack([(wv.fit_transform if fit else wv.transform)(ts), (cv.fit_transform if fit else cv.transform)(ts)]).tocsr()
Xtr = feat([r["text"] for r in train], fit=True)
pre = LogisticRegression(C=C, max_iter=4000).fit(Xtr, [r["intent"] for r in train])
cls = list(pre.classes_)
head = TfidfHead.load(ROOT / "sml" / "models" / "router" / version)       # the shipped (refit) head, via the no-pickle export
assert head.classes == cls


def proba_pre(texts): return pre.predict_proba(feat(texts))
def proba_ship(texts): return np.array([head.proba(t) for t in texts])
hi_idx = [cls.index(c) for c in HI]


def guard(rows, P, thr):
    risky = np.array([r["intent"] in HI for r in rows]); flag = P[:, hi_idx].sum(1) >= thr
    return {"risky_n": int(risky.sum()), "caught": int((flag & risky).sum()), "recall": round(float((flag & risky).sum() / max(1, risky.sum())), 4),
            "benign_n": int((~risky).sum()), "false_alarms": int((flag & ~risky).sum()), "false_alarm_rate": round(float((flag & ~risky).sum() / max(1, (~risky).sum())), 4)}


def scores(rows, P):
    y = [r["intent"] for r in rows]; p = [cls[i] for i in P.argmax(1)]
    bylang = {}
    for r, a, b in zip(rows, y, p): bylang.setdefault(r.get("lang", "en"), []).append(a == b)
    return {"n": len(rows), "accuracy": round(float(np.mean([a == b for a, b in zip(y, p)])), 4), "macro_f1": round(float(f1_score(y, p, average="macro", labels=INTENTS, zero_division=0)), 4),
            "by_lang": {k: [len(v), round(float(np.mean(v)), 3)] for k, v in sorted(bylang.items())}}


grid = [round(x, 2) for x in np.arange(0.05, 0.95, 0.05)]
Pd = proba_pre([r["text"] for r in sets["dev"]])
ok = [t for t in grid if guard(sets["dev"], Pd, t)["recall"] >= 0.99]
thr = max(ok) if ok else min(grid, key=lambda t: (-guard(sets["dev"], Pd, t)["recall"], guard(sets["dev"], Pd, t)["false_alarm_rate"]))
res = {"version": version, "protocol": __doc__.split("\n")[0], "tfidf_C": C, "threshold_chosen_on_dev_with_prerefit_head": thr, "threshold_met_dev_recall_99": bool(ok),
       "dev_prerefit_guard": guard(sets["dev"], Pd, thr), "pre_refit": {}, "shipped_head": {}}
blend_ref = ev["results"]["chosen_blend"]
for name, rows in sets.items():
    texts = [r["text"] for r in rows]
    Pp, Ps = proba_pre(texts), proba_ship(texts)
    res["pre_refit"][name] = {**scores(rows, Pp), "guard": guard(rows, Pp, thr)}
    res["shipped_head"][name] = {**scores(rows, Ps), "guard": guard(rows, Ps, thr)}
    if name in blend_ref or name.replace("natural_test", "nat1") in blend_ref:
        k = name if name in blend_ref else name.replace("natural_test", "nat1")
        res["pre_refit"][name]["blend_macro_f1_for_reference"] = blend_ref[k]["macro_f1"]

# size and quantisation (Gate J: <= 1 MB gzipped, decisions identical)
vd = ROOT / "sml" / "models" / "router" / version
gz = lambda b: len(gzip.compress(b, 9))
j = (vd / "tfidf_head.json").read_bytes(); n = (vd / "tfidf_head.npz").read_bytes()
res["size_bytes"] = {"tfidf_head.json_raw": len(j), "tfidf_head.json_gzip": gz(j), "tfidf_head.npz_float32_compressed": len(n), "sum_gzip_like": gz(j) + len(n),
                     "within_1MB_gzipped": (gz(j) + len(n)) <= 1_000_000}
texts = [r["text"] for rs in sets.values() for r in rs]
Pfull = proba_ship(texts)
coef = head.coef.copy(); quant = {}
for name, q in (("float16", lambda a: a.astype(np.float16).astype(np.float64)), ("round3", lambda a: np.round(a, 3)), ("round2", lambda a: np.round(a, 2))):
    h2 = TfidfHead.__new__(TfidfHead); h2.__dict__.update(head.__dict__); h2.coef = q(coef)
    P2 = np.array([h2.proba(t) for t in texts])
    txt = json.dumps(np.round(h2.coef, 3 if name != "round2" else 2).tolist()).encode()
    quant[name] = {"max_prob_diff": round(float(np.abs(P2 - Pfull).max()), 5), "decision_parity": round(float((P2.argmax(1) == Pfull.argmax(1)).mean()), 4),
                   "coef_json_gzip_bytes": gz(txt) if name != "float16" else None}
res["quantisation_vs_float32_head_on_all_rows"] = quant
out_path.parent.mkdir(exist_ok=True); out_path.write_text(json.dumps(res, indent=1, ensure_ascii=False))
print(json.dumps({k: res[k] for k in ("threshold_chosen_on_dev_with_prerefit_head", "dev_prerefit_guard", "size_bytes", "quantisation_vs_float32_head_on_all_rows")}, indent=1))
for k in ("test_v5", "test_v6", "test_v2", "test_v3"):
    print(k, "pre-refit", res["pre_refit"][k]["macro_f1"], res["pre_refit"][k]["guard"], "| shipped", res["shipped_head"][k]["macro_f1"])
