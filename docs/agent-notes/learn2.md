# Learn wave 2 - agent notes

Main tree (not a worktree). Nothing committed. Tracker rows L-27..L-51 (Pending, except L-41 which stays "Not planned") and the Partial rows L-22/24/25.

## Per-page decision table
Decision key: (a) lesson text extracted; (b) has a phone equivalent / hub that links to it; (c) interactive or service-dependent, no honest phone equivalent, said plainly; (d) website only. Every page has a page at `/learn/<id>` (id = website file name).

| Tracker | Page id | Website source | Decision | Why |
|---|---|---|---|---|
| L-22 | foundations | `html/foundations.html` | (b) hub | Menu of five cards, each mapped to a lesson, tool or tab. |
| L-24 | investor-mindset | `html/investor-mindset.html` | (c) + related tool | Demonstration panels with example numbers ("Simulated sector momentum scores"); Financial DNA is the closest, different, tool. |
| L-25 | investor-profile | `html/investor-profile.html` | (c) + related tool | Imagined "Indian market translation" of ten investors; not copied; Financial DNA is the closest tool. |
| L-27 | mindset-sim | `html/mindset-sim.html` | (a) lesson | The 17 scenarios live as data in the page script and do not depend on what you pick; only the score and the AI debrief do. Extracted as case studies (Hinglish), with the choose-then-reveal flow, score and AI debrief listed as not shown. |
| L-28 | mindset-sim-hub | `html/mindset-sim-hub.html` | redirect | The page only forwards to the Simulator Hub (meta refresh). |
| L-29 | train-mindset | `html/train-mindset.html` | redirect | Same: forwards to the Simulator Hub. |
| L-30 | not-money | `html/not-money.html` | redirect | Forwards to the AI Mindset Simulator. |
| L-31 | decision | `html/decision.html` | (a) lesson | Static teaching text (fast vs slow thinking, three biases, checklist). Doughnut chart (fixed example slices) left out and said so. |
| L-32 | clarity | `html/clarity.html` | (a) lesson + (b) link | Static text. The scanner strip, the "DONE/CURRENT/LOCKED" step labels and the EMI slider (rough x120x1.8 rule) are not shown; each is explained. Links the Net worth tracker. |
| L-33 | scenarios | `html/scenarios.html` | (b) hub, close tools | Nine what-if simulations run on stored numbers with AI narration; not on the phone. Each scenario is listed with the closest phone tool (or none). |
| L-34 | timeline | `html/timeline.html` | (c) no equivalent | Shows generated sample scores whenever it cannot reach its alert service (always off a developer machine). Not copied; Money Score named as the nearest real thing. |
| L-35 | fear-roadmap | `html/fear-roadmap.html` | (c) no equivalent | Quiz whose answers pick written outcomes; not lesson text for everyone. |
| L-36 | roadmap | `html/roadmap.html` | (b) hub | Personalised roadmap/mind map built from stored data: not on the phone. Its 7-path menu is listed with phone equivalents. |
| L-37 | roadmaps | `html/roadmaps.html` | redirect | Forwards to Roadmap. |
| L-38 | trader-roadmap | `html/trader-roadmap.html` | (c) no equivalent | Six-question quiz to five personas; one persona says to close all trading accounts. Not general advice. |
| L-39 | traditional-roadmap | `html/traditional-roadmap.html` | (c) no equivalent | Two-question quiz; the step list has out-of-date tax and inflation statements. |
| L-40 | simulator | `html/simulator.html` | redirect | Forwards to the Trading Simulator. |
| L-42 | simulator-landing | `html/simulator-landing.html` | (b) hub | Menu of six cards; the ticker strip uses fixed typed-in prices and a default 74% and is not shown. |
| L-43 | trading-simulator | `html/trading-simulator.html` | (d) website only | Practice trading UI with generated candles; no trading features on the phone. |
| L-44 | trading-coach | `html/trading-coach.html` | (c) no equivalent | 3-question clearance plus AI assessment; trader-only and needs the website AI service. |
| L-45 | trading-brain | `html/trading-brain.html` | (c) no equivalent | Live signals from data services; pattern tables quote "win rates" with no stated method. |
| L-46 | know-your-finances | `html/know-your-finances.html` | (c) no equivalent | Long input form plus AI scan; phone parts named (Net worth, Money Score, Retirement). |
| L-47 | financial-being | `html/financial-being.html` | (c) no equivalent | Long self-assessment ending in an AI report; Financial DNA named as a different, shorter quiz. |
| L-48 | diagnostics | `html/diagnostics.html` | (b) hub | Menu of 2 scans + 4 tools; DNA, Benchmarks and Future loss exist on the phone. (Not the phone's crash-notes Diagnostics screen.) |
| L-49 | life-wealth | `html/life-wealth.html` | (a) lesson | Static reflective text (page DOM + the five money-vs-soul pairs from its script). Radar chart with fixed scores left out. |
| L-50 | impact | `html/impact.html` | (b) hub | Menu: compound box (= SIP calculator on the phone) and 8 story cards (= Impact stories). |
| L-51 | impact-detail | `html/impact-detail.html` | (a) lesson | Eight five-step stories held in js/impact-detail.js. Two stated figures are wrong and are flagged. |

Total: 5 new lessons ((a): mindset-sim, decision, clarity, life-wealth, impact-detail), 6 hubs (foundations, simulator-landing, roadmap, diagnostics, scenarios, impact), 5 redirects, 9 "no equivalent" pages (two of them with a related tool), 1 website-only. The old `simulator-guide` (L-41) stays excluded.

## What was built
- `mobile/scripts/extract-learn.py` (extended, still deterministic; `--check` is part of the tests):
  - **Provenance for every block of every lesson**: `line` (line of the source file where the quote starts; `file` when the text is in a `js/` file). The extractor FAILS if a quote is not found in the file. All 556 blocks of the 22 first-pass lessons carry `line` too (nothing else in them changed).
  - New lessons: `mindset-sim` (20 scenarios, read by evaluating the page's own `SCENARIOS` literal in the sandbox `learnWebRunner.mjs evalLiteral`; Hinglish kept), `impact-detail` (8 stories from `js/impact-detail.js`), `decision`, `clarity`, `life-wealth` (DOM text with per-page text-neutral options: drop widget chrome, keep hidden panels, checklist labels as list items; life-wealth also takes the five money-vs-soul pairs from its script).
  - Stubs (`kind: "interactive"` + `stub{status, why, about, entries, notCarried, redirectTo}`): every `about` quote, hub entry and "left out" item is located in the website file at generation time (fails otherwise). Hub entries map to `lesson` / `route` / `none` with `match` same / close / note / none.
  - 15 new review items (`mindsim-*`, `impact-*`, `decision-*`, `clarity-cover`) in `docs/agent-notes/learn-review.md` (generated).
  - Illustration labels (hypothetical people / portfolio sizes) and lesson-level notes ("From the website", figures are statements with no stated date, Hinglish).
- Phone: `components/LearnBlocks.tsx` (kv blocks, captions, illustration label, optional per-passage "Quoted from file, line N", `LessonNotes`, `StubView`), `app/learn/[id].tsx` (notes card, "Show where each passage comes from" toggle, stub screens), `app/learn/index.tsx` (row meta from status; the "website" category is collapsed behind one row), `lib/learn.ts` (types, `STATUS_LABEL`, `rowMeta`).
- Progress: unchanged, `finos_learned_modules` in the website shape. Only the 27 lessons can be marked learned; stubs cannot.

## Findings about the website (not fixed here)
1. `html/timeline.html`: off localhost it cannot reach its alert engine, so every visitor sees generated sample scores (a "Demo mode" banner says so).
2. `html/simulator-landing.html`: the ticker has fixed typed-in prices (Nifty 24,213 ...) and a default "calm win rate 74%" when there is no session.
3. `js/clarity.js`: the "scanner" never shows a figure; the "EMI Time Machine" is `emi*120*1.8`, not compounding (Rs 21.6 lakh against about Rs 23.2 lakh for Rs 10,000); the ladder shows DONE / CURRENT / LOCKED to everyone.
4. `js/impact-detail.js`: "Rs 500 a month for 30 years = Rs 1 crore+" is wrong (about Rs 17.6 lakh at 12%; `js/impact.js` computes it itself); "5-year delay = 30-40% less" only holds at about 8-10% returns (46% at 12%). `impact.html`'s meta description talks about ESG, which the page is not.
5. `html/mindset-sim.html`: a comment says "50 scenarios", the array has 20; "64% gain from bottom" is wrong (198% from the bottom; 64% is on the start); an endowment of Rs 50,000 a year is called "3% CAGR" (about 5.3-5.8%) and the ELSS side says Rs 48 lakh (about Rs 36-40 lakh).
6. `html/trader-roadmap.html`: the "Gambler" branch (`p.ego !== 3 || p.emotion === 1`) catches every answer set that does not choose the last "Driver" option, so the other personas are mostly unreachable.
7. `html/traditional-roadmap.html`: says long-held debt funds are more tax-efficient than FDs (not true for units bought on/after 1 April 2023) and uses 6% inflation.
8. Concurrent edits seen: another session corrected the website lesson pages, emptied `REVIEW_ITEMS` in `extract-learn.py` and added external source links to lessons. I kept all of that; the review table now holds only this wave's 15 items.

## Tests
```
cd mobile && npx tsc --noEmit && npm test
python3 scripts/extract-learn.py --check
BASE=http://localhost:<port> python3 scripts/smoke-routes.py /learn /learn/decision /learn/mindset-sim ...
```
`__tests__/learn2.test.mts` (9 tests): every tracker page has a Learn page; stub statuses / targets / routes valid; **provenance re-checked independently of the extractor** for every block and for stub quotes (file, line, quote); no assumed user data (no ticker/demo values, no DONE/CURRENT labels, readers touch no storage); recomputed arithmetic behind the review flags; **Health Score golden**: the website's own `js/finos-health-score.js` snippet against `learnedCount` / `knowledgePoints` for 1..27 lessons marked learned, falsy entries, the cap of 6, stubs excluded; reader guards; search. `learn.test.mts` now also accepts dynamic route screens (`/tools/calc/<id>`).
Mutation check: moved one block's `line` by 100 and the provenance test failed (restored).

## Honest limits
- Review flags come from my own knowledge plus recomputation (no live web): the Nifty move on 23 Jul 2024 and the Zomato listing price are "medium" and must be checked against exchange data.
- Hinglish is shown as on the website, not translated. The Hindi chrome strings below need native review.
- The mindset-sim lesson is long (about 12 minutes). The website's choose-then-reveal, score and AI debrief are not reproduced.
- The hub "close" mappings are my judgement: the phone tool does a similar job with different inputs.
- Light-theme contrast audit and a by-eye look at screenshots of the new components were not done beyond the smoke run.

## Entries needed in shared files
- **`lib/search.ts`**: ALREADY INTEGRATED by the coordinator (search.test is green with the new pages); kept here for reference. Entries were:
  (original instruction: add one entry per new page after the existing `/learn/investor-profile` entry, in this order (`__tests__/search.test.mts` requires manifest order; the first-pass pages keep their old order). It may also report differences in the summaries of older entries, because the website lesson pages were edited by another session:
```
  e('/learn/mindset-sim', 'AI Mindset Simulator', 'Market crashes, FOMO traps, life crises — immersive financial scenarios where Arya plays the market and you make the call.', 'Learn', 'lesson learn investor mindset mindset-sim', '📖'),
  e('/learn/impact-detail', 'Impact stories', 'Eight short five-step stories behind the cards on the Small Changes, Big Impact page: a very Indian beginning, time vs money, an analogy, a reality check and the real insight.', 'Learn', 'lesson learn investor mindset impact-detail', '📖'),
  e('/learn/decision', 'Decision Core', 'Debug your own decision-making — loss aversion, confirmation bias, and anchoring, with tools to catch them before you act.', 'Learn', 'lesson learn investor mindset decision', '📖'),
  e('/learn/clarity', 'Clarity HUD', 'FIN•OS Clarity — structured thinking to cut through financial confusion.', 'Learn', 'lesson learn investor mindset clarity', '📖'),
  e('/learn/life-wealth', 'The Soul (Ultimate)', 'Life milestones and wealth map — marriage, home, children and retirement planning.', 'Learn', 'lesson learn investor mindset life-wealth', '📖'),
  e('/learn/simulator-landing', 'Simulator Hub', 'Train your investor mindset — simulators for psychology, bias and decision making.', 'Learn', 'lesson learn interactive pages on the website simulator-landing', '📖'),
  e('/learn/roadmap', 'My Roadmap', 'FIN·OS — Your personalized financial roadmap, mindmap and life journey.', 'Learn', 'lesson learn interactive pages on the website roadmap', '📖'),
  e('/learn/diagnostics', 'Diagnostic Portal', 'Run a deep financial health scan — find leaks, blind spots and risks in your money system.', 'Learn', 'lesson learn interactive pages on the website diagnostics', '📖'),
  e('/learn/scenarios', 'What-If Scenarios', 'Run real financial simulations on your actual data. See exactly what happens to your wealth, goals, and FIRE date — before you make any decision.', 'Learn', 'lesson learn interactive pages on the website scenarios', '📖'),
  e('/learn/impact', 'Small Changes, Big Impact', 'ESG and social impact investing — align your money with your values.', 'Learn', 'lesson learn investor mindset impact', '📖'),
  e('/learn/timeline', 'Financial Timeline', 'Your financial life on one chronological line — past milestones and the ones still ahead.', 'Learn', 'lesson learn interactive pages on the website timeline', '📖'),
  e('/learn/fear-roadmap', 'Mindset Repair', 'The Diagnosis — a roadmap outcome for the fear-driven investor archetype, one of three persona paths from your Roadmap quiz.', 'Learn', 'lesson learn interactive pages on the website fear-roadmap', '📖'),
  e('/learn/trader-roadmap', 'Trader GPS (God Mode)', 'The Kamikaze — a roadmap outcome for the high-risk trader archetype, one of three persona paths from your Roadmap quiz.', 'Learn', 'lesson learn interactive pages on the website trader-roadmap', '📖'),
  e('/learn/traditional-roadmap', 'The Fortress', 'You Are Not Wrong — a roadmap outcome for the safety-first saver archetype, one of three persona paths from your Roadmap quiz.', 'Learn', 'lesson learn interactive pages on the website traditional-roadmap', '📖'),
  e('/learn/trading-simulator', 'Trading Simulator | India\'s First Thinking Trading OS', 'India\'s first thinking trading OS — candle-by-candle simulation with real OHLC data and zero real money at risk.', 'Learn', 'lesson learn interactive pages on the website trading-simulator', '📖'),
  e('/learn/trading-coach', 'Emotion-Aware Trading Coach', '30 seconds, 3 questions, before you trade — a real-time emotional clearance check to catch fear, greed and overconfidence.', 'Learn', 'lesson learn interactive pages on the website trading-coach', '📖'),
  e('/learn/trading-brain', 'Trady — AI Trading Brain', 'Trady — Your AI Trading Brain & Companion. Pattern recognition, live signals, chart analysis, and Trady AI for NSE/BSE.', 'Learn', 'lesson learn interactive pages on the website trading-brain', '📖'),
  e('/learn/know-your-finances', 'Financial X-Ray (God Mode Scan)', 'FIN•OS God Mode X-Ray — Precision financial analysis for Indian professionals. Understand your cashflow, FIRE horizon, and net worth in minutes.', 'Learn', 'lesson learn interactive pages on the website know-your-finances', '📖'),
  e('/learn/financial-being', 'Financial Being', 'Holistic financial wellness — stress, behaviour and your life money score.', 'Learn', 'lesson learn interactive pages on the website financial-being', '📖'),
  e('/learn/mindset-sim-hub', 'Redirecting…', 'Redirecting to Simulator Hub…', 'Learn', 'lesson learn interactive pages on the website mindset-sim-hub', '📖'),
  e('/learn/train-mindset', 'Redirecting…', 'Redirecting to Simulator Hub…', 'Learn', 'lesson learn interactive pages on the website train-mindset', '📖'),
  e('/learn/not-money', 'Redirecting…', 'FIN•OS — Your AI-powered Financial Operating System for Indian investors.', 'Learn', 'lesson learn interactive pages on the website not-money', '📖'),
  e('/learn/roadmaps', 'Redirecting…', 'Redirecting to Roadmap…', 'Learn', 'lesson learn interactive pages on the website roadmaps', '📖'),
  e('/learn/simulator', 'Redirecting…', 'FIN•OS — Your AI-powered Financial Operating System for Indian investors.', 'Learn', 'lesson learn interactive pages on the website simulator', '📖'),
```
  )
- **Privacy**: the Linking.openURL in LearnBlocks.tsx is the other session's source-links feature; `lesson-links` flow is in lib/privacy.ts and privacy.test is green. This wave opens no web page.
- **Dashboard tile**: unchanged; "x of y lessons" now has y = 27.
- **Privacy**: no new key, host, permission or SDK. Same two keys as wave 1 (`finos_learned_modules`, `finos_learn_opened`).
- **Hindi (first pass, needs native review)**: "FROM THE WEBSITE" / "वेबसाइट से"; "NOT SHOWN ON THE PHONE" / "फ़ोन पर नहीं दिखाया गया"; "LEFT OUT ON PURPOSE" / "जानबूझकर छोड़ा गया"; "WHAT THE WEBSITE PAGE SAYS" / "वेबसाइट का पृष्ठ क्या कहता है"; "Show where each passage comes from" / "हर अंश कहाँ से है, दिखाएँ"; "Hide sources of each passage" / "स्रोत छिपाएँ"; "Not on the phone" / "फ़ोन पर नहीं"; "Website only" / "केवल वेबसाइट"; "A menu page on the website" / "वेबसाइट का एक मेनू पृष्ठ"; "A redirect on the website" / "वेबसाइट पर एक रीडायरेक्ट"; "Open the lesson" / "पाठ खोलें".
- **Tracker (`docs/MOBILE_PARITY_TRACKER.xlsx`)**: L-22 Done (hub); L-24, L-25 "No equivalent (explained)" with Financial DNA as related tool; L-27, L-31, L-32, L-49, L-51 Done (lesson); L-28, L-29, L-30, L-37, L-40 Done (redirect page); L-33, L-36, L-42, L-48, L-50 Done (hub with phone equivalents); L-34, L-35, L-38, L-39, L-44, L-45, L-46, L-47 no honest equivalent (page explains why); L-43 Website only. Planned location `learn/<id>` for all.
- **`mobile/.expo/types/router.d.ts`**: nothing new (routes are `/learn/[id]`).

## Commit
```
git add -- docs/agent-notes/learn2.md docs/agent-notes/learn-review.md \
  mobile/scripts/extract-learn.py mobile/content/learn \
  mobile/lib/learn.ts mobile/lib/learnContent.ts \
  mobile/components/LearnBlocks.tsx mobile/app/learn \
  mobile/__tests__/learn.test.mts mobile/__tests__/learn2.test.mts

git commit -F - <<'EOF'
Learn wave 2: mindset lessons, honest pages for every interactive website page

- extract-learn.py: line provenance for every quoted block (fails if a quote is
  not in the file); 5 new lessons (mindset-sim case studies, impact stories,
  decision, clarity, life-wealth); pages for 22 interactive / menu / redirect
  website pages that say what the page is and what the phone has instead,
  never flattening quizzes or demo panels into fake text.
- 15 new review flags (wrong arithmetic on the pages, e.g. Rs 500 SIP = Rs 1 crore).
- Reader: notes, left-out items, optional per-passage source lines, stub screens.
- Tests: provenance re-checked independently, no assumed user data, Health Score
  golden against js/finos-health-score.js for all 27 lessons.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```
`content/learn/*` and `learn.test.mts` also contain the other session's website-lesson corrections and source links; commit together or split by file as the coordinator prefers.

Final verification: `npm test` 1038/1038 pass, `tsc --noEmit` clean, `extract-learn.py --check` up to date, smoke-routes 17 screens x 4 runs 0 problems (Metro on 8161, stopped).
