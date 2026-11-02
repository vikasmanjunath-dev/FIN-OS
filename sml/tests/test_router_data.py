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


# ── v2 sets (written by independent agents, merged by ingest_incoming.py) ─────────────────────────────────────
import re
_D = Path(__file__).resolve().parents[1] / "data"


def _load(name):
    p = _D / name
    return [json.loads(l) for l in p.read_text().splitlines() if l.strip()] if p.exists() else []


def _n(s): return re.sub(r"\s+", " ", s.strip().lower())


_TRAIN_FILES = ("train.jsonl", "train_extra.jsonl", "train_extra2.jsonl")
_MODEL_SELECTION_FILES = ("valid.jsonl", "dev.jsonl", "dev3.jsonl")          # may be fit on in the final refit and used to choose settings; never reported as test results


def _all_sets():
    """Every dataset file under sml/data, found on disk, so a new test_v7.jsonl is guarded without anyone editing this list (F11)."""
    return sorted(p.name for p in _D.glob("*.jsonl"))


def _held_out_sets():
    return [f for f in _all_sets() if f not in _TRAIN_FILES]


def test_every_dataset_file_is_listed_in_the_manifest_with_its_current_hash():
    import hashlib
    man = json.loads((_D / "MANIFEST.json").read_text())["sha256"]
    for f in _all_sets():
        assert f in man, f"{f} is not in sml/data/MANIFEST.json (run sml/data/ingest_incoming.py or add it)"
        assert hashlib.sha256((_D / f).read_bytes()).hexdigest() == man[f], f"{f} changed since the manifest was written"


def test_no_exact_text_shared_between_any_heldout_set_and_training():
    held_names = _held_out_sets()
    assert {"natural_test.jsonl", "test_v2.jsonl", "test_v6.jsonl"} <= set(held_names)          # discovery works
    sets = {f: {_n(r["text"]) for r in _load(f)} for f in _all_sets()}
    train = set().union(*(sets.get(f, set()) for f in _TRAIN_FILES))
    for held in held_names:
        assert not (train & sets[held]), f"{held} leaks into training"
    for i, a in enumerate(held_names):
        for b in held_names[i + 1:]:
            assert not (sets[a] & sets[b]), f"{a} and {b} overlap"


# 18 rows of test_v2..test_v6 are punctuation / one-word variants of templated training rows ("What can you do?" vs "what can you do"):
# the exact-text dedupe in ingest_incoming.py normalises case and spaces only. Found 2026-10-25 (TRACKER H20); effect on router 0.4.1 measured in
# sml/eval/router_0.4.1_contamination_check.json (macro-F1 changes by at most 0.0007 on v2-v4, v6; v5 rises 0.005 without them). The sets are frozen, so
# these rows are pinned by hash; any NEW near-duplicate fails the build, and a pin that no longer matches a row fails too (no stale exceptions).
_KNOWN_NEAR_DUPLICATES = ['24d5051632ca', '514723c07e44', '619727fa63ad', '814c14cbb101', '8686d3a218ab', '8f4dd8ef150a', 'a2a364b26810', 'a4b46b0f75fc', 'acefee12464e', 'ad630f92506b', 'b579c50c9b1c', 'bc4793196165', 'bfba329febe2', 'c1fd93a30571', 'd409181428ff', 'eda16b6b69c0', 'f42aed956642', 'fb47d2e438ae']


def test_no_near_duplicate_between_training_and_any_heldout_set():
    """Character 4-gram Jaccard >= 0.7 is what ingest_incoming.py drops from TRAIN; this checks the other direction too."""
    import hashlib
    def grams(t):
        t = _n(t); return {t[i:i + 4] for i in range(max(1, len(t) - 3))}
    train = [grams(r["text"]) for f in _TRAIN_FILES for r in _load(f)]
    inv = {}
    for i, g in enumerate(train):
        for x in g: inv.setdefault(x, []).append(i)
    found = set(); new = []
    for f in _held_out_sets():
        if f in _MODEL_SELECTION_FILES:
            continue                                   # valid is template-held-out and dev is for settings; the test sets are the strict ones
        for r in _load(f):
            g = grams(r["text"]); cand = {i for x in g for i in inv.get(x, ())}
            worst = max((len(g & train[i]) / len(g | train[i]) for i in cand), default=0)
            if worst >= 0.7:
                h = hashlib.sha1(_n(r["text"]).encode()).hexdigest()[:12]
                (found.add(h) if h in _KNOWN_NEAR_DUPLICATES else new.append((f, r["text"], round(worst, 2))))
    assert not new, f"new near-duplicates of training rows in a held-out set: {new}"
    assert found == set(_KNOWN_NEAR_DUPLICATES), "a pinned near-duplicate no longer exists: remove it from _KNOWN_NEAR_DUPLICATES"


def test_the_final_refit_only_ever_uses_train_extra_valid_and_dev():
    """Static guard on train_router_v2.py: the lines that FIT models must not mention a test set."""
    src = (Path(__file__).resolve().parents[1] / "training" / "train_router_v2.py").read_text()
    fit_lines = [l for l in src.splitlines() if ".fit(" in l or l.strip().startswith("Xall") or l.strip().startswith("Yall")]
    assert fit_lines, "no fit lines found: the guard needs updating"
    for l in fit_lines:
        assert not re.search(r"test\d|nat1|\"test\"|\"all\"|test_v", l), f"a held-out set is used while fitting: {l.strip()[:120]}"


def test_independent_sets_cover_every_intent():
    for f in [x for x in _all_sets() if x not in ("train.jsonl", "valid.jsonl", "natural_test.jsonl")]:
        rows = _load(f)
        if rows:
            assert {r["intent"] for r in rows} == set(R.INTENTS), f
