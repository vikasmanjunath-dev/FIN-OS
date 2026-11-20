# filename: app.py
from flask import Flask, jsonify, request, Response, abort
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


# ─────────────────────────────────────────────────────────────────────────────
# /explain  — structured signal POST → detailed Hinglish analysis with
#             stop / target price levels built into the prompt
# ─────────────────────────────────────────────────────────────────────────────

_SIGNAL_SYSTEM = """You are Arya, FIN·OS's AI technical analyst for Indian retail investors.
Explain trading signals exactly like a senior trader at a prop desk would explain to a junior.
Use ₹, NSE/BSE context, exact numbers. Hinglish — warm but precise.
Format: 3-4 sentences max. Always end with: "Stop loss: ₹X | Target: ₹Y | Risk-Reward: Z:1"
Never give advice without a stop loss. Always name the key risk."""

def _build_explain_prompt(data: dict) -> str:
    symbol      = data.get("symbol", "Stock")
    signal      = data.get("signal", "").upper()
    rsi         = data.get("rsi")
    macd_hist   = data.get("macd_hist")
    ema_cross   = data.get("ema_cross", "")
    vol_ratio   = data.get("volume_ratio")
    price       = data.get("current_price")
    support     = data.get("support")
    resistance  = data.get("resistance")
    mode        = data.get("mode", "swing")   # intraday / swing / long

    # Describe RSI zone
    rsi_desc = ""
    if rsi is not None:
        if rsi < 30:    rsi_desc = f"RSI {rsi:.1f} — heavily oversold (strong reversal zone)"
        elif rsi < 40:  rsi_desc = f"RSI {rsi:.1f} — oversold (watch for bounce)"
        elif rsi < 55:  rsi_desc = f"RSI {rsi:.1f} — neutral territory"
        elif rsi < 70:  rsi_desc = f"RSI {rsi:.1f} — bullish momentum, not overbought yet"
        else:           rsi_desc = f"RSI {rsi:.1f} — overbought (caution — reversal risk)"

    # MACD context
    macd_desc = ""
    if macd_hist is not None:
        if macd_hist > 0:   macd_desc = f"MACD histogram +{macd_hist:.2f} — bullish momentum building"
        elif macd_hist < 0: macd_desc = f"MACD histogram {macd_hist:.2f} — bearish pressure active"

    # Volume context
    vol_desc = ""
    if vol_ratio is not None:
        if vol_ratio >= 2.0:   vol_desc = f"Volume {vol_ratio:.1f}× average — institutional interest, high conviction move"
        elif vol_ratio >= 1.5: vol_desc = f"Volume {vol_ratio:.1f}× average — above-average activity"
        elif vol_ratio < 0.7:  vol_desc = f"Volume {vol_ratio:.1f}× average — weak volume, caution"

    # EMA cross
    ema_desc = ""
    if ema_cross:
        if "bullish" in str(ema_cross).lower(): ema_desc = "EMA crossover: bullish (short EMA crossed above long EMA)"
        elif "bearish" in str(ema_cross).lower(): ema_desc = "EMA crossover: bearish (short EMA crossed below long EMA)"

    # Auto-compute stop/target if price + support/resistance given
    stop_target_hint = ""
    if price and support and resistance:
        risk   = abs(price - support)
        reward = abs(resistance - price)
        rr     = round(reward / risk, 1) if risk > 0 else "N/A"
        stop_target_hint = (
            f"\nPrice info: CMP ₹{price} | Support ₹{support} | Resistance ₹{resistance} "
            f"→ suggested stop ₹{support} | target ₹{resistance} | R:R {rr}:1"
        )
    elif price:
        # Rough auto-stop (2% below for long, 2% above for short)
        if signal in ("BUY", "LONG"):
            stop  = round(price * 0.98, 1)
            tgt   = round(price * 1.05, 1)
        else:
            stop  = round(price * 1.02, 1)
            tgt   = round(price * 0.95, 1)
        stop_target_hint = f"\nCMP ₹{price} — compute stop ~₹{stop} and target ~₹{tgt} based on signal."

    signals_block = "\n".join(filter(None, [rsi_desc, macd_desc, vol_desc, ema_desc]))

    timeframe = {"intraday": "same-day trade (15m/1h chart)", "swing": "3-10 day swing trade (daily chart)", "long": "long-term position (weekly chart)"}.get(mode, mode)

    return f"""
Stock: {symbol}
Signal: {signal}
Timeframe: {timeframe}
Technical signals:
{signals_block or '(use general knowledge for this setup)'}
{stop_target_hint}

Give a 3-4 sentence Hinglish explanation:
1. What the signals collectively say
2. Why this setup is interesting (or risky)
3. End with "Stop loss: ₹X | Target: ₹Y | Risk-Reward: Z:1"
If signals are mixed or unclear, say so and recommend waiting for confirmation.
""".strip()


@app.route('/explain', methods=['POST'])
def explain_signal():
    """
    POST /explain
    Body: { symbol, signal, rsi, macd_hist, ema_cross, volume_ratio,
            current_price, support, resistance, mode }
    Returns: { explanation, recommendation, stop_loss, target, risk_reward }
    """
    data = request.get_json(silent=True) or {}
    if not data.get("symbol"):
        abort(400, "symbol is required")

    prompt      = _build_explain_prompt(data)
    explanation = _ollama_generate(prompt, _SIGNAL_SYSTEM)

    # Parse stop/target from response (re is imported at module level)
    stop_m  = re.search(r'Stop\s*(?:loss)?[:\s]+₹?([\d,\.]+)', explanation, re.I)
    tgt_m   = re.search(r'Target[:\s]+₹?([\d,\.]+)', explanation, re.I)
    rr_m    = re.search(r'Risk.?Reward[:\s]+([\d\.]+):1', explanation, re.I)

    def _parse_price(m):
        if not m: return None
        try: return float(m.group(1).replace(",", ""))
        except: return None

    upper = explanation.upper()
    rec   = "BUY" if any(w in upper for w in ["BUY", "BULLISH", "ACCUMULATE"]) \
            else "SELL" if any(w in upper for w in ["SELL", "BEARISH", "EXIT", "AVOID"]) \
            else "HOLD"

    return jsonify({
        "status":       "success",
        "symbol":       data.get("symbol"),
        "signal":       data.get("signal"),
        "explanation":  explanation,
        "recommendation": rec,
        "stop_loss":    _parse_price(stop_m),
        "target":       _parse_price(tgt_m),
        "risk_reward":  rr_m.group(1) + ":1" if rr_m else None,
        "metrics":      data,
    })


# ─────────────────────────────────────────────────────────────────────────────
# /explain/stream  — SSE streaming version of /explain
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/explain/stream', methods=['POST'])
def explain_signal_stream():
    """
    POST /explain/stream — Server-Sent Events (SSE) streaming Ollama response.
    Same body as /explain. Client reads event: token / event: done.
    """
    data   = request.get_json(silent=True) or {}
    prompt = _build_explain_prompt(data)

    def _generate():
        try:
            resp = requests.post(OLLAMA_URL, json={
                "model":   OLLAMA_MODEL,
                "system":  _SIGNAL_SYSTEM,
                "prompt":  prompt,
                "stream":  True,
                "options": {"temperature": 0.6, "num_predict": 250}
            }, stream=True, timeout=60)
            for line in resp.iter_lines():
                if not line: continue
                try:
                    chunk = json.loads(line)
                    tok   = chunk.get("response", "")
                    # Strip think tokens
                    tok = re.sub(r'<think>.*?</think>', '', tok, flags=re.DOTALL | re.IGNORECASE)
                    if tok:
                        yield f"data: {json.dumps({'token': tok})}\n\n"
                    if chunk.get("done"):
                        yield f"data: {json.dumps({'done': True})}\n\n"
                        break
                except Exception:
                    continue
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(_generate(), mimetype='text/event-stream',
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ─────────────────────────────────────────────────────────────────────────────
# /summarize  — 3-bullet AI news summary + sentiment score for any symbol
# ─────────────────────────────────────────────────────────────────────────────

_SUMMARIZE_SYSTEM = """You are Arya, FIN·OS's AI news analyst for Indian retail investors.
Summarize financial news in plain Hinglish for a retail investor with zero jargon.
Format your response EXACTLY as JSON:
{
  "bullets": ["bullet1", "bullet2", "bullet3"],
  "sentiment_score": <integer -100 to +100>,
  "sentiment_label": "bullish|bearish|neutral",
  "retail_impact": "one sentence explaining what this means for a retail investor",
  "related_stocks": ["STOCK1", "STOCK2"]
}
No text outside the JSON. Be precise and honest about uncertainty."""

@app.route('/summarize', methods=['GET', 'POST'])
def summarize_news():
    """
    GET  /summarize?symbol=RELIANCE&headline=<text>
    POST /summarize  { symbol, headline, news_items: ["h1","h2",...] }

    Returns 3-bullet AI summary + sentiment score (-100 to +100).
    """
    if request.method == 'POST':
        data       = request.get_json(silent=True) or {}
        symbol     = data.get("symbol", "Market")
        headline   = data.get("headline", "")
        news_items = data.get("news_items", [])
    else:
        symbol     = request.args.get("symbol", "Market")
        headline   = request.args.get("headline", "")
        news_items = []

    # Build the news block
    if news_items:
        news_block = "\n".join(f"- {h}" for h in news_items[:8])
    elif headline:
        news_block = f"- {headline}"
    else:
        news_block = f"Recent news for {symbol} (use your training knowledge)"

    prompt = f"""
Symbol / Topic: {symbol}
News headlines to summarize:
{news_block}

Summarize as instructed. Be honest — if news is unclear or old, say so in retail_impact.
Sentiment score: +100 = extremely bullish, -100 = extremely bearish, 0 = neutral.
""".strip()

    raw = _ollama_generate(prompt, _SUMMARIZE_SYSTEM)

    # Parse JSON from response
    try:
        # Strip any markdown fences
        clean = re.sub(r'```(?:json)?|```', '', raw).strip()
        result = json.loads(clean)
    except Exception:
        # Fallback: extract what we can
        upper = raw.upper()
        score = 20 if "BULLISH" in upper else -20 if "BEARISH" in upper else 0
        result = {
            "bullets":         [raw[:200]] if raw else ["Summarization failed — try again"],
            "sentiment_score": score,
            "sentiment_label": "bullish" if score > 0 else "bearish" if score < 0 else "neutral",
            "retail_impact":   "Unable to parse AI response — please retry",
            "related_stocks":  [],
        }

    return jsonify({
        "status":  "success",
        "symbol":  symbol,
        **result,
    })


if __name__ == '__main__':
    print("🚀 FIN-OS GOD MODE SERVER READY...")
    app.run(port=5000, debug=True)