"""
FIN-OS gateway health aggregator.

One endpoint that answers "which backends are up?" for the whole platform, so the
frontend (and ops) stop probing 9 different ports. Runs behind nginx as /health.

    uvicorn health_aggregator:app --host 0.0.0.0 --port 8010

Service list is data, not code — override with FINOS_SERVICES_JSON='[{"name":..,"url":..}]'.
"""
import asyncio
import json
import os
import time

import httpx
from fastapi import FastAPI, Response

DEFAULT_SERVICES = [
    {"name": "alerts",    "url": "http://alert-engine:8001/health"},
    {"name": "stocks",    "url": "http://stock-engine:8003/api/health"},
    {"name": "docs",      "url": "http://document-ai:8004/health"},
    {"name": "market",    "url": "http://market-intel:5000/"},
    {"name": "arya",      "url": "http://arya-ai:7475/health"},
    {"name": "rag",       "url": "http://rag-engine:7476/api/health"},
    # Critical services decide the overall status; others only degrade it.
]
CRITICAL = {"alerts", "stocks"}

SERVICES = json.loads(os.environ.get("FINOS_SERVICES_JSON", "null")) or DEFAULT_SERVICES
TIMEOUT = float(os.environ.get("FINOS_HEALTH_TIMEOUT", "2.5"))
CACHE_TTL = 5.0

app = FastAPI(title="FIN-OS gateway health", docs_url=None, redoc_url=None)
_cache = {"at": 0.0, "body": None}


async def _probe(client: httpx.AsyncClient, svc: dict) -> dict:
    t0 = time.perf_counter()
    try:
        r = await client.get(svc["url"])
        ok = r.status_code < 500
        detail = None if ok else f"HTTP {r.status_code}"
    except Exception as e:  # noqa: BLE001 - any failure means "down"
        ok, detail = False, type(e).__name__
    return {
        "name": svc["name"],
        "status": "up" if ok else "down",
        "latency_ms": round((time.perf_counter() - t0) * 1000),
        **({"detail": detail} if detail else {}),
    }


async def collect() -> dict:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        results = await asyncio.gather(*[_probe(client, s) for s in SERVICES])
    down = [r["name"] for r in results if r["status"] == "down"]
    if any(n in CRITICAL for n in down):
        overall = "down"
    elif down:
        overall = "degraded"
    else:
        overall = "ok"
    return {"status": overall, "gateway": "finos-v3", "services": results, "checked_at": int(time.time())}


@app.get("/health")
async def health(response: Response):
    now = time.monotonic()
    if _cache["body"] is None or now - _cache["at"] > CACHE_TTL:   # protect backends from probe storms
        _cache["body"], _cache["at"] = await collect(), now
    response.status_code = 503 if _cache["body"]["status"] == "down" else 200
    return _cache["body"]
