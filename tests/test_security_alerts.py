"""alert engine security review fixes (Oct 2026). The engine uses the Supabase SERVICE ROLE key (bypasses row-level security) and had
no authentication: any caller could read another person's alerts, health score and couple finances, mark their alerts read, register
their own device for another person's push notifications, or make the server POST to internal addresses (push endpoint).

Supabase and the optional libraries (slowapi, apscheduler, supabase, pywebpush, prometheus_client) are replaced by stand-ins; nothing
touches the network.
"""
import importlib.util
import os
import sys
import types
from datetime import date

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pytest.importorskip("fastapi")
pytest.importorskip("dotenv")
pytest.importorskip("cachetools")
from fastapi.testclient import TestClient  # noqa: E402

A, B = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa", "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
C = "cccccccc-3333-4333-8333-cccccccccccc"


class FakeQuery:
    def __init__(self, db, table):
        self.db, self.table, self.filters, self.op, self.payload, self._range, self._single = db, table, [], "select", None, None, False

    def select(self, *a): self.op = "select"; return self
    def insert(self, row): self.op, self.payload = "insert", row; return self
    def upsert(self, row, **k): self.op, self.payload = "upsert", row; return self
    def update(self, row): self.op, self.payload = "update", row; return self
    def delete(self): self.op = "delete"; return self
    def eq(self, k, v): self.filters.append(("eq", k, v)); return self
    def gte(self, k, v): self.filters.append(("gte", k, v)); return self
    def lte(self, k, v): self.filters.append(("lte", k, v)); return self
    def or_(self, expr): self.filters.append(("or", expr, None)); return self
    def order(self, *a, **k): return self
    def limit(self, n): return self
    def range(self, a, b): self._range = (a, b); return self
    def single(self): self._single = True; return self

    def _match(self, row):
        for op, k, v in self.filters:
            if op == "eq" and row.get(k) != v: return False
            if op == "gte" and not str(row.get(k)) >= str(v): return False
            if op == "or":
                self.db.or_filters.append(k)
                return False
        return True

    def execute(self):
        self.db.log.append((self.table, self.op, list(self.filters), self.payload))
        rows = self.db.tables.setdefault(self.table, [])
        if self.op == "insert" or self.op == "upsert":
            row = dict(self.payload, id=self.payload.get("id") or f"id{len(rows)}")
            rows.append(row)
            return types.SimpleNamespace(data=[row])
        hit = [r for r in rows if self._match(r)]
        if self.op == "update":
            for r in hit: r.update(self.payload)
            return types.SimpleNamespace(data=hit)
        if self.op == "delete":
            for r in hit: rows.remove(r)
            return types.SimpleNamespace(data=hit)
        if self._range:
            hit = hit[self._range[0]:self._range[1] + 1]
        if self._single:
            return types.SimpleNamespace(data=hit[0] if hit else None)
        return types.SimpleNamespace(data=hit)


class FakeDB:
    def __init__(self):
        self.tables, self.log, self.or_filters = {}, [], []

    def table(self, name): return FakeQuery(self, name)


@pytest.fixture(scope="module")
def engine():
    stubs = {}

    class Limiter:
        def __init__(self, **k): pass
        def limit(self, *a, **k): return lambda f: f

    slowapi = types.ModuleType("slowapi")
    slowapi.Limiter, slowapi._rate_limit_exceeded_handler = Limiter, lambda *a: None
    errs = types.ModuleType("slowapi.errors")
    errs.RateLimitExceeded = type("RateLimitExceeded", (Exception,), {})
    util = types.ModuleType("slowapi.util")
    util.get_remote_address = lambda r: "x"
    stubs.update({"slowapi": slowapi, "slowapi.errors": errs, "slowapi.util": util})

    class Sched:
        def __init__(self, **k): pass
        def add_job(self, *a, **k): pass
        def start(self): pass
    for name in ("apscheduler", "apscheduler.schedulers"):
        stubs[name] = types.ModuleType(name)
    aio = types.ModuleType("apscheduler.schedulers.asyncio")
    aio.AsyncIOScheduler = Sched
    stubs["apscheduler.schedulers.asyncio"] = aio
    sb = types.ModuleType("supabase")
    sb.create_client, sb.Client = lambda *a, **k: None, object
    stubs["supabase"] = sb
    wp = types.ModuleType("pywebpush")
    wp.webpush, wp.WebPushException = lambda **k: None, type("WebPushException", (Exception,), {})
    stubs["pywebpush"] = wp
    prom = types.ModuleType("prometheus_client")

    class Metric:
        def __init__(self, *a, **k): self.seen = []
        def labels(self, **k): self.seen.append(k); return self
        def inc(self, *a): pass
        def time(self):
            import contextlib
            return contextlib.nullcontext()
    prom.Counter = prom.Histogram = Metric
    prom.generate_latest, prom.CONTENT_TYPE_LATEST = lambda: b"", "text/plain"
    stubs["prometheus_client"] = prom

    before_mods, before_path = set(sys.modules), list(sys.path)
    sys.path.insert(0, os.path.join(ROOT, "alerts"))
    try:
        for k, v in stubs.items():
            sys.modules[k] = v
        for n in ("rules", "health_score"):
            sys.modules.pop(n, None)
        spec = importlib.util.spec_from_file_location("alert_engine_under_test", os.path.join(ROOT, "alerts", "alert-engine.py"))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        yield mod
    finally:
        for name in set(sys.modules) - before_mods:
            sys.modules.pop(name, None)
        sys.path[:] = before_path


@pytest.fixture()
def api(engine, monkeypatch):
    db = FakeDB()
    monkeypatch.setattr(engine, "_get_supabase", lambda: db)
    monkeypatch.setattr(engine, "AUTH_MODE", "required")
    monkeypatch.setattr(engine, "ADMIN_KEY", "op-key-for-tests")
    tokens = {"tokA": A, "tokB": B, "tokC": C}

    async def verify(token):
        if token not in tokens:
            raise engine.HTTPException(401, "Missing or invalid session token")
        return tokens[token]
    monkeypatch.setattr(engine, "_verify_token", verify)
    return engine, db, TestClient(engine.app, raise_server_exceptions=False)


def auth(tok): return {"Authorization": f"Bearer {tok}"}


# ── authentication / per-user isolation ───────────────────────────────────────

USER_ROUTES = [
    ("get", f"/alerts/{A}"), ("post", f"/alerts/mark-all-read/{A}"), ("get", f"/alerts/preferences/{A}"),
    ("get", f"/health-score/{A}"), ("get", f"/health-score/{A}/history"), ("get", f"/health-score/{A}/summary"),
    ("get", f"/benchmark/{A}"), ("get", f"/couple/overview/{A}"), ("delete", f"/couple/dissolve/{A}"),
    ("post", f"/alerts/{C}/read"),
]


@pytest.mark.parametrize("method,path", USER_ROUTES)
def test_user_routes_refuse_anonymous_and_other_users(api, method, path):
    _, db, c = api
    assert getattr(c, method)(path).status_code == 401
    assert getattr(c, method)(path, headers=auth("bad-token")).status_code == 401
    if str(A) in path:
        assert getattr(c, method)(path, headers=auth("tokB")).status_code == 403
    assert db.log == []                                            # nothing reached the database


def test_owner_can_read_their_own_alerts_and_admin_key_works_for_servers(api):
    _, db, c = api
    db.tables["alerts"] = [{"id": "1", "user_id": A, "read": False}, {"id": "2", "user_id": B, "read": False}]
    r = c.get(f"/alerts/{A}", headers=auth("tokA"))
    assert r.status_code == 200 and [a["id"] for a in r.json()["alerts"]] == ["1"]
    assert c.get(f"/alerts/{A}", headers={"X-Admin-Key": "op-key-for-tests"}).status_code == 200
    assert c.get(f"/alerts/{A}", headers={"X-Admin-Key": "wrong"}).status_code == 401


def test_mark_read_only_touches_the_callers_own_alert(api):
    _, db, c = api
    db.tables["alerts"] = [{"id": "x1", "user_id": B, "read": False}]
    assert c.post("/alerts/x1/read", headers=auth("tokA")).status_code == 200      # someone else's id: no row is changed
    assert db.tables["alerts"][0]["read"] is False
    assert c.post("/alerts/x1/read", headers=auth("tokB")).status_code == 200
    assert db.tables["alerts"][0]["read"] is True


def test_auth_off_mode_is_an_explicit_development_switch(api, monkeypatch):
    engine, _, c = api
    monkeypatch.setattr(engine, "AUTH_MODE", "off")
    assert c.get(f"/alerts/{A}").status_code == 200


def test_manual_run_is_closed_when_no_admin_key_is_configured(api, monkeypatch):
    engine, _, c = api
    monkeypatch.setattr(engine, "ADMIN_KEY", "")
    assert c.post("/alerts/run").status_code == 403
    monkeypatch.setattr(engine, "ADMIN_KEY", "k")
    assert c.post("/alerts/run", headers={"X-Admin-Key": "nope"}).status_code == 403


def test_preferences_validate_rule_and_channels(api):
    engine, db, c = api
    body = {"user_id": A, "rule_id": "NOT_A_RULE", "enabled": False}
    assert c.put("/alerts/preferences", json=body, headers=auth("tokA")).status_code == 400
    rule = next(iter(engine.RULES_BY_ID))
    assert c.put("/alerts/preferences", json={**body, "rule_id": rule, "channels": ["sms"]}, headers=auth("tokA")).status_code == 422
    assert c.put("/alerts/preferences", json={**body, "rule_id": rule}, headers=auth("tokB")).status_code == 403
    assert c.put("/alerts/preferences", json={**body, "rule_id": rule}, headers=auth("tokA")).status_code == 200


# ── push subscription SSRF ────────────────────────────────────────────────────

@pytest.mark.parametrize("endpoint", [
    "http://169.254.169.254/latest/meta-data", "https://localhost/x", "https://10.0.0.5/push", "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com.evil.example/x", "https://evil.example/fcm.googleapis.com", "https://user:pw@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x", "ftp://fcm.googleapis.com/x", "https://evilfcm.googleapis.com.attacker.io/",
])
def test_push_endpoint_must_be_a_real_push_service(api, endpoint):
    _, db, c = api
    body = {"user_id": A, "endpoint": endpoint, "p256dh": "k", "auth_key": "a"}
    assert c.post("/alerts/subscribe", json=body, headers=auth("tokA")).status_code == 400
    assert db.log == []


def test_push_subscription_is_bound_to_the_caller(api):
    _, db, c = api
    good = "https://fcm.googleapis.com/fcm/send/abc123"
    body = {"user_id": A, "endpoint": good, "p256dh": "k", "auth_key": "a"}
    assert c.post("/alerts/subscribe", json=body, headers=auth("tokB")).status_code == 403      # cannot attach a device to someone else
    assert c.post("/alerts/subscribe", json=body).status_code == 401
    assert c.post("/alerts/subscribe", json=body, headers=auth("tokA")).status_code == 200
    for ok in ("https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/Q1", "https://wns2-par02p.notify.windows.com/w"):
        assert c.post("/alerts/subscribe", json={**body, "endpoint": ok}, headers=auth("tokA")).status_code == 200, ok


def test_unsubscribe_only_removes_the_callers_own_row(api):
    _, db, c = api
    db.tables["push_subscriptions"] = [{"endpoint": "https://fcm.googleapis.com/x", "user_id": B}]
    c.request("DELETE", "/alerts/subscribe", params={"endpoint": "https://fcm.googleapis.com/x"}, headers=auth("tokA"))
    assert len(db.tables["push_subscriptions"]) == 1
    c.request("DELETE", "/alerts/subscribe", params={"endpoint": "https://fcm.googleapis.com/x"}, headers=auth("tokB"))
    assert db.tables["push_subscriptions"] == []


# ── couples ───────────────────────────────────────────────────────────────────

def test_couple_filter_injection_is_blocked(api):
    engine, db, _ = api
    db.tables["couple_links"] = [{"id": "z", "user_a": A, "user_b": B, "status": "active"}]
    assert engine._get_couple(db, "x,status.neq.zzz)", "active") is None
    assert engine._get_couple(db, f"{A},user_b.eq.{B}", "active") is None
    assert db.or_filters == []                                      # the malicious string never reached the query


def test_couple_writes_require_membership(api):
    _, db, c = api
    cid = "dddddddd-4444-4444-8444-dddddddddddd"
    db.tables["couple_links"] = [{"id": cid, "user_a": A, "user_b": B, "status": "active"}]
    db.tables["couple_goals"] = [{"id": "eeeeeeee-5555-4555-8555-eeeeeeeeeeee", "couple_id": cid, "current_amount": 10}]
    goal = {"couple_id": cid, "title": "Holiday", "target_amount": 1000}
    assert c.post("/couple/goal", json=goal, headers=auth("tokC")).status_code == 403          # an outsider
    assert c.post("/couple/goal", json=goal, headers=auth("tokB")).status_code == 200
    resp = {"couple_id": cid, "label": "EMI", "assigned_to": "joint"}
    assert c.post("/couple/responsibility", json=resp, headers=auth("tokC")).status_code == 403
    gid = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
    assert c.put(f"/couple/goal/{gid}/contribute", params={"amount": 5}, headers=auth("tokC")).status_code == 403
    assert c.put(f"/couple/goal/{gid}/contribute", params={"amount": 5}, headers=auth("tokA")).status_code == 200
    for bad in ("-5", "0", "nan", "1e12"):
        assert c.put(f"/couple/goal/{gid}/contribute", params={"amount": bad}, headers=auth("tokA")).status_code == 400, bad


def test_invite_codes_use_a_cryptographic_source_and_accept_is_authenticated(api):
    engine, _, c = api
    codes = {engine._gen_invite_code() for _ in range(200)}
    assert len(codes) == 200 and all(len(x) == 10 and x.isalnum() for x in codes)
    src = open(os.path.join(ROOT, "alerts", "alert-engine.py"), encoding="utf-8").read()
    assert "random.choices" not in src
    assert c.post("/couple/accept", json={"user_id": A, "invite_code": "ABCDEF12"}).status_code == 401
    assert c.post("/couple/accept", json={"user_id": A, "invite_code": "ABCDEF12"}, headers=auth("tokB")).status_code == 403
    assert c.post("/couple/accept", json={"user_id": A, "invite_code": "AB;--"}, headers=auth("tokA")).status_code == 422


# ── errors, CORS, metrics ─────────────────────────────────────────────────────

def test_server_errors_do_not_carry_database_text(api, monkeypatch):
    engine, _, c = api

    def boom():
        raise RuntimeError('relation "public.alerts" does not exist at https://abc.supabase.co/rest/v1')
    monkeypatch.setattr(engine, "_get_supabase", boom)
    r = c.get(f"/alerts/{A}", headers=auth("tokA"))
    assert r.status_code == 500 and r.json() == {"detail": "Internal error"}


def test_cors_does_not_allow_arbitrary_origins(api):
    _, _, c = api
    h = {"Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"}
    assert "access-control-allow-origin" not in c.options("/health", headers={**h, "Origin": "https://evil.example"}).headers
    assert c.options("/health", headers={**h, "Origin": "http://localhost:5173"}).headers["access-control-allow-origin"] == "http://localhost:5173"


def test_metrics_label_is_the_route_template_not_the_user_id(api, engine):
    engine, _, c = api
    c.get(f"/alerts/{A}", headers=auth("tokA"))
    seen = [k["path"] for k in engine._api_requests.seen]
    assert "/alerts/{user_id}" in seen and not any(A in p for p in seen)


def test_trace_id_header_is_sanitised(api):
    _, _, c = api
    r = c.get("/health", headers={"X-Trace-ID": "ab<script>\"cd"})
    assert r.headers["x-trace-id"] == "abscriptcd"


def test_benchmark_upgrade_required_is_not_turned_into_a_500(api):
    _, db, c = api
    db.tables["profiles"] = [{"id": A, "plan": "free"}]
    assert c.get(f"/benchmark/{A}", headers=auth("tokA")).status_code == 402


# ── transactions window ───────────────────────────────────────────────────────

def test_transactions_are_fetched_by_date_and_paged_not_cut_at_100_rows(engine):
    db = FakeDB()
    db.tables["transactions"] = [{"user_id": A, "date": "2026-09-%02d" % (1 + i % 28), "amount": 1} for i in range(2500)] + \
                                [{"user_id": A, "date": "2026-01-01", "amount": 1}, {"user_id": B, "date": "2026-09-01", "amount": 1}]
    rows, truncated = engine._fetch_transactions(db, A, date(2026, 7, 1))
    assert len(rows) == 2500 and truncated is False                    # old: 100 rows, only the last 60 days
    assert all(r["user_id"] == A and r["date"] >= "2026-07-01" for r in rows)
    db.tables["transactions"] = [{"user_id": A, "date": "2026-09-01", "amount": 1} for _ in range(engine.TX_MAX_ROWS + 10)]
    rows, truncated = engine._fetch_transactions(db, A, date(2026, 7, 1))
    assert len(rows) == engine.TX_MAX_ROWS and truncated is True
