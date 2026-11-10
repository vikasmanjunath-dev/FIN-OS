"""extend_pool.step_append must keep every existing row and claim_id byte-identical (founder labels are keyed by claim_id), skip duplicate claims, and number new rows after the max id."""
import importlib.util, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("extend_pool", ROOT / "sml" / "tools" / "claims" / "extend_pool.py")
EP = importlib.util.module_from_spec(spec); spec.loader.exec_module(EP)


def test_append_keeps_existing_and_dedupes(tmp_path, monkeypatch):
    old = [{"claim_id": "c0001", "claim": "STT on futures is 0.02%.", "pool": "existing"}, {"claim_id": "c0007", "claim": "Second claim here ok.", "pool": "new"}]
    pool, raw = tmp_path / "pool.jsonl", tmp_path / "raw.jsonl"
    pool.write_text("".join(json.dumps(r) + "\n" for r in old)); before = pool.read_text()
    raw.write_text(json.dumps({"qid": "x1", "rows": [{"claim": "stt on futures is 0.02%.", "qid": "x1"}, {"claim": "A brand new claim sentence.", "qid": "x1"}, {"claim": "Another fresh claim sentence.", "qid": "x1"}]}) + "\n")
    monkeypatch.setattr(EP, "POOL", pool); monkeypatch.setattr(EP, "CFILE", raw)
    EP.step_append(seed=3)
    text = pool.read_text(); assert text.startswith(before)               # existing bytes untouched
    new = [json.loads(l) for l in text[len(before):].splitlines()]
    assert sorted(r["claim_id"] for r in new) == ["c0008", "c0009"]       # duplicate dropped, ids continue after the max
