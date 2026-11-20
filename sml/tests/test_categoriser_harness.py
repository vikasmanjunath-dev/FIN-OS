"""Categoriser harness plumbing (ROADMAP I1): row validation, privacy rejection, metric maths, baseline through node. Synthetic rows only; no performance is claimed."""
import importlib.util, json, shutil, sys
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("cat_harness", ROOT / "sml" / "categoriser" / "harness.py")
H = importlib.util.module_from_spec(spec); sys.modules["cat_harness"] = H; spec.loader.exec_module(H)


def row(desc, cat="Other", bucket="100-500", direction="debit", **kw):
    return json.dumps({"description": desc, "amount_bucket": bucket, "direction": direction, "channel": "upi", "category": cat, "source": "synthetic-test", **kw})


def test_rows_with_personal_looking_descriptions_are_rejected(tmp_path):
    bad = ["pay to 9876543210", "refund to ravi.kumar@okhdfc", "mail a.b@example.com", "PAN ABCDE1234F fee", "acct 1234 5678 9012", "ref ١٢٣٤", "card 4111 1111 1111 1111"]
    p = tmp_path / "r.jsonl"; p.write_text("\n".join([row("SWIGGY ORDER", "Food & Dining")] + [row(b) for b in bad]) + "\n", encoding="utf-8")
    rows, errs = H.load_rows(p)
    assert len(rows) == 1 and len(errs) == len(bad), errs


def test_bad_category_bucket_and_direction_are_rejected(tmp_path):
    p = tmp_path / "r.jsonl"
    p.write_text("\n".join([row("x", "Nonsense"), row("x", "Other", bucket="12345"), row("x", "Other", direction="sideways"), "not json", row("ok", "Health")]) + "\n")
    rows, errs = H.load_rows(p)
    assert [r["description"] for r in rows] == ["ok"] and len(errs) == 4


def test_metrics_on_known_predictions():
    rows = [{"category": c, "source": "s"} for c in ["Food & Dining", "Food & Dining", "Groceries", "Other"]]
    res = H.evaluate(rows, ["Food & Dining", "Groceries", "Groceries", "Other"])
    assert res["n"] == 4 and res["coverage"] == 0.75 and res["accuracy_all_rows"] == 0.75 and res["accuracy_on_covered_rows"] == 0.6667
    assert res["per_category"]["Groceries"]["precision"] == 0.5 and res["per_category"]["Food & Dining"]["recall"] == 0.5
    assert res["gate_C"]["met"] is False                                       # 4 rows can never meet a >= 300 row gate


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_baseline_is_the_apps_own_rule_function():
    out = H.baseline(["Swiggy order", "BIGBASKET", "uber trip", "something unknown"])
    assert out == ["Food & Dining", "Groceries", "Transport", "Other"]


def test_fixture_is_valid_and_marked_synthetic():
    rows, errs = H.load_rows(ROOT / "sml" / "categoriser" / "fixtures" / "plumbing.jsonl")
    assert not errs and rows and all(r["source"].startswith("synthetic") for r in rows)


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_rows_made_by_the_in_app_export_pass_the_harness_privacy_check(tmp_path):
    """I2 export (js/sml/categoriser-export.js) and the Python harness must agree on what a safe row is."""
    import subprocess
    raw = [{"amount": a, "type": "debit", "category": c, "description": d} for a, c, d in [
        (450, "Food & Dining", "SWIGGY ORDER 88123"), (120, "Transport", "UPI to ravi.k@okhdfc 9876543210 ref 1234567"), (2500, "Shopping", "AMAZON PAY 1234 5678 9012"),
        (60, "Groceries", "kirana mohan 98765 43210"), (15000, "Housing", "Rent PAN ABCDE1234F sharma"), (800, "Health", "Dr. Mehta clinic ٣٤٥٦٧٨٩")]]
    js = "const X=require(process.argv[1]);const r=X.buildRows(JSON.parse(require('fs').readFileSync(0,'utf8')));process.stdout.write(X.toJsonl(r.rows));"
    out = subprocess.run(["node", "-e", js, str(ROOT / "js" / "sml" / "categoriser-export.js")], input=json.dumps(raw), capture_output=True, text=True, check=True).stdout
    p = tmp_path / "rows.jsonl"; p.write_text(out + "\n", encoding="utf-8")
    rows, errs = H.load_rows(p)
    assert len(rows) == 6 and not errs, errs
