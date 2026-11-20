"""Gate-set builder and kappa for the claim labelling tool (D9). SYNTHETIC pool and labels only: no real judgement is made or implied."""
import importlib.util, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("claims_report", ROOT / "sml" / "tools" / "claims" / "claims_report.py")
CR = importlib.util.module_from_spec(spec); sys.modules["claims_report"] = CR; spec.loader.exec_module(CR)
bp = importlib.util.spec_from_file_location("build_pool", ROOT / "sml" / "tools" / "claims" / "build_pool.py")


def row(i, pool="new", **kw):
    return dict({"claim_id": f"c{i:04d}", "pool": pool, "qid": f"Q{i}", "question": "q", "evidence": [{"title": "t", "text": "x"}], "claim": f"claim {i} here ok", "answer_index": 0}, **kw)


def test_kappa_known_values():
    assert CR.kappa(list("aabb"), list("aabb")) == 1.0 and CR.kappa(list("aabb"), list("bbaa")) == -1.0 and CR.kappa([], []) is None
    assert abs(CR.kappa(list("aabbaabb"), list("aabbaaba")) - 0.75) < 1e-9


def test_gate_set_files_in_verifier_format_leave_out_unsure_and_never_invent(tmp_path):
    pool = [row(i) for i in range(1, 7)] + [row(7, "existing", existing_idx=0), row(8, "existing", existing_idx=1)]
    labels = {"c0001": "supported", "c0002": "not_supported", "c0003": "unsure", "c0004": "supported", "c0007": "supported", "c0008": "not_supported", "zzzz": "supported"}
    A = {0: "supported", 1: "not_supported"}; B = {0: "supported", 1: "supported"}
    decided, out = CR.build(pool, labels, A, B); CR.write(decided, out, tmp_path)
    assert out["unsure"] == 1 and out["decided"] == 5 and out["supported"] == 3 and out["not_supported"] == 2 and out["unknown_claim_ids"] == ["zzzz"]
    assert out["gate"]["met"] is False and out["by_pool"] == {"existing": 2, "new": 3}
    k = out["kappa_vs_earlier_labellers_binary"]; assert k["claims_compared"] == 2 and k["founder_vs_A"] == 1.0 and k["founder_agrees_with_B"] == 1
    claims = [json.loads(l) for l in (tmp_path / "gate_claims_D9.jsonl").read_text().splitlines()]; labs = [json.loads(l) for l in (tmp_path / "gate_labels_D9.jsonl").read_text().splitlines()]
    assert [c["claim_id"] for c in claims] == ["c0001", "c0002", "c0004", "c0007", "c0008"] and [l["idx"] for l in labs] == [0, 1, 2, 3, 4]
    assert [l["label"] for l in labs] == ["supported", "unsupported", "supported", "supported", "unsupported"]
    assert "c0003" not in json.dumps(claims)                                                       # unsure claims are not in the gate set


def test_gate_met_only_with_300_decided_and_100_not_supported():
    pool = [row(i) for i in range(1, 401)]
    labs = {f"c{i:04d}": ("not_supported" if i <= 100 else "supported") for i in range(1, 301)}
    assert CR.build(pool, labs)[1]["gate"]["met"] is True
    labs["c0001"] = "supported"; assert CR.build(pool, labs)[1]["gate"]["met"] is False


def test_earlier_labels_collapse_contradicted_and_unsupported_to_not_supported():
    A, B = CR.earlier_labels()
    assert len(A) == len(B) == 241 and set(A.values()) | set(B.values()) == {"supported", "not_supported"}


def test_pool_builder_dedupes_against_existing_claims_and_numbers_them():
    spec2 = importlib.util.module_from_spec(bp); sys.modules["build_pool"] = spec2
    try:
        bp.loader.exec_module(spec2)
    except ModuleNotFoundError:
        return                                      # httpx / rag-engine not importable in this environment
    ex = [{"pool": "existing", "claim": "Already here.", "evidence": [], "qid": "a", "question": "q", "answer_index": 0}]
    new = [{"pool": "new", "claim": "already here.", "evidence": [], "qid": "b", "question": "q", "answer_index": 0}, {"pool": "new", "claim": "Fresh claim.", "evidence": [], "qid": "b", "question": "q", "answer_index": 1}]
    p = spec2.build(ex, new)
    assert len(p) == 2 and sorted(r["claim_id"] for r in p) == ["c0001", "c0002"] and {r["claim"] for r in p} == {"Already here.", "Fresh claim."}
    assert not any("label" in r for r in p)                                                       # the pool never carries a label
