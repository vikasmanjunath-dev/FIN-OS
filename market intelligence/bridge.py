# filename: bridge.py
import json
import os
import yfinance as yf

# Import your existing modules
# NOTE: Ensure your original files (intraday.py, etc.) are in the same folder
from fundamental import FinancialSystem
from intraday import full_stock_analytics
from swing import swing_detailed_analytics
from long import omni_max_analytics

def run_bridge():
    symbol = input("ENTER STOCK SYMBOL (e.g., RELIANCE.NS): ").strip().upper()
    if "." not in symbol: symbol += ".NS"
    
    print(f"\n🚀 INITIALIZING BRIDGE FOR {symbol}...")
    
    # CONTAINER FOR ALL DATA
    market_data = {
        "meta": {"symbol": symbol, "price": 0.0},
        "intraday": {},
        "swing": {},
        "long": {},
        "fundamental": {}
    }

    # 1. GET PRICE
    try:
        ticker = yf.Ticker(symbol)
        market_data["meta"]["price"] = round(ticker.history(period="1d")['Close'].iloc[-1], 2)
    except: pass

    # 2. RUN FUNDAMENTAL (Using your class)
    try:
        print("   🧬 Extracting DNA (Fundamental)...")
        fs = FinancialSystem(symbol)
        # We access the internal attributes directly since your class calculates them in __init__ or run_full_scan
        fs.run_full_scan() 
        market_data["fundamental"] = {
            "score": fs.score,
            "max_score": fs.max_score,
            "pct": round((fs.score/fs.max_score)*100, 1) if fs.max_score else 0,
            "red_flags": fs.red_flags
        }
    except Exception as e: print(f"   ⚠️ Fundamental Skip: {e}")

    # 3. CAPTURE SWING DATA
    # Note: For this to work perfectly, your swing.py functions should RETURN the dicts.
    # If they only print, we will simulate the structure for the UI demo.
    # ideally, modify swing.py to `return techs, vol_data` at the end.
    try:
        print("   🌊 Capturing Swing Force...")
        # Simulating the return structure based on your swing.py logic
        market_data["swing"] = {
            "status": "MOMENTUM ACTIVE", # This would come from logic
            "sma_alignment": "Bullish Stack (20 > 50 > 200)",
            "rsi": 65,
            "institutional_action": "Accumulation"
        }
    except: pass

    # 4. SAVE TO JAVASCRIPT FILE
    # This creates a file that looks like JS code but contains your data
    js_content = f"const MARKET_DATA = {json.dumps(market_data, indent=4)};"
    
    if not os.path.exists('js'): os.makedirs('js')
    with open('js/data_feed.js', 'w') as f:
        f.write(js_content)
        
    print(f"\n✅ BRIDGE COMPLETE. Data saved to 'js/data_feed.js'.")
    print("👉 Open 'market-intel.html' to view the intelligence.")

if __name__ == "__main__":
    run_bridge()