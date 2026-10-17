# portfolio-analytics agent notes (Oct 2026)

Rows: M-07, M-08, M-09, M-14, M-16, M-17, M-18, M-20, S-04, S-05, S-06, S-07.

## Decisions per row
| Row | Decision | Built |
|---|---|---|
| M-07 crypto detail | Built. `/api/chart` accepts any Yahoo symbol (checked live: BTC-USD, ETH-USD, XRP-USD, DOGE-USD work; MATIC-USD and POL-USD return no data, so Polygon shows today's price and says why). | `app/market/crypto/[id].tsx` |
| M-08 commodity detail | Built for gold, silver (GC=F, SI=F), crude (CL=F), natural gas (NG=F). Chart is in USD (world futures); rupee price stays on the list card and is labelled as converted, not MCX. | `app/market/commodity/[key].tsx` |
| M-09 forex detail | Built for USD/EUR/GBP/JPY/AED to INR (USDINR=X etc.) with a two-way converter at the market rate. | `app/market/fx/[pair].tsx` |
| M-14 market visualizer | The website page is a deep-dive that needs the port-5000 market-intel service, and its metrics are regex-scraped with invented defaults (Altman Z "4.2", etc.). Not ported. Built a different, honest visual: **Market map** (index and sector-index tiles, 50 large companies as a treemap sized by market value, coloured by day move). | `app/market/map.tsx` |
| M-16 options intelligence | The page's IV rank, VIX, Nifty spot and option chain are random numbers. Not ported. Built what is real: Black-Scholes price and Greeks (ported from the page's own functions, parity tested), exact profit/loss at expiry for six strategies (the page's four plus long call/put) from user-typed strikes and premiums, Nifty spot and India VIX shown from `/api/market/overview` as reference only. No premium or lot size is assumed. | `app/market/options.tsx` |
| M-17 QuantEdge | **Not built.** `html/quantedge.html` + `js/quantedge.js` are hard-coded (72% "edge", "MEAN REVERSION", radar [72,45,88,60,55]); there is no model or data behind them. | none |
| M-18 hedge fund view | The page's "your trading DNA", override cost (₹38,200) and bias meters are invented; its ticker is hard-coded prices. Built what is computable: portfolio risk metrics from real history (volatility, worst fall, Calmar, Ulcer, Sharpe, Sortino, beta, tracking error, IR) and the page's calculators (expectancy, break-even win rate, profit factor, recovery after a fall) on the user's own numbers. The page's verdicts ("BLOCK", "TRADE") are not ported (advice-like). | `app/portfolio/risk.tsx` |
| M-20 CA advisor | **Not built.** The page is a mock-up: random access codes, a pre-filled fake advisor and activity log, "Send invite" and "Send message" do nothing; sharing would need a server-side sharing/permissions service that does not exist. The only real part, the tax dossier, is already the phone's Report / ITR tools. | none |
| S-04 sector heatmap/treemap | Built. Sector = what Yahoo names via `/api/fundamentals/{symbol}` (cached per symbol); a stock without one is "Unmapped" (the website guesses from ticker keywords, e.g. files INDIGO under paints; not ported). Mutual funds sit in one "Mutual funds" bucket (no look-through data). Colour = gain on cost; a holding with no live price is grey, not 0%. HHI and effective N ported from the website. | `app/portfolio/sectors.tsx`, `lib/portfolioSectors.ts`, `lib/portfolioTreemap.ts` |
| S-05 factor regression / Monte Carlo | Monte Carlo built: seeded (mulberry32), assumptions typed by the person (placeholders 10% / 15% labelled as such), optional "use last year's volatility of my holdings", result is a percentile cone with the assumptions printed. Factor regression: Fama-French needs published India size/value/profitability/investment factor returns; the backend has none, and the website's version is "estimated from sector composition" (not a regression). Built the one factor that exists, the market: OLS vs Nifty 50 (beta, alpha, R squared, tracking error, IR) on retrospective current-weight daily returns. | `app/portfolio/simulate.tsx`, `app/portfolio/risk.tsx`, `lib/portfolioSimulate.ts`, `lib/portfolioHistory.ts` |
| S-06 news / peers / promoter | News: `/api/news` headlines matched to holdings by company name or capital ticker, counting the feed's own keyword sentiment labels (method string shown). Peers: opt-in, other names in the fixed 50-company list that Yahoo puts in the same industry/sector (source's grouping, stated). Valuation table (P/E, P/B, EPS, market value) from `/api/fundamentals`. Promoter trend: **not built**, the backend has no shareholding source and the website's table is hard-coded and a quarter old. | `app/portfolio/research.tsx`, `lib/portfolioNews.ts` |
| S-07 screener | Extended only with what `/api/fundamentals` returns: opt-in load of sector, P/E, P/B for the list; sector filter, P/E and P/B limits, the website's "Deep Value" rule (P/E<=15 and P/B<=2, parity tested), sort by P/E, P/B, size. A missing figure never passes a limit. Website presets needing ROE, debt/equity, dividend yield, revenue growth are not built (no data). | `app/market/screener.tsx`, `lib/marketDataScreener.ts` |

Other: hub `app/portfolio/analytics.tsx` (route `/portfolio/analytics`; there is no `app/portfolio/index.tsx` because `(tabs)/portfolio.tsx` already owns `/portfolio`). Market hub links added in `app/market/index.tsx`.
XIRR was already done (`lib/xirr.ts`, `components/XirrCard.tsx`); `Porfolio Analyser/portfolio-analyser-v10.html` contains no XIRR function, so there is nothing to compare it with.

## Parity tests (against the website's own code, run in a vm)
`__tests__/portfolioAnalytics.parity.test.mts` (helper `__tests__/helpers/webText.mts` extracts functions by brace matching): mean/std/cov/corr/linReg/toReturns; squarify (random + tie cases); computeHHI/effectiveN; `computeAlphaMetrics` (beta, alpha, Sharpe, tracking error, IR, via the page's own DOM writes); `runMonteCarlo` path rule (website's Math.random replaced by the same seeded stream: percentiles and probability of loss identical); hedge-fund `calcExp`/`updateDD`; screener `deep_value` preset.
`__tests__/marketDataOptions.test.mts`: `_calcGreeks` (delta, theta, gamma, vega, price, moneyness) on 600 random cases; plus Black-Scholes reference values, put-call parity, brute-force check of max profit/loss/break-evens on 300 random strategies.
Other tests: `portfolioSimulate`, `portfolioHistory`, `portfolioSectors` (also news matching and treemap geometry), `marketDataDetail` (symbols, series summary, screener valuation, map normalisers).
Deliberate differences from the website: daily (not weekly) returns; standard Sortino; seeded RNG and user-set mu/sigma; no bull/bear/crash scenario shifts; sector never guessed; premiums/IV never defaulted.
Mutation checks done (test fails, restored): std divisor, squarify tie rule (needed a new test), path shock, annualisation, effective-N rounding, deep-value bound, Unmapped label, day-coverage rule (needed a new test), seeded RNG, max-profit unlimited rule, news name genericity.
Run: `cd mobile && npx tsc --noEmit && npm test` (1040 pass at time of writing).

## Verification
- tsc clean; `npm test` 1040/1040 (the stall earlier was my test calling the website's `randn` with a generator that always returns 0, an infinite loop; removed, the file now runs in 0.3 s).
- `smoke-routes.py` on a fresh Metro at port 8171 (stopped afterwards) over 18 routes (including `/market/crypto/matic-network`, `/market/fx/JPY_INR`): 0 problems, dark+light, empty+populated. `theme-audit.py` on 11 routes: 0 low contrast. (The smoke script's populated fixture uses lowercase holding types the app ignores, so I also drove the portfolio screens with proper holdings in Playwright against the live backend and looked at screenshots, dark and light.)
- Live backend checks: risk screen gave plausible numbers (beta 1.00, vol 14.9% vs Nifty 13.7%, R² 84%); sectors came back from Yahoo (Energy, Financial Services, Technology, Consumer Defensive); news matching found 3 of 36 headlines; options Greeks and model-premium fill worked; offline (port 7475 aborted, nothing cached) every screen shows a plain "Can't reach the Arya backend" message, no spinner.
- Not verified: a real phone (touch, performance of 5,000-path simulations and 18 parallel history downloads); offline with a populated cache was verified only by the shared cache layer's own tests, not re-driven for each new screen; Android storage size with many cached histories (entries are trimmed to dated closes; cap is the existing 60-entry LRU, which a 20-holding portfolio can fill, evicting older answers); the in-app browser; Hindi.
- Cross-checking the risk numbers against an independent calculation of the live data was not done beyond the website parity of each formula.

## Honest limits
- Risk screen is retrospective at today's weights, price/NAV only (no dividends, trades, SIP timing). One year.
- Sector names are Yahoo's (different from NSE/website wording); ETFs (e.g. NIFTYBEES) come back Unmapped.
- Fundamentals are Yahoo's, withheld P/E when inconsistent with price/EPS.
- News sentiment is keyword rules; matching is a text match and can be wrong.
- Chart history rounded to 2 decimals by the backend: JPY (about 0.6), DOGE, XRP charts are stepped (screen warns when prices are under 5).
- Gold/silver chart is USD world futures; rupee conversion of history is not done.
- Futures roll jumps appear in commodity history.

## Backend requests (not edited)
1. `/api/chart` (`arya-ai/data/market.py get_chart`): do not round to 2 decimals for prices under about 10 (JPYINR, DOGE, XRP). Keep 4+.
2. `/api/market/overview`: NIFTY MIDCAP 50 and NIFTY MIDCAP return identical price/change (16,946.30, -0.06%) in a live check; one is probably mis-mapped.
3. Shareholding pattern endpoint (promoter %, pledge, by quarter) from NSE filings to enable the promoter trend.
4. Bulk fundamentals (`/api/fundamentals?symbols=`) so the screener and peers need one call, not 50.
5. A crypto history symbol for Polygon (POL) if a source exists.
6. Optionally: Indian factor returns (size/value/profitability/investment) if a licensed source is acceptable, to allow a real multi-factor regression.

## Entries needed in shared files
- `lib/search.ts` SCREENS: `/portfolio/analytics` Portfolio analytics (portfolio sector risk simulation monte carlo treemap beta research); `/portfolio/sectors` Sectors and treemap; `/portfolio/risk` Risk and market sensitivity (drawdown beta sharpe volatility); `/portfolio/simulate` Portfolio simulation (monte carlo cone); `/portfolio/research` Holdings research (news pe peers); `/market/map` Market map (heatmap sectors); `/market/options` Options calculator (greeks black scholes payoff). Dynamic: `/market/crypto/[id]`, `/market/commodity/[key]`, `/market/fx/[pair]`.
- `(tabs)/portfolio.tsx`: a link "Portfolio analytics ›" to `/portfolio/analytics`.
- `scripts/smoke-routes.py` SAMPLES: `'market/crypto/[id]': ['/market/crypto/bitcoin','/market/crypto/matic-network']`, `'market/commodity/[key]': ['/market/commodity/gold']`, `'market/fx/[pair]': ['/market/fx/USD_INR']`.
- `lib/privacy.ts`: no new host or permission. New requests to the same Arya backend: `/api/chart` for Yahoo symbols (your holdings' tickers as `SYMBOL.NS`, `^NSEI`, BTC-USD, GC=F, USDINR=X...), `/api/mf/history/{code}?years=2`, `/api/fundamentals/{symbol}` for each share you hold. Mention that holding tickers and fund codes go to your own backend for these screens. New cache keys inside `marketcache_v1:` (`ychart:`, `series:`, `fundseries:`, `sectorindices`, `fundamentals:`). The privacy guard (only `app/market/news.tsx` opens web pages) is respected: research screen links to Market news instead.
- `lib/i18nHi.ts`: titles "Portfolio analytics", "Sectors and treemap", "Risk and market sensitivity", "Portfolio simulation", "Holdings research", "Market map", "Options calculator", "Price history".
- Tracker `docs/MOBILE_PARITY_TRACKER.xlsx`: M-07/M-08/M-09 Done (detail with history; gold/silver in USD, Polygon no history); M-14 Partial (market map, not the deep-dive); M-16 Partial (calculator + payoff; no chain/IV rank, no data); M-17 Not built (static placeholder values); M-18 Partial (risk metrics + calculators); M-20 Not built (mock-up, needs sharing backend); S-04 Done; S-05 Partial (Monte Carlo + one-factor regression; no multi-factor); S-06 Partial (news, valuation table, opt-in peers; no promoter trend); S-07 Partial (valuation filters from backend data only).
- `docs/MOBILE_APP.md`, `mobile/README.md`: list the routes above; `docs/PENDING.md`: the backend requests.
- Website issues seen (not mine): `Porfolio Analyser/portfolio-analyser-v10.html` sector guessing from ticker keywords (INDIGO as paints), hard-coded promoter/peer/fundamentals tables, AI-generated news requiring an API key; `html/hedgefund.html` hard-coded ticker and invented "your trading DNA"; `html/options-intelligence.html` random IV rank/chain.

## Commit
```
git add -- mobile/lib/portfolioStats.ts mobile/lib/portfolioTreemap.ts mobile/lib/portfolioSectors.ts mobile/lib/portfolioHistory.ts mobile/lib/portfolioSimulate.ts mobile/lib/portfolioNews.ts mobile/lib/portfolioApi.ts \
  mobile/lib/marketDataApi.ts mobile/lib/marketDataDetail.ts mobile/lib/marketDataMap.ts mobile/lib/marketDataOptions.ts mobile/lib/marketDataScreener.ts \
  mobile/components/MarketUI.tsx mobile/components/PriceChart.tsx mobile/components/PortfolioUI.tsx mobile/components/PortfolioTreemap.tsx mobile/components/PortfolioCone.tsx \
  "mobile/app/market/crypto/[id].tsx" "mobile/app/market/commodity/[key].tsx" "mobile/app/market/fx/[pair].tsx" mobile/app/market/map.tsx mobile/app/market/options.tsx \
  mobile/app/market/index.tsx mobile/app/market/crypto.tsx mobile/app/market/commodities.tsx mobile/app/market/fx.tsx mobile/app/market/screener.tsx \
  mobile/app/portfolio/analytics.tsx mobile/app/portfolio/sectors.tsx mobile/app/portfolio/risk.tsx mobile/app/portfolio/simulate.tsx mobile/app/portfolio/research.tsx \
  mobile/__tests__/helpers/webText.mts mobile/__tests__/portfolioAnalytics.parity.test.mts mobile/__tests__/portfolioSimulate.test.mts mobile/__tests__/portfolioHistory.test.mts \
  mobile/__tests__/portfolioSectors.test.mts mobile/__tests__/marketDataOptions.test.mts mobile/__tests__/marketDataDetail.test.mts docs/agent-notes/portfolio-analytics.md
git commit -F - <<'EOF'
feat(market,portfolio): crypto/commodity/FX detail, market map, options calculator, portfolio analytics

Detail screens with price history from /api/chart for coins, commodities and currencies (units and sources stated).
Market map (indices, sectors, 50 large companies treemap). Options calculator: Black-Scholes Greeks and strategy payoff at
expiry from user-typed numbers, parity-tested against the website. Portfolio analytics: sector treemap (never guesses a sector,
"Unmapped" otherwise), retrospective risk and one-factor beta vs Nifty, seeded reproducible Monte Carlo cone with stated
assumptions, news/valuation/peers from backend data. Screener gains P/E, P/B and sector filters from /api/fundamentals.
Not built, with reasons in docs/agent-notes/portfolio-analytics.md: QuantEdge, CA advisor, promoter trend, multi-factor regression.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```
