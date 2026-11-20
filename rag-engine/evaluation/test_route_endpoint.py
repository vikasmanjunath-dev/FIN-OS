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


# ── two-stage guard SHADOW (sml/TRACKER.md): counters only, off by default, never changes the reply ─────────────────────────────────────
import two_stage_judge  # noqa: E402
import metrics  # noqa: E402


def _judge_count(flag, verdict):
    return metrics.ROUTER_JUDGE.labels(router_flag=flag, verdict=verdict)._value.get()


def test_judge_shadow_is_off_by_default(monkeypatch):
    monkeypatch.delenv("FINOS_ROUTER_JUDGE_SHADOW", raising=False)
    monkeypatch.setattr(router_predict, "predict", lambda t, *a, **k: DECISION)
    called = []
    monkeypatch.setattr(two_stage_judge, "judge", lambda t, *a, **k: called.append(t) or "OTHER")
    assert client.post("/api/route", json={"text": SECRET}).status_code == 200
    assert called == []


def test_judge_shadow_counts_off_path_and_leaves_the_reply_alone(monkeypatch):
    monkeypatch.setenv("FINOS_ROUTER_JUDGE_SHADOW", "1")
    monkeypatch.setattr(router_predict, "predict", lambda t, *a, **k: DECISION)
    seen = []
    monkeypatch.setattr(two_stage_judge, "judge", lambda t, *a, **k: seen.append(t) or "OTHER")
    before = _judge_count("class", "other")
    r = client.post("/api/route", json={"text": SECRET})
    assert r.status_code == 200 and r.json()["intent"] == "advice_seeking" and r.json()["needs_guard"] is True   # the judge's OTHER does not change the reply
    assert seen == [SECRET]
    assert _judge_count("class", "other") == before + 1
    body, _ = metrics.render()
    assert b"ABCDE1234F" not in body and b"1,25,000" not in body                                            # labels only, never text


def test_judge_shadow_labels_a_mass_flag_and_survives_a_judge_failure(monkeypatch):
    monkeypatch.setenv("FINOS_ROUTER_JUDGE_SHADOW", "1")
    monkeypatch.setattr(router_predict, "predict", lambda t, *a, **k: {**DECISION, "intent": "concept_explainer", "risk": "low", "high_risk_mass": 0.4})
    def boom(t, *a, **k): raise OSError("ollama down")
    monkeypatch.setattr(two_stage_judge, "judge", boom)
    before = _judge_count("mass", "error")
    r = client.post("/api/route", json={"text": "what is the penalty for tax evasion"})
    assert r.status_code == 200 and r.json()["intent"] == "concept_explainer"
    assert _judge_count("mass", "error") == before + 1


def test_judge_shadow_ignores_unflagged_messages(monkeypatch):
    monkeypatch.setenv("FINOS_ROUTER_JUDGE_SHADOW", "1")
    monkeypatch.setattr(router_predict, "predict", lambda t, *a, **k: {**DECISION, "intent": "smalltalk", "risk": "low", "needs_guard": False, "high_risk_mass": 0.01})
    called = []
    monkeypatch.setattr(two_stage_judge, "judge", lambda t, *a, **k: called.append(t) or "OTHER")
    assert client.post("/api/route", json={"text": "hi there"}).status_code == 200
    assert called == []


def test_judge_maps_the_models_word_and_skips_when_busy(monkeypatch):
    import io, json as _json
    class R(io.BytesIO): pass
    def fake(word):
        return lambda req, timeout=0: R(_json.dumps({"response": word}).encode())
    for word, want in (("ADVICE", "ADVICE"), (" evasion.", "EVASION"), ("OTHER", "OTHER"), ("something odd", "OTHER")):
        monkeypatch.setattr(two_stage_judge.urllib.request, "urlopen", fake(word))
        assert two_stage_judge.judge("x") == want
    assert two_stage_judge._busy.acquire(blocking=False)                   # simulate a call in flight
    try:
        assert two_stage_judge.judge("x") == "BUSY"
    finally:
        two_stage_judge._busy.release()
