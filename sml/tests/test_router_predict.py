"""Router predictor: cost cap on long text, class-order check at load, no unpickling. No Ollama, no real model files."""
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "sml" / "runtime"))
sys.path.insert(0, str(ROOT / "rag-engine"))
import router_predict as rp  # noqa: E402

CLASSES = ["advice_seeking", "evasion_request", "other"]


seen_models = []


def _fake(monkeypatch, seen):
    monkeypatch.setitem(rp._cache, "t", (np.eye(3, 4, dtype=np.float32), np.zeros(3), CLASSES, None, 1.0, 0.2, "mxbai-embed-large"))
    monkeypatch.setattr(rp, "embed_batch", lambda texts, model=None: (seen.append(list(texts)), seen_models.append(model), [[1.0, 0.0, 0.0, 0.0]])[2])


def test_long_text_is_cut_before_it_is_embedded(monkeypatch):
    seen = []
    _fake(monkeypatch, seen)
    out = rp.predict("a" * 5000, version="t")
    assert len(seen[0][0]) == rp.MAX_CHARS
    assert out["intent"] in CLASSES and out["router_version"] == "t"


def test_short_text_is_untouched(monkeypatch):
    seen = []
    _fake(monkeypatch, seen)
    rp.predict("how do i hide cash income", version="t")
    assert seen == [["how do i hide cash income"]]


def test_no_message_text_in_the_decision(monkeypatch):
    seen = []
    _fake(monkeypatch, seen)
    secret = "my PAN is ABCDE1234F"
    assert "ABCDE1234F" not in repr(rp.predict(secret, version="t"))


def test_tfidf_class_order_mismatch_fails_at_load(monkeypatch, tmp_path):
    d = tmp_path / "sml" / "models" / "router" / "9.9.9"; d.mkdir(parents=True)
    np.savez(d / "embed_lr.npz", coef=np.zeros((3, 4)), intercept=np.zeros(3), classes=np.array(CLASSES), embed_weight=0.5)
    import joblib
    joblib.dump({"classes": ["other", "advice_seeking", "evasion_request"], "word": None, "char": None, "lr": None}, d / "tfidf_lr.joblib")
    monkeypatch.setattr(rp, "ROOT", tmp_path)
    monkeypatch.delitem(rp._cache, "9.9.9", raising=False)
    with pytest.raises(ValueError, match="class order"):
        rp._load("9.9.9")


def test_models_load_without_pickle():
    z = np.load(ROOT / "sml" / "models" / "router" / rp.DEFAULT_VERSION / "embed_lr.npz", allow_pickle=False)
    assert set(z.files) >= {"coef", "intercept", "classes"}


def test_fresh_clone_without_joblib_falls_back_to_the_pickle_free_export(monkeypatch, tmp_path):
    import shutil
    src = ROOT / "sml" / "models" / "router" / "0.4.1"
    if not (src / "tfidf_head.json").exists():
        pytest.skip("export not present")
    d = tmp_path / "sml" / "models" / "router" / "0.4.1"; d.mkdir(parents=True)
    for f in ("embed_lr.npz", "tfidf_head.json", "tfidf_head.npz"):                       # everything EXCEPT tfidf_lr.joblib
        shutil.copy(src / f, d / f)
    monkeypatch.setattr(rp, "ROOT", tmp_path)
    monkeypatch.delitem(rp._cache, "0.4.1", raising=False); monkeypatch.delitem(rp._cache, "0.4.1|export", raising=False)
    monkeypatch.setattr(rp, "embed_batch", lambda texts, model=None: [[0.3, -0.1, 0.5, 0.2] + [0.0] * 1020 for _ in texts])
    out = rp.predict("how do i hide cash income from tax", "0.4.1")
    assert out["intent"] in ("evasion_request", "advice_seeking", "concept_explainer", "regulation_question") and out["router_version"] == "0.4.1"


def test_router_embeds_with_its_own_model_even_when_retrieval_uses_another(monkeypatch):
    """Switching the retrieval embedding model (RAG_EMBED_MODEL, B14) must not break the router: it was trained on mxbai vectors."""
    import config
    seen = []; seen_models.clear()
    _fake(monkeypatch, seen)
    monkeypatch.setattr(config, "EMBED_MODEL", "bge-m3")
    monkeypatch.setitem(rp._cache, "t", (*rp._cache["t"][:6], "mxbai-embed-large"))
    rp.predict("hello there", version="t")
    assert seen_models[-1] == "mxbai-embed-large"
