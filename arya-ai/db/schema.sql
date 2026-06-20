-- Arya AI — SQLite Schema
-- Self-contained. No dependency on any other FIN-OS database.

CREATE TABLE IF NOT EXISTS quote_cache (
    symbol      TEXT NOT NULL,
    exchange    TEXT NOT NULL DEFAULT 'NSE',
    price       REAL,
    change      REAL,
    change_pct  REAL,
    open        REAL,
    high        REAL,
    low         REAL,
    prev_close  REAL,
    volume      INTEGER,
    market_cap  REAL,
    pe_ratio    REAL,
    week52_high REAL,
    week52_low  REAL,
    raw_json    TEXT,
    fetched_at  INTEGER NOT NULL,
    PRIMARY KEY (symbol, exchange)
);

CREATE TABLE IF NOT EXISTS mf_nav_cache (
    scheme_code TEXT PRIMARY KEY,
    scheme_name TEXT,
    nav         REAL,
    date        TEXT,
    fund_house  TEXT,
    category    TEXT,
    fetched_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS commodity_cache (
    name        TEXT PRIMARY KEY,
    price       REAL,
    unit        TEXT,
    change_pct  REAL,
    source      TEXT,
    fetched_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS news_cache (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    summary     TEXT,
    url         TEXT,
    source      TEXT,
    sentiment   TEXT DEFAULT 'neutral',
    sentiment_score REAL DEFAULT 0,
    tags        TEXT,
    published   TEXT,
    fetched_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS search_cache (
    query_hash  TEXT PRIMARY KEY,
    query       TEXT,
    results     TEXT,
    fetched_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS technical_cache (
    symbol      TEXT PRIMARY KEY,
    signals     TEXT,
    verdict     TEXT,
    score       INTEGER,
    fetched_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT,
    symbol      TEXT,
    message     TEXT,
    triggered_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_news_fetched ON news_cache(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_fetched ON quote_cache(fetched_at DESC);
