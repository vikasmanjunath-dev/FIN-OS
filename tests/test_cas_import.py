"""CAS import: mapping, privacy, error handling, HTTP endpoint. Uses casparser's real model classes when installed."""
import datetime as dt
import io
import os
import sys
from decimal import Decimal

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
DOC_AI = os.path.join(os.path.dirname(HERE), "document-ai")
sys.path.insert(0, DOC_AI)
import cas_import  # noqa: E402


CAMS = {
    "statement_period": {"from_": "2025-04-01", "to": "2026-09-30"},
    "investor_info": {"name": "Asha K", "email": "asha@example.com", "address": "12 MG Road", "mobile": "9999999999"},
    "folios": [
        {"folio": "1234567/89", "amc": "PPFAS Mutual Fund", "PAN": "ABCDE1234F", "schemes": [
            {"scheme": "Parag Parikh Flexi Cap Fund - Direct Growth", "isin": "INF879O01027", "amfi": "122639",
             "close": Decimal("1234.567"), "valuation": {"date": "2026-09-30", "nav": Decimal("78.9"), "value": Decimal("97406.99"), "cost": Decimal("68148")}},
            {"scheme": "Closed Scheme", "isin": "INF000000001", "close": Decimal("0"), "valuation": {"date": "2026-09-30", "nav": Decimal("10"), "value": Decimal("0")}},
        ]},
        {"folio": "777", "amc": "Axis MF", "PAN": "ABCDE1234F", "schemes": [
            {"scheme": "Axis Bluechip Fund", "isin": "INF846K01DP8", "close": Decimal("500"), "valuation": {"date": "2026-09-30", "nav": Decimal("60"), "value": Decimal("30000")}},
        ]},
    ],
    "cas_type": "DETAILED", "file_type": "CAMS", "parse_warnings": [],
}

NSDL = {
    "statement_period": {"from_": "2026-09-01", "to": "2026-09-30"},
    "investor_info": {"name": "Asha K", "email": "x@y.z", "address": "addr", "mobile": "1"},
    "accounts": [{"name": "Zerodha", "type": "NSDL", "balance": Decimal("0"), "owners": [], "folios": 1,
                  "equities": [{"name": "HDFC BANK LTD", "isin": "INE040A01034", "num_shares": Decimal("10"), "price": Decimal("1620.25"), "value": Decimal("16202.5")},
                               {"name": "Zero Qty Co", "isin": "INE000000002", "num_shares": Decimal("0"), "price": Decimal("5"), "value": Decimal("0")}],
                  "mutual_funds": [{"name": "SBI Small Cap", "isin": "INF200K01RO2", "balance": Decimal("100"), "nav": Decimal("150"), "value": Decimal("15000"), "total_cost": Decimal("12000")}],
                  "bonds": [{"name": "GOI 2030", "isin": "IN0020200000", "num_bonds": Decimal("2"), "value": Decimal("2100"), "face_value": Decimal("1000")}]}],
    "nps": {"pran": "1234", "value": Decimal("50000"), "schemes": [{"scheme": "SBI Pension Equity", "units": Decimal("1000"), "nav": Decimal("50"), "value": Decimal("50000")}]},
}


def test_cams_kfintech_mapping():
    r = cas_import.cas_to_holdings(CAMS)
    assert r["source"] == "cams-kfin" and r["as_of"] == "2026-09-30"
    names = [x["name"] for x in r["rows"]]
    assert names == ["Parag Parikh Flexi Cap Fund - Direct Growth", "Axis Bluechip Fund"]          # zero-balance scheme dropped
    ppfas = r["rows"][0]
    assert (ppfas["kind"], ppfas["isin"], ppfas["qty"], ppfas["value"], ppfas["invested"], ppfas["pnl"]) == ("mf", "INF879O01027", 1234.567, 97406.99, 68148.0, 29258.99)
    assert ppfas["folio"] == "1234567/89" and ppfas["amfi"] == "122639"
    assert r["rows"][1].get("invested") is None                                                  # no cost in the statement → not invented
    assert r["totals"] == {"equity": 0, "mf": 127407, "invested": 68148, "count": 2}


def test_nsdl_cdsl_mapping_including_bonds_and_nps():
    r = cas_import.cas_to_holdings(NSDL)
    assert r["source"] == "nsdl-cdsl"
    by_kind = {}
    for x in r["rows"]:
        by_kind.setdefault(x["kind"], []).append(x["name"])
    assert by_kind == {"equity": ["HDFC BANK LTD"], "mf": ["SBI Small Cap"], "bond": ["GOI 2030"], "nps": ["SBI Pension Equity"]}
    assert r["totals"]["equity"] == 16203 and r["totals"]["mf"] == 15000
    assert any("Bonds and NPS" in w for w in r["warnings"])
    mf = next(x for x in r["rows"] if x["kind"] == "mf")
    assert (mf["avg"], mf["pnl"]) == (120.0, 3000.0)


def test_result_carries_no_personal_identifiers():
    blob = repr(cas_import.cas_to_holdings(CAMS)) + repr(cas_import.cas_to_holdings(NSDL))
    for pii in ("ABCDE1234F", "asha@example.com", "MG Road", "9999999999", "Asha K"):
        assert pii not in blob, pii


def test_empty_statement_gives_a_warning_not_an_error():
    r = cas_import.cas_to_holdings({"folios": [], "statement_period": {"to": "2026-09-30"}})
    assert r["rows"] == [] and any("No schemes" in w for w in r["warnings"])


def test_works_on_real_casparser_models_when_installed():
    types = pytest.importorskip("casparser.types")
    # model_construct: real classes and attribute access, without needing to satisfy every validator
    val = types.SchemeValuation.model_construct(date=dt.date(2026, 9, 30), nav=Decimal("78.9"), cost=Decimal("68148"), value=Decimal("97406.99"))
    scheme = types.Scheme.model_construct(scheme="Parag Parikh Flexi Cap", isin="INF879O01027", amfi="122639", close=Decimal("1234.567"), close_calculated=Decimal("1234.567"), valuation=val, transactions=[])
    folio = types.Folio.model_construct(folio="123", amc="PPFAS", PAN="ABCDE1234F", schemes=[scheme])
    period = types.StatementPeriod.model_construct(from_=dt.date(2025, 4, 1), to=dt.date(2026, 9, 30))
    data = types.CASData.model_construct(statement_period=period, folios=[folio], parse_warnings=[])
    r = cas_import.cas_to_holdings(data)
    assert r["rows"][0]["value"] == 97406.99 and r["rows"][0]["invested"] == 68148.0 and "ABCDE1234F" not in repr(r)
    assert r["as_of"] == "2026-09-30" and r["source"] == "cams-kfin"

    eq = types.Equity.model_construct(name="HDFC BANK", isin="INE040A01034", num_shares=Decimal("10"), price=Decimal("1620.25"), value=Decimal("16202.5"))
    acct = types.DematAccount.model_construct(equities=[eq], mutual_funds=[], bonds=[])
    n = types.NSDLCASData.model_construct(accounts=[acct], statement_period=period, nps=None, parse_warnings=[])
    r2 = cas_import.cas_to_holdings(n)
    assert r2["source"] == "nsdl-cdsl" and r2["totals"]["equity"] == 16203          # half-up, matching the browser importer


# ── parse_pdf error handling ─────────────────────────────────────────────────
def test_non_pdf_rejected():
    with pytest.raises(cas_import.CasError) as e:
        cas_import.parse_pdf(b"hello", "pw")
    assert e.value.status == 422


def test_missing_library_is_a_clear_501(monkeypatch):
    monkeypatch.setitem(sys.modules, "casparser", None)                    # makes `import casparser` raise ImportError
    with pytest.raises(cas_import.CasError) as e:
        cas_import.parse_pdf(b"%PDF-1.4 x", "pw")
    assert e.value.status == 501 and "casparser" in str(e.value)


def test_wrong_password_message_never_echoes_the_password(monkeypatch):
    class IncorrectPasswordError(Exception):
        pass
    fake = type(sys)("casparser")
    def boom(*a, **k):
        raise IncorrectPasswordError("bad password: SECRET123")
    fake.read_cas_pdf = boom
    monkeypatch.setitem(sys.modules, "casparser", fake)
    with pytest.raises(cas_import.CasError) as e:
        cas_import.parse_pdf(b"%PDF-1.4 x", "SECRET123")
    assert e.value.status == 400 and "SECRET123" not in str(e.value) and "PAN" in str(e.value)


def test_unparseable_statement_message(monkeypatch):
    class CASParseError(Exception):
        pass
    fake = type(sys)("casparser")
    fake.read_cas_pdf = lambda *a, **k: (_ for _ in ()).throw(CASParseError("x"))
    monkeypatch.setitem(sys.modules, "casparser", fake)
    with pytest.raises(cas_import.CasError) as e:
        cas_import.parse_pdf(b"%PDF-1.4 x", "pw")
    assert e.value.status == 422 and "CAMS" in str(e.value)


def test_pdf_is_parsed_from_memory_with_the_password(monkeypatch):
    seen = {}
    fake = type(sys)("casparser")
    def ok(f, password, **k):
        seen["file_like"] = hasattr(f, "read"); seen["pw"] = password
        return CAMS
    fake.read_cas_pdf = ok
    monkeypatch.setitem(sys.modules, "casparser", fake)
    r = cas_import.parse_pdf(b"%PDF-1.4 data", "ABCDE1234F")
    assert seen == {"file_like": True, "pw": "ABCDE1234F"} and r["totals"]["count"] == 2


# ── HTTP endpoint ────────────────────────────────────────────────────────────
@pytest.fixture()
def client(monkeypatch):
    pytest.importorskip("fastapi")
    pytest.importorskip("httpx")
    from fastapi.testclient import TestClient
    try:
        import server  # document-ai/server.py
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"document-ai server not importable here: {e}")
    return TestClient(server.app), server


def test_endpoint_returns_holdings_and_maps_errors(client, monkeypatch):
    c, server = client
    monkeypatch.setattr(cas_import, "parse_pdf", lambda b, p: cas_import.cas_to_holdings(CAMS))
    r = c.post("/parse/cas", files={"file": ("cas.pdf", io.BytesIO(b"%PDF-1.4 x"), "application/pdf")}, data={"password": "x"})
    assert r.status_code == 200 and r.json()["totals"]["count"] == 2

    def bad(b, p):
        raise cas_import.CasError("Wrong PDF password.", 400)
    monkeypatch.setattr(cas_import, "parse_pdf", bad)
    r = c.post("/parse/cas", files={"file": ("cas.pdf", io.BytesIO(b"%PDF-1.4 x"), "application/pdf")}, data={"password": "x"})
    assert r.status_code == 400 and r.json()["detail"] == "Wrong PDF password."

    monkeypatch.setattr(server, "MAX_FILE_SIZE", 5)
    r = c.post("/parse/cas", files={"file": ("cas.pdf", io.BytesIO(b"%PDF-1.4 too big"), "application/pdf")}, data={"password": "x"})
    assert r.status_code == 413
