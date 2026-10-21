"""Guards the router evaluation against leakage. Run: rag-engine/.venv/bin/pytest sml/tests -q"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "data"))
import router_data as R


def _rows():
    return R.build()


def test_templates_never_cross_train_and_valid():
    tr, va, _ = _rows()
    assert not ({r["template"] for r in tr} & {r["template"] for r in va})


def test_natural_test_text_never_appears_in_training():
    tr, va, na = _rows()
    seen = {r["text"].lower() for r in tr + va}
    assert not [r["text"] for r in na if r["text"].lower() in seen]


def test_every_intent_present_in_every_split_and_balanced_natural():
    tr, va, na = _rows()
    for split in (tr, va, na):
        assert {r["intent"] for r in split} == set(R.INTENTS)
    assert {sum(1 for r in na if r["intent"] == i) for i in R.INTENTS} == {10}


def test_generation_is_deterministic():
    a, b = R.build(), R.build()
    assert a == b


def test_high_risk_intents_are_marked():
    tr, _, _ = _rows()
    assert {r["risk"] for r in tr if r["intent"] in ("advice_seeking", "evasion_request")} == {"high"}
