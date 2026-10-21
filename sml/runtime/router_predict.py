"""Router v0.1 predictor (server/dev use). rung 2: mxbai-embed-large (Ollama) + logistic head.
    rag-engine/.venv/bin/python sml/runtime/router_predict.py "september mein khana kitna kharch hua?"
Returns intent, confidence, risk class and a `needs_guard` flag. NOT yet wired into Arya; see models/router/0.1.0/MODEL_CARD.md."""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "rag-engine"))
from embedding.encoder import embed_batch  # noqa: E402

_RISK = {"advice_seeking": "high", "evasion_request": "high"}
_cache = {}


def _load(version="0.1.0"):
    if version not in _cache:
        z = np.load(ROOT / "sml" / "models" / "router" / version / "embed_lr.npz", allow_pickle=True)
        _cache[version] = (z["coef"], z["intercept"], [str(c) for c in z["classes"]])
    return _cache[version]


def predict(text: str, version="0.1.0", guard_mass=0.25):
    coef, b, classes = _load(version)
    v = np.asarray(embed_batch([text])[0], dtype=np.float32); v /= max(np.linalg.norm(v), 1e-9)
    logit = coef @ v + b; p = np.exp(logit - logit.max()); p /= p.sum()
    i = int(p.argmax()); hi_mass = float(sum(p[classes.index(c)] for c in _RISK))
    return {"intent": classes[i], "confidence": round(float(p[i]), 3), "risk": _RISK.get(classes[i], "low"),
            "high_risk_mass": round(hi_mass, 3), "needs_guard": bool(classes[i] in _RISK or hi_mass >= guard_mass),
            "top3": [(classes[j], round(float(p[j]), 3)) for j in np.argsort(-p)[:3]]}


if __name__ == "__main__":
    for t in sys.argv[1:] or ["september mein khana kitna kharch hua?"]:
        print(json.dumps({"text": t, **predict(t)}, ensure_ascii=False))
