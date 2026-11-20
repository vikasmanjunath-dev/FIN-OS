"""PULSE offline replay harness (G2). Every number here comes from SYNTHETIC logs with a known best widget: this tests the harness, it says nothing about FIN-OS users."""
import importlib.util, json, random, shutil, subprocess, sys
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("pulse_replay", ROOT / "sml" / "tools" / "pulse" / "replay.py")
P = importlib.util.module_from_spec(spec); sys.modules["pulse_replay"] = P; spec.loader.exec_module(P)
ORDER = P.PINNED + ["moneyScore", "taxDashboard", "debtFreedomPlanner", "goalCards", "savingsRateMeter", "newsWidget"]


def test_pinned_list_matches_the_real_rule_ranker():
    if shutil.which("node") is None: pytest.skip("node not installed")
    js = "const R=require(process.argv[1]);process.stdout.write(JSON.stringify(R.PINNED));"
    assert json.loads(subprocess.run(["node", "-e", js, str(ROOT / "js" / "arya-pulse-rank.js")], capture_output=True, text=True, check=True).stdout) == P.PINNED


def test_safety_net_build_order_and_violations():
    o = P.build_order("debtFreedomPlanner", ORDER)
    assert o[:2] == P.PINNED and o[2] == "debtFreedomPlanner" and sorted(o) == sorted(ORDER) and P.check_order(o, ORDER) == []
    assert P.check_order(P.build_order("moneyScore", ORDER), ORDER) == []                        # choosing the rule's own first widget changes nothing
    bad = list(ORDER); bad[0], bad[1] = bad[1], bad[0]; assert any("pinned" in v for v in P.check_order(bad, ORDER))
    far = ORDER[:2] + ["newsWidget"] + [w for w in ORDER[2:] if w != "newsWidget"]; assert any("top-K" in v for v in P.check_order(far, ORDER))
    demoted = ORDER[:2] + ["taxDashboard", "debtFreedomPlanner", "goalCards", "moneyScore"] + ORDER[6:]; v = P.check_order(demoted, ORDER)
    assert any("demoted" in x for x in v) and any("floor" in x for x in v)
    assert P.check_order(ORDER[:-1], ORDER) == ["not a permutation of the rule order"] or "not a permutation" in P.check_order(ORDER[:-1], ORDER)[0]


def test_candidates_are_only_the_rule_top_k_and_never_pinned():
    assert P.candidates(ORDER, 3) == ["moneyScore", "taxDashboard", "debtFreedomPlanner"] and not set(P.candidates(ORDER, 10)) & set(P.PINNED)


def test_estimators_recover_the_known_tap_rates_and_the_bandit_finds_the_best_widget():
    rows, rates = P.synthetic_log(n=6000, seed=3)
    r = P.evaluate(rows, seed=2)
    rule = r["rule_on_test"]; assert rule["identifiable"] and rule["snips_ci95"][0] <= rates["moneyScore"] <= rule["snips_ci95"][1]          # rule shows moneyScore (true rate 0.06)
    for name, est in r["learned_on_test"].items():
        assert est["identifiable"] and est["snips_ci95"][0] <= rates["debtFreedomPlanner"] <= est["snips_ci95"][1], name                      # learned policy = the true best widget (0.30)
    up = r["uplift_vs_rule_on_test"]["epsgreedy"]; assert up["interval_above_zero"] is True and up["ips_diff"] > 0.15
    assert all(v["safety_violations"] == 0 for v in r["replay_on_train"].values())
    assert r["gate_for_live_use"]["met"] is False


def test_a_deterministic_rule_only_log_cannot_say_anything_about_other_orders():
    rows = [{"rule_order": ORDER, "featured": "moneyScore", "propensity": 1.0, "tap": int(i % 15 == 0)} for i in range(1000)]
    assert P.estimate(rows, P.Rule())["identifiable"] is True
    g = P.Greedy(); g.s["debtFreedomPlanner"], g.n["debtFreedomPlanner"] = 90, 100
    e = P.estimate(rows, g); assert e["identifiable"] is False and "NOT IDENTIFIABLE" in e["note"]


def test_replay_warns_when_logging_was_not_uniform_and_checks_it():
    rows, _ = P.synthetic_log(n=500, eps=0.5); assert P.uniform_logging(rows) is False
    uni, _ = P.synthetic_log(n=500, eps=1.0); assert P.uniform_logging(uni) is True
    assert "warning" in P.evaluate(rows)


def test_log_loading_drops_malformed_rows_and_asks_the_real_ranker_for_ctx_orders(tmp_path):
    ctx = {"month": 2, "income": 100000, "expense": 60000, "debt": 0, "emergencyFund": 0, "sip": 0, "goals": 0, "policies": 0, "holdings": 0, "txns": 0, "netWorth": 0, "gap80c": 150000, "age": 30, "retireAge": 60}
    lines = [{"ctx": ctx, "featured": "taxDashboard", "propensity": 0.5, "tap": 1}, {"rule_order": ORDER, "featured": "moneyScore", "propensity": 0.0, "tap": 1}, {"rule_order": ORDER, "featured": "x", "propensity": 0.5, "tap": 2}, {"featured": "x"}]
    p = tmp_path / "l.jsonl"; p.write_text("\n".join(json.dumps(x) for x in lines) + "\nnot json\n".replace("not json\n", ""), encoding="utf-8")
    if shutil.which("node") is None: pytest.skip("node not installed")
    rows = P.load_log(p); assert len(rows) == 1 and rows[0]["rule_order"][:2] == P.PINNED and "taxDashboard" in rows[0]["rule_order"]


def test_counters_view_says_what_aggregates_can_and_cannot_show():
    out = P.from_counters({"widgets": {"a": {"imp": 100, "tap": 10, "pos_sum": 250, "top_imp": 0, "top_tap": 0}, "b": {"imp": 0, "tap": 0, "pos_sum": 0, "top_imp": 0, "top_tap": 0}}})
    assert list(out["widgets"]) == ["a"] and out["widgets"]["a"]["tap_rate"] == 0.1 and out["widgets"]["a"]["avg_position"] == 2.5 and out["widgets"]["a"]["wilson95"][0] < 0.1 < out["widgets"]["a"]["wilson95"][1]
    assert "propensity" in out["note"]


def test_nothing_in_the_app_reads_or_writes_these_logs():
    for p in list((ROOT / "js").glob("*.js")) + list((ROOT / "html").glob("*.html")):
        t = p.read_text(encoding="utf-8", errors="ignore")
        assert "pulse/replay" not in t and "pulse_replay" not in t, p
