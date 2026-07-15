"""
SQLite FTS5 sparse (BM25) index — exact-term retrieval, e.g. "Section 80CCD(1B)".
See docs/RAG_PIPELINE.md Layer 4 Tier 2 and docs/RAG_SECURITY.md §2 for the
namespace-isolation guarantee mirrored here from the Qdrant layer.

Uses SQLite's native FTS5 bm25() ranking — no external BM25 package needed.
"""
from __future__ import annotations
import sqlite3
import json
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config

_DB_PATH = config.RAG_ENGINE_DIR / "rag_bm25.db"

_SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    text,
    point_id UNINDEXED,
    namespace UNINDEXED,
    doc_type UNINDEXED,
    payload_json UNINDEXED
);
"""


def get_connection() -> sqlite3.Connection:
    con = sqlite3.connect(_DB_PATH)
    con.execute(_SCHEMA)
    return con


def index_chunks(point_ids: list[str], texts: list[str], payloads: list[dict]) -> int:
    """Mirrors the same chunks (and the same point_id) into the FTS5 index alongside Qdrant."""
    assert len(point_ids) == len(texts) == len(payloads)
    con = get_connection()
    try:
        rows = [
            (
                _fts_escape(text),
                pid,
                payload.get("namespace", config.PUBLIC_NAMESPACE),
                payload.get("doc_type", "unknown"),
                json.dumps(payload),
            )
            for pid, text, payload in zip(point_ids, texts, payloads)
        ]
        con.executemany(
            "INSERT INTO chunks_fts (text, point_id, namespace, doc_type, payload_json) VALUES (?, ?, ?, ?, ?)",
            rows,
        )
        con.commit()
        return len(rows)
    finally:
        con.close()


def _fts_escape(text: str) -> str:
    # FTS5 MATCH syntax treats quotes/operators specially; storing as plain
    # content column is fine (escaping only matters for query strings).
    return text


def _fts_query_escape(query: str) -> str:
    # Wrap the raw user query as a single FTS5 phrase-safe term sequence:
    # strip characters that have special MATCH-syntax meaning so a query
    # like "80CCD(1B)" doesn't throw an FTS5 syntax error.
    cleaned = "".join(c if c.isalnum() or c.isspace() else " " for c in query)
    terms = [t for t in cleaned.split() if t]
    if not terms:
        return ""
    return " OR ".join(terms)


def search(query: str, user_id: str | None, top_k: int = 20, doc_type: str | None = None) -> list[dict]:
    """Namespace-filtered BM25 search via SQLite FTS5's native bm25() ranking."""
    match_query = _fts_query_escape(query)
    if not match_query:
        return []

    allowed_namespaces = [config.PUBLIC_NAMESPACE]
    if user_id:
        allowed_namespaces.append(config.user_namespace(user_id))

    placeholders = ",".join("?" * len(allowed_namespaces))
    doc_type_clause = " AND doc_type = ?" if doc_type else ""
    sql = f"""
        SELECT point_id, payload_json, bm25(chunks_fts) AS score
        FROM chunks_fts
        WHERE chunks_fts MATCH ? AND namespace IN ({placeholders}){doc_type_clause}
        ORDER BY score
        LIMIT ?
    """
    params = [match_query, *allowed_namespaces]
    if doc_type:
        params.append(doc_type)
    params.append(top_k)

    con = get_connection()
    try:
        cur = con.execute(sql, params)
        rows = cur.fetchall()
    finally:
        con.close()

    results = []
    for point_id, payload_json, score in rows:
        results.append(
            {
                "id": point_id,
                # bm25() in SQLite returns negative scores where more-negative = more relevant;
                # flip sign so downstream RRF fusion treats higher = better, consistent with Qdrant.
                "score": -score,
                "payload": json.loads(payload_json),
            }
        )
    return results


def clear() -> None:
    con = get_connection()
    con.execute("DELETE FROM chunks_fts")
    con.commit()
    con.close()


def delete_by_doc_type(doc_type: str) -> None:
    con = get_connection()
    con.execute("DELETE FROM chunks_fts WHERE doc_type = ?", (doc_type,))
    con.commit()
    con.close()


def count() -> int:
    con = get_connection()
    n = con.execute("SELECT COUNT(*) FROM chunks_fts").fetchone()[0]
    con.close()
    return n
