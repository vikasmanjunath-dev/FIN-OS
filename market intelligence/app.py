# filename: app.py
from flask import Flask, jsonify, request
from flask_cors import CORS
import sys
import io
import re
import json
import requests
from unittest.mock import patch

# CORE MODULES
from fundamental import FinancialSystem
from intraday import full_stock_analytics
from swing import swing_detailed_analytics
from long import omni_max_analytics

app = Flask(__name__)
CORS(app)

# --- 1. CLEANING ENGINES ---
def ansi_to_html(text):
    """Converts terminal colors to HTML."""
    replacements = {
        r'\033\[95m': '<span style="color:#d63384;font-weight:bold;">',
        r'\033\[96m': '<span style="color:#00F0FF;font-weight:bold;">',
        r'\033\[92m': '<span style="color:#CCFF00;font-weight:bold;">',
        r'\033\[93m': '<span style="color:#FFD700;font-weight:bold;">',
        r'\033\[91m': '<span style="color:#FF2A6D;font-weight:bold;">',
        r'\033\[0m': '</span>',
        r'\033\[1m': '<span style="font-weight:bold;">',
        r'\033\[4m': '<span style="text-decoration:underline;">',
        r'\n': '<br>'
    }
    html = text
    for p, r in replacements.items(): html = re.sub(p, r, html)
    return html

def strip_ansi(text):
    """Aggressively removes ALL color codes to get raw text."""
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)

# --- 2. DATA SPIES (REGEX PARSERS) ---
def parse_metrics(mode, raw_text):
    """Extracts numbers from the CLEANED text."""
    data = {}
    clean_text = strip_ansi(raw_text) # Remove colors first!
    
    if mode == 'fundamental':
        # Look for "Health Score: 85.0/100"
        s = re.search(r"Health Score:\s*([\d\.]+)", clean_text)
        data['score'] = float(s.group(1)) if s else 0
        
        # Look for Red Flags
        if "RISK REPORT" in clean_text:
            parts = clean_text.split("RISK REPORT (Red Flags):")
            if len(parts) > 1:
                # Find lines starting with "-"
                flags = re.findall(r"-\s+(.*)", parts[1])
                data['flags'] = [f.strip() for f in flags if f.strip()]
            else:
                data['flags'] = []
        else:
            data['flags'] = []

    elif mode == 'intraday':
        # RSI
        r = re.search(r"RSI \(15m\):\s*([\d\.]+)", clean_text)
        data['rsi'] = float(r.group(1)) if r else 50
        
        # Trend
        t = re.search(r"Trend:\s*([A-Za-z]+)", clean_text)
        data['trend'] = t.group(1) if t else "Neutral"
        
        # Volume Chart (Open:123 Mid:456 Close:789)
        v = re.search(r"Open:(\d+)\s*Mid:(\d+)\s*Close:(\d+)", clean_text)
        if v:
            data['vol_chart'] = [int(v.group(1)), int(v.group(2)), int(v.group(3))]
        else:
            data['vol_chart'] = [10, 10, 10] # Fallback

    elif mode == 'swing':
        # Alignment
        a = re.search(r"Alignment Status:\s*(.*)", clean_text)
        data['alignment'] = a.group(1).strip() if a else "Unknown"
        
        # Institutional Days
        # Just count occurrences of "ACCUMULATION" word
        data['accum'] = clean_text.count("ACCUMULATION")
        
    return data

# --- 3. EXECUTION ENGINE ---
def execute_protocol(func, *args):
    capture = io.StringIO()
    # Auto-answers for input() calls: SMA=20, EMA=9, NSE=y
    inputs = ["20", "9", "y"] 
    
    with patch('sys.stdout', new=capture):
        with patch('builtins.input', side_effect=inputs):
            try:
                func(*args)
            except Exception as e:
                print(f"Error executing {func.__name__}: {e}")
            
    raw_output = capture.getvalue()
    return {
        "html": ansi_to_html(raw_output),
        "raw": raw_output
    }

@app.route('/analyze', methods=['GET'])
def analyze():
    sym = request.args.get('symbol', 'RELIANCE').upper()
    if "." not in sym: sym += ".NS"
    mode = request.args.get('mode', 'fundamental')
    
    print(f"⚡ RUNNING VISUALIZER PROTOCOL: {sym} [{mode}]")

    # SELECT PROTOCOL
    if mode == 'fundamental':
        res = execute_protocol(lambda: FinancialSystem(sym).run_full_scan())
    elif mode == 'intraday':
        res = execute_protocol(full_stock_analytics, sym)
    elif mode == 'swing':
        res = execute_protocol(swing_detailed_analytics, sym)
    elif mode == 'long':
        res = execute_protocol(omni_max_analytics, sym)
    else:
        return jsonify({"status": "error", "message": "Invalid Mode"})

    # PARSE DATA
    viz_data = parse_metrics(mode, res['raw'])

    return jsonify({
        "status": "success",
        "html": res['html'], # HTML for Terminal
        "viz": viz_data      # JSON for Visualizer
    })

# ─────────────────────────────────────────────────────────────────────────────
# AI EXPLAIN ENDPOINT — LLM reasoning for every technical signal
# ─────────────────────────────────────────────────────────────────────────────
OLLAMA_URL   = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen3:14b"

MARKET_AI_SYSTEM = """You are Arya, FIN·OS's AI market analyst for Indian retail investors.
Explain trading signals in plain Hinglish — like a smart friend who studied at IIM but still talks over chai.
Use ₹, Indian market context (NSE/BSE, SEBI, Nifty, Sensex). Be specific with numbers.
Max 3-4 sentences. End with ONE risk to watch."""

def _ollama_generate(prompt: str, system: str = MARKET_AI_SYSTEM) -> str:
    """Synchronous Ollama call — used in Flask routes."""
    try:
        resp = requests.post(OLLAMA_URL, json={
            "model":   OLLAMA_MODEL,
            "system":  system,
            "prompt":  prompt,
            "stream":  False,
            "options": {"temperature": 0.6, "num_predict": 200}
        }, timeout=30)
        resp.raise_for_status()
        return resp.json().get("response", "").strip()
    except Exception as e:
        return f"AI explanation unavailable — Ollama offline? ({e})"


@app.route('/ai-explain', methods=['GET', 'POST'])
def ai_explain():
    """
    Accepts signal data and returns a plain-language AI explanation.
    GET  /ai-explain?symbol=RELIANCE&mode=intraday
    POST /ai-explain  { symbol, mode, metrics: {rsi, trend, macd, ...} }
    """
    if request.method == 'POST':
        data   = request.get_json(silent=True) or {}
        symbol = data.get('symbol', 'NIFTY50')
        mode   = data.get('mode', 'intraday')
        metrics= data.get('metrics', {})
    else:
        symbol  = request.args.get('symbol', 'NIFTY50').upper()
        mode    = request.args.get('mode', 'intraday')
        metrics = {}  # GET mode uses existing /analyze output

        if not metrics and mode:
            # Run full analysis to get real metrics first
            if "." not in symbol: symbol_ns = symbol + ".NS"
            else: symbol_ns = symbol
            try:
                if mode == 'fundamental':
                    res = execute_protocol(lambda: FinancialSystem(symbol_ns).run_full_scan())
                elif mode == 'intraday':
                    res = execute_protocol(full_stock_analytics, symbol_ns)
                elif mode == 'swing':
                    res = execute_protocol(swing_detailed_analytics, symbol_ns)
                elif mode == 'long':
                    res = execute_protocol(omni_max_analytics, symbol_ns)
                else:
                    res = {"raw": ""}
                metrics = parse_metrics(mode, res['raw'])
            except Exception as e:
                metrics = {"error": str(e)}

    # Build context-rich prompt
    metrics_str = "\n".join(f"  {k}: {v}" for k, v in metrics.items())
    mode_labels = {
        "intraday":    "Intraday / Scalping (same-day trade)",
        "swing":       "Swing Trade (3–10 days)",
        "fundamental": "Fundamental Analysis (long-term investing)",
        "long":        "Long-Term Investing (1+ years)"
    }

    prompt = f"""
Stock: {symbol}
Analysis Type: {mode_labels.get(mode, mode)}
Technical/Fundamental Metrics:
{metrics_str if metrics_str.strip() else "  (no metrics provided — use general knowledge)"}

Explain this analysis in plain Hinglish for an Indian retail investor.
Include: what the signal means, is it good or bad, and one specific action.
""".strip()

    explanation = _ollama_generate(prompt)

    # Derive simple recommendation
    upper = explanation.upper()
    if any(w in upper for w in ["BUY", "BULLISH", "ACCUMULATE", "STRONG"]):
        rec = "BUY"
    elif any(w in upper for w in ["SELL", "BEARISH", "EXIT", "AVOID"]):
        rec = "SELL"
    else:
        rec = "HOLD"

    return jsonify({
        "status":       "success",
        "symbol":       symbol,
        "mode":         mode,
        "explanation":  explanation,
        "recommendation": rec,
        "metrics":      metrics
    })


@app.route('/sentiment', methods=['GET'])
def sentiment():
    """
    Quick AI sentiment for a symbol.
    GET /sentiment?symbol=RELIANCE
    """
    symbol = request.args.get('symbol', 'NIFTY50').upper()

    prompt = f"""
Stock/Index: {symbol} (Indian market — NSE/BSE)
Based on your training knowledge:
1. Sentiment right now: BULLISH / BEARISH / NEUTRAL
2. Key reason in one sentence
3. One risk to watch

Reply in natural Hinglish, 2-3 sentences max.
""".strip()

    text = _ollama_generate(prompt)
    upper = text.upper()
    sentiment_val = "bullish" if "BULLISH" in upper else "bearish" if "BEARISH" in upper else "neutral"

    return jsonify({
        "status":    "success",
        "symbol":    symbol,
        "sentiment": sentiment_val,
        "text":      text
    })


if __name__ == '__main__':
    print("🚀 FIN-OS GOD MODE SERVER READY...")
    app.run(port=5000, debug=True)