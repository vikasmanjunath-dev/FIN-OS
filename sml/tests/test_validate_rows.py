"""The categoriser contributor-file validator, with DELIBERATELY DIRTY files. Every dirty value below is invented."""
import importlib.util, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("validate_rows", ROOT / "sml" / "tools" / "categoriser" / "validate_rows.py")
V = importlib.util.module_from_spec(spec); sys.modules["validate_rows"] = V; spec.loader.exec_module(V)


def row(desc="SWIGGY ORDER", **kw): return dict({"description": desc, "amount_bucket": "100-500", "direction": "debit", "channel": "upi", "category": "Food & Dining", "source": "p1"}, **kw)


CLEAN = ["SWIGGY ORDER", "BIGBASKET GROCERIES", "Uber trip", "NETFLIX", "kirana store", "Apollo pharmacy", "रिलायंस फ्रेश", "Zomato", "Metro card recharge", "HP petrol pump"]
DIRTY = {
    "phone number": ["call 9876543210", "to +91 98765 43210", "98765-43210 recharge", "tel 09876543210"],
    "e-mail address": ["mail ravi.k@example.com"],
    "UPI handle": ["pay ravi@okhdfc", "to sneha.s@ybl"],
    "PAN": ["fee ABCDE1234F", "pan abcde1234f"],
    "Aadhaar-like number": ["id 1234 5678 9012", "uid 1234-5678-9012"],
    "long digit run (5+)": ["acct 123456", "card 4111111111111111"],
    "date": ["paid on 2026-10-05", "due 05/10/2026", "5 Oct 2026 rent", "Oct 5 emi", "5th October", "12-12-24"],
    "order / reference id": ["OD123456789", "ORD 4455", "Ref No 482917", "UTR: 99887", "txn#1234", "INV-2026-889"],
    "non-ASCII digit": ["ref ٣٤٥", "नंबर ९८७६"],
}


def test_clean_rows_pass_and_every_dirty_description_is_rejected_for_the_right_reason():
    for d in CLEAN: assert V.check_row(row(d)) == [], d
    for reason, descs in DIRTY.items():
        for d in descs:
            why = V.check_row(row(d)); assert why, f"accepted dirty text: {d!r}"
            assert any(reason in w for w in why) or reason == "long digit run (5+)" and why, (d, why)


def test_structure_errors_are_rejected():
    assert any("extra field" in w for w in V.check_row(row(date="2026-10-05"))) and any("extra field" in w for w in V.check_row(row(amount=450)))
    assert any("missing" in w for w in V.check_row({"description": "x"})) and V.check_row("x") == ["not a JSON object"]
    assert any("category" in w for w in V.check_row(row(category="Fun")))
    assert any("amount_bucket" in w for w in V.check_row(row(amount_bucket="450")))
    assert any("direction" in w for w in V.check_row(row(direction="out"))) and any("channel" in w for w in V.check_row(row(channel="paytm")))
    assert any("source" in w for w in V.check_row(row(source="Ravi Kumar 9876543210")))
    assert any("empty" in w for w in V.check_row(row(" "))) and any("longer" in w for w in V.check_row(row("x" * 81)))


def test_file_level_report_duplicates_counts_and_exit_code(tmp_path, capsys):
    f = tmp_path / "rows.jsonl"
    lines = [json.dumps(row("SWIGGY ORDER")), json.dumps(row("SWIGGY ORDER")), "not json", json.dumps(row("call 9876543210")), json.dumps(row("Uber trip", category="Transport", source="p2")), ""]
    f.write_text("\n".join(lines), encoding="utf-8")
    acc, rej = V.validate_file(f)
    assert len(acc) == 2 and [i for i, _ in rej] == [2, 3, 4]
    assert any("duplicate" in w for w in rej[0][1]) and rej[1][1] == ["not valid JSON"]
    clean = tmp_path / "clean.jsonl"
    code = V.main([str(f), "--write-clean", str(clean)]); out = capsys.readouterr().out
    assert code == 1 and "TOTAL accepted 2 of target 1000" in out and "Food & Dining" in out and "p2" in out and "9876543210" not in out        # the offending text is never echoed
    assert len(clean.read_text().splitlines()) == 2
    ok = tmp_path / "ok.jsonl"; ok.write_text(json.dumps(row("Zomato")) + "\n", encoding="utf-8"); assert V.main([str(ok)]) == 0


def test_rows_the_in_app_export_produces_pass(tmp_path):
    import shutil, subprocess
    if shutil.which("node") is None: return
    raw = [{"amount": 450, "type": "debit", "category": "Food & Dining", "description": "SWIGGY ORDER 88123"}, {"amount": 120, "type": "debit", "category": "Transport", "description": "Uber trip"},
           {"amount": 900, "type": "debit", "category": "Shopping", "description": "Amazon Pay 123"}]
    js = "const X=require(process.argv[1]);const r=X.buildRows(JSON.parse(require('fs').readFileSync(0,'utf8')));process.stdout.write(X.toJsonl(r.rows));"
    out = subprocess.run(["node", "-e", js, str(ROOT / "js" / "sml" / "categoriser-export.js")], input=json.dumps(raw), capture_output=True, text=True, check=True).stdout
    f = tmp_path / "app.jsonl"; f.write_text(out + "\n", encoding="utf-8"); acc, rej = V.validate_file(f)
    assert len(acc) + len(rej) == 3
    # the export masks 5+ digit runs as [NUM]; the validator accepts the masked token because it carries no digits
    assert not any("long digit run" in w for _, ws in rej for w in ws)
