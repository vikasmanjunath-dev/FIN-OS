import yfinance as yf
import pandas as pd
import numpy as np
from ta.momentum import RSIIndicator
from ta.volatility import AverageTrueRange


def full_stock_analytics(symbol):
    print("\nFetching data...")

    stock = yf.Ticker(symbol)

    # ---------------- DAILY DATA ----------------
    daily = stock.history(period="6mo", interval="1d")
    if daily.empty:
        print("No daily data available")
        return

    # ---------------- TECHNICALS (LATEST DAY) ----------------
    daily["SMA20"] = daily["Close"].rolling(20).mean()
    daily["SMA50"] = daily["Close"].rolling(50).mean()
    daily["SMA200"] = daily["Close"].rolling(200).mean()
    daily["ATR"] = AverageTrueRange(
        daily["High"], daily["Low"], daily["Close"], 14
    ).average_true_range()

    latest = daily.iloc[-1]

    # ---------------- USER INPUT (FIXED LOCATION) ----------------
    sma_len = int(input("Enter SMA length (example: 20, 50): "))
    ema_len = int(input("Enter EMA length (example: 9, 21): "))

    # ---------------- INTRADAY DATA ----------------
    intraday_5m = stock.history(period="5d", interval="5m")
    intraday_15m = stock.history(period="5d", interval="15m")

    # ---------------- INDICATORS ----------------
    intraday_15m["RSI"] = RSIIndicator(intraday_15m["Close"], 14).rsi()
    intraday_15m[f"SMA_{sma_len}"] = intraday_15m["Close"].rolling(sma_len).mean()
    intraday_15m[f"EMA_{ema_len}"] = intraday_15m["Close"].ewm(
        span=ema_len, adjust=False
    ).mean()

    # ---------------- LAST 3 TRADING DAYS ----------------
    last_3_dates = sorted(set(daily.index.date))[-3:]
    daywise_data = []

    for d in last_3_dates:
        day_daily = daily[daily.index.date == d]
        day_5m = intraday_5m[intraday_5m.index.date == d]
        day_15m = intraday_15m[intraday_15m.index.date == d].dropna()

        if day_daily.empty or day_5m.empty or day_15m.empty:
            continue

        # -------- DAILY LOW --------
        daily_low = round(day_daily["Low"].iloc[0], 2)

        # -------- DAILY TREND --------
        open_p = day_daily["Open"].iloc[0]
        close_p = day_daily["Close"].iloc[0]
        pct = round(((close_p - open_p) / open_p) * 100, 2)

        if pct > 0.3:
            trend = "Bullish"
        elif pct < -0.3:
            trend = "Bearish"
        else:
            trend = "Neutral"

        # -------- SUPPORT / RESISTANCE --------
        support = round(day_5m["Low"].min(), 2)
        resistance = round(day_5m["High"].max(), 2)

        # -------- SESSION MOVES --------
        def session_move(df, start, end):
            win = df.between_time(start, end)
            if win.empty:
                return None
            return round(win["Close"].iloc[-1] - win["Open"].iloc[0], 2)

        opening = session_move(day_5m, "09:15", "09:45")
        mid = session_move(day_5m, "12:30", "13:00")
        closing = session_move(day_5m, "14:45", "15:15")

        # -------- RSI (15m | FULL DAY) --------
        last_rsi_row = day_15m.iloc[-1]
        last_rsi = round(last_rsi_row["RSI"], 2)
        last_rsi_time = last_rsi_row.name.strftime("%H:%M")

        if last_rsi > 55:
            rsi_trend = "Bullish"
        elif last_rsi < 45:
            rsi_trend = "Bearish"
        else:
            rsi_trend = "Neutral"

        oversold = [(t.strftime("%H:%M"), round(r, 2))
                    for t, r in day_15m["RSI"].items() if r <= 30]

        overbought = [(t.strftime("%H:%M"), round(r, 2))
                      for t, r in day_15m["RSI"].items() if r >= 70]

        # -------- SMA / EMA --------
        last_ma_row = day_15m.iloc[-1]
        sma_val = round(last_ma_row[f"SMA_{sma_len}"], 2)
        ema_val = round(last_ma_row[f"EMA_{ema_len}"], 2)
        ma_time = last_ma_row.name.strftime("%H:%M")
        last_price = round(last_ma_row["Close"], 2)

        price_vs_sma = "Above" if last_price > sma_val else "Below"
        price_vs_ema = "Above" if last_price > ema_val else "Below"

        daywise_data.append({
            "date": str(d),
            "support": support,
            "resistance": resistance,
            "daily_low": daily_low,
            "trend": trend,
            "pct": pct,
            "opening": opening,
            "mid": mid,
            "closing": closing,
            "last_rsi": last_rsi,
            "last_rsi_time": last_rsi_time,
            "rsi_trend": rsi_trend,
            "oversold": oversold,
            "overbought": overbought,
            "sma": sma_val,
            "ema": ema_val,
            "ma_time": ma_time,
            "price_vs_sma": price_vs_sma,
            "price_vs_ema": price_vs_ema
        })

    # ---------------- OUTPUT ----------------
    print("\n================ DAY-WISE ANALYTICS (PAST 3 DAYS) ================")

    for d in daywise_data:
        print(f"\nDate: {d['date']}")
        print(f"Support: {d['support']} | Resistance: {d['resistance']}")
        print(f"Daily Low: {d['daily_low']}")
        print(f"Trend: {d['trend']} ({d['pct']}%)")

        print("Session Moves:")
        print(f"  Opening: {d['opening']}")
        print(f"  Mid: {d['mid']}")
        print(f"  Closing: {d['closing']}")

        print(f"RSI (15m): {d['last_rsi']} at {d['last_rsi_time']} → {d['rsi_trend']}")
        print(f"SMA({sma_len}) / EMA({ema_len}) at {d['ma_time']}")
        print(f"  SMA: {d['sma']} | Price is {d['price_vs_sma']}")
        print(f"  EMA: {d['ema']} | Price is {d['price_vs_ema']}")

    print("\n---- LATEST DAILY TECHNICAL SNAPSHOT ----")
    print(f"SMA20 / SMA50 / SMA200: {round(latest['SMA20'],2)} / {round(latest['SMA50'],2)} / {round(latest['SMA200'],2)}")
    print(f"ATR: {round(latest['ATR'],2)}")
    print("=================================================")


# ---------------- USER INPUT ----------------
symbol = input("Enter stock symbol (example: ITC or RELIANCE): ").strip().upper()
if "." not in symbol:
    symbol += ".NS"

full_stock_analytics(symbol)
