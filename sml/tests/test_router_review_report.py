"""Blind router review: candidate selection, kappa/disagreements, and the guarantee that resolved labels never touch a dataset file. SYNTHETIC reviewer labels only."""
import hashlib, importlib.util, json, random, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "sml" / "data"


def load(name, rel):
    spec = importlib.util.spec_from_file_location(name, ROOT / rel); m = importlib.util.module_from_spec(spec); sys.modules[name] = m; spec.loader.exec_module(m); return m


RR = load("router_review_report", "sml/tools/review/router_review_report.py")
BC = load("build_candidates", "sml/tools/review/build_candidates.py")


def key(i, cur, reason="boundary", s="dev", idx=0): return {"item_id": f"r{i:04d}", "set": s, "row_index": idx, "current_label": cur, "router_0_4_1": cur, "router_0_5_1": cur, "reason": reason}


def test_candidate_selection_finds_disagreements_and_low_confidence_and_adds_seeded_controls():
    rows = [{"set": "dev", "row_index": i, "text": f"t{i}", "intent": "smalltalk"} for i in range(6)]
    A = [("smalltalk", 0.95), ("app_help", 0.95), ("smalltalk", 0.5), ("smalltalk", 0.97), ("smalltalk", 0.99), ("smalltalk", 0.92)]
    B = [("smalltalk", 0.96), ("smalltalk", 0.9), ("smalltalk", 0.9), ("document_help", 0.8), ("smalltalk", 0.99), ("smalltalk", 0.95)]
    picked, ctl = BC.candidates(rows, A, B, random.Random(1), controls=2)
    assert sorted(p["row_index"] for p in picked) == [1, 2, 3] and all(p["reason"] != "control" for p in picked)
    assert {c["row_index"] for c in ctl} <= {0, 4, 5} and len(ctl) == 2 and all(c["reason"] == "control" for c in ctl)
    assert [c["row_index"] for c in BC.candidates(rows, A, B, random.Random(1), controls=2)[1]] == [c["row_index"] for c in ctl]     # seeded


def test_report_kappa_agreement_and_disagreements():
    kk = [key(1, "smalltalk", "control"), key(2, "app_help", "control"), key(3, "advice_seeking"), key(4, "evasion_request"), key(5, "goal_status")]
    labs = {"r0001": "smalltalk", "r0002": "app_help", "r0003": "concept_explainer", "r0004": "evasion_request", "r0005": "unsure"}
    res, dis = RR.report(kk, labs, texts={"r0003": "should i wear a jacket"})
    assert res["unsure"] == 1 and res["vs_current_labels"]["controls_only"]["agreement"] == 1.0 and res["vs_current_labels"]["boundary_only"]["n"] == 2
    assert res["vs_current_labels"]["all"]["agreement"] == 0.75 and res["vs_current_labels"]["all"]["n"] == 4
    assert sorted(d["item_id"] for d in dis) == ["r0003", "r0005"] and dis[0]["text"] == "should i wear a jacket"
    assert res["top_confusions"] == [{"current": "advice_seeking", "reviewer": "concept_explainer", "n": 1}]
    two = RR.report(kk, labs, {"r0001": "smalltalk", "r0002": "smalltalk", "r0003": "concept_explainer", "r0004": "evasion_request"})[0]["reviewer_vs_reviewer"]
    assert two["n"] == 4 and two["agreement"] == 0.75


def test_resolutions_become_a_separate_proposal_and_no_dataset_file_is_modified(tmp_path):
    before = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in D.glob("*.jsonl")}
    kk = [dict(key(1, "out_of_scope", s="test_v8", idx=3)), dict(key(2, "smalltalk", s="dev", idx=5))]
    ch, sk = RR.resolve(kk, [{"item_id": "r0001", "final_label": "advice_seeking"}, {"item_id": "r0002", "final_label": "smalltalk"}, {"item_id": "r0003", "final_label": "x"}, {"item_id": "r0001", "final_label": "not_an_intent"}])
    assert len(ch) == 1 and ch[0] == {"set": "test_v8", "row_index": 3, "text": "", "old_label": "out_of_scope", "new_label": "advice_seeking"} and len(sk) == 2
    assert {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in D.glob("*.jsonl")} == before
    src = (ROOT / "sml" / "tools" / "review" / "router_review_report.py").read_text()
    assert "open(" not in src.replace("opened for writing", "") and ".write_text(" in src                      # writes only through write_text to the report / proposed files
    assert all("D / f\"{" not in line or "read_text" in line for line in src.splitlines() if "D / f\"{" in line)    # sets are only read
