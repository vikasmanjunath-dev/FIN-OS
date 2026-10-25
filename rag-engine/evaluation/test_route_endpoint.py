"""POST /api/route contract + privacy tests. router_predict.predict is monkeypatched: no Ollama, no models.
Run: cd rag-engine && .venv/bin/pytest evaluation/test_route_endpoint.py -v"""
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "sml" / "runtime"))

from fastapi.testclient import TestClient  # noqa: E402
from server import app  # noqa: E402
import router_predict  # noqa: E402

SECRET = "my PAN is ABCDE1234F and I earn 1,25,000 a month"
DECISION = {"intent": "advice_seeking", "confidence": 0.91, "risk": "high", "high_risk_mass": 0.95,
            "needs_guard": True, "top3": [("advice_seeking", 0.91), ("spending_query", 0.05), ("other", 0.02)]}

client = TestClient(app)


def test_contract(monkeypatch):
    seen = []
    monkeypatch.setattr(router_predict, "predict", lambda t, *a, **k: (seen.append(t), DECISION)[1])
    r = client.post("/api/route", json={"text": "should I buy this stock?"})
    assert r.status_code == 200
    body = r.json()
    assert {"intent", "confidence", "risk", "high_risk_mass", "needs_guard", "top3"} <= set(body)
    assert body["needs_guard"] is True and body["risk"] == "high"
    assert seen == ["should I buy this stock?"]


def test_missing_body_is_422_not_500():
    assert client.post("/api/route", json={}).status_code == 422


def test_blank_text_is_422_and_never_reaches_the_router(monkeypatch):
    called = []
    monkeypatch.setattr(router_predict, "predict", lambda t, *a, **k: (called.append(t), DECISION)[1])
    assert client.post("/api/route", json={"text": "   \n"}).status_code == 422
    assert called == []


def test_failure_is_503_without_stack_trace(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("ollama down: " + SECRET)
    monkeypatch.setattr(router_predict, "predict", boom)
    r = client.post("/api/route", json={"text": SECRET})
    assert r.status_code == 503
    assert set(r.json()) == {"error"}
    assert "Traceback" not in r.text and "ABCDE1234F" not in r.text and "ollama down" not in r.text


def test_text_never_logged_or_printed(monkeypatch, caplog, capsys):
    monkeypatch.setattr(router_predict, "predict", lambda t, *a, **k: DECISION)
    with caplog.at_level(logging.DEBUG):
        assert client.post("/api/route", json={"text": SECRET}).status_code == 200
        monkeypatch.setattr(router_predict, "predict", lambda t, *a, **k: (_ for _ in ()).throw(ValueError(SECRET)))
        assert client.post("/api/route", json={"text": SECRET}).status_code == 503
    out = capsys.readouterr()
    for blob in (caplog.text, out.out, out.err):
        assert "ABCDE1234F" not in blob and "1,25,000" not in blob


def test_metric_has_labels_but_no_text(monkeypatch):
    import metrics
    from prometheus_client import generate_latest
    monkeypatch.setattr(router_predict, "predict", lambda t, *a, **k: DECISION)
    client.post("/api/route", json={"text": SECRET})
    exposition = generate_latest().decode()
    assert 'rag_router_decisions_total{intent="advice_seeking",needs_guard="true"}' in exposition
    assert "ABCDE1234F" not in exposition
