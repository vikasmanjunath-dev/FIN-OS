"""Golden set (B18): item well-formedness, anchors still present in the local index, and the comparison maths. Retrieval itself is not run here (it needs the server)."""
import importlib.util, json, sys
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("golden_harness", ROOT / "sml" / "eval" / "golden" / "harness.py")
H = importlib.util.module_from_spec(spec); sys.modules["golden_harness"] = H; spec.loader.exec_module(H)
CATS = {"tax", "mutual_funds", "insurance", "debt", "equity", "regulation", "principle", "app", "other"}


def test_items_are_well_formed_unique_and_not_copied_from_their_chunk():
    items = H.load_items()
    assert len(items) >= 90 and len({i["id"] for i in items}) == len(items) and len({H.norm(i["question"]) for i in items}) == len(items)
    for i in items:
        assert {"id", "question", "gold_anchor", "gold_doc_title", "must_contain", "category"} <= set(i) and i["category"] in CATS
        assert 4 <= len(i["gold_anchor"].split()) <= 16 and i["must_contain"]


@pytest.mark.skipif(not (ROOT / "rag-engine" / "rag_bm25.db").exists() or (ROOT / "rag-engine" / "rag_bm25.db").stat().st_size < 1_000_000, reason="local index not present or empty (the tracked stub is 24 KB)")
def test_every_anchor_is_present_in_the_local_index_and_no_question_copies_its_chunk(capsys):
    rep = H.check(); capsys.readouterr()
    assert rep["missing_anchor"] == [] and rep["question_copies_chunk"] == [] and rep["duplicate_questions"] == []


def test_wilson_and_paired_compare(tmp_path):
    lo, hi = H.wilson(93, 100); assert 0.86 < lo < 0.88 and 0.96 < hi < 0.98
    a = {"items": [{"id": str(i), "rank": 1 if i < 80 else None} for i in range(100)]}
    b = {"items": [{"id": str(i), "rank": 1 if i < 90 else None} for i in range(100)]}
    (tmp_path / "a.json").write_text(json.dumps(a)); (tmp_path / "b.json").write_text(json.dumps(b))
    r = H.compare(tmp_path / "a.json", tmp_path / "b.json")
    assert r["diff_b_minus_a"] == 0.1 and r["only_b"] == 10 and r["only_a"] == 0 and r["ci95"][0] > 0
