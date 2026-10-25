"""Guards the W2 verifier data. Run: rag-engine/.venv/bin/pytest sml/tests -q"""
import hashlib, json, re, shutil, sys
from pathlib import Path
import pytest
VER = Path(__file__).resolve().parents[1] / "verifier"
sys.path.insert(0, str(VER))
import gen_claims as G

def load(name): return [json.loads(l) for l in open(VER / f"{name}.jsonl")]
NUMRE = re.compile(r"\d[\d,]*(?:\.\d+)?")

@pytest.fixture(scope="module")
def data(): return load("train"), load("test")

def test_no_page_in_both_splits(data):
    tr, te = data
    assert not ({r["page_key"] for r in tr} & {r["page_key"] for r in te})

def test_unsupported_claims_never_cross_splits_or_come_from_evidence_page(data):
    tr, te = data
    for split in data:
        for r in split:
            if r["label"] == "unsupported":
                assert r["claim_page_key"] != r["page_key"]
    claims_tr = {r["claim"] for r in tr}
    assert not [r for r in te if r["claim"] in claims_tr]

def test_labels_balanced_within_5_percent(data):
    for split in data:
        n = {l: sum(r["label"] == l for r in split) for l in ("entailed", "contradicted", "unsupported")}
        assert min(n.values()) > 100
        assert max(n.values()) <= min(n.values()) * 1.05

def test_entailed_is_in_evidence_and_unsupported_is_lexically_distant(data):
    for split in data:
        for r in split:
            if r["label"] == "entailed": assert r["claim"] in r["evidence"]
            if r["label"] == "unsupported":
                assert r["claim"] not in r["evidence"]
                assert G.jacc(G.content(r["claim"]), G.content(r["evidence"])) < 0.1

def test_every_contradicted_row_differs_from_its_evidence_sentence_by_the_recorded_change(data):
    seen = set()
    for split in data:
        for r in split:
            if r["label"] != "contradicted": continue
            src, cl, ct = r["source_sentence"], r["claim"], r["change_type"]
            seen.add(ct)
            assert src in r["evidence"] and cl != src and cl not in r["evidence"]
            if ct == "number":
                assert NUMRE.sub("#", cl) == NUMRE.sub("#", src)
                assert NUMRE.findall(cl) != NUMRE.findall(src)
            elif ct == "negation":
                assert re.sub(r" not\b", "", cl, count=1) == src
            elif ct == "polarity":
                assert NUMRE.findall(cl) == NUMRE.findall(src)
                assert cl.split() != src.split()
            else:
                pytest.fail(f"unknown change type {ct}")
    assert seen == {"number", "negation", "polarity"}

def test_contradicted_numbers_never_reuse_a_number_the_evidence_contains(data):
    for split in data:
        for r in split:
            if r["label"] == "contradicted" and r["change_type"] == "number":
                new = r["change"].split("->")[1]
                assert new.replace(",", "") not in r["evidence"].replace(",", "")

def test_generation_is_deterministic_and_matches_manifest(tmp_path, monkeypatch):
    shutil.copy(VER / "chunks_cache.jsonl", tmp_path / "chunks_cache.jsonl")
    monkeypatch.setattr(G, "HERE", tmp_path)
    G.main()
    man = json.load(open(VER / "MANIFEST.json"))
    for name in ("train", "test"):
        a = hashlib.sha256((tmp_path / f"{name}.jsonl").read_bytes()).hexdigest()
        assert a == hashlib.sha256((VER / f"{name}.jsonl").read_bytes()).hexdigest() == man["splits"][name]["sha256"]


# ---- W2.4: paraphrased entailed rows and the validation split ----
import experiments as X

def test_val_split_is_by_page_group_inside_train_and_disjoint_from_test(data):
    tr, te = data
    fit, val = X.val_split(tr)
    assert fit and val and len(fit) + len(val) == len(tr)
    assert not ({r["page_key"] for r in fit} & {r["page_key"] for r in val})
    assert not ({r["page_key"] for r in val} & {r["page_key"] for r in te})
    assert {r["label"] for r in val} == {"entailed", "contradicted", "unsupported"}

def test_paraphrased_rows_are_entailed_numeric_safe_and_not_copies():
    for name in ("para_test", "para_val"):
        for r in load(name):
            assert r["label"] == "entailed" and r["change_type"] == "paraphrase"
            assert r["source_claim"] in r["evidence"] and r["claim"] not in r["evidence"]
            assert r["claim"].lower() != r["source_claim"].lower()
            assert sorted(re.findall(r"\d[\d,.]*", r["claim"])) == sorted(re.findall(r"\d[\d,.]*", r["source_claim"]))

def test_paraphrase_sets_do_not_touch_validation_pages_used_to_pick_tau(data):
    tr, te = data
    _, val = X.val_split(tr)
    val_pages = {r["page_key"] for r in val}
    assert not ({r["page_key"] for r in load("para_test")} & val_pages)
    pt = {r["page_key"] for r in load("para_test") if r["origin"] == "test"}
    assert pt <= {r["page_key"] for r in te}
    assert {r["page_key"] for r in load("para_val")} <= val_pages

def test_paraphrase_is_deterministic():
    te = load("test")
    a = [r["claim"] for r in X.build_paraphrases(te)]
    b = [r["claim"] for r in X.build_paraphrases(te)]
    assert a == b and len(a) >= 40
