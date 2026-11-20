"""Local review page and re-score for the draft Hindi/Hinglish golden questions (B23). Synthetic verdicts only: no real verdict is ever filled in by tooling."""
import importlib.util, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
G = ROOT / "sml" / "eval" / "golden"


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path); m = importlib.util.module_from_spec(spec); sys.modules[name] = m; spec.loader.exec_module(m); return m


RP = load("review_page", G / "review_page.py")
RS = load("rescore_review", G / "rescore_review.py")


def test_page_builds_from_stubbed_retrieval_without_network_or_verdicts(tmp_path):
    items = [{"id": "H1-01", "lang": "hi", "category": "tax", "question": "80C की सीमा?", "gold_anchor": "limit is 1.5 lakh", "must_contain": ["1.5"]}]
    chunks = [("Tax Protocol", "The 80C limit is 1.5 lakh per year."), ("Other", "unrelated")]
    data = RP.build_data(items, chunks, retriever=lambda q: [{"doc_title": "Tax Protocol", "text": "The 80C limit is 1.5 lakh per year."}, {"doc_title": "Other", "text": "unrelated"}])
    assert data[0]["gold_title"] == "Tax Protocol" and data[0]["retrieved"][0]["has_anchor"] is True and data[0]["retrieved"][1]["has_anchor"] is False
    html = RP.render(data)
    assert "80C की सीमा?" in html and "verdict" in html
    script = re.sub(r'<script id="data"[\s\S]*?</script>', "", html)
    assert not re.search(r"fetch\(|XMLHttpRequest|sendBeacon|WebSocket|<script[^>]+src=|<link[^>]+href=", script)          # no network code, no external files
    assert "</script><script" not in json.dumps(data) and "<\\/" not in html.split('id="data"')[0]


def test_data_with_script_closing_tag_cannot_break_the_page():
    data = [{"id": "x", "lang": "hi", "category": "o", "question": "</script><b>x", "gold_anchor": "a", "must_contain": [], "gold_title": "t", "gold_text": "a", "retrieved": []}]
    body = RP.render(data).split('<script id="data" type="application/json">')[1].split("</script>")[0]
    assert "</script" not in body and json.loads(body.replace("<\\/", "</"))[0]["question"] == "</script><b>x"


def test_the_built_page_in_the_repo_has_40_questions_and_no_verdicts():
    p = G / "review" / "index.html"
    if not p.exists():
        return
    body = p.read_text(encoding="utf-8").split('<script id="data" type="application/json">')[1].split("</script>")[0]
    data = json.loads(body.replace("<\\/", "</"))
    assert len(data) == 40 and all(len(d["retrieved"]) == 5 for d in data)
    assert not any("verdict" in d or "verdicts" in d for d in data)           # the build never fills a verdict


def test_rescore_counts_only_correct_verdicts_and_excludes_the_rest():
    ranks = {"pipeline_mxbai": {"a": None, "b": 1, "c": None, "d": 2}, "pipeline_bge_m3": {"a": 1, "b": 1, "c": 3, "d": None}}
    v = {"reviewer": "t", "items": {"a": {"verdict": "correct"}, "b": {"verdict": "correct"}, "c": {"verdict": "wrong_gold"}, "d": {"verdict": "bad_question"}, "e": {"verdict": ""}}}
    r = RS.rescore(v, ranks)
    assert r["counted_as_evidence"] == 2 and r["excluded"] == {"c": "wrong_gold", "d": "bad_question"}
    assert r["systems"]["pipeline_mxbai"]["recall@5"] == 0.5 and r["systems"]["pipeline_bge_m3"]["recall@5"] == 1.0 and r["systems"]["pipeline_bge_m3"]["n"] == 2
    p = r["paired_pipeline_bge_m3_minus_pipeline_mxbai_recall@5"]; assert p["diff"] == 0.5 and p["better"] == 1 and p["worse"] == 0


def test_rescore_with_no_correct_verdicts_does_not_crash_or_invent_numbers():
    r = RS.rescore({"items": {}}, {"pipeline_mxbai": {"a": 1}, "pipeline_bge_m3": {"a": 1}})
    assert r["counted_as_evidence"] == 0 and r["systems"]["pipeline_bge_m3"]["recall@5"] is None
