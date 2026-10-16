"""
Regression test: every endpoint's request body must be resolved as a BODY, not a query parameter.

Why this exists (Oct 15 2026): server.py uses `from __future__ import annotations`. Wrapping an
endpoint in a decorator whose wrapper lives in another module (prometheus-client 0.25.0's
`.time()` decorator) stops FastAPI from resolving `req: QueryRequest`; it then treats `req` as a
required query parameter and the endpoint answers HTTP 422 to every call. /api/search and
/api/retrieve were broken this way for ~11 days with no test noticing, because the Arya frontend
degrades gracefully when /api/retrieve fails.

This test inspects the generated OpenAPI schema only — it loads no models and calls no endpoint.
Run:  cd rag-engine && .venv/bin/pytest evaluation/test_endpoint_signatures.py -v
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import app  # noqa: E402

_BODY_ENDPOINTS = ["/api/search", "/api/retrieve", "/api/query", "/api/feedback"]


def _schema():
    return app.openapi()


def test_no_endpoint_has_a_query_param_named_req():
    bad = []
    for path, ops in _schema()["paths"].items():
        for method, op in ops.items():
            for p in op.get("parameters", []):
                if p["name"] == "req" and p.get("in") == "query":
                    bad.append(f"{method.upper()} {path}")
    assert not bad, f"request body resolved as a query param (HTTP 422 on every call): {bad}"


def test_body_endpoints_declare_a_request_body():
    paths = _schema()["paths"]
    for path in _BODY_ENDPOINTS:
        assert path in paths, f"{path} missing from the API"
        op = paths[path]["post"]
        assert "requestBody" in op, f"{path} has no requestBody in OpenAPI (body model not resolved)"
