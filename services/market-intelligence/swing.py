import yfinance as yf
import pandas as pd
import numpy as np
from ta.momentum import RSIIndicator
from ta.trend import MACD, SMAIndicator
from ta.volatility import AverageTrueRange, BollingerBands
from ta.volume import OnBalanceVolumeIndicator

# ================= CLASS: COLOR CODES =================
class Colors:
    HEADER = '\033[95m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

# ================= MODULE 1: DETAILED VOLUME BREAKDOWN =================
def analyze_volume_detailed(df, windows=[5, 25, 50, 75, 100]):
    """
    Returns raw volume data + derived insights for multiple timeframes.
    """
    analysis = {}
    df = df.copy()
    
    # Pre-calc candle attributes
    df['Body_Pct'] = abs((df['Close'] - df['Open']) / df['Open']) * 100
    df['is_Green'] = df['Close'] > df['Open']
    
    for w in windows:
        if len(df) < w: continue
        subset = df.iloc[-w:]
        
        # 1. Raw Stats
        avg_vol = int(subset["Volume"].mean())
        total_vol = int(subset["Volume"].sum())
        
        # 2. Extremes (The specific data points)
        peak_row = subset.loc[subset["Volume"].idxmax()]
        low_row = subset.loc[subset["Volume"].idxmin()]
        
        # 3. Flow Calculation (Raw Days)
        # Definition: High Vol = >1.5x Avg
        high_vol_mask = subset["Volume"] > (1.5 * avg_vol)
        
        # Count specific days
        accum_days = len(subset[high_vol_mask & df['is_Green']])
        dist_days = len(subset[high_vol_mask & (~df['is_Green'])])
        churn_days = len(subset[high_vol_mask & (df['Body_Pct'] < 0.3)]) # High Vol + Doji
        
        # 4. Net Volume Flow (Approximation)
        # Sum of volume on Green days vs Red days
        green_vol = subset.loc[subset['is_Green'], 'Volume'].sum()
        red_vol = subset.loc[~subset['is_Green'], 'Volume'].sum()
        vol_ratio = round(green_vol / red_vol, 2) if red_vol > 0 else 0
        
        analysis[w] = {
            "avg_vol": avg_vol,
            "total_vol": total_vol,
            "accum_days": accum_days,
            "dist_days": dist_days,
            "churn_days": churn_days,
            "buy_sell_ratio": vol_ratio,
            # Peak Details
            "peak_date": peak_row.name.strftime('%Y-%m-%d'),
            "peak_vol": int(peak_row["Volume"]),
            "peak_close": round(peak_row["Close"], 2),
            "peak_move_pct": round(peak_row['Body_Pct'], 2),
            "peak_type": "Green" if peak_row['Close'] > peak_row['Open'] else "Red",
            # Low Details
            "low_date": low_row.name.strftime('%Y-%m-%d'),
            "low_vol": int(low_row["Volume"]),
        }
    return analysis

# ================= MODULE 2: TECHNICAL CALCULATOR =================
def calculate_detailed_technicals(df):
    latest = df.iloc[-1]
    prev = df.iloc[-2]
    
    # --- A. SMA GEOMETRY (Slope & Distance) ---
    def get_slope(series, periods=5):
        # Simple rise/run over last 5 days
        return (series.iloc[-1] - series.iloc[-periods]) / periods

    sma_data = {}
    for p in [20, 50, 200]:
        col = f'SMA_{p}'
        val = latest[col]
        dist_pct = (latest['Close'] - val) / val * 100
        slope = get_slope(df[col])
        
        # Interpret Slope
        direction = "Rising" if slope > 0 else "Falling"
        angle = "Steep" if abs(slope) > (val * 0.005) else "Flat" # Threshold for steepness
        
        sma_data[p] = {
            "value": round(val, 2),
            "distance_pct": round(dist_pct, 2),
            "slope": round(slope, 2),
            "status": f"{direction} ({angle})"
        }

    # --- B. RSI MECHANICS ---
    rsi_val = round(latest['RSI'], 2)
    rsi_change = round(latest['RSI'] - prev['RSI'], 2)
    # Zone Detection
    if rsi_val >= 70: rsi_zone = "Overbought (>70)"
    elif rsi_val <= 30: rsi_zone = "Oversold (<30)"
    elif rsi_val >= 50: rsi_zone = "Bullish Half (50-70)"
    else: rsi_zone = "Bearish Half (30-50)"

    # --- C. BOLLINGER PRECISION ---
    bb_width = round(latest['BB_Width'], 4)
    # Compare current width to 6-month average width
    avg_width_6m = df['BB_Width'].tail(126).mean()
    width_ratio = round(bb_width / avg_width_6m, 2) # 1.0 = Average, 0.5 = Squeeze
    
    # %B Calculation
    b_range = latest['BB_Upper'] - latest['BB_Lower']
    pct_b = (latest['Close'] - latest['BB_Lower']) / b_range if b_range > 0 else 0
    
    # --- D. ATR & RISK ---
    atr_val = round(latest['ATR'], 2)
    atr_pct = round((atr_val / latest['Close']) * 100, 2) # Volatility as % of price

    return {
        "sma": sma_data,
        "rsi": {"val": rsi_val, "change": rsi_change, "zone": rsi_zone},
        "bb": {"width": bb_width, "avg_width": round(avg_width_6m, 4), "ratio": width_ratio, "pct_b": round(pct_b, 2)},
        "atr": {"val": atr_val, "pct_price": atr_pct}
    }

# ================= MAIN FUNCTION =================
def swing_detailed_analytics(symbol):
    print(f"\n{Colors.HEADER}Generating Detailed Data Report for {symbol}...{Colors.ENDC}")
    stock = yf.Ticker(symbol)
    
    # 1. Fetch Data
    df = stock.history(period="2y", interval="1d")
    if df.empty:
        print("No data found.")
        return

    # 2. Indicator Calculation
    # SMA
    for p in [20, 50, 200]:
        df[f'SMA_{p}'] = SMAIndicator(df['Close'], p).sma_indicator()
    
    # Momentum
    df['RSI'] = RSIIndicator(df['Close'], 14).rsi()
    macd = MACD(df['Close'])
    df['MACD'] = macd.macd()
    df['MACD_Signal'] = macd.macd_signal()
    df['MACD_Hist'] = macd.macd_diff()
    
    # Volatility
    df['ATR'] = AverageTrueRange(df['High'], df['Low'], df['Close'], 14).average_true_range()
    bb = BollingerBands(df['Close'], 20, 2)
    df['BB_Upper'] = bb.bollinger_hband()
    df['BB_Lower'] = bb.bollinger_lband()
    df['BB_Width'] = (df['BB_Upper'] - df['BB_Lower']) / df['SMA_20']
    
    # Volume
    df['OBV'] = OnBalanceVolumeIndicator(df['Close'], df['Volume']).on_balance_volume()
    df['OBV_SMA'] = SMAIndicator(df['OBV'], 20).sma_indicator()

    # 3. Process Data
    techs = calculate_detailed_technicals(df)
    vol_data = analyze_volume_detailed(df)
    latest = df.iloc[-1]
    
    # ================= REPORT GENERATION =================
    print(f"\n{Colors.BOLD}================ DETAILED SWING DOSSIER: {symbol} ================{Colors.ENDC}")
    print(f"Current Price: {Colors.CYAN}{round(latest['Close'], 2)}{Colors.ENDC}")
    print(f"Data Date: {latest.name.strftime('%Y-%m-%d')}")

    # --- SECTION 1: TREND PHYSICS (RAW DATA) ---
    print(f"\n{Colors.UNDERLINE}1. TREND PHYSICS (SMA Data){Colors.ENDC}")
    print(f"{'MA Line':<10} {'Price Level':<12} {'Dist. from Price':<18} {'Slope (Steepness)'}")
    print("-" * 75)
    for p in [20, 50, 200]:
        d = techs['sma'][p]
        dist_str = f"{d['distance_pct']}%"
        color = Colors.GREEN if d['distance_pct'] > 0 else Colors.FAIL
        print(f"SMA {str(p):<6} {d['value']:<12} {color}{dist_str:<18}{Colors.ENDC} {d['status']}")
    
    # Trend alignment conclusion
    s20 = techs['sma'][20]['value']
    s50 = techs['sma'][50]['value']
    s200 = techs['sma'][200]['value']
    if s20 > s50 > s200: align = "Perfect Bullish Stack (20>50>200)"
    elif s20 < s50 < s200: align = "Perfect Bearish Stack (20<50<200)"
    else: align = "Unstacked / Choppy"
    print(f"• Alignment Status: {align}")

    # --- SECTION 2: MOMENTUM & OSCILLATORS ---
    print(f"\n{Colors.UNDERLINE}2. MOMENTUM MECHANICS (RSI & MACD){Colors.ENDC}")
    print(f"• RSI (14) Raw Value: {techs['rsi']['val']}")
    print(f"• RSI Change (1D): {techs['rsi']['change']}")
    print(f"• RSI Zone Diagnosis: {techs['rsi']['zone']}")
    
    print(f"• MACD Histogram Value: {round(latest['MACD_Hist'], 5)}")
    print(f"• MACD Line vs Signal: {round(latest['MACD'], 2)} vs {round(latest['MACD_Signal'], 2)}")
    macd_signal = "BUY (Line > Signal)" if latest['MACD'] > latest['MACD_Signal'] else "SELL (Line < Signal)"
    print(f"• MACD Crossover Status: {macd_signal}")

    # --- SECTION 3: VOLATILITY & RISK ---
    print(f"\n{Colors.UNDERLINE}3. VOLATILITY LAB (BB & ATR){Colors.ENDC}")
    print(f"• ATR (14): {techs['atr']['val']} ({techs['atr']['pct_price']}% of price)")
    print(f"  -> Implies a typical daily swing of +/- {techs['atr']['val']}")
    
    bb_d = techs['bb']
    print(f"• Bollinger Width: {bb_d['width']} (Avg: {bb_d['avg_width']})")
    print(f"• Squeeze Ratio: {bb_d['ratio']}x (Current vs 6M Avg)")
    if bb_d['ratio'] < 0.7: print(f"  -> {Colors.WARNING}ALERT: Volatility Compressed (Squeeze){Colors.ENDC}")
    elif bb_d['ratio'] > 1.5: print(f"  -> ALERT: Volatility Expanded (Possible Exhaustion)")
    else: print("  -> Status: Normal Volatility")
    
    print(f"• %B (Position in Bands): {bb_d['pct_b']} (0=Low, 1=High, >1=Breakout)")

    # --- SECTION 4: INSTITUTIONAL FOOTPRINT (DETAILED) ---
    print(f"\n{Colors.UNDERLINE}4. INSTITUTIONAL FOOTPRINT (Volume Data){Colors.ENDC}")
    print(f"{'Period':<8} {'Buy/Sell Vol Ratio':<20} {'Accum Days':<12} {'Dist Days':<12} {'Churn'}")
    print("-" * 80)
    for w in [5, 25, 50, 75, 100]:
        d = vol_data[w]
        ratio_color = Colors.GREEN if d['buy_sell_ratio'] > 1.0 else Colors.FAIL
        print(f"{str(w)+'d':<8} {ratio_color}{str(d['buy_sell_ratio'])+'x':<20}{Colors.ENDC} {str(d['accum_days']):<12} {str(d['dist_days']):<12} {d['churn_days']}")

    print(f"\n{Colors.UNDERLINE}5. EXTREME VOLUME EVENTS (Highest Vol Day in Period){Colors.ENDC}")
    print(f"{'Period':<8} {'Date':<12} {'Volume':<12} {'Close Price':<12} {'Move %':<10} {'Type'}")
    print("-" * 80)
    for w in [5, 25, 50, 75, 100]:
        d = vol_data[w]
        # Avoid div zero
        vol_multiple = round(d['peak_vol'] / d['avg_vol'], 1) if d['avg_vol'] > 0 else 0
        type_color = Colors.GREEN if d['peak_type'] == "Green" else Colors.FAIL
        print(f"{str(w)+'d':<8} {d['peak_date']:<12} {str(vol_multiple)+'x Avg':<12} {d['peak_close']:<12} {d['peak_move_pct']:<10} {type_color}{d['peak_type']}{Colors.ENDC}")

    # --- SECTION 6: OBV CONFIRMATION ---
    print(f"\n{Colors.UNDERLINE}6. ON-BALANCE VOLUME (OBV) CHECK{Colors.ENDC}")
    obv_val = round(latest['OBV'] / 1000000, 2) # In Millions
    obv_sma = round(latest['OBV_SMA'] / 1000000, 2)
    print(f"• Current OBV: {obv_val}M")
    print(f"• OBV 20-SMA:  {obv_sma}M")
    if latest['OBV'] > latest['OBV_SMA']:
        print(f"• Verdict: {Colors.GREEN}ACCUMULATION (OBV > SMA){Colors.ENDC}")
    else:
        print(f"• Verdict: {Colors.FAIL}DISTRIBUTION (OBV < SMA){Colors.ENDC}")

    print(f"\n{Colors.BOLD}================ END OF DOSSIER ================={Colors.ENDC}")

# ================= EXECUTION =================
if __name__ == "__main__":
    symbol = input("Enter stock symbol (e.g., RELIANCE, TSLA): ").strip().upper()
    if "." not in symbol and len(symbol) <= 6 and symbol.isalpha():
        is_nse = input("Is this an Indian NSE stock? (y/n): ").lower()
        if is_nse == 'y': symbol += ".NS"
        
    swing_detailed_analytics(symbol)