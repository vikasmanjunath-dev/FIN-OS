import yfinance as yf
import pandas as pd
import numpy as np
from ta.momentum import RSIIndicator
from ta.volatility import AverageTrueRange

# ================= HELPER FUNCTION =================
def intraday_volume_analysis(intraday_5m, last_3_dates):
    volume_analysis = []

    for d in last_3_dates:
        # Filter data for specific date
        day_data = intraday_5m[intraday_5m.index.date == d]

        if day_data.empty:
            continue

        avg_vol = day_data["Volume"].mean()
        median_vol = day_data["Volume"].median()
        max_vol = day_data["Volume"].max()

        high_volume_threshold = 1.5 * avg_vol

        high_volume_candles = []
        momentum_zones = []
        absorption_zones = []

        for time, row in day_data.iterrows():
            vol = row["Volume"]
            # Avoid division by zero
            if row["Open"] == 0: 
                continue
            
            price_move_pct = abs((row["Close"] - row["Open"]) / row["Open"]) * 100
            candle_range = abs(row["Close"] - row["Open"])

            if vol >= high_volume_threshold:
                direction = "Bullish" if row["Close"] > row["Open"] else "Bearish"

                high_volume_candles.append({
                    "time": time.strftime("%H:%M"),
                    "volume": int(vol),
                    "price_range": round(candle_range, 2),
                    "direction": direction
                })

                if price_move_pct >= 0.3:
                    momentum_zones.append({
                        "time": time.strftime("%H:%M"),
                        "price_from": round(row["Open"], 2),
                        "price_to": round(row["Close"], 2),
                        "direction": direction
                    })
                else:
                    absorption_zones.append({
                        "time": time.strftime("%H:%M"),
                        "price": round(row["Close"], 2),
                        "direction": direction
                    })

        # -------- TIME BUCKETS --------
        opening_vol = day_data.between_time("09:15", "10:00")["Volume"].sum()
        midday_vol = day_data.between_time("12:00", "13:30")["Volume"].sum()
        closing_vol = day_data.between_time("14:30", "15:30")["Volume"].sum()

        volume_analysis.append({
            "date": str(d),
            "avg_volume": int(avg_vol),
            "median_volume": int(median_vol),
            "max_volume": int(max_vol),
            "high_volume_count": len(high_volume_candles),
            "high_volume_frequency_pct": round(
                (len(high_volume_candles) / len(day_data)) * 100, 2
            ),
            "opening_volume": int(opening_vol),
            "midday_volume": int(midday_vol),
            "closing_volume": int(closing_vol),
            "high_volume_candles": high_volume_candles,
            "momentum_zones": momentum_zones,
            "absorption_zones": absorption_zones
        })

    return volume_analysis


# ================= MAIN ANALYTICS FUNCTION =================
def full_stock_analytics(symbol):
    print(f"\nFetching data for {symbol}...")

    stock = yf.Ticker(symbol)

    # ---------------- DAILY DATA ----------------
    daily = stock.history(period="6mo", interval="1d")
    if daily.empty:
        print(f"No data found for {symbol}. Check the symbol and try again.")
        return

    # ---------------- TECHNICALS (LATEST DAY) ----------------
    daily["SMA20"] = daily["Close"].rolling(20).mean()
    daily["SMA50"] = daily["Close"].rolling(50).mean()
    daily["SMA200"] = daily["Close"].rolling(200).mean()
    daily["ATR"] = AverageTrueRange(
        daily["High"], daily["Low"], daily["Close"], 14
    ).average_true_range()

    latest = daily.iloc[-1]

    # ---------------- USER INPUT ----------------
    try:
        sma_len = int(input("Enter SMA length (example: 20, 50): "))
        ema_len = int(input("Enter EMA length (example: 9, 21): "))
    except ValueError:
        print("Invalid input. Using defaults SMA=20, EMA=9")
        sma_len, ema_len = 20, 9

    # ---------------- INTRADAY DATA ----------------
    intraday_5m = stock.history(period="5d", interval="5m")
    intraday_15m = stock.history(period="5d", interval="15m")
    
    if intraday_5m.empty or intraday_15m.empty:
        print("Not enough intraday data available.")
        return

    # ---------------- INDICATORS ----------------
    intraday_15m["RSI"] = RSIIndicator(intraday_15m["Close"], 14).rsi()
    intraday_15m[f"SMA_{sma_len}"] = intraday_15m["Close"].rolling(sma_len).mean()
    intraday_15m[f"EMA_{ema_len}"] = intraday_15m["Close"].ewm(
        span=ema_len, adjust=False
    ).mean()

    # Get last 3 unique dates from intraday data
    last_3_dates = sorted(list(set(intraday_5m.index.date)))[-3:]

    # ---------------- VOLUME ANALYSIS ----------------
    volume_data = intraday_volume_analysis(intraday_5m, last_3_dates)

    print("\n================ INTRADAY VOLUME ANALYSIS ================")
    for d in volume_data:
        print(f"\nDate: {d['date']}")
        print(f"Avg Vol: {d['avg_volume']} | Median: {d['median_volume']} | Max: {d['max_volume']}")
        print(f"High-Volume Candles: {d['high_volume_count']} "
              f"({d['high_volume_frequency_pct']}% of session)")

        print(f"Session Volume → Open:{d['opening_volume']} "
              f"Mid:{d['midday_volume']} Close:{d['closing_volume']}")

        if d["momentum_zones"]:
            print("Momentum Zones:")
            for z in d["momentum_zones"]:
                print(f"  {z['time']} | {z['price_from']} → {z['price_to']} | {z['direction']}")
        
        if d["absorption_zones"]:
            print("Absorption Zones:")
            for z in d["absorption_zones"]:
                print(f"  {z['time']} | Price {z['price']} | {z['direction']}")

    # ---------------- PRICE ACTION ANALYSIS ----------------
    daywise_data = []

    for d in last_3_dates:
        # Filter for the specific day
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
                return "N/A"
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

# ---------------- EXECUTION BLOCK ----------------
if __name__ == "__main__":
    symbol = input("Enter stock symbol (example: ITC or RELIANCE): ").strip().upper()
    if "." not in symbol:
        symbol += ".NS"

    full_stock_analytics(symbol)