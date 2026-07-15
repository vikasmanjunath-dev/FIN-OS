"""
Namespace isolation regression test — see docs/RAG_EVALUATION.md §6.

This is a security regression test, not a normal unit test: a failure here
must block all other work until fixed (private user documents leaking across
users is the single worst thing this system could do).

Formalizes the manual test already run successfully during Phase 3/4
(see docs/RAG_PHASES.md) as a real, repeatable pytest. Run with:
    cd rag-engine && source .venv/bin/activate && pytest evaluation/test_namespace_isolation.py -v
"""
import sys
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config
from embedding.encoder import embed_batch
from storage.qdrant_store import upsert_chunks, delete_by_doc_type, ensure_collection
from storage import sqlite_fts
from retrieval.hybrid import hybrid_retrieve

_MARKER = "SECRET_MARKER_PYTEST_ISOLATION_CHECK"
_USER_A = "aaaaaaaa-pytest-1111-1111-111111111111"
_USER_B = "bbbbbbbb-pytest-2222-2222-222222222222"
_DOC_TYPE = "pytest_isolation_test"


@pytest.fixture
def seeded_private_chunk():
    """Inserts one chunk into User A's private namespace, cleans up after."""
    ensure_collection()
    namespace = config.user_namespace(_USER_A)
    text = f"This is a private test document containing {_MARKER} for automated testing."
    vec = embed_batch([text])[0]
    payload = {
        "text": text,
        "namespace": namespace,
        "doc_type": _DOC_TYPE,
        "doc_title": "Pytest Isolation Test Doc",
    }
    point_ids = upsert_chunks([vec], [payload])
    sqlite_fts.index_chunks(point_ids, [text], [payload])

    yield

    delete_by_doc_type(_DOC_TYPE)
    sqlite_fts.delete_by_doc_type(_DOC_TYPE)


def _marker_present(user_id: str | None) -> bool:
    results = hybrid_retrieve(_MARKER, user_id=user_id, dense_k=10, sparse_k=10)
    return any(_MARKER in r["payload"]["text"] for r in results)


def test_owner_can_retrieve_own_document(seeded_private_chunk):
    assert _marker_present(_USER_A) is True


def test_other_user_cannot_retrieve_it(seeded_private_chunk):
    assert _marker_present(_USER_B) is False


def test_anonymous_cannot_retrieve_it(seeded_private_chunk):
    assert _marker_present(None) is False
