# market-data agent notes (Oct 2026)

## Built
Phone (all under `mobile/`):
- `app/market/index.tsx` hub (share look-up, fund search, links, "clear saved market data"), `news.tsx`, `commodities.tsx`, `fx.tsx`, `crypto.tsx`, `screener.tsx`, `stock/[symbol].tsx` (quote, day and 52-week range, 1M/3M/6M/1Y SVG chart, fundamentals, add to watchlist), `fund/[code].tsx` (NAV, plan/option, NAV history chart, computed returns).
- `lib/marketData.ts` (pure normalisers, freshness, fund returns, screener), `lib/marketDataStorage.ts` (last-good cache), `lib/marketDataApi.ts`, `hooks/useMarketResource.ts`, `hooks/useMarketData.ts` (now cached, change may be null, adds index P/E), `components/PriceChart.tsx` (PriceChart + Sparkline), `components/MarketUI.tsx`.
- `app/(tabs)/markets.tsx`: "Market research" link; index cards no longer show 0 for an unknown change; offline shows the last saved answer.
- Tests: `__tests__/marketData.test.mts`, `__tests__/marketDataStorage.test.mts` (33 tests).

Backend (`arya-ai/`), tests in `tests/test_market_data_backend.py` (30 tests, stubs only):
- `pe_ratio` was price-to-book under a wrong name (and always None in practice: fast_info has neither). Now `pe_ratio: None`, `price_to_book: None` on quotes; real ratios come from new `GET /api/fundamentals/{symbol}` (Yahoo company info; P/E cross-checked against price/EPS within 15%, else withheld with the reason).
- Commodities: no more `fx.get("USD_INR", 83.5)`. Without a live rate gold/silver go to `unavailable` (with USD price); partial answers are not cached; units now USD/bbl, USD/MMBtu; `price_date`, `price_usd`, `usd_inr` added.
- `/api/fx` returns `{"error":...}` when no rate could be fetched. Crypto cache key collision fixed, ids validated, failures remembered 30 s, generic error text. Overview: NSE `high/low` were read from the wrong keys; added year high/low, NSE index P/E, P/B, dividend yield; no invented 0 change; empty answers not cached. Sector fallback likewise.
- Quotes: symbol validation, `M&M` URL-encoded for NSE, bulk quotes concurrent and capped at 60 (`truncated`), unknown symbol remembered 20 s, SQLite L2 returns the full stored quote (name, source, price_to_book).
- MF: parser header-driven, category captured, "N.A." NAV is None, outage retried at most once a minute, search matches all words in any order. New `GET /api/mf/history/{code}?years=6` using api.mfapi.in (public mirror of AMFI NAVs; 189/189 daily NAVs of one scheme matched AMFI's own history report; each response is also cross-checked with NAVAll). New third-party host, backend only.
- News: parallel fetch with timeouts, per-source status (`sources`), sorted by real time (was sorted by weekday name), `published_ts`, HTML entities decoded, whole-word sentiment and tags (implemented in `data/news.py` `score_text`; `intelligence/sentiment.py` was not edited and still has the substring bug, but nothing else uses it), `sentiment_method`, `as_of`. 5 of 40 live headlines changed class (e.g. "against" matched "gain", "bank" matched "ban").
- `/api/chart` now returns `dates` aligned with `closes`.
- Live check (backend was running with --reload): quote, fundamentals, quotes, commodities, fx, mf history/search, news all answered with real data. NSE's quote-equity returned nothing from here, so quotes come from yfinance.

## Honest limits
- Screener: price-only (day move, distance from 52-week high/low). The 50-name list is Nifty 50 membership as of late 2025 with TATAMOTORS replaced by TMPV; all 50 were quotable on 14 Oct 2026 but membership was NOT checked against NSE. yfinance quotes carry the symbol as `name` (fundamentals supplies the long name).
- Not built, no data source: F&O, debt, money-market detail, FII/DII, market-intel (needs the separate port-5000 service), stock-platform deep screener (needs stock-engine on 8003). ETF detail = the share screen; expense ratio/tracking error not available. MF expense ratio, AUM, holdings are not in AMFI NAV data.
- Fund returns are point-to-point NAV maths (3Y/5Y per year), flagged as not factsheet figures; IDCW options flagged as understated.
- Sentiment is keyword rules on headline+summary; the screen says so. Moneycontrol and Business Standard feeds return 403 to the backend (3 of 5 sources answer); the screen shows "x of y sources answered".
- Fundamentals are Yahoo's, checked live only on a RELIANCE sample (P/E 21.3 vs price/EPS 21.3).
- Not tested on a real phone; the in-app browser (`expo-web-browser`) was not exercised on web.
- Masterclass pages (equitydetail, mfdetail, ...) are editorial text, not data; not ported.

## Verification
- `npx tsc --noEmit` clean; `npm test`: my 33 + a11y + privacy fetch-caller guard + search pass. Other failures (website-parity tests, `lib/diagnostics.ts:42 192.168.1.4` host guard) belong to other agents' in-flight work.
- Backend: `python3 -m pytest tests/test_market_data_backend.py tests/test_chart_endpoint.py -q` 39 passed. Mutation checks: pe_ratio=price_to_book, 83.5 fallback, crypto key, unencoded `&` all fail the tests.
- Smoke (`BASE=http://localhost:8093`, fresh Metro; the :8082 server was stale and showed "Unmatched Route" for new files, which smoke does not flag): 11 routes x 4 runs, 0 problems; theme-audit light 0 low-contrast. Offline (port 7475 aborted): news shows the last saved answer "as of 7:17 am" with the reason; a stock never seen shows a plain message.
- Restart the :8082 Metro to pick up `app/market/**`.

## Shared-file entries needed
- `lib/search.ts` SCREENS: `/market` Market research (news stock price share lookup fund nav screener gold dollar bitcoin), `/market/news` Market news, `/market/screener` Stock screener, `/market/commodities` Gold, silver and oil, `/market/fx` Currency rates, `/market/crypto` Crypto prices. Check the search guard copes with the dynamic `/market/stock/[symbol]`, `/market/fund/[code]`.
- Watchlist rows (`app/tracker/watchlist.tsx`): make the row name a button doing `router.push('/market/stock/' + r.symbol)` for Stock and `'/market/fund/' + r.symbol` for MF. Portfolio `HoldingRow`: same (row is a long-press Touchable; add a small "Details" link next to Remove).
- Privacy notice (`lib/privacy.ts`): backend now also asks api.mfapi.in (fund NAV history, scheme code only) and Yahoo company info; add to the market-data providers flow. New on-device cache: keys `marketcache_v1:*` and `marketcache_v1_index` (last market answers, includes symbols you looked at; not exported or backed up because no `finos_` prefix; removed by Erase all data or the hub's "Clear saved market data"). Add to DATA_ITEMS if wanted.
- `privacy.test.mts` fetch-caller list unchanged (new code uses fetchJSON; useMarketData.ts still calls fetch directly).
- Hindi (`lib/i18nHi.ts`): "Market research", "Market news", "Stock screener", "Gold, silver and oil", "Currency rates", "Crypto prices", "Offline. Showing the last saved answer", "Not available", "What this is, and is not", "Add to watchlist".
- Docs: `mobile/README.md`, `docs/MOBILE_APP.md` list the `/market/*` screens and cache layer; `arya-ai/README.md` endpoint table gets `/api/fundamentals/{symbol}`, `/api/mf/history/{code}`, `/api/mf/search`, `/api/fx`, chart `dates`; `docs/PENDING.md` gets the "not built" items.
- Tracker: M-19 Done; M-04 Done (live data, no masterclass text); M-05 Partial (ETF = share screen, no expense ratio); M-06 Done (NAV, history, computed returns); M-07, M-08, M-09 Partial (live prices only); M-15 Partial (price-only screener); M-10, M-11, M-12, M-13 stay Pending/Blocked (no data source).
- Website issues seen (not mine): `js/arya-sidebar-panel.js` reads commodity key "GOLD (10g MCX)" which no longer exists and labels FX "RBI reference"; `html/news.html` shows fabricated "Ghost Protocol" headlines when the feed is offline.

## Commit
```
git add -- arya-ai/data/market.py arya-ai/data/news.py arya-ai/db/store.py arya-ai/server.py tests/test_market_data_backend.py \
  mobile/lib/marketData.ts mobile/lib/marketDataStorage.ts mobile/lib/marketDataApi.ts mobile/hooks/useMarketResource.ts mobile/hooks/useMarketData.ts \
  mobile/components/PriceChart.tsx mobile/components/MarketUI.tsx "mobile/app/(tabs)/markets.tsx" \
  mobile/app/market/index.tsx mobile/app/market/news.tsx mobile/app/market/commodities.tsx mobile/app/market/fx.tsx mobile/app/market/crypto.tsx \
  mobile/app/market/screener.tsx "mobile/app/market/stock/[symbol].tsx" "mobile/app/market/fund/[code].tsx" \
  mobile/__tests__/marketData.test.mts mobile/__tests__/marketDataStorage.test.mts docs/agent-notes/market-data.md
git commit -F - <<'EOF'
feat(market): news, stock, fund, commodity, FX, crypto and screener screens; honest market backend

Phone: market research hub, news with stated keyword-sentiment and tag filter, stock detail with
range, chart and labelled fundamentals, fund detail with NAV history and computed returns,
commodities (gold/silver marked as converted world prices, not MCX), FX, crypto, price-only
screener, last-good-response cache with "as of" time, null-safe index cards.

Backend: pe_ratio was price-to-book under the wrong name; USD/INR is never guessed (83.5 removed);
crypto cache key collision, invented 0 changes, wrong NSE index fields, news sorted by weekday name,
substring sentiment ("ban" in "bank"), slow serial quotes, M&M encoding. New /api/fundamentals,
/api/mf/history (AMFI NAVs via mfapi.in, cross-checked), chart dates, news source status.
Tests: 30 backend, 33 phone.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```
