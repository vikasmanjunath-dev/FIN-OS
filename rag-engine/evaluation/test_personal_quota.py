"""Offline tests for retrieval.personal.retrieve_ranked (hybrid_retrieve and the cross-encoder are stubbed)."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config
from retrieval import personal as P

OWN = config.user_namespace("u1")


def _chunk(i, ns, score):
    return {"id": i, "payload": {"text": i, "namespace": ns}, "_s": score}


def _setup(monkeypatch, pool, own):
    class Calls(list): pass
    calls = Calls(); vecs = []
    def fake_hybrid(query, user_id=None, dense_k=10, sparse_k=10, use_hyde=False, doc_type=None, personal_only=False, query_vec=None):
        calls.append(personal_only); vecs.append(query_vec); return [dict(c) for c in (own if personal_only else pool)]
    def fake_rerank(query, cands, top_k=8, own_namespace=None):
        for c in cands: c["rerank_score"] = c["_s"]
        return sorted(cands, key=lambda c: -c["rerank_score"])[:top_k]
    embeds = []
    monkeypatch.setattr(P, "hybrid_retrieve", fake_hybrid); monkeypatch.setattr(P, "rerank", fake_rerank)
    monkeypatch.setattr(P, "query_vector", lambda q, h=False: (embeds.append((q, h)), [0.1, 0.2])[1])
    calls.vecs, calls.embeds = vecs, embeds
    return calls


PUB = [_chunk(f"pub{i}", "public", 0.5 - i * 0.05) for i in range(6)]
MINE = [_chunk("own-a", OWN, 0.02), _chunk("own-b", OWN, 0.01)]


def test_first_person_question_reserves_a_slot_for_own_chunk(monkeypatch):
    calls = _setup(monkeypatch, PUB, MINE); monkeypatch.setattr(config, "PERSONAL_QUOTA", 1)
    ids = [c["id"] for c in P.retrieve_ranked("What is my home loan EMI?", "u1", 3)]
    assert "own-a" in ids and len(ids) == 3 and calls == [False, True]
    assert ids.count("own-b") == 0                                   # quota is 1, not "all personal chunks"


def test_non_first_person_question_is_untouched(monkeypatch):
    calls = _setup(monkeypatch, PUB, MINE); monkeypatch.setattr(config, "PERSONAL_QUOTA", 1)
    ids = [c["id"] for c in P.retrieve_ranked("What is the 80C limit?", "u1", 3)]
    assert ids == ["pub0", "pub1", "pub2"] and calls == [False]


def test_anonymous_caller_never_triggers_personal_search(monkeypatch):
    calls = _setup(monkeypatch, PUB, MINE); monkeypatch.setattr(config, "PERSONAL_QUOTA", 1)
    P.retrieve_ranked("What is my home loan EMI?", None, 3)
    assert calls == [False]


def test_quota_zero_disables_and_dedupes_when_own_chunk_already_in_pool(monkeypatch):
    calls = _setup(monkeypatch, PUB + [MINE[0]], MINE); monkeypatch.setattr(config, "PERSONAL_QUOTA", 0)
    P.retrieve_ranked("What is my home loan EMI?", "u1", 3); assert calls == [False]
    monkeypatch.setattr(config, "PERSONAL_QUOTA", 1)
    ids = [c["id"] for c in P.retrieve_ranked("What is my home loan EMI?", "u1", 3)]
    assert len(ids) == len(set(ids)) == 3 and "own-a" in ids


def test_personal_only_flag_restricts_namespaces():
    from storage import qdrant_store as Q
    f = Q._namespace_filter("u1", None, personal_only=True)
    assert f.must[0].match.any == [OWN]
    f2 = Q._namespace_filter("u1", None, personal_only=False)
    assert set(f2.must[0].match.any) == {"public", OWN}


def test_first_person_question_embeds_once_and_shares_the_vector(monkeypatch):
    calls = _setup(monkeypatch, PUB, MINE); monkeypatch.setattr(config, "PERSONAL_QUOTA", 1)
    P.retrieve_ranked("What is my home loan EMI?", "u1", 3, use_hyde=True)
    assert calls.embeds == [("What is my home loan EMI?", True)]      # one embedding (and one HyDE generation), not two
    assert calls.vecs == [[0.1, 0.2], [0.1, 0.2]]
