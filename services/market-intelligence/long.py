import yfinance as yf
import pandas as pd
import numpy as np
from ta.momentum import RSIIndicator
from ta.trend import SMAIndicator
from ta.volatility import BollingerBands

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

# ================= MODULE 1: DATA ENGINE =================
def fetch_and_resample(symbol):
    daily = yf.Ticker(symbol).history(period="max", interval="1d")
    if daily.empty: return None
    
    agg = {'Open': 'first', 'High': 'max', 'Low': 'min', 'Close': 'last', 'Volume': 'sum'}
    
    frames = {
        "Daily": daily,
        "Weekly": daily.resample('W').agg(agg).dropna(),
        "Monthly": daily.resample('ME').agg(agg).dropna(),
        "Yearly": daily.resample('YE').agg(agg).dropna()
    }
    return frames

# ================= MODULE 2: DEEP METRIC CALCULATOR =================
def calculate_max_metrics(df, name):
    # Need enough data for calculations
    if len(df) < 50: return None 
    
    latest = df.iloc[-1]
    prev = df.iloc[-2]

    # --- 1. TREND PHYSICS (Velocity & Acceleration) ---
    smas = {}
    for p in [20, 50, 100, 200]:
        if len(df) >= p:
            sma_series = SMAIndicator(df['Close'], p).sma_indicator()
            val = sma_series.iloc[-1]
            
            # Distance: How far is price from SMA?
            dist = ((latest['Close'] - val) / val) * 100
            
            # Velocity: How fast is the SMA moving per period? (Slope)
            # Calculated over last 3 periods
            velocity = (val - sma_series.iloc[-4]) / 3
            
            # Acceleration: Is the SMA speeding up or slowing down?
            prev_velocity = (sma_series.iloc[-4] - sma_series.iloc[-7]) / 3
            acceleration = velocity - prev_velocity
            
            smas[p] = {
                "val": round(val, 2), 
                "dist": round(dist, 2), 
                "vel": round(velocity, 2),
                "acc": round(acceleration, 3)
            }
        else:
            smas[p] = {"val": "N/A", "dist": 0, "vel": 0, "acc": 0}

    # Trend Stack Status (is 20 > 50 > 100 > 200?)
    if smas[20]['val'] != "N/A" and smas[200]['val'] != "N/A":
        is_stacked = (smas[20]['val'] > smas[50]['val'] > smas[100]['val'] > smas[200]['val'])
        stack_status = "BULL STACK" if is_stacked else "MIXED/BEAR"
    else:
        stack_status = "N/A"

    # --- 2. MOMENTUM VECTORS (RSI Speed) ---
    rsi_series = RSIIndicator(df['Close'], 14).rsi()
    rsi_val = rsi_series.iloc[-1]
    
    # RSI Velocity (Is momentum gaining steam?)
    rsi_vel = rsi_val - rsi_series.iloc[-2]
    
    if rsi_val > 70: rsi_zone = "Overbought"
    elif rsi_val < 30: rsi_zone = "Oversold"
    else: rsi_zone = "Neutral"

    # --- 3. VOLATILITY STATS (Squeeze & Expansion) ---
    bb = BollingerBands(df['Close'], 20, 2)
    width = (bb.bollinger_hband() - bb.bollinger_lband()) / bb.bollinger_mavg()
    
    # Percentile: Where is current width relative to last 50 periods?
    past_width = width.tail(50)
    width_rank = (past_width < width.iloc[-1]).mean() * 100 # 0-100 score
    
    ratio = round(width.iloc[-1] / width.rolling(20).mean().iloc[-1], 2)
    pct_b = (latest['Close'] - bb.bollinger_lband().iloc[-1]) / (bb.bollinger_hband().iloc[-1] - bb.bollinger_lband().iloc[-1])

    # --- 4. VOLUME DEEP DIVE (Buying vs Selling Pressure) ---
    lookback = 20
    subset = df.iloc[-lookback:].copy()
    
    subset['Green'] = subset['Close'] > subset['Open']
    subset['Range'] = subset['High'] - subset['Low']
    subset['Body'] = abs(subset['Close'] - subset['Open'])
    
    # A. Volume Split
    buy_vol = subset.loc[subset['Green'], 'Volume'].sum()
    sell_vol = subset.loc[~subset['Green'], 'Volume'].sum()
    total_vol = buy_vol + sell_vol
    
    buy_pct = round((buy_vol / total_vol) * 100, 1) if total_vol > 0 else 0
    sell_pct = round((sell_vol / total_vol) * 100, 1) if total_vol > 0 else 0
    
    # B. Efficiency (Volume Power)
    # How much price moves per unit of volume?
    # Low Efficiency = Churn (Retail trapping)
    avg_eff = (subset['Body'] / subset['Volume']).mean() * 1000000 # Scaling factor
    curr_eff = (subset['Body'].iloc[-1] / subset['Volume'].iloc[-1]) * 1000000
    eff_rating = "High Power" if curr_eff > avg_eff * 1.2 else "Churn/Weak"
    
    # C. Peak Analysis
    peak_idx = subset['Volume'].idxmax()
    peak_row = subset.loc[peak_idx]
    avg_vol = int(subset['Volume'].mean())
    peak_ratio = round(peak_row['Volume'] / avg_vol, 1) if avg_vol > 0 else 0
    
    # D. Retail Churn Calculation (High Vol, Low Body)
    churn_mask = (subset['Volume'] > avg_vol) & (subset['Body'] < subset['Body'].mean() * 0.5)
    churn_vol = subset.loc[churn_mask, 'Volume'].sum()
    churn_pct = round((churn_vol / total_vol) * 100, 1) if total_vol > 0 else 0

    return {
        "trend": smas, "stack": stack_status,
        "rsi": {"val": round(rsi_val, 2), "vel": round(rsi_vel, 2), "zone": rsi_zone},
        "volatility": {"width": round(width.iloc[-1], 4), "rank": round(width_rank, 0), "ratio": ratio, "pct_b": round(pct_b, 2)},
        "volume": {
            "buy_pct": buy_pct, "sell_pct": sell_pct,
            "peak_date": peak_idx.strftime('%Y-%m-%d'), "peak_vol": peak_row['Volume'], "peak_ratio": peak_ratio,
            "avg_vol": avg_vol, "churn_pct": churn_pct,
            "eff_rating": eff_rating
        }
    }

# ================= MAIN ENGINE =================
def omni_max_analytics(symbol):
    print(f"\n{Colors.HEADER}Initializing OMNI-TIMEFRAME MAX DATA for {symbol}...{Colors.ENDC}")
    
    frames = fetch_and_resample(symbol)
    if not frames:
        print("No data found.")
        return

    data = {}
    for name, df in frames.items():
        res = calculate_max_metrics(df, name)
        if res: data[name] = res

    print(f"\n{Colors.BOLD}================ OMNI MAX DATA DOSSIER: {symbol} ================{Colors.ENDC}")
    print(f"Analysis Date: {pd.Timestamp.now().strftime('%Y-%m-%d')}")

    # --- SECTION 1: TREND PHYSICS (Velocity & Acceleration) ---
    print(f"\n{Colors.UNDERLINE}1. TREND PHYSICS (Structure, Speed & Acceleration){Colors.ENDC}")
    print(f"{'Frame':<8} {'SMA':<5} {'Value':<10} {'Dist %':<8} {'Velocity':<10} {'Accel.':<10} {'State'}")
    print("-" * 75)
    for name in ["Daily", "Weekly", "Monthly", "Yearly"]:
        if name not in data: continue
        d = data[name]['trend']
        
        # Only printing 20 and 200 for brevity, or loop all
        for p in [20, 50, 200]: 
            sma = d[p]
            if sma['val'] == "N/A": continue
            
            # Physics Logic
            state = "Coasting"
            if sma['vel'] > 0 and sma['acc'] > 0: state = "Rocketing"
            elif sma['vel'] > 0 and sma['acc'] < 0: state = "Slowing"
            elif sma['vel'] < 0 and sma['acc'] < 0: state = "Crashing"
            elif sma['vel'] < 0 and sma['acc'] > 0: state = "Rounding"

            v_col = Colors.GREEN if sma['vel'] > 0 else Colors.FAIL
            a_col = Colors.CYAN if sma['acc'] > 0 else Colors.WARNING
            
            frame_lbl = name[:4] if p == 20 else ""
            print(f"{frame_lbl:<8} {str(p):<5} {str(sma['val']):<10} {str(sma['dist']):<8} {v_col}{str(sma['vel']):<10}{Colors.ENDC} {a_col}{str(sma['acc']):<10}{Colors.ENDC} {state}")
        print(f"      [Stack Status: {Colors.BOLD}{data[name]['stack']}{Colors.ENDC}]")
        print("-" * 75)

    # --- SECTION 2: MOMENTUM VECTORS ---
    print(f"\n{Colors.UNDERLINE}2. MOMENTUM VECTORS (RSI Speed){Colors.ENDC}")
    print(f"{'Frame':<10} {'RSI':<10} {'Velocity (1D)':<15} {'Zone':<15} {'Bias'}")
    print("-" * 65)
    for name in ["Daily", "Weekly", "Monthly", "Yearly"]:
        if name not in data: continue
        d = data[name]['rsi']
        
        vel_str = f"+{d['vel']}" if d['vel'] > 0 else f"{d['vel']}"
        vel_col = Colors.GREEN if d['vel'] > 0 else Colors.FAIL
        
        print(f"{name:<10} {d['val']:<10} {vel_col}{vel_str:<15}{Colors.ENDC} {d['zone']:<15} {'Bullish' if d['val']>50 else 'Bearish'}")

    # --- SECTION 3: VOLATILITY STATS ---
    print(f"\n{Colors.UNDERLINE}3. VOLATILITY LAB (Statistical Rank){Colors.ENDC}")
    print(f"{'Frame':<10} {'Width':<10} {'Rank (0-100)':<15} {'Expansion Ratio':<18} {'%B Pos'}")
    print("-" * 70)
    for name in ["Daily", "Weekly", "Monthly", "Yearly"]:
        if name not in data: continue
        d = data[name]['volatility']
        
        # Rank Color: Low = Squeeze (Yellow), High = Volatile (Red)
        rank_col = Colors.WARNING if d['rank'] < 20 else Colors.FAIL if d['rank'] > 80 else Colors.ENDC
        
        print(f"{name:<10} {d['width']:<10} {rank_col}{str(d['rank']):<15}{Colors.ENDC} {d['ratio']:<18} {d['pct_b']}")

    # --- SECTION 4: VOLUME COMPOSITION (Buy/Sell) ---
    print(f"\n{Colors.UNDERLINE}4. VOLUME COMPOSITION (Buying vs Selling){Colors.ENDC}")
    print(f"{'Frame':<10} {'Buyers %':<12} {'Sellers %':<12} {'Churn %':<10} {'Avg Vol'}")
    print("-" * 65)
    for name in ["Daily", "Weekly", "Monthly", "Yearly"]:
        if name not in data: continue
        d = data[name]['volume']
        
        b_col = Colors.GREEN if d['buy_pct'] > 50 else Colors.ENDC
        s_col = Colors.FAIL if d['sell_pct'] > 50 else Colors.ENDC
        c_col = Colors.WARNING if d['churn_pct'] > 20 else Colors.ENDC
        
        print(f"{name:<10} {b_col}{str(d['buy_pct']):<12}{Colors.ENDC} {s_col}{str(d['sell_pct']):<12}{Colors.ENDC} {c_col}{str(d['churn_pct']):<10}{Colors.ENDC} {d['avg_vol']}")

    # --- SECTION 5: PEAK & POWER ANALYSIS ---
    print(f"\n{Colors.UNDERLINE}5. VOLUME POWER & EXTREMES{Colors.ENDC}")
    print(f"{'Frame':<10} {'Efficiency (Power)':<20} {'Peak Date':<12} {'Peak Magnitude':<15} {'Peak Vol'}")
    print("-" * 75)
    for name in ["Daily", "Weekly", "Monthly", "Yearly"]:
        if name not in data: continue
        d = data[name]['volume']
        
        eff_col = Colors.GREEN if "High" in d['eff_rating'] else Colors.FAIL
        
        print(f"{name:<10} {eff_col}{d['eff_rating']:<20}{Colors.ENDC} {d['peak_date']:<12} {str(d['peak_ratio'])+'x Avg':<15} {d['peak_vol']}")

    print(f"\n{Colors.BOLD}================ END OF MAX DATA REPORT ================={Colors.ENDC}")

# ================= EXECUTION =================
if __name__ == "__main__":
    symbol = input("Enter stock symbol (e.g., RELIANCE, MSFT): ").strip().upper()
    if "." not in symbol and len(symbol) <= 6 and symbol.isalpha():
        is_nse = input("Is this an Indian NSE stock? (y/n): ").lower()
        if is_nse == 'y': symbol += ".NS"
    
    try:
        omni_max_analytics(symbol)
    except Exception as e:
        print(e)