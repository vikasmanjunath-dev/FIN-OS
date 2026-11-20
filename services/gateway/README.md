# Gateway health aggregator

A small FastAPI service that answers "which FIN·OS backends are up?" from one endpoint, so clients and ops don't
probe each port separately. In the Docker stack it runs as `gateway-health` and nginx exposes it as `GET /health`
on the gateway (`:8000`). See `../nginx-gateway.conf` and `../docker-compose.yml`.

Files: `health_aggregator.py` (the service), `Dockerfile` (python:3.12-slim, port 8010), `requirements.txt` (fastapi, uvicorn, httpx).

## Run

```bash
pip install -r requirements.txt
uvicorn health_aggregator:app --host 0.0.0.0 --port 8010
```
The default service URLs use Docker hostnames (`alert-engine`, `stock-engine`, …), so outside Docker set
`FINOS_SERVICES_JSON` to localhost URLs (below).

## Response

`GET /health` → `200` when `ok` or `degraded`, `503` when `down`.

```json
{
  "status": "ok | degraded | down",
  "gateway": "finos-v3",
  "services": [{ "name": "alerts", "status": "up", "latency_ms": 12 },
               { "name": "rag", "status": "down", "latency_ms": 2501, "detail": "ConnectTimeout" }],
  "checked_at": 1790000000
}
```

- A service is **down** on any connection error or HTTP 5xx; 4xx counts as up.
- Overall status is `down` if a **critical** service is down (`alerts`, `stocks`), `degraded` if only others are, else `ok`.
- Results are cached for 5 s, so polling can't hammer the backends.

## Monitored services (defaults)

| Name | URL | Critical |
| --- | --- | --- |
| alerts | `http://alert-engine:8001/health` | yes |
| stocks | `http://stock-engine:8003/api/health` | yes |
| docs | `http://document-ai:8004/health` | |
| market | `http://market-intel:5000/` | |
| arya | `http://arya-ai:7475/health` | |
| rag | `http://rag-engine:7476/api/health` | |

The voice agent (`:8765`) and Ollama (`:11434`) are not probed.

## Configuration

| Env var | Default | Meaning |
| --- | --- | --- |
| `FINOS_SERVICES_JSON` | built-in list above | JSON array `[{"name": "...", "url": "..."}]` replacing the list |
| `FINOS_HEALTH_TIMEOUT` | `2.5` | Per-probe timeout, seconds |

Limitations: the `CRITICAL` set is hard-coded in the source (it can't be set via env), and a custom
`FINOS_SERVICES_JSON` that renames services will leave them non-critical unless the names stay `alerts` / `stocks`.
