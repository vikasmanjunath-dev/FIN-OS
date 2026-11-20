"""Action ladder (note / block): pure decision rule and the recorded evidence in ladder.json. No models, no network."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "sml" / "runtime"))
import ladder  # noqa: E402

L = {"t_note": 0.30, "t_block": 0.60}
d = lambda intent, mass: {"intent": intent, "high_risk_mass": mass}


def test_advice_gets_a_note_never_a_block():
    r = ladder.decide(d("advice_seeking", 0.95), L)
    assert (r["action"], r["kind"]) == ("note", "advice")


def test_evasion_note_below_block_and_block_above():
    assert ladder.decide(d("evasion_request", 0.45), L)["action"] == "note"
    assert ladder.decide(d("evasion_request", 0.45), L)["kind"] == "unlawful"
    r = ladder.decide(d("evasion_request", 0.60), L)
    assert (r["action"], r["kind"]) == ("block", "unlawful")


def test_below_note_threshold_and_other_intents_do_nothing():
    assert ladder.decide(d("advice_seeking", 0.29), L)["action"] == "none"
    assert ladder.decide(d("concept_explainer", 0.99), L)["action"] == "none"     # high mass behind another predicted class: no action
    assert ladder.decide(d("out_of_scope", 0.70), L)["reason"] == "not_high_risk"


def test_missing_ladder_or_bad_decision_is_none_not_an_error():
    assert ladder.load("0.0.0") is None
    assert ladder.decide(d("evasion_request", 0.99), {})["action"] == "none"       # empty ladder = no ladder
    assert ladder.decide(None, L)["action"] == "none"
    assert ladder.decide({"intent": "evasion_request"}, L)["action"] == "none"    # no mass
    assert ladder.decide({}, L)["action"] == "none"


def test_ladder_json_is_valid_and_within_the_founders_targets():
    j = json.loads((ROOT / "sml" / "models" / "router" / ladder.LADDER_VERSION / "ladder.json").read_text())
    assert 0 < j["t_note"] <= j["t_block"] <= 1
    assert j["targets"]["note_false_alarm"] == 0.05 and j["targets"]["block_false_alarm"] == 0.02
    dev = j["dev"]
    assert dev["note_false_alarm"] <= 0.05 and dev["block_false_alarm"] <= 0.02 and dev["block_precision"] >= 0.95
    assert dev["n"] >= 800 and "CANDIDATE" in j["status"]                          # still a candidate until a new sealed set confirms it
    assert ladder.load()["t_block"] == j["t_block"]


def test_decision_is_pure_and_does_not_mutate_its_input():
    x = d("evasion_request", 0.9); before = dict(x)
    ladder.decide(x, L)
    assert x == before
