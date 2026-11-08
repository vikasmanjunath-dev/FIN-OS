"""Router v0.1 predictor (server/dev use). rung 2: mxbai-embed-large (Ollama) + logistic head.
    rag-engine/.venv/bin/python sml/runtime/router_predict.py "september mein khana kitna kharch hua?"
Returns intent, confidence, risk class and a `needs_guard` flag. NOT yet wired into Arya; see models/router/0.1.0/MODEL_CARD.md."""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "rag-engine"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
from embedding.encoder import embed_batch  # noqa: E402

_RISK = {"advice_seeking": "high", "evasion_request": "high"}
_cache = {}


DEFAULT_VERSION = "0.5.1"   # F3 approved 2026-11-08: note-level operating point (thr 0.35, recall 347/351, false alarm 4.85% on sealed v8); 0.4.1 was the shadow-week default
MAX_CHARS = 500             # cost cap: the router saw messages of at most 100 characters; the rest of a long paste adds embed time, not signal


def _load(version=DEFAULT_VERSION, tfidf_source="joblib"):
    d = ROOT / "sml" / "models" / "router" / version
    if tfidf_source == "joblib" and not (d / "tfidf_lr.joblib").exists() and (d / "tfidf_head.json").exists():
        tfidf_source = "export"      # a fresh clone has no joblib (git-ignored pickle): use the tracked, pickle-free export instead (decision N3)
    key = version if tfidf_source == "joblib" else f"{version}|{tfidf_source}"
    if key not in _cache:
        z = np.load(d / "embed_lr.npz", allow_pickle=False)   # plain arrays only: nothing is unpickled from this file
        tf = None
        if (d / ("tfidf_head.json" if tfidf_source == "export" else "tfidf_lr.joblib")).exists() and "embed_weight" in z.files:   # v0.2+: blend of tfidf + embedding heads
            if tfidf_source == "export":                  # no-pickle head (ROADMAP C21); the joblib stays the default until this is proven in shadow
                from tfidf_head import TfidfHead
                tf = TfidfHead.load(d)
            else:
                import joblib
                tf = joblib.load(d / "tfidf_lr.joblib")
        w = float(z["embed_weight"]) if "embed_weight" in z.files else 1.0
        thr = float(z["guard_threshold"]) if "guard_threshold" in z.files else 0.25
        embed_model = str(z["embed_model"]) if "embed_model" in z.files else "mxbai-embed-large"   # the router always embeds with the model it was trained on, whatever the retrieval pipeline uses
        classes = [str(c) for c in z["classes"]]
        tf_classes = tf.classes if tfidf_source == "export" and tf is not None else (tf["classes"] if tf is not None else None)
        if tf is not None and [str(c) for c in tf_classes] != classes:   # checked once at load (an assert per call vanishes under python -O)
            raise ValueError(f"router {version}: tfidf and embedding heads disagree on the class order")
        _cache[key] = (z["coef"], z["intercept"], classes, tf, w, thr, embed_model)
    return _cache[key]


def predict(text: str, version=DEFAULT_VERSION, guard_mass=None, tfidf_source="joblib"):
    """guard_mass: flag for a guard when P(advice)+P(evasion) >= this. Default = the value chosen on the dev set
    (0.2 for v0.4.1, about 4-7% of benign messages flagged on agent-written text); see MODEL_CARD.md for the trade-off table. Pass 0.2-0.3 for fewer false alarms."""
    coef, b, classes, tf, w, thr, embed_model = _load(version, tfidf_source)
    if tf is not None and hasattr(tf, "proba"): tfidf_source = "export"      # _load may have switched to the export
    text = text[:MAX_CHARS]
    guard_mass = thr if guard_mass is None else guard_mass
    v = np.asarray(embed_batch([text], model=embed_model)[0], dtype=np.float32); v /= max(np.linalg.norm(v), 1e-9)
    logit = coef @ v + b; p = np.exp(logit - logit.max()); p /= p.sum()
    if tf is not None:
        if tfidf_source == "export":
            pt = tf.proba(text)
        else:
            from scipy.sparse import hstack
            x = hstack([tf["word"].transform([text]), tf["char"].transform([text])]).tocsr()
            pt = tf["lr"].predict_proba(x)[0]
        p = w * p + (1 - w) * pt
    i = int(p.argmax()); hi_mass = float(sum(p[classes.index(c)] for c in _RISK))
    return {"router_version": version, "intent": classes[i], "confidence": round(float(p[i]), 3), "risk": _RISK.get(classes[i], "low"),
            "high_risk_mass": round(hi_mass, 3), "needs_guard": bool(classes[i] in _RISK or hi_mass >= guard_mass),
            "top3": [(classes[j], round(float(p[j]), 3)) for j in np.argsort(-p)[:3]]}


if __name__ == "__main__":
    for t in sys.argv[1:] or ["september mein khana kitna kharch hua?"]:
        print(json.dumps({"text": t, **predict(t)}, ensure_ascii=False))
