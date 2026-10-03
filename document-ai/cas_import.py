"""
Consolidated Account Statement (CAS) import — CAMS/KFintech and NSDL/CDSL PDFs → FIN-OS holdings rows.

Parsing is done by the open-source `casparser` library (real-world CAS layouts are messy; don't re-invent that).
This module only (a) calls it safely and (b) maps its typed result to the same row shape the browser's CSV importer
produces, so the net-worth page doesn't care where holdings came from.

Privacy: the PDF and its password live in memory only for the duration of the call. The result deliberately carries NO
PAN, e-mail, address, phone or folio holder name — only instruments, quantities and values.

The mapper is duck-typed (attributes OR dict keys), so it works on casparser's models, on plain dicts, and in tests
without casparser installed.
"""
from __future__ import annotations

import io
import math
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Optional

PDF_MAGIC = b"%PDF"


class CasError(Exception):
    """Raised with a message that is safe to show to the user."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _get(obj: Any, name: str, default: Any = None) -> Any:
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _num(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        f = float(v) if not isinstance(v, Decimal) else float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f else None  # NaN guard


def _round(v: Optional[float], d: int = 2) -> Optional[float]:
    return None if v is None else round(v, d)


def _half_up(v: float) -> int:
    """Round half up (like JavaScript's Math.round) so server and browser totals agree; Python's round() is banker's rounding."""
    return int(math.floor(v + 0.5))


def _iso(d: Any) -> Optional[str]:
    if d is None:
        return None
    if hasattr(d, "isoformat"):
        return d.isoformat()[:10]
    return str(d)[:10]


def _row(name, isin, kind, qty, price, value, invested=None, extra=None) -> Optional[Dict[str, Any]]:
    qty, price, value, invested = _num(qty), _num(price), _num(value), _num(invested)
    name = (str(name).strip() if name else "") or (str(isin) if isin else "")
    if not name or qty is None or qty <= 0:
        return None
    if value is None and price is not None:
        value = qty * price
    if value is None or value < 0:
        return None
    row = {"name": name, "isin": (str(isin).upper() if isin else None), "kind": kind, "qty": _round(qty, 4),
           "price": _round(price if price is not None else value / qty, 4), "value": _round(value)}
    if invested is not None and invested > 0:
        row["invested"] = _round(invested)
        row["avg"] = _round(invested / qty, 4)
        row["pnl"] = _round(value - invested)
    if extra:
        row.update({k: v for k, v in extra.items() if v is not None})
    return row


def _from_depository(data: Any, rows: List[dict], warnings: List[str]) -> None:
    for acct in _get(data, "accounts", []) or []:
        for e in _get(acct, "equities", []) or []:
            r = _row(_get(e, "name") or _get(e, "symbol"), _get(e, "isin"), "equity", _get(e, "num_shares"), _get(e, "price"), _get(e, "value"))
            if r:
                rows.append(r)
        for m in _get(acct, "mutual_funds", []) or []:
            r = _row(_get(m, "name"), _get(m, "isin"), "mf", _get(m, "balance"), _get(m, "nav"), _get(m, "value"), _get(m, "total_cost"))
            if r:
                rows.append(r)
        for b in _get(acct, "bonds", []) or []:
            r = _row(_get(b, "name"), _get(b, "isin"), "bond", _get(b, "num_bonds"), _get(b, "market_price") or _get(b, "face_value"), _get(b, "value"))
            if r:
                rows.append(r)
    nps = _get(data, "nps")
    for s in (_get(nps, "schemes", []) or []) if nps else []:
        r = _row(_get(s, "scheme"), None, "nps", _get(s, "units"), _get(s, "nav"), _get(s, "value"))
        if r:
            rows.append(r)
    if any(r["kind"] in ("bond", "nps") for r in rows):
        warnings.append("Bonds and NPS are listed but are not added to your equity / mutual-fund totals (NPS has its own tracker).")


def _from_registrar(data: Any, rows: List[dict], warnings: List[str]) -> None:
    for folio in _get(data, "folios", []) or []:
        fno = _get(folio, "folio")
        for s in _get(folio, "schemes", []) or []:
            val = _get(s, "valuation")
            units = _get(s, "close")
            if _num(units) is None:
                units = _get(s, "close_calculated")
            r = _row(_get(s, "scheme"), _get(s, "isin"), "mf", units, _get(val, "nav"), _get(val, "value"), _get(val, "cost"),
                     {"folio": str(fno) if fno else None, "amfi": _get(s, "amfi")})
            if r:
                rows.append(r)
    if not rows:
        warnings.append("No schemes with a non-zero balance were found in this statement.")


def cas_to_holdings(data: Any) -> Dict[str, Any]:
    """Map a casparser result (CASData / NSDLCASData / equivalent dict) to {rows, totals, as_of, source, warnings}."""
    rows: List[dict] = []
    warnings: List[str] = [str(w) for w in (_get(data, "parse_warnings", []) or [])]
    if _get(data, "accounts") is not None:
        source = "nsdl-cdsl"
        _from_depository(data, rows, warnings)
    else:
        source = "cams-kfin"
        _from_registrar(data, rows, warnings)
    period = _get(data, "statement_period")
    as_of = _iso(_get(period, "to")) or _iso(_get(period, "to_"))
    if as_of is None:                                                    # fall back to the latest valuation date
        dates = [_iso(_get(_get(s, "valuation"), "date")) for f in (_get(data, "folios", []) or []) for s in (_get(f, "schemes", []) or [])]
        as_of = max([d for d in dates if d], default=None)
    totals = {
        "equity": _half_up(sum(r["value"] for r in rows if r["kind"] == "equity")),
        "mf": _half_up(sum(r["value"] for r in rows if r["kind"] == "mf")),
        "invested": _half_up(sum(r.get("invested", 0) for r in rows if r["kind"] in ("equity", "mf"))),
        "count": len(rows),
    }
    return {"rows": rows, "totals": totals, "as_of": as_of, "source": source, "warnings": warnings}


def parse_pdf(pdf_bytes: bytes, password: str) -> Dict[str, Any]:
    """Read a CAS PDF held in memory. Raises CasError with a user-safe message."""
    if not pdf_bytes.startswith(PDF_MAGIC):
        raise CasError("That file is not a PDF.", 422)
    try:
        import casparser  # imported lazily: the rest of document-ai must run without it
    except ImportError as e:
        raise CasError("Statement import isn't installed on this server (pip install casparser).", 501) from e
    try:
        data = casparser.read_cas_pdf(io.BytesIO(pdf_bytes), password or "")
    except Exception as e:  # noqa: BLE001 — translate casparser's exception types by name, never echo the password
        name = type(e).__name__
        if "Password" in name:
            raise CasError("Wrong PDF password. CAS files are usually protected with your PAN (capital letters) — for some statements PAN + date of birth.", 400) from e
        if name in ("CASParseError", "UnsupportedFile", "ParseError") or "Parse" in name:
            raise CasError("This doesn't look like a CAMS / KFintech / NSDL / CDSL consolidated statement.", 422) from e
        raise CasError("Couldn't read that statement.", 422) from e
    return cas_to_holdings(data)
