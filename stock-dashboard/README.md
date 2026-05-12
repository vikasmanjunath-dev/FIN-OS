# StockOS — Live Stock Market Dashboard

A production-grade, real-time stock market dashboard with a Gen Z dark-mode UI.

---

## Folder Structure

```
stock-dashboard/
├── backend/
│   ├── app.py              ← Flask API server
│   └── requirements.txt    ← Python dependencies
└── frontend/
    ├── index.html          ← Main dashboard page
    ├── css/
    │   └── styles.css      ← Full styling (dark/light theme)
    └── js/
        └── app.js          ← All JS: charts, watchlist, compare, particles
```

---

## Setup & Run (Local)

### Step 1 — Backend (Python)

```bash
cd stock-dashboard/backend

# Create a virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate        # Mac/Linux
# venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Start the API server
python app.py
```

The API runs at: **http://localhost:5000**

---

### Step 2 — Frontend

Open `frontend/index.html` directly in your browser, **or** serve it with a local server:

```bash
cd stock-dashboard/frontend
python3 -m http.server 8080
```

Then open: **http://localhost:8080**

> Make sure the backend is running first, or you'll get "Failed to fetch" errors.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/stock?ticker=AAPL&period=1D` | Full stock data + history |
| GET | `/sparkline?ticker=AAPL` | 7-day sparkline data |
| GET | `/compare?tickers=AAPL,MSFT&period=1M` | Normalized comparison |
| GET | `/search?q=reliance` | Ticker autocomplete |

**Period options:** `1D`, `5D`, `1M`, `3M`, `1Y`

---

## Sample Tickers

### Indian Stocks (NSE)
- `RELIANCE.NS` — Reliance Industries
- `TCS.NS` — Tata Consultancy Services
- `INFY.NS` — Infosys
- `HDFCBANK.NS` — HDFC Bank
- `WIPRO.NS` — Wipro
- `BAJFINANCE.NS` — Bajaj Finance

### US Stocks (NASDAQ / NYSE)
- `AAPL` — Apple
- `TSLA` — Tesla
- `NVDA` — NVIDIA
- `MSFT` — Microsoft
- `META` — Meta Platforms
- `AMZN` — Amazon

### Indices
- `^NSEI` — NIFTY 50
- `^GSPC` — S&P 500
- `^DJI` — Dow Jones
- `^IXIC` — NASDAQ Composite

---

## Features

- Live price with auto-refresh every 10 seconds
- Interactive Chart.js charts (1D / 5D / 1M / 3M / 1Y)
- Green/Red price indicators with animated flash
- Glassmorphism dark UI with Gen Z aesthetics
- Particle background animation
- Fixed sidebar with 4 pages: Dashboard, Watchlist, Compare, Markets
- Watchlist with localStorage persistence + sparklines
- Multi-stock comparison with normalized % charts
- Global markets overview page
- AI financial insight panel
- 52-week range progress bar
- CMD+K search shortcut
- Light/Dark theme toggle
- Responsive design (mobile-friendly)
- In-memory caching (10s TTL)
- Debounced search with autocomplete

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.9+, Flask, yfinance |
| Frontend | Vanilla HTML/CSS/JS |
| Charts | Chart.js v4 |
| Fonts | Inter + JetBrains Mono |
| Data | yfinance (free, no API key needed) |
