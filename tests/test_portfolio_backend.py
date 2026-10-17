"""Security and calculation boundary tests for the local portfolio-analysis dependency."""
import importlib.util
from pathlib import Path

from fastapi.testclient import TestClient

SERVER_PATH = Path(__file__).resolve().parents[1] / "Porfolio Analyser" / "server.py"
SPEC = importlib.util.spec_from_file_location("finos_portfolio_analyser_server", SERVER_PATH)
portfolio_server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(portfolio_server)
client = TestClient(portfolio_server.app)


def test_analysis_rejects_bad_rows_and_values_before_model_or_market_calls(monkeypatch):
    def should_not_run(*_args, **_kwargs):
        raise AssertionError("invalid input must be rejected before external work")

    monkeypatch.setattr(portfolio_server, "_ollama_generate", should_not_run)
    for holdings in [None, [], ["TCS"], [{"symbol": "<script>", "value": 100}],
                     [{"symbol": "TCS", "value": float("inf")}],
                     [{"symbol": "TCS", "value": 100, "beta": 1000}],
                     [{"symbol": "TCS", "value": 100, "sector": "x" * 10000}]]:
        response = client.post("/ai-analysis", json={"holdings": holdings})
        assert response.status_code == 400


def test_analysis_caps_holdings_and_scenario_inputs(monkeypatch):
    monkeypatch.setattr(portfolio_server, "_ollama_generate", lambda *_a, **_k: "Observation.")
    row = {"symbol": "TCS", "value": 1000, "sector": "IT", "beta": 1}
    assert client.post("/ai-analysis", json={"holdings": [row] * 31}).status_code == 400
    assert client.post("/ai-analysis", json={"holdings": [row], "what_if_drop_pct": 101}).status_code == 400
    response = client.post("/ai-analysis", json={"holdings": [row], "what_if_drop_pct": 15})
    assert response.status_code == 200
    assert response.json()["metrics"]["what_if_scenario"]["estimated_loss"] == 150


def test_analysis_has_a_body_limit_and_strict_origin_allowlist():
    assert client.post("/ai-analysis", content=b" " * 65537,
                       headers={"Content-Type": "application/json"}).status_code == 413
    denied = client.options("/ai-analysis", headers={
        "Origin": "https://attacker.example", "Access-Control-Request-Method": "POST",
    })
    allowed = client.options("/ai-analysis", headers={
        "Origin": "https://finos1.vercel.app", "Access-Control-Request-Method": "POST",
    })
    assert "access-control-allow-origin" not in denied.headers
    assert allowed.headers.get("access-control-allow-origin") == "https://finos1.vercel.app"
    assert not allowed.headers.get("access-control-allow-credentials")


def test_unrealised_loss_rows_do_not_claim_flat_tax_savings():
    candidates = portfolio_server._find_tax_loss_candidates([
        {"symbol": "TCS", "unrealised_pnl": -10000},
    ])
    assert candidates == [{"symbol": "TCS", "pnl": -10000}]


def test_model_failures_do_not_leak_internal_error_details(monkeypatch):
    def fail(*_args, **_kwargs):
        raise RuntimeError("private endpoint and token details")

    monkeypatch.setattr(portfolio_server, "_ollama_generate", fail)
    response = client.post("/ai-analysis", json={
        "holdings": [{"symbol": "TCS", "value": 1000, "sector": "IT", "beta": 1}],
    })
    assert response.status_code == 200
    assert "private endpoint" not in response.json()["analysis"]
    assert "temporarily unavailable" in response.json()["analysis"]
