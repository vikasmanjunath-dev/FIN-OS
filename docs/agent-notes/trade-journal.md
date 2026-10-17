# Trade journal (tracker row S-09), Oct 2026

## Built (all under `mobile/`)
- `lib/tradeJournal.ts` pure core: the record (web field names), reading/validating stored records, per-trade P&L with 7 charges, totals (win rate, average win/loss, payoff, profit factor, expectancy, max drawdown with dates, streaks), groups by setup / tag / weekday / month / symbol / instrument / side, periods (all, Indian FY, 90d, 30d), psychology as counts and comparisons only, the form model and its validation, tags.
- `lib/tradeJournalImport.ts` CSV export (all charges, zeros kept, formula-injection guard) and import: this app's CSV (round trip), a table of trades, a broker trade book (fills paired flat-to-flat per symbol, day-first dates, open leftovers reported not imported), the website's TradeBook JSON backup. Merge with duplicate detection (id, then content, counted), undo by batch.
- `lib/tradeJournalStorage.ts` AsyncStorage wrappers (serialised writes, raw-list edits that leave unreadable records and unknown fields alone, `keepIfUnreadable` before any write over a damaged list).
- `components/JournalUI.tsx` (chips, tiles, SVG equity chart in the PriceChart style, group bars, `useJournal`).
- Screens: `app/journal/index.tsx` (home: totals, curve, filter/search, list), `trade.tsx` (add/edit/delete, live P&L preview), `analytics.tsx`, `psychology.tsx`, `import.tsx` (preview, dedupe count, undo, past imports, export), `tags.tsx`.
- Tests: `__tests__/tradeJournal.test.mts` (39), `tradeJournalImport.test.mts` (11), `tradeJournal.parity.test.mts` (20: 12 pass, 8 `todo` web defects).

## Data and privacy
Keys: `finos_trade_journal_v1` (array of trades, unique string ids), `finos_trade_journal_tags_v1` (array of {id,name,type,color}). They are ordinary `finos_` keys, so existing rules apply unchanged: on device always; in the person's own export/backup; in the cloud only if signed in and tracker sync is on (arrays with unique ids merge by id); erased by Erase all data. No network call, no new host, no permission, no dependency. File read uses `expo-document-picker` + `expo-file-system` (native) / `File.text()` (web), not `fetch`, so the fetch-caller guard list is unchanged. Export uses the share sheet (text) on native, a download on web: no temp file, so no TEMP_FILE_PATTERNS change.
Decision for the integrator: trade notes and feelings are sensitive. If you prefer them never to sync, rename the keys `finos_sync_never_trade_journal_v1` / `..._tags_v1` (kept out of sync by prefix; backup still includes them) and change the two constants in `lib/tradeJournalStorage.ts`. Default follows the brief (existing tracker-sync rules).
Not synced with the standalone TradeJournal website: that app has its own BYO Supabase and vault id; the phone imports its JSON backup instead.

## Defects found in the website TradeJournal/ (for its owner; nothing under TradeJournal/ edited)
Pinned by `tradeJournal.parity.test.mts` (`todo` tests assert the correct behaviour and will pass once fixed) unless marked "read":
1. `fmt()` uses `Math.abs`, so a losing Net P&L (`stat-netpnl`), expectancy and chart axis ticks lose their minus sign (only the colour says loss).
2. `editTrade()` refills ~15 inputs; `saveTrade()` rebuilds the whole record from the form, so editing a trade erases all 7 charges (net becomes gross) and about 25 other fields (SL, target, lot size, pre-emotion, confidence, notes...).
3. `updateFormCalc` runs only when `entry && exit`: an exit of 0 (option expired worthless) gives no gross.
4. Blank quantity is treated as 1 (`parseFloat(qty)||1`): a profit is shown for a quantity nobody typed.
5. Week-to-date P&L: `weekStart = today - getDay() + 1` is next Monday on Sundays, and `toISOString()` is UTC (read also: `checkDailyLossLimit` uses the UTC date, so 00:00 to 05:30 IST checks yesterday).
6. Strategy doughnut plots `Math.abs` of each strategy total: a losing strategy looks like a big winner.
7. CSV export reads `t.exchangeCharges` / `t.otherCharges` but trades store `exchange` / `other` (two columns always blank); every cell uses `|| ''` so a 0 exit or 0 net is blank; `plannedRR`/`actualRR` never exist; no formula-injection guard; charges labelled "Tax".
8. CSV import (`upgrades.js`): reads DD/MM/YYYY as MM/DD (5 Oct becomes 10 May); each broker fill becomes its own trade with net 0; exit is never read; side stored as BUY/SELL (the rest of the app uses Long/Short); header cleaning strips digits and `&` so "P&L" never matches; naive comma split; dedupe key date|symbol|net removes distinct zero-net fills on re-import; no undo.
9. Read only: `generateInsights` calls avg win / avg loss "Profit Factor" (that is the payoff ratio) while the dashboard uses total won / total lost, and `insights.js` uses a third formula that is off when breakeven trades exist; `insights.js` and `stats.js` expectancy `wr*avgWin-(1-wr)*avgLoss` counts breakeven trades as losses (app.js's version is right); `insights.js` streaks count breakeven as a loss.
10. Read only: "Sharpe", "Sortino", "Calmar", Kelly, VaR are computed on daily rupee P&L, not returns on capital, with population std and a Sortino that takes the std of negative days only; not valid figures. Kelly uses the profit factor where it needs the payoff ratio.
11. Read only: `renderJournal` and other views insert `symbol`, `strategy`, `emotion`, notes into `innerHTML` unescaped (only `id` is sanitised on import): stored XSS through an imported file or synced vault.
12. Read only: confidence (5) and stress (3) and `isRevenge/isImpulsive=false` are saved even if never touched, so the psychology charts treat defaults as answers.
13. Read only: "Cost of indiscipline" (`discPnl>0 ? -undiscPnl : abs(undiscPnl)`) shows a cost even when rule-breaking trades made money, and can show "-₹-x". "Rule ROI" "would have saved" amounts are invented constants (avgLoss x 0.2, x 0.3...). Several texts are advice ("Avoid trading in this state", "Consider sizing up", "Stop trading").
14. Read only: dashboard `stat-dd-sub` percent (`maxDD/(total+maxDD)`) is not a drawdown percentage; `updateXP(100 + Math.abs(n) > 0 ? 50 : 0)` precedence.
15. Read only (sync.js): vault id is PBKDF2 of a phone number with a fixed salt, 100k iterations (a 10-digit mobile space is searchable offline); RLS is `using (true)` so the anon key in the browser reads every vault; pull overwrites a whole key (last writer wins) so offline edits on two devices lose trades. Tesseract/Chart.js load from CDNs.

## Phone behaviour that differs on purpose
- Unknown stays unknown: no exit/qty/side means "not rated", listed but excluded from every profit figure; charges not recorded are counted and the screens say net may be overstated. Revenge/impulsive are yes / no / not recorded.
- Net is derived (gross - charges), not stored. Max drawdown keeps the website's convention (curve starts at 0), same-day order by entry time then logged order. Profit factor is `null` (screen: "No losses") instead of the website's 999.
- Dates use the local calendar day, weekdays are time-zone independent, "this financial year" starts 1 April.
- Not ported: Sharpe/Sortino/Calmar/Kelly/VaR/Monte Carlo/benchmark vs NIFTY (needs capital; the website's NIFTY line is a made-up 12% a year), tilt/burnout/bias/psychology scores and grades, rule ROI, rules list, mood journal, XP and badges, challenges, quality sliders, MAE/MFE, SL/target and R multiples, timeframe, trade type, indicators, account, prop-firm and Arya coach. Psychology output is counts and comparisons with "very few trades" flags; a test forbids advice words.
- OCR scan of broker screenshots: not built. It needs an on-device OCR dependency (a native module or a WASM engine like Tesseract, large and new to the build) or a backend, and either changes what leaves or is processed on the phone, which needs a privacy decision (a screenshot shows account details). The import screen offers the broker trade-book CSV instead.
- Tax: nothing computed. The home screen says so and links to the existing Tax planner (`/tools/taxplanner`), stating it does not cover trading income.

## Honest limits / not verified
- Not run on a real phone or the native share sheet / file picker (web preview only; picker and `Share.share` untested). Export on native shares text, large journals (tens of thousands of rows) may hit share-sheet size limits.
- Broker file formats were written from column names (Zerodha tradebook: symbol, trade_date, trade_type, quantity, price, order_execution_time) and not tested against a real Zerodha, Upstox, Groww or Angel One file. Options with different symbols per strike are paired per symbol; positions carried across a file boundary are reported open.
- Fills pairing uses flat-to-flat cycles with average prices, not tax lot matching (FIFO). Brokers' own P&L reports may differ.
- Web parity covers: dashboard totals, drawdown, per-trade P&L form maths, by weekday / month / emotion / tag / discipline, expectancy (the website's whole-rupee rounding aside). Hindi not translated.
- `npm test` overall: the only failures are other agents' (learn lesson files, `app/arya/agent.tsx` in the fetch-caller list, news-link flow). Mine, a11y, storage-key, search and privacy host guards pass. tsc: no errors in my files.
- Smoke (port 8171, stopped afterwards): 6 routes x 4 runs 0 problems (empty data only; populated runs done by hand with 41 trades, dark and light, no NaN, no external requests). theme-audit light (empty): 0 low-contrast.
- Mutation checks done: drawdown, profit factor, dedupe, fills sign each make tests fail.

## Entries needed in shared files
- `lib/keyShapes.ts` ARRAY_KEYS: add `'finos_trade_journal_v1'`, `'finos_trade_journal_tags_v1'`.
- `lib/storageKeys.ts`: nothing (not private-named, synced + backed up + erased by the generic rules). If you choose the device-only-from-sync variant above, rename instead.
- `lib/privacy.ts`: DATA_ITEMS add `{ key: 'finos_trade_journal_v1', label: 'Trade journal: your trades, charges, feelings and notes (syncs like your other tracker data if you sign in)', kind: 'list' }` and `{ key: 'finos_trade_journal_tags_v1', label: 'Trade journal tags', kind: 'list' }`. FLOWS 'files': add "or a trade file" to the title/when text (nothing sent; undo from Import and export). No new host or permission.
- `lib/search.ts` SCREENS: `/journal` Trade journal (trade trades journal pnl profit loss log), `/journal/analytics` Trade analytics, `/journal/psychology` Trading psychology, `/journal/import` Import or export trades, `/journal/tags` Trade tags. (`/journal/trade` is a form: optional "Add a trade".)
- `app/(tabs)/dashboard.tsx` or Tools hub: a link to `/journal`.
- `.expo/types/router.d.ts`: add the 6 routes (screens use `as any` so tsc is unaffected).
- Hindi (`i18nHi.ts`), first pass: "Trade journal", "Add a trade", "Analytics", "Psychology", "Import and export", "Tags", "NET PROFIT AFTER CHARGES", "WIN RATE", "AVG PER TRADE", "MAX DRAWDOWN", "YOUR TRADES", "No trades yet", "Not recorded", "Save trade", "Save changes", "Delete this trade", "Read the file", "Export CSV", "Undo this import", "PAST IMPORTS", "This journal records and counts what you entered. It is not investment advice and does not compute tax.", "Reading your journal…".
- Tracker xlsx S-09: Partial (log, edit, analytics, psychology counts, CSV/JSON import and export built; OCR scan out of scope, with reasons above). README / docs/MOBILE_APP.md: list `/journal/*` and the three libs. PENDING: OCR decision, real-file broker tests, website fixes above.

## Run
`cd mobile && npx tsc --noEmit && node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./__tests__/register-aliases.mjs --test __tests__/tradeJournal*.test.mts` (70 tests, 8 todo = website defects). Smoke: `BASE=http://localhost:<port> python3 mobile/scripts/smoke-routes.py /journal /journal/trade /journal/analytics /journal/psychology /journal/import /journal/tags`.

## Commit
```
git add -- mobile/lib/tradeJournal.ts mobile/lib/tradeJournalImport.ts mobile/lib/tradeJournalStorage.ts mobile/components/JournalUI.tsx \
  mobile/app/journal/index.tsx mobile/app/journal/trade.tsx mobile/app/journal/analytics.tsx mobile/app/journal/psychology.tsx mobile/app/journal/import.tsx mobile/app/journal/tags.tsx \
  mobile/__tests__/tradeJournal.test.mts mobile/__tests__/tradeJournalImport.test.mts mobile/__tests__/tradeJournal.parity.test.mts docs/agent-notes/trade-journal.md
git commit -F - <<'MSG'
feat(mobile): on-device trade journal (log, analytics, psychology counts, CSV/JSON import and export)

Ports the TradeBook Pro journal to the phone: trades with seven charges and the website's psychology
tags, analytics (win rate, average win/loss, profit factor, expectancy, max drawdown, by setup/tag/
weekday/month, equity curve), psychology as plain counts and comparisons (never advice), CSV and
broker trade-book import with preview, dedupe and undo, TradeBook JSON backup import, CSV export.
Unknown figures stay unrecorded; damaged storage is kept aside, never overwritten. Parity tests run the
website's app.js; website defects (lost minus sign, edit wipes charges, exit 0, DD/MM dates, CSV
export gaps, Sunday week) are pinned as todo tests and listed in the notes. OCR scan not built.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
MSG
```
