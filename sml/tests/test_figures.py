"""sml/rules/figures.json stays tied to the pages it cites (ROADMAP D10 first slice). A failure means a page changed (update the entry after a CA looks) or an entry is wrong."""
import importlib.util, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("check_figures", ROOT / "sml" / "tools" / "check_figures.py")
CF = importlib.util.module_from_spec(spec); sys.modules["check_figures"] = CF; spec.loader.exec_module(CF)


def test_every_anchor_sentence_is_still_on_its_page():
    res = CF.check()
    assert not [a for a in res["anchors"] if not a["ok"]], [a for a in res["anchors"] if not a["ok"]]


def test_entries_are_well_formed_and_ids_unique():
    es = json.loads((ROOT / "sml" / "rules" / "figures.json").read_text(encoding="utf-8"))["entries"]
    assert len({e["id"] for e in es}) == len(es)
    for e in es:
        assert {"id", "topic", "value", "source", "anchor"} <= set(e) and (ROOT / e["source"]).exists()


def test_the_tax_core_numbers_in_the_table_match_the_code():
    es = {e["id"]: e for e in json.loads((ROOT / "sml" / "rules" / "figures.json").read_text(encoding="utf-8"))["entries"]}
    src = (ROOT / "js" / "finos-taxcore.js").read_text(encoding="utf-8")
    assert "NEW_REBATE_LIMIT = %d" % es["new_regime_nil_to_12l"]["numeric"] in src
    assert "CESS = %s" % ("0.0%d" % es["cess"]["numeric"]) in src
