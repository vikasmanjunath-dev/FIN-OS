"""
Arya AI — SQLite store.
Thread-safe read/write helpers. All other modules import from here.
"""
import sqlite3
import time
import json
import threading
from pathlib import Path
from config import DB_PATH

_lock = threading.Lock()


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA synchronous=NORMAL")
    return c


def init_db():
    schema = (Path(__file__).parent / "schema.sql").read_text()
    with _lock, _conn() as c:
        c.executescript(schema)


# ── Generic helpers ────────────────────────────────────────────────────────────

def _now() -> int:
    return int(time.time())


def get_cached(table: str, pk_col: str, pk_val: str, ttl: int) -> dict | None:
    """Return row as dict if fresh, else None."""
    with _lock, _conn() as c:
        row = c.execute(
            f"SELECT * FROM {table} WHERE {pk_col}=? AND fetched_at>?",
            (pk_val, _now() - ttl)
        ).fetchone()
    return dict(row) if row else None


def upsert(table: str, data: dict):
    """Insert or replace a row. data must include all columns."""
    data.setdefault("fetched_at", _now())
    cols = ", ".join(data.keys())
    placeholders = ", ".join("?" * len(data))
    sql = f"INSERT OR REPLACE INTO {table} ({cols}) VALUES ({placeholders})"
    with _lock, _conn() as c:
        c.execute(sql, list(data.values()))
        c.commit()


def fetch_all(table: str, order_by: str = "fetched_at DESC", limit: int = 50) -> list[dict]:
    with _lock, _conn() as c:
        rows = c.execute(
            f"SELECT * FROM {table} ORDER BY {order_by} LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def delete_stale(table: str, ttl: int):
    cutoff = _now() - ttl
    with _lock, _conn() as c:
        c.execute(f"DELETE FROM {table} WHERE fetched_at<?", (cutoff,))
        c.commit()


# ── Quote helpers ──────────────────────────────────────────────────────────────

def cache_quote(symbol: str, exchange: str, data: dict):
    upsert("quote_cache", {
        "symbol":      symbol.upper(),
        "exchange":    exchange.upper(),
        "price":       data.get("price"),
        "change":      data.get("change"),
        "change_pct":  data.get("change_pct"),
        "open":        data.get("open"),
        "high":        data.get("high"),
        "low":         data.get("low"),
        "prev_close":  data.get("prev_close"),
        "volume":      data.get("volume"),
        "market_cap":  data.get("market_cap"),
        "pe_ratio":    data.get("pe_ratio"),
        "week52_high": data.get("week52_high"),
        "week52_low":  data.get("week52_low"),
        "raw_json":    json.dumps(data),
        "fetched_at":  _now(),
    })


def get_quote_cached(symbol: str, exchange: str, ttl: int) -> dict | None:
    with _lock, _conn() as c:
        row = c.execute(
            "SELECT * FROM quote_cache WHERE symbol=? AND exchange=? AND fetched_at>?",
            (symbol.upper(), exchange.upper(), _now() - ttl)
        ).fetchone()
    if not row:
        return None
    d = dict(row)
    d.pop("raw_json", None)
    return d


# ── News helpers ───────────────────────────────────────────────────────────────

def cache_news(articles: list[dict]):
    now = _now()
    with _lock, _conn() as c:
        for a in articles:
            c.execute(
                """INSERT OR IGNORE INTO news_cache
                   (id, title, summary, url, source, sentiment, sentiment_score, tags, published, fetched_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (a.get("id"), a.get("title"), a.get("summary"), a.get("url"),
                 a.get("source"), a.get("sentiment", "neutral"),
                 a.get("sentiment_score", 0), json.dumps(a.get("tags", [])),
                 a.get("published"), now)
            )
        c.commit()


def get_recent_news(limit: int = 30, ttl: int = 3600) -> list[dict]:
    cutoff = _now() - ttl
    with _lock, _conn() as c:
        rows = c.execute(
            "SELECT * FROM news_cache WHERE fetched_at>? ORDER BY fetched_at DESC LIMIT ?",
            (cutoff, limit)
        ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        try:
            d["tags"] = json.loads(d.get("tags") or "[]")
        except Exception:
            d["tags"] = []
        result.append(d)
    return result


# ── Search cache ───────────────────────────────────────────────────────────────

def cache_search(query: str, results: list, ttl_key: str):
    import hashlib
    qhash = hashlib.md5(query.lower().encode()).hexdigest()
    upsert("search_cache", {
        "query_hash": qhash,
        "query":      query,
        "results":    json.dumps(results),
        "fetched_at": _now(),
    })


def get_search_cached(query: str, ttl: int) -> list | None:
    import hashlib
    qhash = hashlib.md5(query.lower().encode()).hexdigest()
    row = get_cached("search_cache", "query_hash", qhash, ttl)
    if not row:
        return None
    try:
        return json.loads(row["results"])
    except Exception:
        return None


# ── Technical cache ────────────────────────────────────────────────────────────

def cache_technical(symbol: str, signals: dict, verdict: str, score: int):
    upsert("technical_cache", {
        "symbol":     symbol.upper(),
        "signals":    json.dumps(signals),
        "verdict":    verdict,
        "score":      score,
        "fetched_at": _now(),
    })


def get_technical_cached(symbol: str, ttl: int) -> dict | None:
    row = get_cached("technical_cache", "symbol", symbol.upper(), ttl)
    if not row:
        return None
    try:
        row["signals"] = json.loads(row.get("signals") or "{}")
    except Exception:
        row["signals"] = {}
    return row
