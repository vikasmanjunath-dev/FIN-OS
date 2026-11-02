"""The label-review tool: stratified reproducible sample, no original label in the reviewer sheet, kappa and agreement maths. Datasets are only read."""
import csv, importlib.util, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("review_sheet", ROOT / "sml" / "tools" / "review_sheet.py")
RS = importlib.util.module_from_spec(spec); sys.modules["review_sheet"] = RS; spec.loader.exec_module(RS)


def test_sheet_hides_labels_and_is_reproducible(tmp_path):
    n = RS.make(["test_v6"], 52, 7, tmp_path / "a"); RS.make(["test_v6"], 52, 7, tmp_path / "b")
    assert n == 52 and (tmp_path / "a" / "sheet.csv").read_text() == (tmp_path / "b" / "sheet.csv").read_text()
    sheet = list(csv.DictReader(open(tmp_path / "a" / "sheet.csv", encoding="utf-8"))); key = list(csv.DictReader(open(tmp_path / "a" / "key.csv", encoding="utf-8")))
    assert set(sheet[0]) == {"id", "text", "label", "unsure"} and all(r["label"] == "" for r in sheet)
    assert {r["original_label"] for r in key} == set(RS.INTENTS)                      # stratified: every intent is present
    assert max(sum(r["original_label"] == c for r in key) for c in RS.INTENTS) <= 4  # 52 // 13


def test_kappa_and_wilson():
    assert RS.kappa(list("aabb"), list("aabb")) == 1.0
    assert abs(RS.kappa(list("aabb"), list("abab"))) < 1e-9 or RS.kappa(list("aabb"), list("abab")) <= 0.0
    lo, hi = RS.wilson(50, 100); assert 0.39 < lo < 0.41 and 0.59 < hi < 0.61


def test_score_finds_disagreements_and_rejects_bad_labels(tmp_path):
    RS.make(["test_v6"], 26, 3, tmp_path)
    key = list(csv.DictReader(open(tmp_path / "key.csv", encoding="utf-8")))
    def fill(path, flip):
        rows = list(csv.DictReader(open(tmp_path / "sheet.csv", encoding="utf-8")))
        for r, k in zip(rows, key):
            r["label"] = "smalltalk" if (int(r["id"]) in flip and k["original_label"] != "smalltalk") else k["original_label"]
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["id", "text", "label", "unsure"]); w.writeheader(); w.writerows(rows)
    fill(tmp_path / "a.csv", set()); fill(tmp_path / "b.csv", {1, 2, 3})
    res = RS.score(tmp_path / "key.csv", [tmp_path / "a.csv", tmp_path / "b.csv"])
    assert res["reviewers"]["a.csv"]["rate"] == 1.0 and res["reviewers"]["b.csv"]["rate"] < 1.0
    assert 0 < res["kappa_between_first_two"] < 1 and 1 <= len(res["to_adjudicate"]) <= 3
    bad = tmp_path / "bad.csv"; bad.write_text("id,text,label,unsure\n1,x,not_an_intent,\n", encoding="utf-8")
    try: RS.score(tmp_path / "key.csv", [bad]); raise AssertionError("bad label accepted")
    except SystemExit: pass
