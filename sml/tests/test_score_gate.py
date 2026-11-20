"""score_gate: exact bounds and the three-way gate call, on synthetic labels. Reads no founder data."""
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location("sg", Path(__file__).resolve().parents[1] / "verifier" / "score_gate.py")
S = importlib.util.module_from_spec(spec); spec.loader.exec_module(S)


def test_bounds_known_values():
    lo, hi = S.bounds(50, 100); assert 0.41 < lo < 0.43 and 0.57 < hi < 0.59            # one-sided 95% each side
    assert S.bounds(0, 10)[0] == 0.0 and S.bounds(10, 10)[1] == 1.0 and S.bounds(0, 0) == (0.0, 1.0)


def _case(tp, fp, fn, tn):
    gold, pred, i = {}, {}, 0
    for n, g, p in ((tp, 1, 1), (fp, 0, 1), (fn, 1, 0), (tn, 0, 0)):
        for _ in range(n): gold[i] = bool(g); pred[i] = bool(p); i += 1
    return S.score(gold, pred)


def test_three_way_call():
    assert _case(180, 6, 10, 800)["call"] == "GO"            # P .968, R .947 on 190 negatives
    assert _case(15, 5, 25, 300)["call"] == "NO-GO"          # P .75, R .375
    assert _case(9, 1, 1, 60)["call"] == "NEED MORE"         # looks good but only 10 negatives


def test_judge_pool_verdict_parsing():
    spec2 = importlib.util.spec_from_file_location("jp", Path(__file__).resolve().parents[1] / "verifier" / "judge_pool.py")
    J = importlib.util.module_from_spec(spec2); spec2.loader.exec_module(J)
    assert J.verdict("Step 3: VERDICT: SUPPORTED.") == "supported" and J.verdict("VERDICT: UNSUPPORTED") == "unsupported"   # UNSUPPORTED must not match SUPPORTED
    assert J.verdict("<think>x</think>VERDICT: CONTRADICTED") == "contradicted" and J.verdict("no idea") == "error"
