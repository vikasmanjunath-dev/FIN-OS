"""
Arya AI — Technical Analysis Engine.
Uses `ta` library (already installed). Returns clean signal dicts.
No dependency on voice AI or any other FIN-OS module.
"""
import time
import pandas as pd
import numpy as np
import ta

import data.cache as cache
from db.store import cache_technical, get_technical_cached
from data.market import get_historical
from config import TTL_TECHNICAL


def _safe_last(series) -> float | None:
    try:
        v = series.dropna().iloc[-1]
        return float(round(v, 4))
    except Exception:
        return None


def _supertrend(high: pd.Series, low: pd.Series, close: pd.Series,
                period: int = 10, multiplier: float = 3.0) -> tuple[pd.Series, pd.Series]:
    """
    Supertrend — not in the `ta` library at all (only pandas_ta has it built in,
    which is why the original plan called for pandas_ta specifically). Standard
    ATR-based formula, manually implemented: a "sticky" band that only moves in
    the direction of the trend, flips when price closes through it.
    Returns (supertrend_line, direction) where direction is 1 (uptrend) or -1 (downtrend).
    """
    atr = ta.volatility.AverageTrueRange(high=high, low=low, close=close, window=period).average_true_range()
    hl2 = (high + low) / 2
    basic_upper = hl2 + multiplier * atr
    basic_lower = hl2 - multiplier * atr

    final_upper = basic_upper.copy()
    final_lower = basic_lower.copy()
    direction = pd.Series(1, index=close.index)
    supertrend = pd.Series(0.0, index=close.index)

    for i in range(1, len(close)):
        # Bands only move closer to price, never away — except on a flip.
        final_upper.iloc[i] = (
            basic_upper.iloc[i] if (basic_upper.iloc[i] < final_upper.iloc[i - 1]
                                     or close.iloc[i - 1] > final_upper.iloc[i - 1])
            else final_upper.iloc[i - 1]
        )
        final_lower.iloc[i] = (
            basic_lower.iloc[i] if (basic_lower.iloc[i] > final_lower.iloc[i - 1]
                                     or close.iloc[i - 1] < final_lower.iloc[i - 1])
            else final_lower.iloc[i - 1]
        )
        if close.iloc[i] > final_upper.iloc[i - 1]:
            direction.iloc[i] = 1
        elif close.iloc[i] < final_lower.iloc[i - 1]:
            direction.iloc[i] = -1
        else:
            direction.iloc[i] = direction.iloc[i - 1]

    supertrend = final_lower.where(direction == 1, final_upper)
    return supertrend, direction


def analyze(symbol: str, exchange: str = "NSE") -> dict:
    """
    Full technical analysis for a symbol.
    Returns signals dict + verdict (BUY/HOLD/SELL) + score (0–100).
    """
    key = f"ta:{exchange}:{symbol}".upper()

    # L1 memory cache
    mc = cache.get(key, TTL_TECHNICAL)
    if mc:
        return mc

    # L2 SQLite cache
    db = get_technical_cached(symbol, TTL_TECHNICAL)
    if db:
        cache.set(key, db)
        return db

    # Fetch 6-month daily OHLCV
    hist = get_historical(symbol, period="6mo", interval="1d", exchange=exchange)
    if "error" in hist or not hist.get("ohlcv"):
        return {"error": f"No OHLCV data for {symbol}", "symbol": symbol}

    rows = hist["ohlcv"]
    if len(rows) < 30:
        return {"error": "Insufficient data (need 30+ days)", "symbol": symbol}

    df = pd.DataFrame(rows)
    df["close"] = df["close"].astype(float)
    df["high"]  = df["high"].astype(float)
    df["low"]   = df["low"].astype(float)
    df["open"]  = df["open"].astype(float)
    df["volume"]= df["volume"].astype(float)

    signals = {}
    buy_votes  = 0
    sell_votes = 0

    # ── RSI ────────────────────────────────────────────────────────────────────
    try:
        rsi_ind  = ta.momentum.RSIIndicator(close=df["close"], window=14)
        rsi_val  = _safe_last(rsi_ind.rsi())
        signals["RSI"] = {
            "value":  rsi_val,
            "signal": "OVERSOLD (BUY)" if rsi_val and rsi_val < 35
                      else "OVERBOUGHT (SELL)" if rsi_val and rsi_val > 70
                      else "NEUTRAL",
        }
        if rsi_val:
            if rsi_val < 35:  buy_votes  += 2
            elif rsi_val > 70: sell_votes += 2
    except Exception:
        pass

    # ── MACD ───────────────────────────────────────────────────────────────────
    try:
        macd_ind  = ta.trend.MACD(close=df["close"])
        macd_line = _safe_last(macd_ind.macd())
        macd_sig  = _safe_last(macd_ind.macd_signal())
        macd_hist = _safe_last(macd_ind.macd_diff())
        crossover = "BULLISH CROSS" if macd_line and macd_sig and macd_line > macd_sig \
                    else "BEARISH CROSS"
        signals["MACD"] = {
            "macd":       macd_line,
            "signal":     macd_sig,
            "histogram":  macd_hist,
            "crossover":  crossover,
        }
        if crossover == "BULLISH CROSS":  buy_votes  += 1
        else:                              sell_votes += 1
    except Exception:
        pass

    # ── Bollinger Bands ────────────────────────────────────────────────────────
    try:
        bb_ind   = ta.volatility.BollingerBands(close=df["close"])
        bb_upper = _safe_last(bb_ind.bollinger_hband())
        bb_lower = _safe_last(bb_ind.bollinger_lband())
        bb_mid   = _safe_last(bb_ind.bollinger_mavg())
        price    = _safe_last(df["close"])
        bb_signal = "NEAR LOWER BAND (BUY)" if price and bb_lower and price <= bb_lower * 1.01 \
                    else "NEAR UPPER BAND (SELL)" if price and bb_upper and price >= bb_upper * 0.99 \
                    else "MID BAND (NEUTRAL)"
        signals["Bollinger Bands"] = {
            "upper":  bb_upper,
            "middle": bb_mid,
            "lower":  bb_lower,
            "signal": bb_signal,
        }
        if "BUY" in bb_signal:   buy_votes  += 1
        elif "SELL" in bb_signal: sell_votes += 1
    except Exception:
        pass

    # ── EMA Cross (20/50) ──────────────────────────────────────────────────────
    try:
        ema20 = _safe_last(ta.trend.EMAIndicator(df["close"], window=20).ema_indicator())
        ema50 = _safe_last(ta.trend.EMAIndicator(df["close"], window=50).ema_indicator())
        ema_signal = "BULLISH (20>50)" if ema20 and ema50 and ema20 > ema50 else "BEARISH (20<50)"
        signals["EMA Cross"] = {
            "ema_20": ema20,
            "ema_50": ema50,
            "signal": ema_signal,
        }
        if "BULLISH" in ema_signal: buy_votes  += 1
        else:                        sell_votes += 1
    except Exception:
        pass

    # ── SMA 200 (trend direction) ──────────────────────────────────────────────
    try:
        if len(df) >= 200:
            sma200 = _safe_last(ta.trend.SMAIndicator(df["close"], window=200).sma_indicator())
            price  = _safe_last(df["close"])
            sma_signal = "ABOVE SMA200 (UPTREND)" if price and sma200 and price > sma200 \
                         else "BELOW SMA200 (DOWNTREND)"
            signals["SMA 200"] = {"sma_200": sma200, "signal": sma_signal}
            if "UPTREND" in sma_signal:   buy_votes  += 1
            else:                          sell_votes += 1
    except Exception:
        pass

    # ── ADX (trend strength) ───────────────────────────────────────────────────
    try:
        adx_ind = ta.trend.ADXIndicator(high=df["high"], low=df["low"], close=df["close"])
        adx_val = _safe_last(adx_ind.adx())
        signals["ADX"] = {
            "value":  adx_val,
            "signal": "STRONG TREND" if adx_val and adx_val > 25 else "WEAK / RANGING",
        }
    except Exception:
        pass

    # ── Supertrend ─────────────────────────────────────────────────────────────
    try:
        st_line, st_dir = _supertrend(df["high"], df["low"], df["close"])
        st_val  = _safe_last(st_line)
        st_dval = int(st_dir.iloc[-1])
        st_signal = "BULLISH (price above band)" if st_dval == 1 else "BEARISH (price below band)"
        signals["Supertrend"] = {
            "value":  st_val,
            "signal": st_signal,
        }
        if st_dval == 1: buy_votes  += 1
        else:             sell_votes += 1
    except Exception:
        pass

    # ── Volume confirmation ────────────────────────────────────────────────────
    try:
        avg_vol = float(df["volume"].tail(20).mean())
        last_vol = float(df["volume"].iloc[-1])
        vol_signal = "HIGH VOLUME" if last_vol > avg_vol * 1.5 else \
                     "LOW VOLUME" if last_vol < avg_vol * 0.5 else "AVERAGE VOLUME"
        signals["Volume"] = {
            "last":    int(last_vol),
            "avg_20":  int(avg_vol),
            "signal":  vol_signal,
        }
    except Exception:
        pass

    # ── Verdict ────────────────────────────────────────────────────────────────
    total = buy_votes + sell_votes
    score = int((buy_votes / total) * 100) if total > 0 else 50

    if score >= 65:
        verdict = "BUY"
    elif score <= 35:
        verdict = "SELL"
    else:
        verdict = "HOLD"

    result = {
        "symbol":   symbol.upper(),
        "exchange": exchange.upper(),
        "verdict":  verdict,
        "score":    score,
        "signals":  signals,
        "as_of":    int(time.time()),
    }

    cache.set(key, result)
    cache_technical(symbol, signals, verdict, score)
    return result


def multi_timeframe_summary(symbol: str, exchange: str = "NSE") -> dict:
    """
    Returns short (1w), medium (1mo), long (6mo) technical summary.
    Each period: verdict + RSI + MACD direction.
    """
    summaries = {}
    for period, label in [("5d", "short"), ("1mo", "medium"), ("6mo", "long")]:
        hist = get_historical(symbol, period=period, interval="1d", exchange=exchange)
        if "error" in hist or not hist.get("ohlcv") or len(hist["ohlcv"]) < 5:
            summaries[label] = {"error": "insufficient data"}
            continue
        rows = hist["ohlcv"]
        df   = pd.DataFrame(rows)
        df["close"] = df["close"].astype(float)
        try:
            rsi  = _safe_last(ta.momentum.RSIIndicator(df["close"]).rsi())
            macd = ta.trend.MACD(df["close"])
            ml   = _safe_last(macd.macd())
            ms   = _safe_last(macd.macd_signal())
            summaries[label] = {
                "rsi":    rsi,
                "macd":   "bullish" if ml and ms and ml > ms else "bearish",
                "period": period,
            }
        except Exception:
            summaries[label] = {"error": "calc error"}

    return {"symbol": symbol.upper(), "timeframes": summaries}
