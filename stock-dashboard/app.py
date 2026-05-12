"""
Stock Market Dashboard - Flask Backend
Production-grade API with yfinance, caching, NaN sanitization, and CORS
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import yfinance as yf
import time
import math
from datetime import datetime
import threading
import traceback

app = Flask(__name__)
CORS(app)

# ─── In-memory cache ────────────────────────────────────────────────────────
_cache = {}
_cache_lock = threading.Lock()
CACHE_TTL = 10  # seconds

def get_cached(key):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and (time.time() - entry["ts"]) < CACHE_TTL:
            return entry["data"]
    return None

def set_cached(key, data):
    with _cache_lock:
        _cache[key] = {"data": data, "ts": time.time()}

# ─── Safe Data Sanitizers (The Fix for NaN Crashes) ─────────────────────────
def safe_float(val, default=None):
    try:
        if val is None:
            return default
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return round(f, 4)
    except Exception:
        return default

def safe_int(val, default=0):
    try:
        if val is None:
            return default
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return int(f)
    except Exception:
        return default

def format_history(hist_df):
    records = []
    for ts, row in hist_df.iterrows():
        records.append({
            "time": int(ts.timestamp()) if hasattr(ts, "timestamp") else str(ts),
            "open": safe_float(row.get("Open"), 0),
            "high": safe_float(row.get("High"), 0),
            "low": safe_float(row.get("Low"), 0),
            "close": safe_float(row.get("Close"), 0),
            "volume": safe_int(row.get("Volume"), 0),
        })
    return records

PERIOD_MAP = {
    "1D": {"period": "1d",  "interval": "5m"},
    "5D": {"period": "5d",  "interval": "15m"},
    "1M": {"period": "1mo", "interval": "1d"},
    "3M": {"period": "3mo", "interval": "1d"},
    "1Y": {"period": "1y",  "interval": "1wk"},
    "5Y": {"period": "5y",  "interval": "1mo"},
}

def get_market_status(ticker_str):
    now_utc = datetime.utcnow()
    if any(x in ticker_str.upper() for x in [".NS", ".BO"]):
        weekday = now_utc.weekday()
        if weekday >= 5: return "CLOSED"
        market_open = now_utc.replace(hour=3, minute=45, second=0, microsecond=0)
        market_close = now_utc.replace(hour=10, minute=0, second=0, microsecond=0)
        if market_open <= now_utc <= market_close: return "OPEN"
        elif now_utc < market_open: return "PRE"
        else: return "CLOSED"
    else:
        weekday = now_utc.weekday()
        if weekday >= 5: return "CLOSED"
        pre_open = now_utc.replace(hour=9, minute=0, second=0, microsecond=0)
        market_open = now_utc.replace(hour=13, minute=30, second=0, microsecond=0)
        market_close = now_utc.replace(hour=20, minute=0, second=0, microsecond=0)
        if market_open <= now_utc <= market_close: return "OPEN"
        elif pre_open <= now_utc < market_open: return "PRE"
        elif market_close < now_utc: return "AFTER"
        else: return "CLOSED"

# ─── Routes ─────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "timestamp": datetime.utcnow().isoformat()})

@app.route("/stock", methods=["GET"])
def get_stock():
    ticker_str = request.args.get("ticker", "").strip().upper()
    period_key = request.args.get("period", "1D").upper()

    if not ticker_str:
        return jsonify({"error": "ticker parameter is required"}), 400

    cache_key = f"{ticker_str}_{period_key}"
    cached = get_cached(cache_key)
    if cached:
        cached["cached"] = True
        return jsonify(cached)

    try:
        # Let yfinance handle the connection session natively
        ticker = yf.Ticker(ticker_str)

        period_cfg = PERIOD_MAP.get(period_key, PERIOD_MAP["1D"])
        hist = ticker.history(period=period_cfg["period"], interval=period_cfg["interval"])
        
        if hist.empty:
            return jsonify({"error": f"Ticker '{ticker_str}' not found or no data available"}), 404
            
        history = format_history(hist)

        info = {}
        try:
            info = ticker.info or {}
        except Exception:
            pass

        name = info.get("longName") or info.get("shortName") or ticker_str
        market_cap = info.get("marketCap")
        pe_ratio = safe_float(info.get("trailingPE"))
        week_52_high = safe_float(info.get("fiftyTwoWeekHigh"))
        week_52_low = safe_float(info.get("fiftyTwoWeekLow"))
        currency = info.get("currency", "USD")
        exchange = info.get("exchange", "")

        fallback_close = history[-1]["close"] if len(history) > 0 else 0.0
        
        try:
            fi = ticker.fast_info
            current_price = safe_float(fi.last_price)
            open_price = safe_float(fi.open)
            prev_close = safe_float(fi.previous_close)
            day_high = safe_float(fi.day_high)
            day_low = safe_float(fi.day_low)
            volume = safe_int(fi.last_volume, 0)
        except Exception:
            current_price = safe_float(info.get("currentPrice") or info.get("regularMarketPrice") or fallback_close)
            open_price = safe_float(info.get("open") or info.get("regularMarketOpen"), 0)
            prev_close = safe_float(info.get("previousClose") or info.get("regularMarketPreviousClose"))
            day_high = safe_float(info.get("dayHigh") or info.get("regularMarketDayHigh"), 0)
            day_low = safe_float(info.get("dayLow") or info.get("regularMarketDayLow"), 0)
            volume = safe_int(info.get("volume") or info.get("regularMarketVolume"), 0)

        change = 0.0
        change_pct = 0.0
        
        if prev_close is None and open_price is not None:
            prev_close = open_price

        if current_price is not None and prev_close is not None and prev_close != 0:
            change = round(current_price - prev_close, 4)
            change_pct = round((change / prev_close) * 100, 2)

        market_status = get_market_status(ticker_str)
        insight = generate_insight(current_price, prev_close, volume, change_pct, hist)

        result = {
            "ticker": ticker_str,
            "name": name,
            "exchange": exchange,
            "currency": currency,
            "price": current_price or 0,
            "open": open_price or 0,
            "high": day_high or 0,
            "low": day_low or 0,
            "prev_close": prev_close or 0,
            "volume": volume,
            "change": change,
            "change_pct": change_pct,
            "market_cap": market_cap,
            "pe_ratio": pe_ratio,
            "week_52_high": week_52_high,
            "week_52_low": week_52_low,
            "market_status": market_status,
            "period": period_key,
            "history": history,
            "insight": insight,
            "cached": False,
            "fetched_at": datetime.utcnow().isoformat(),
        }

        set_cached(cache_key, result)
        return jsonify(result)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/compare", methods=["GET"])
def compare_stocks():
    tickers_param = request.args.get("tickers", "")
    period_key = request.args.get("period", "1M").upper()
    tickers_list = [t.strip().upper() for t in tickers_param.split(",") if t.strip()]

    if not tickers_list: return jsonify({"error": "tickers parameter required"}), 400
    if len(tickers_list) > 5: return jsonify({"error": "max 5 tickers for comparison"}), 400

    period_cfg = PERIOD_MAP.get(period_key, PERIOD_MAP["1M"])
    results = {}

    for t in tickers_list:
        try:
            # Let yfinance handle connection
            ticker = yf.Ticker(t)
            hist = ticker.history(period=period_cfg["period"], interval=period_cfg["interval"])
            
            if hist.empty or "Close" not in hist.columns:
                results[t] = {"error": "Invalid Ticker or No Data", "times": [], "normalized": [], "raw": []}
                continue

            # Strip out NaNs to prevent Frontend JSON.parse failure
            valid_times = []
            valid_closes = []
            
            for ts, c in zip(hist.index, hist["Close"]):
                val = safe_float(c)
                if val is not None:
                    valid_times.append(int(ts.timestamp()))
                    valid_closes.append(val)
            
            if valid_closes and valid_closes[0] != 0:
                base = valid_closes[0]
                normalized = [round(((c - base) / base) * 100, 2) for c in valid_closes]
            else:
                normalized = [0] * len(valid_closes)
                
            results[t] = {"times": valid_times, "normalized": normalized, "raw": valid_closes}
        except Exception as e:
            traceback.print_exc()
            results[t] = {"error": str(e), "times": [], "normalized": [], "raw": []}

    return jsonify({"period": period_key, "stocks": results})

@app.route("/sparkline", methods=["GET"])
def get_sparkline():
    ticker_str = request.args.get("ticker", "").strip().upper()
    if not ticker_str: return jsonify({"error": "ticker required"}), 400
    cache_key = f"spark_{ticker_str}"
    cached = get_cached(cache_key)
    if cached: return jsonify(cached)

    try:
        # Let yfinance handle connection
        ticker = yf.Ticker(ticker_str)
        hist = ticker.history(period="7d", interval="1d")
        if hist.empty or "Close" not in hist.columns:
            return jsonify({"ticker": ticker_str, "closes": []})
        
        # Strip out NaNs
        closes = [safe_float(v) for v in hist["Close"].tolist() if safe_float(v) is not None]
        
        result = {"ticker": ticker_str, "closes": closes}
        set_cached(cache_key, result)
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/search", methods=["GET"])
def search_ticker():
    query = request.args.get("q", "").strip().lower()
    if not query or len(query) < 1: return jsonify({"results": []})

    POPULAR = [
        {"symbol": "RELIANCE.NS", "name": "Reliance Industries", "exchange": "NSE"},
        {"symbol": "TCS.NS", "name": "Tata Consultancy Services", "exchange": "NSE"},
        {"symbol": "INFY.NS", "name": "Infosys", "exchange": "NSE"},
        {"symbol": "HDFCBANK.NS", "name": "HDFC Bank", "exchange": "NSE"},
        {"symbol": "WIPRO.NS", "name": "Wipro", "exchange": "NSE"},
        {"symbol": "ICICIBANK.NS", "name": "ICICI Bank", "exchange": "NSE"},
        {"symbol": "BAJFINANCE.NS", "name": "Bajaj Finance", "exchange": "NSE"},
        {"symbol": "SBIN.NS", "name": "State Bank of India", "exchange": "NSE"},
        {"symbol": "ADANIENT.NS", "name": "Adani Enterprises", "exchange": "NSE"},
        {"symbol": "HINDUNILVR.NS", "name": "Hindustan Unilever", "exchange": "NSE"},
        {"symbol": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ"},
        {"symbol": "MSFT", "name": "Microsoft Corporation", "exchange": "NASDAQ"},
        {"symbol": "GOOGL", "name": "Alphabet Inc.", "exchange": "NASDAQ"},
        {"symbol": "AMZN", "name": "Amazon.com Inc.", "exchange": "NASDAQ"},
        {"symbol": "TSLA", "name": "Tesla Inc.", "exchange": "NASDAQ"},
        {"symbol": "NVDA", "name": "NVIDIA Corporation", "exchange": "NASDAQ"},
        {"symbol": "META", "name": "Meta Platforms Inc.", "exchange": "NASDAQ"},
        {"symbol": "NFLX", "name": "Netflix Inc.", "exchange": "NASDAQ"},
        {"symbol": "AMD", "name": "Advanced Micro Devices", "exchange": "NASDAQ"},
        {"symbol": "INTC", "name": "Intel Corporation", "exchange": "NASDAQ"},
        {"symbol": "JPM", "name": "JPMorgan Chase & Co.", "exchange": "NYSE"},
        {"symbol": "BRK-B", "name": "Berkshire Hathaway", "exchange": "NYSE"},
        {"symbol": "V", "name": "Visa Inc.", "exchange": "NYSE"},
        {"symbol": "JNJ", "name": "Johnson & Johnson", "exchange": "NYSE"},
        {"symbol": "WMT", "name": "Walmart Inc.", "exchange": "NYSE"},
        {"symbol": "^NSEI", "name": "NIFTY 50 Index", "exchange": "NSE"},
        {"symbol": "^BSESN", "name": "BSE SENSEX", "exchange": "BSE"},
        {"symbol": "^GSPC", "name": "S&P 500", "exchange": "NYSE"},
        {"symbol": "^DJI", "name": "Dow Jones", "exchange": "NYSE"},
        {"symbol": "^IXIC", "name": "NASDAQ Composite", "exchange": "NASDAQ"},
    ]

    matches = [t for t in POPULAR if query in t["symbol"].lower() or query in t["name"].lower()][:8]
    return jsonify({"results": matches})

def generate_insight(price, prev_close, volume, change_pct, hist_df):
    insights = []
    if change_pct is not None:
        if change_pct > 3: insights.append("🚀 Strong bullish momentum — stock is surging today")
        elif change_pct > 1: insights.append("📈 Stock is trending bullish today")
        elif change_pct < -3: insights.append("📉 Heavy selling pressure — strong bearish move")
        elif change_pct < -1: insights.append("🔻 Stock is trending bearish today")
        else: insights.append("➡️ Stock is trading sideways — low volatility")

    if not hist_df.empty and "Volume" in hist_df.columns:
        # Strip NaNs before math operations
        vols = [v for v in hist_df["Volume"].tolist() if not math.isnan(v)]
        if len(vols) > 5:
            avg_vol = sum(vols[:-1]) / max(len(vols) - 1, 1)
            curr_vol = vols[-1] if vols[-1] else 0
            if avg_vol > 0 and curr_vol > avg_vol * 2:
                insights.append("⚡ Volume spike detected — unusual activity")
            elif avg_vol > 0 and curr_vol < avg_vol * 0.3:
                insights.append("😴 Low volume — limited market interest today")

    if not hist_df.empty and "Close" in hist_df.columns:
        closes = [c for c in hist_df["Close"].tolist() if not math.isnan(c)]
        if closes and price:
            high_52 = max(closes)
            low_52 = min(closes)
            if price >= high_52 * 0.98: insights.append("🏆 Near 52-week high — strong uptrend")
            elif price <= low_52 * 1.02: insights.append("⚠️ Near 52-week low — potential support zone")

    return insights if insights else ["📊 Insufficient data for insight generation"]

@app.errorhandler(404)
def not_found(e): 
    return jsonify({"error": "endpoint not found"}), 404

@app.errorhandler(500)
def server_error(e): 
    traceback.print_exc()
    return jsonify({"error": "internal server error"}), 500

if __name__ == "__main__":
    print("🚀 Stock Dashboard API starting on http://localhost:5001")
    print("📊 Endpoints: /stock  /sparkline  /compare  /search  /health")
    app.run(debug=True, host="0.0.0.0", port=5000, threaded=True)