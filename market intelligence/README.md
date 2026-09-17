# FIN-OS Market Intelligence Engine

> Flask · NSE/BSE data · Technical + Fundamental analysis  
> **Port:** 5001 | **Version:** v1 | **Updated:** July 2026

Multi-modal stock analysis engine that powers the `market-intel.html` page. Provides four distinct analysis modes: Fundamental, Intraday, Swing, and Long-term — each returning both rich HTML output and clean parsed metrics.

---

## Folder Structure

```
market intelligence/
├── app.py              ← Flask server (entry point, routes + output cleaning)
├── fundamental.py      ← Fundamental analysis engine (FinancialSystem)
├── intraday.py         ← Intraday trading analytics
├── swing.py            ← Swing trading analytics (multi-day to weeks)
├── long.py             ← Long-term investment analytics (omni_max_analytics)
└── requirements.txt    ← Python dependencies
```

---

## Analysis Modes

### 1. Fundamental (`/analyze/fundamental`)
Deep company analysis:
- Valuation ratios: P/E, P/B, EV/EBITDA, PEG
- Profitability: ROE, ROCE, net margin, operating margin
- Balance sheet: D/E ratio, current ratio, interest coverage
- Growth: 3Y revenue CAGR, EPS growth, promoter holding trend
- FIN-OS Health Score: composite 0–100 rating
- DuPont decomposition: asset turnover × profit margin × leverage

### 2. Intraday (`/analyze/intraday`)
Same-day trading signals:
- Volume spike detection (vs 20-day average)
- VWAP (Volume-Weighted Average Price)
- Support / resistance levels (pivot points)
- RSI (14-period), MACD signal line
- Options OI change (if available)
- Intraday bias: bullish / bearish / neutral

### 3. Swing (`/analyze/swing`)
Multi-day to weeks trading:
- Moving averages: EMA 20, EMA 50, SMA 200
- Bollinger Bands squeeze detection
- ADX (Average Directional Index) trend strength
- Fibonacci retracement levels
- Pattern recognition: flags, channels, breakouts
- Risk/reward ratio with suggested entry + stop-loss

### 4. Long-term (`/analyze/long`)
Investment-grade analysis via `omni_max_analytics`:
- 5Y and 10Y price CAGR
- Dividend yield and payout ratio
- Free cash flow yield
- Moat scoring: brand / switching cost / network effect / cost advantage
- Peer comparison across sector
- FIRE corpus calculation: "How much FD to live on dividends?"

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Service status |
| POST | `/analyze/fundamental` | Fundamental analysis → HTML + metrics JSON |
| POST | `/analyze/intraday` | Intraday signals → HTML + metrics JSON |
| POST | `/analyze/swing` | Swing analysis → HTML + metrics JSON |
| POST | `/analyze/long` | Long-term analysis → HTML + metrics JSON |

### Request body (all endpoints)

```json
{
  "ticker": "RELIANCE.NS",
  "exchange": "NSE"
}
```

### Response structure

```json
{
  "html": "<div class='analysis'>...</div>",
  "metrics": {
    "pe": 23.4,
    "pb": 2.1,
    "roe": 14.8,
    "health_score": 72.0
  },
  "mode": "fundamental",
  "ticker": "RELIANCE.NS"
}
```

The `html` field is ANSI-cleaned and safe to inject directly into the page. The `metrics` field contains parsed numbers for charts and KPI cards.

---

## Output Pipeline (app.py)

The analysis modules return terminal-style text with ANSI colour codes. `app.py` has two cleaning functions:

```
Raw ANSI output from analysis module
    ↓
ansi_to_html()   → converts \033[92m → <span style="color:#CCFF00">
    ↓
HTML output (for rendering in market-intel.html)

Raw ANSI output
    ↓
strip_ansi()     → removes all escape codes
    ↓
parse_metrics()  → regex extracts "PE: 23.4", "Health Score: 72.0/100" etc.
    ↓
JSON metrics (for KPI cards and charts)
```

---

## Setup

```bash
cd "market intelligence"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python app.py
# API at http://localhost:5001
```

---

## Sample Tickers

| Format | Exchange | Example |
|---|---|---|
| `SYMBOL.NS` | NSE | `RELIANCE.NS`, `TCS.NS`, `INFY.NS` |
| `SYMBOL.BO` | BSE | `500325.BO` |
| No suffix | US / Auto | `AAPL`, `TSLA` |

---

## Dependencies

```
flask, flask-cors    — API server
yfinance            — Price history, fundamentals
pandas, numpy       — Data processing
requests            — HTTP scraping (Screener.in fallback)
```
