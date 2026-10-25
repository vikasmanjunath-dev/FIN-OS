"""Offline tests for the personal prior in retrieval.reranker (no model loaded: the cross-encoder is stubbed)."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config
from retrieval import reranker as R


class _Stub:
    def predict(self, pairs):  # public chunk looks slightly MORE relevant than the personal one
        return [0.03 if "public" in p[1] else 0.01 for p in pairs]


def _cands():
    return [{"id": "pub", "payload": {"text": "public rent guide", "namespace": "public"}},
            {"id": "own", "payload": {"text": "Riya profile rent 24,000", "namespace": "user:u1"}},
            {"id": "other", "payload": {"text": "someone else rent", "namespace": "user:u2"}}]


def _run(query, own, prior=4.0):
    R._model = _Stub()
    config.PERSONAL_PRIOR = prior        # default is 1.0 (off); these tests exercise the mechanism itself
    return [c["id"] for c in R.rerank(query, _cands(), top_k=3, own_namespace=own)]


def test_first_person_detection():
    assert R.is_first_person("How much rent do I pay?") and R.is_first_person("mera EMI kitna hai") and R.is_first_person("मेरा लोन")
    assert not R.is_first_person("Tell me about index funds") and not R.is_first_person("What is the 80C limit?")


def test_own_chunk_wins_on_my_question_but_not_otherwise():
    assert _run("How much rent do I pay?", "user:u1")[0] == "own"
    assert _run("What is the rent guide?", "user:u1")[0] == "pub"          # no first person -> no prior


def test_prior_never_applies_without_a_user_and_never_to_other_users():
    assert _run("How much rent do I pay?", None)[0] == "pub"
    assert _run("How much rent do I pay?", "user:u2")[0] == "other"        # only the CALLER'S namespace is boosted


def test_prior_off_when_set_to_one():
    assert _run("How much rent do I pay?", "user:u1", prior=1.0)[0] == "pub"
    config.PERSONAL_PRIOR = 1.0          # restore the shipped default


def test_news_demotion_only_for_non_news_questions():
    class S2:
        def predict(self, pairs): return [0.05 if "news" in p[1] else 0.04 for p in pairs]
    cands = lambda: [{"id": "n", "payload": {"text": "news item", "doc_type": "news", "namespace": "public"}},
                     {"id": "r", "payload": {"text": "rule text", "doc_type": "regulation", "namespace": "public"}}]
    R._model = S2(); old = config.NEWS_DEMOTION; config.NEWS_DEMOTION = 0.3
    try:
        assert R.rerank("What is the 80C limit?", cands(), top_k=2)[0]["id"] == "r"          # demoted
        assert R.rerank("latest news on Reliance", cands(), top_k=2)[0]["id"] == "n"         # news asked for: untouched
        config.NEWS_DEMOTION = 1.0
        assert R.rerank("What is the 80C limit?", cands(), top_k=2)[0]["id"] == "n"          # off = old behaviour
    finally:
        config.NEWS_DEMOTION = old
    assert R.wants_news("what happened in the market today") and not R.wants_news("explain index funds")


def test_english_main_is_not_first_person_but_hindi_main_is():
    for q in ("What is the main difference between ELSS and FD?", "What are the two main categories of the Indian tax system?", "main purpose of Section 80C", "The main reason for the repo rate cut"):
        assert not R.is_first_person(q), q
    for q in ("main kitna kamata hoon", "main kitna kharch karta hu", "kya main SIP band kar sakta hoon", "Main"):
        assert R.is_first_person(q), q
