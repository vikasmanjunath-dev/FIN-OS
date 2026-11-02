"""The no-pickle TF-IDF head must give the same probabilities as the sklearn model it was exported from (ROADMAP C21).
Skipped when the git-ignored joblib / export files are not on this machine (retrain, then run sml/training/export_tfidf.py)."""
import json, sys
from pathlib import Path
import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "sml" / "runtime"))
import tfidf_head as H  # noqa: E402

VER = ROOT / "sml" / "models" / "router" / "0.4.1"
need = pytest.mark.skipif(not ((VER / "tfidf_lr.joblib").exists() and (VER / "tfidf_head.json").exists() and (VER / "tfidf_head.npz").exists()),
                          reason="router 0.4.1 joblib or its export is not present")
EDGE = ["", "   ", "a", "ok", "हिंदी", "बेनामी संपत्ति कैसे खरीदें", "mera EMI kitna hai???", "tab\tseparated\nlines", "😀 market", "x" * 600,
        "UPPER lower MiXeD", "naïve café", "1,25,000 ₹ per month", "see ya_there __init__"]


def _texts():
    out = list(EDGE)
    for p in sorted((ROOT / "sml" / "data").glob("*.jsonl")):
        out += [json.loads(l)["text"] for l in p.read_text().splitlines() if l.strip()]
    return out


@need
def test_export_matches_sklearn_on_every_dataset_row_and_edge_cases():
    import joblib
    from scipy.sparse import hstack
    tf = joblib.load(VER / "tfidf_lr.joblib"); h = H.TfidfHead.load(VER)
    texts = _texts()
    ref = tf["lr"].predict_proba(hstack([tf["word"].transform(texts), tf["char"].transform(texts)]).tocsr())
    mine = np.array([h.proba(t) for t in texts])
    assert h.classes == [str(c) for c in tf["classes"]]
    assert np.abs(ref - mine).max() < 1e-6
    assert (ref.argmax(1) == mine.argmax(1)).all()


@need
def test_export_files_load_without_pickle_and_have_the_documented_shape():
    z = np.load(VER / "tfidf_head.npz", allow_pickle=False)
    j = json.loads((VER / "tfidf_head.json").read_text())
    assert z["coef"].shape == (len(j["meta"]["classes"]), len(j["vocab_word"]) + len(j["vocab_char"]))
    assert len(j["idf_word"]) == len(j["vocab_word"]) and len(j["idf_char"]) == len(j["vocab_char"])


def test_analysers_follow_the_sklearn_rules():
    assert H.word_terms("Hello, World 7 a") == ["hello", "world", "hello world"]          # one-letter tokens and digits-only singles are dropped
    assert H.char_wb_terms("ab")[:3] == [" a", "ab", "b "]                                  # padded with spaces, 2-grams first
    assert H.word_terms("") == [] and H.char_wb_terms("") == []


@need
def test_predictor_gives_the_same_decision_with_either_head(monkeypatch):
    import router_predict as rp
    monkeypatch.setattr(rp, "embed_batch", lambda texts, model=None: [[0.3, -0.1, 0.5, 0.2] + [0.0] * 1020 for _ in texts])
    for t in ("how do i hide cash income from tax", "mera EMI kitna hai", "बेनामी संपत्ति कैसे खरीदें"):
        a = rp.predict(t, "0.4.1"); b = rp.predict(t, "0.4.1", tfidf_source="export")
        assert a["intent"] == b["intent"] and a["needs_guard"] == b["needs_guard"]
        assert abs(a["confidence"] - b["confidence"]) < 1e-3 and abs(a["high_risk_mass"] - b["high_risk_mass"]) < 1e-3
