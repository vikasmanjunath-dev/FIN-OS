# arya-tabs agent: Arya Plan / Map / Life / Cal / India / Agent tabs, tool loop, PULSE additions (tracker A-02 to A-06, A-09)

Nothing committed or pushed. Website files, `arya-ai/` and shared files untouched. The first-pass work (PULSE, memory, life events, local tools) was
already committed; this builds on it. See `arya-pulse.md` for that pass.

## Per-row decisions

| Row | Verdict | What was done |
|---|---|---|
| A-02 PULSE | Row text was inaccurate: the website has **27** ranked widgets, not 24, and 14 were on the phone. | Added 3 more computable from recorded data (now **17 of 27** on the phone): Net worth timeline, Wealth velocity (from an on-device net-worth history, website key `finos_nw_history`, one point a day, 90 kept), Monte Carlo "will my money last" (from the Retirement planner's stored inputs; runs only when retire age, retirement spending and age are really stored). 10 stay off with a reason each (`SECTIONS` in `lib/pulseCards.ts`): wealth fingerprint, page activity, wealth chart, compound race, scenario lab, inflation eroder, time machine, peer benchmark, goal probability, news. |
| A-03 Plan / Map / Life | Built | `app/arya/plan.tsx`, `map.tsx`, `life.tsx` + pure cores `lib/aryaPlan.ts`, `aryaMap.ts`, `aryaLife.ts`. |
| A-04 Cal / India / Agent | Built | `cal.tsx` (upcoming windows + 26-week spending heatmap), `india.tsx` (rules with source and year), `agent.tsx`. |
| A-05 Agent tools | Built | Tool loop wired into the chat; 44 tools (see below); every call visible; off switch; results carry source and time. |
| A-06 Memory and life events | Verified, gaps fixed | Verified the first pass (tests green, switches default off). Gaps fixed: chat could not write a note ("remember that ...": now a visible tool call through the memory store's refusal rules); the Life tab shows life events on a timeline with what each changes (kept equal to the rules by a test); a `tools` switch was added to `AryaPrefs`. Not done: nothing in Settings links to Memory (integration item). |
| A-09 Money AI / chatbot brain / RAG filings | **Not built on the phone**, reasons below | Money AI page = the Arya tab (A-01 Done). Chatbot brain (`chatbot/brain.py`) is a server-side Ollama proxy; the phone's equivalent is `/api/chat` already used. RAG filings: see below. |

### A-09 reasons (RAG)
Checked live (not from the docs): `rag-engine` on :7476 answers `/api/search`, but its collection (per `docs/RAG_STATUS.md`, 1036 points) holds only
`regulation` (SEBI/RBI/IRDAI/PFRDA) and `finos_page` documents; **no NSE/BSE filings are indexed**, so "RAG filings" cannot be honest. A test query for ELSS lock-in
returned a FIN-OS page chunk as its top hit, not a regulation. A phone tool would also send the question text to a second service that needs Qdrant and a model
running on the person's computer, with no public fallback. Documented in the Agent tab's "Not on the phone" list. Backend request: index filings, then expose a
retrieval-only endpoint (passages + source URL + date, no generated text) and the phone can add one tool and one privacy flow line.

## What the website tabs showed vs the phone

| Tab | Website | Phone |
|---|---|---|
| Plan | Roadmap; defaults spending to 75% of income, age 30; invents premiums ("~₹8-12K/yr"), "7.2%", "12% CAGR". Its sort puts unfinished safety steps near the end (priority numbers sorted ascending): looks like a website bug, not touched. | 8 steps (emergency fund, term, health, debt, 80C, saving, goals, retirement odds); each is done / in progress / not yet / **needs a figure** / may not apply. Dependants recorded as 0 -> term cover "may not apply". Optional return and cost-rise fields (blank by default, nothing stored) use `lifeGoals.findSIP`. |
| Map | Mind map with an "ideal equity = 100 - age" check | Allocation bar from recorded assets + 8 expandable areas; "Not recorded" for missing; no ideal mix, no benchmarks. |
| Life | Age milestones (25, 30, 35 ...) with "8x / 15x income" targets, retire at 60 | Timeline of declared events (with phase and prompts), goal dates, the retirement year the person set (only when age is recorded). Benchmarks not built. |
| Cal | 365-day heatmap against `finos_expenses/30 \|\| 50000` and fixed-date festivals | Upcoming dates grouped by window with money going out; heatmap compared with recorded monthly spending / 30, else the person's own average (the screen says which); no festivals (dates move yearly). |
| India | State "cost of life" map (unsourced figures, income defaults to ₹50,000) | **Not ported (no source).** Replaced by India's income-tax rules, each with source and year, both regimes side by side for the Tax-planner income, next tax dates. Warns when today's FY (2026-27) is later than the rules (FY 2025-26). No slab or regime assumed. |
| Agent | ReAct loop sending all context and tool results to the model; 45 tools; personas; run history | Plan-and-run loop on the phone (below). Personas and persisted run history not built. |

## The tool loop (A-05)
* `lib/aryaIntent.ts` was dead, untested code from the first pass (unwired, with bugs: "SIP of 10000 at 12% for 15 years" matched nothing). Fixed and adopted as **the** matcher; 
  the older matcher in `aryaTools.ts` is gone. `lib/aryaToolbox.ts` (phone tools), `lib/aryaServerTools.ts` (server tools), `lib/aryaAgent.ts` (plan, run, compose),
  `lib/aryaAgentLog.ts` (session log, memory only).
* **Why not model-driven:** `/api/chat` streams plain text and has no tool calling; a model-driven loop would send tool *results* (the person's figures) back to the model
  after every call regardless of the "figures" switch. The phone chooses tools from the question's words, so records stay on the phone. Cost: a question the matcher
  does not recognise is plain chat.
* Phone tools (no network): money summary, net worth, assets, debt, savings rate, emergency fund, goals, goal SIP, health score, Money Score, budget, spending, subscriptions,
  insurance, upcoming, alerts, life-event prompts, net-worth trend, retirement odds, FIRE number, SIP/EMI/FD/RD/lump sum/inflation calculators (the calculator hub's own `run`),
  tax estimate / 80C / advance tax / tax dates, memory show / add / forget (forget only opens the Memory screen), open screen, help.
* Server tools (`POST /api/tool`, the website's tool names): `get_quote`, `get_market`, `get_commodities`, `get_crypto`, `get_fx`, `analyze_stock`, `search_mf`/`get_mf_nav`,
  `get_news`, `get_announcements`. Only a public symbol, coin or fund-name words leave; each call states what it sends. `analyze_stock`'s BUY/SELL/HOLD verdict and score are
  **not shown** (indicator readings only, "not a recommendation"); tested.
* Visible: under every answer an "N tools used" block (tool, phone/server, what it was given, what left, status, time; tap for detail), shown as `running` before the call
  completes; the Agent tab lists the session's calls. Off switch: `tools` in `AryaPrefs` (chat header and Agent tab); off = no tool of any kind, and the offline reply says so.
  Public lookups also need the `online` switch. Results: "From: source. As of 17 Oct, 11:58."
* Multi-part questions ("my net worth and how is the nifty") run up to 3 tools; ambiguous ones ask (chips that send a question); a price with no share named asks which.
* Long (>12 words) questions about the person's own figures still go to the model first, with the tool answer as fallback if it cannot be reached (as in the first pass).
* Verified live against the real arya-ai (:7475): quote, market, calculator, two-tool question, and the off switch (question went to the model, no tool).

## Honest limits
* Matcher is words only: Hinglish is partial; unusual phrasing falls to the model. Errs toward not claiming.
* The India rules are FY 2025-26 as coded in the app (`lib/taxcore.ts`); I could not verify any FY 2026-27 Budget change. The screen says so. Legal section numbers in the
  `source` strings are my citation of the Act, checked against the code's figures, not against the Gazette.
* Net worth history only grows while PULSE is opened; it syncs like the website's key (object shape: on a sync conflict the cloud copy wins, so local points can be replaced).
* Monte Carlo on PULSE uses 1,000 runs, the tool 2,000; assumptions not set by the person are listed on the card.
* Per-cell heatmap taps are not offered (accessibility); biggest days are listed as text.
* Not verified: a physical device / simulator; Hindi; light-theme contrast audit (`theme-audit.py` not run); the Agent screen with a populated phone by eye (smoke test ran empty + populated, 0 problems).

## Backend requests (not done: `arya-ai/` is another agent's)
1. Native tool calling on `/api/chat` (or a server loop) if model-chosen tools are wanted; today the phone must not send results back.
2. A retrieval-only RAG endpoint with filings indexed (A-09).
3. `get_quote` returns no price timestamp (the gateway's `ts` is the call time); add `price_time` so "as of" can be the market time.
4. `search_mf` returned no results for "sbi bluechip direct growth" while the AMFI list was not loaded; a "list not loaded" error would be more honest than an empty list.

## Entries needed in shared files
* `lib/search.ts` SCREENS: `/arya/plan` (Plan, "money steps roadmap"), `/arya/map` (Map, "where my money sits allocation"), `/arya/life` (Life timeline), `/arya/cal` (Cal, "upcoming dates spending heatmap"), `/arya/india` (India tax rules), `/arya/agent` (Agent tools); also `/pulse`, `/pulse/memory`, `/pulse/life` from arya-pulse.md. The test `aryaToolbox` allows my six routes meanwhile.
* `lib/privacy.ts` DATA_ITEMS: `{ key: 'finos_nw_history', label: 'Net worth points PULSE recorded (syncs like your other records)', kind: 'value' }` (plus the keys in arya-pulse.md). The `arya` flow `sent` should add: "Tool calls: a share symbol, coin name or fund-name words for a public lookup; each call is listed under the answer and in the Agent tab; switch tools off there." No new host, permission or fetch caller (`app/arya/agent.tsx` reuses `postTool` from the hook; the guard test passes).
* `lib/storageKeys.ts` / erase registry: `finos_nw_history` is a `finos_` key (erased with the rest). `AryaPrefs` gained `tools` inside the existing `finos_session_arya_prefs_v1`.
* `lib/i18nHi.ts`: all new strings are English; Hindi needs a native pass (Plan/Map/Life/Cal/India/Agent titles and the tool-call labels).
* Dashboard/Track/Settings: links to `/arya/plan` and `/arya/agent`; `router.d.ts` is regenerated by `expo start`.
* Tracker rows (xlsx): A-02 "Partly: 17 of 27 website PULSE sections (website has 27, not 24); 10 deliberately not ported, see arya-tabs.md"; A-03 Done; A-04 Done (India map replaced by tax rules); A-05 Done (phone tool loop; model-driven loop not built, reason in notes); A-06 Done; A-09 Not built on phone (reasons in notes).
* Edits outside my listed files, small: `app/pulse/index.tsx` (tab strip + records the net-worth point), `components/AryaBubble.tsx` (tool-call block, ask chips). `lib/lifeEvents.ts` shows modified in the tree but not by me.

## Tests and how to run
`cd mobile && npx tsc --noEmit && npm test`: 995 pass; the 5 failures are others' (`fixedIncome.parity`, Learn manifest, website-quote check, extraction JSON, news-link opener list from `LearnBlocks.tsx`).
New: `aryaIntent` (matcher, 8), `aryaToolbox` (11), `aryaServerTools` (5), `aryaAgent` (9: off switch, visible steps, online switch, failures, abort, log, hook wiring), `aryaTabs` (11: plan/map/life/cal cores, India rules rebuild `taxcore` on 400 random incomes and match `taxSavings`/`taxHarvest` limits, "no tab prints an assumed income/age/slab", history, PULSE cards).
Mutation checks: removing the `tools` off check fails `aryaAgent`; removing the BUY/SELL stripping fails `aryaServerTools`. Smoke: `BASE=http://localhost:8151 python3 scripts/smoke-routes.py /arya/plan /arya/map /arya/life /arya/cal /arya/india /arya/agent /pulse /arya` -> 8 screens x 4 runs, 0 problems (Metro stopped afterwards).

## Commit
```
git add -- \
  docs/agent-notes/arya-tabs.md \
  "mobile/app/(tabs)/arya.tsx" mobile/app/pulse/index.tsx mobile/app/arya/plan.tsx mobile/app/arya/map.tsx mobile/app/arya/life.tsx mobile/app/arya/cal.tsx mobile/app/arya/india.tsx mobile/app/arya/agent.tsx \
  mobile/components/AryaBubble.tsx mobile/components/AryaFacts.tsx mobile/components/AryaTabs.tsx mobile/components/AryaToolCalls.tsx mobile/hooks/useAryaChat.ts \
  mobile/lib/aryaAgent.ts mobile/lib/aryaAgentLog.ts mobile/lib/aryaCal.ts mobile/lib/aryaFactsStorage.ts mobile/lib/aryaIndia.ts mobile/lib/aryaIntent.ts mobile/lib/aryaLife.ts \
  mobile/lib/aryaMap.ts mobile/lib/aryaMemoryStorage.ts mobile/lib/aryaPlan.ts mobile/lib/aryaRetirement.ts mobile/lib/aryaServerTools.ts mobile/lib/aryaToolbox.ts mobile/lib/aryaTools.ts \
  mobile/lib/pulseCards.ts mobile/lib/pulseHistory.ts mobile/lib/pulseHistoryStorage.ts \
  mobile/__tests__/aryaAgent.test.mts mobile/__tests__/aryaIntent.test.mts mobile/__tests__/aryaServerTools.test.mts mobile/__tests__/aryaTabs.test.mts mobile/__tests__/aryaToolbox.test.mts \
  mobile/__tests__/aryaTools.test.mts mobile/__tests__/aryaMemory.test.mts mobile/__tests__/pulseStorage.test.mts

git commit -F - <<'MSG'
feat(mobile): Arya Plan/Map/Life/Cal/India/Agent tabs, visible tool loop, PULSE net-worth history

Tool loop: the intent matcher (fixed, adopted) picks up to 3 tools per question; phone tools read recorded
figures or run the calculator hub; server tools (quote, market, commodities, crypto, fx, indicators, fund NAV,
news, announcements) send only a public symbol. Every call is shown under the answer and on the Agent tab with
source and time; a tools switch turns the loop off. analyze_stock's buy/sell verdict is not passed on.
Tabs: Plan (steps from records, "needs a figure" when unrecorded), Map, Life timeline, Cal (+ spending
heatmap against recorded spending), India (tax rules with source and year; table rebuilds taxcore exactly).
PULSE: net worth timeline, wealth velocity (one recorded point a day) and Monte Carlo from stored planner inputs.
A-09 (RAG filings) documented as not built: no filings are indexed.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
MSG
```
