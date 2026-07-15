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

from config import SUPABASE_URL, SUPABASE_ANON_KEY
from data.market import get_quote

_TIMEOUT = httpx.Timeout(10.0)


def get_portfolio_summary(user_id: str) -> dict:
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return {"error": "Supabase not configured — set SUPABASE_URL/SUPABASE_ANON_KEY in arya-ai/.env"}

    try:
        resp = httpx.get(
            f"{SUPABASE_URL}/rest/v1/holdings",
            params={"user_id": f"eq.{user_id}", "select": "symbol,quantity,avg_price,current_price,asset_type"},
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {SUPABASE_ANON_KEY}"},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        holdings = resp.json()
    except httpx.HTTPError as e:
        return {"error": f"could not fetch holdings from Supabase: {e}"}

    if not holdings:
        return {
            "user_id": user_id, "holdings": [], "total_invested": 0,
            "total_current_value": 0, "total_pnl": 0, "total_pnl_pct": 0,
        }

    items = []
    total_invested = 0.0
    total_current = 0.0

    for h in holdings:
        symbol = h.get("symbol")
        qty = h.get("quantity") or 0
        avg_price = h.get("avg_price") or 0
        invested = qty * avg_price

        # F&O positions don't carry a tradeable cash-market symbol the same way
        # equities do — fall back to the DB's last-known current_price rather
        # than calling get_quote() on something that isn't a plain NSE ticker.
        if h.get("asset_type") in ("futures", "options") or not symbol:
            live_price = h.get("current_price") or avg_price
            price_source = "db_cached"
        else:
            quote = get_quote(symbol)
            if "error" in quote:
                live_price = h.get("current_price") or avg_price
                price_source = "db_cached_fallback"
            else:
                live_price = quote.get("price", h.get("current_price") or avg_price)
                price_source = "live"

        current_value = qty * live_price
        pnl = current_value - invested

        items.append({
            "symbol": symbol,
            "quantity": qty,
            "avg_price": avg_price,
            "current_price": live_price,
            "price_source": price_source,
            "invested_value": round(invested, 2),
            "current_value": round(current_value, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": round((pnl / invested * 100), 2) if invested else 0,
        })

        total_invested += invested
        total_current += current_value

    total_pnl = total_current - total_invested
    return {
        "user_id": user_id,
        "holdings": items,
        "total_invested": round(total_invested, 2),
        "total_current_value": round(total_current, 2),
        "total_pnl": round(total_pnl, 2),
        "total_pnl_pct": round((total_pnl / total_invested * 100), 2) if total_invested else 0,
    }
