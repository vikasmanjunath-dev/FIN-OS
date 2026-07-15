"""
Qdrant vector store — collection management, upsert, namespace-filtered search.
See docs/RAG_KNOWLEDGE_BASE.md §4 and docs/RAG_SECURITY.md §2 for the
namespace-isolation guarantee this implements.
"""
from __future__ import annotations
import uuid

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchAny,
    PayloadSchemaType,
    HnswConfigDiff,
)

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config

_client: QdrantClient | None = None


def get_client() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(host=config.QDRANT_HOST, port=config.QDRANT_PORT)
    return _client


def ensure_collection() -> None:
    client = get_client()
    existing = [c.name for c in client.get_collections().collections]
    if config.COLLECTION_NAME in existing:
        return

    client.create_collection(
        collection_name=config.COLLECTION_NAME,
        vectors_config=VectorParams(size=config.EMBED_DIM, distance=Distance.COSINE),
        hnsw_config=HnswConfigDiff(m=16, ef_construct=128),
    )
    for field_name in ["namespace", "doc_type", "finance_category", "doc_id"]:
        client.create_payload_index(
            config.COLLECTION_NAME, field_name, PayloadSchemaType.KEYWORD
        )


def upsert_chunks(vectors: list[list[float]], payloads: list[dict], point_ids: list[str] | None = None) -> list[str]:
    """
    payloads must each include a 'namespace' key — see config.PUBLIC_NAMESPACE / user_namespace().
    Returns the point IDs used (generated if not supplied) so callers can mirror
    the same IDs into the SQLite FTS5 sparse index — see storage/sqlite_fts.py.
    """
    assert len(vectors) == len(payloads)
    if point_ids is None:
        point_ids = [str(uuid.uuid4()) for _ in vectors]
    assert len(point_ids) == len(vectors)

    client = get_client()
    points = [
        PointStruct(id=pid, vector=vec, payload=payload)
        for pid, vec, payload in zip(point_ids, vectors, payloads)
    ]
    client.upsert(collection_name=config.COLLECTION_NAME, points=points)
    return point_ids


def _namespace_filter(user_id: str | None, doc_type: str | None = None) -> Filter:
    allowed = [config.PUBLIC_NAMESPACE]
    if user_id:
        allowed.append(config.user_namespace(user_id))
    must = [FieldCondition(key="namespace", match=MatchAny(any=allowed))]
    if doc_type:
        # Phase 4: lets rag_search_regulations actually restrict to doc_type='regulation'
        # rather than being a same-results rename of rag_query — see RAG_INTEGRATION.md.
        must.append(FieldCondition(key="doc_type", match=MatchAny(any=[doc_type])))
    return Filter(must=must)


def search(query_vector: list[float], user_id: str | None, top_k: int = 8, doc_type: str | None = None) -> list[dict]:
    """
    Namespace-filtered vector search. The filter is passed INTO the Qdrant
    search call (not applied after) — a private chunk is never scored or
    returned for a request it doesn't belong to. See docs/RAG_SECURITY.md §2.
    """
    client = get_client()
    results = client.query_points(
        collection_name=config.COLLECTION_NAME,
        query=query_vector,
        query_filter=_namespace_filter(user_id, doc_type),
        limit=top_k,
        with_payload=True,
    )
    return [
        {"score": point.score, "payload": point.payload, "id": point.id}
        for point in results.points
    ]


def delete_by_doc_type(doc_type: str) -> None:
    """Used before re-ingesting a source so re-runs don't duplicate content (full
    incremental dedup via content hash is Phase 3 scope — see docs/RAG_PIPELINE.md §1)."""
    client = get_client()
    client.delete(
        collection_name=config.COLLECTION_NAME,
        points_selector=Filter(must=[FieldCondition(key="doc_type", match=MatchAny(any=[doc_type]))]),
    )


def collection_size() -> int:
    client = get_client()
    info = client.get_collection(config.COLLECTION_NAME)
    return info.points_count
