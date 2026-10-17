"""
Arya AI — Portfolio Summary
Reads holdings from Supabase (the only Supabase dependency in this otherwise-
standalone service) and refreshes each one's price live via the same
get_quote() used by every other endpoint — so this returns real-time
valuation, not whatever current_price was last written to the DB.

holdings table columns used (confirmed against real queries elsewhere in this
project, e.g. js/finos-context.js and alerts/alert-engine.py — not guessed):
  user_id, symbol, quantity, avg_price, current_price, asset_type
"""
import httpx
import math

from config import SUPABASE_URL, SUPABASE_ANON_KEY
from data.market import get_multiple_quotes, get_mf_nav

_TIMEOUT = httpx.Timeout(10.0)


def _amount(value) -> float | None:
    """Accept finite, non-negative monetary/unit values; reject booleans and malformed DB rows."""
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if math.isfinite(number) and number >= 0 else None


def get_portfolio_summary(user_id: str, access_token: str | None = None) -> dict:
    """The caller's verified Supabase session token is required so RLS scopes the query to that user."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return {"error": "Supabase not configured — set SUPABASE_URL/SUPABASE_ANON_KEY in arya-ai/.env"}
    if not access_token:
        return {"error": "A verified Supabase session token is required"}

    try:
        resp = httpx.get(
            f"{SUPABASE_URL}/rest/v1/holdings",
            params={"user_id": f"eq.{user_id}", "select": "symbol,quantity,avg_price,current_price,asset_type"},
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {access_token}"},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        holdings = resp.json()
    except httpx.HTTPError as e:
        # not str(e): httpx puts the full request URL (project address + the filter on the user id) in the message
        status = getattr(getattr(e, "response", None), "status_code", None)
        return {"error": "could not fetch holdings from Supabase" + (f" (HTTP {status})" if status else f" ({type(e).__name__})")}
    except (ValueError, TypeError):
        return {"error": "could not fetch holdings from Supabase (invalid JSON response)"}

    if not isinstance(holdings, list):
        return {"error": "could not fetch holdings from Supabase (invalid response format)"}
    if not holdings:
        return {
            "user_id": user_id, "holdings": [], "total_invested": 0,
            "total_current_value": 0, "total_pnl": 0, "total_pnl_pct": None, "invalid_holdings": 0,
        }

    items = []
    total_invested = 0.0
    total_current = 0.0

    # Fetch equity quotes in bounded concurrent batches. Calling get_quote serially
    # made one slow provider multiply its latency by the number of holdings.
    stock_symbols = []
    for h in holdings:
        if not isinstance(h, dict) or str(h.get("asset_type") or "").strip().lower() not in ("equity", "stock"):
            continue
        symbol = h.get("symbol")
        qty, avg = _amount(h.get("quantity")), _amount(h.get("avg_price"))
        if isinstance(symbol, str) and symbol.strip() and qty is not None and avg is not None and math.isfinite(qty * avg):
            stock_symbols.append(symbol.strip()[:40])
    quotes = {}
    unique_stock_symbols = list(dict.fromkeys(stock_symbols))
    for i in range(0, len(unique_stock_symbols), 60):
        batch = unique_stock_symbols[i:i + 60]
        try:
            quotes.update({str(q.get("symbol", "")).upper(): q for q in get_multiple_quotes(batch) if isinstance(q, dict)})
        except Exception:
            # A batch failure falls back to each holding's saved quote/cost below.
            pass

    invalid_holdings = 0
    for h in holdings:
        if not isinstance(h, dict):
            invalid_holdings += 1
            continue
        symbol = h.get("symbol")
        symbol = symbol.strip()[:40] if isinstance(symbol, str) else ""
        qty, avg_price = _amount(h.get("quantity")), _amount(h.get("avg_price"))
        cached_price = _amount(h.get("current_price"))
        if not symbol or qty is None or avg_price is None:
            invalid_holdings += 1
            continue
        invested = qty * avg_price
        if not math.isfinite(invested):
            invalid_holdings += 1
            continue

        asset_type = str(h.get("asset_type") or "").strip().lower()
        fallback = cached_price if cached_price is not None and cached_price > 0 else avg_price
        price_source = "db_cached" if cached_price is not None and cached_price > 0 else "avg_cost_fallback"
        live_price = fallback
        if asset_type in ("equity", "stock"):
            quote = quotes.get(symbol.upper(), {})
            quote_price = _amount(quote.get("price")) if isinstance(quote, dict) else None
            if quote_price is not None and quote_price > 0:
                live_price, price_source = quote_price, "market_quote"
            elif cached_price is not None and cached_price > 0:
                price_source = "db_cached_fallback"
        elif asset_type in ("mutual_fund", "mf", "elss"):
            try:
                nav = get_mf_nav(symbol)
                nav_value = _amount(nav.get("nav")) if isinstance(nav, dict) else None
                if nav_value is not None and nav_value > 0:
                    live_price, price_source = nav_value, "amfi_nav"
                elif cached_price is not None and cached_price > 0:
                    price_source = "db_cached_fallback"
            except Exception:
                if cached_price is not None and cached_price > 0:
                    price_source = "db_cached_fallback"

        current_value = qty * live_price
        pnl = current_value - invested
        if not all(math.isfinite(x) for x in (live_price, current_value, pnl)):
            invalid_holdings += 1
            continue
        pnl_pct = (pnl / invested * 100) if invested else None
        if pnl_pct is not None and not math.isfinite(pnl_pct):
            pnl_pct = None

        new_total_invested = total_invested + invested
        new_total_current = total_current + current_value
        if not math.isfinite(new_total_invested) or not math.isfinite(new_total_current):
            # Reject the row before changing the aggregate so totals remain finite and consistent.
            invalid_holdings += 1
            continue

        items.append({
            "symbol": symbol,
            "quantity": qty,
            "avg_price": avg_price,
            "current_price": live_price,
            "price_source": price_source,
            "invested_value": round(invested, 2),
            "current_value": round(current_value, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 2) if pnl_pct is not None else None,
        })

        total_invested = new_total_invested
        total_current = new_total_current

    total_pnl = total_current - total_invested
    total_pnl_pct = (total_pnl / total_invested * 100) if total_invested else None
    if total_pnl_pct is not None and not math.isfinite(total_pnl_pct):
        total_pnl_pct = None
    return {
        "user_id": user_id,
        "holdings": items,
        "invalid_holdings": invalid_holdings,
        "total_invested": round(total_invested, 2),
        "total_current_value": round(total_current, 2),
        "total_pnl": round(total_pnl, 2),
        "total_pnl_pct": round(total_pnl_pct, 2) if total_pnl_pct is not None else None,
    }
