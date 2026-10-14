# arya-pulse agent: PULSE ranked insights, Arya memory and life events, Arya local tools

Worktree: `/Users/vkm/Desktop/Finos/Initial Deployment/.claude/worktrees/agent-a7f23e0889ff2f9e5`  (branch `worktree-agent-a7f23e0889ff2f9e5`)
Nothing committed or pushed. Website files, `arya-ai/` and the shared files named in the brief are untouched.

## 0. Read this first: three things about the state I started from

1. **An earlier run of this same task had left files in the main tree (uncommitted, 11:3x today).** I adopted them instead of rewriting:
   `lib/pulseRank.ts` + `__tests__/pulseRank.parity.test.mts`, `lib/aryaMemory.ts`, `lib/aryaMemoryStorage.ts`, `lib/lifeEvents.ts`,
   `lib/lifeEventsStorage.ts`, `lib/aryaFacts.ts`. They are in this worktree and in the commit below, identical to main's copies
   except: `aryaMemory.ts` had two literal U+2028/U+2029 characters inside a regex (a syntax error: the file did not compile), now
   written as escapes; `aryaFacts.ts` gained `taxEstimate()`. **If you still have those files uncommitted in the main tree, the
   commit below supersedes them (same names, a superset).**
2. **My code depends on `lib/alerts.ts` and `lib/alertsStorage.ts`, which are uncommitted in the main tree** (another agent's alerts
   work, 01:01) and so were absent from this worktree. I copied the two files plus `__tests__/alerts.test.mts` in only to compile and
   test. They are *not* in my `git add` list: commit the alerts work first (or add them to the same commit).
3. **The existing smoke test would have passed vacuously on my first attempt.** With `node_modules` symlinked into a worktree,
   Metro serves HTML whose client bundle 404s, so every route renders only its static shell and `smoke-routes.py` reports 0 problems.
   If you run it from a worktree, give the worktree a real `node_modules` (`cp -cR` clone is instant on APFS) and check that a
   screen's text is non-trivial. I did this and re-ran everything.

## 1. What was built

### A. PULSE feed on the phone (`app/pulse/index.tsx`)

* `lib/pulseRank.ts` = port of `js/arya-pulse-rank.js` (`rank`, `snapshot`, `diff`, same DEFAULT_ORDER / PINNED / rules / wording, the
  clock is a parameter). `__tests__/pulseRank.parity.test.mts` loads the real website file and compares on 600 random contexts
  (junk values included), edge cases, the clock path, snapshot and diff.
* `lib/aryaFacts.ts` is one bundle of "what the phone knows" (`ArFacts`) built from the existing cores (`computeAll`, `alerts`,
  `nudges`, subscriptions summary, calendar events, Debt optimizer inputs, tax-planner inputs, saved Money Score).
  `lib/aryaFactsStorage.ts` `loadArFacts()` reads it from storage. Nothing is defaulted: an unknown figure is 0/null and the
  consumers say "not recorded".
* `lib/pulseCards.ts`: `SECTIONS` (the table below), `pulseCtx` (the ranker's context from facts), `buildFeed`.
  Only ported sections with real inputs become cards; a ported section missing one input shows under "Needs one more thing from you"
  with the exact missing item and a link; the not-ported ones are listed (with reasons) in a collapsible on the screen.
  Every card has `source` ("From: ...") and a caveat where one applies. The top three "Recommended for you" reasons go on cards that
  are actually on screen.
* "Since your last visit" uses the website's `finos_pulse_snapshot` key and its rule (save when none or 6h old). One honest change:
  the website's snapshot reports a 100% savings rate when spending is unknown; here a rate exists only with income AND spending.
* `components/PulseCard.tsx` renders a card.

### B. Memory and life events (`app/pulse/memory.tsx`, `app/pulse/life.tsx`)

* `lib/aryaMemory.ts` (pure, tested): notes you give (kinds fact/preference/goal/plan/event), topics noted from questions
  (fixed vocabulary of 14 labels, never your words, fade after 90 days), the website's 60-char dedupe, 45-day half-life,
  3 topics + 4 notes limit, refusal of PAN / Aadhaar / card / account / password / PIN / OTP, a per-note "never send" switch,
  instruction-lookalike text kept but never sent. Deliberate omissions vs the website: no emotion guess is stored, no cloud sync.
* `lib/aryaMemoryStorage.ts`: serialised read-modify-write, tolerant of corruption, switches (`AryaPrefs`).
* `lib/lifeEvents.ts` (pure, tested): 7 event types (marriage, child, home, job change, windfall, education, loss of income),
  a lead time and a window each, and rules that turn *recorded* facts into prompts ("because ..." lists the facts). A rule that needs
  an unrecorded figure says what to record. The website's `arya-life-events.js` triggers (salary credited, market fall, goal date,
  budget, tax, SIP missed, emergency fund, debt, milestone) are `lib/alerts.ts` + `lib/nudges.ts` on the phone, not repeated; the
  website's "Life Event Advisor" (a canned prompt to the model that returns an essay with invented amounts) is replaced by these rules.
* "What Arya will be told": `lib/aryaContext.ts` `buildChatContext()` is the *only* place that builds the request body. The chat hook
  sends its `.body`, the Memory screen lists its `.disclosures` (Sent / Not sent, with the reason, for the question, each figure,
  each memory note, each life event). A test asserts the hook contains no other context assembly.
* Switches (all on the Memory screen): online model on/off (off = nothing leaves the phone), figures, memory (default OFF),
  life events (default OFF), note topics of questions.

### C. Agent tools (`lib/aryaTools.ts`, `hooks/useAryaChat.ts`)

* `matchIntent` (words only, tested on 33 positive and 15 negative phrases): net worth, savings rate, emergency months, goals, dues,
  spending this month, Money Score, insurance, debt, tax, "SIP of X at r% for n years", "EMI on X at r% for n years", help.
  General questions ("what is a SIP?", "explain net worth", advice asks) are never claimed: they go to the model.
* `runLocal` answers from the same cores as the screens: net worth / emergency / budget from `computeAll`; SIP and EMI by running
  the calculator hub's own `byId('sip' | 'emi').run` and quoting its lines (test: each line is present); tax from `taxcore.best`
  (the same function the planner and the Tax screens use); debt payoff from `debt.simulatePayoff`; insurance from `computeCoverage`.
  Every answer ends with "From: <source>" and a chip to the screen. A missing figure is named, never assumed (SIP without a
  return asks for one rather than using 12%).
* Backend tool calls (online only, as the website): `backendCallFor` maps public-market questions to `get_quote`, `get_market`,
  `get_crypto`, `get_fx` on `POST /api/tool` (same gateway and tool names as `arya-sidebar-panel.js`). Only a public symbol is
  sent. `formatBackend` words the result deterministically and returns null on an unexpected shape. The call lives in
  `hooks/useAryaChat.ts` (already an allowed `fetch` caller in `privacy.test.mts`), so the guard needed no change.
* Order in the hook: evasion refusal (unchanged) -> local tool (short questions; long ones go online and fall back to the local
  answer on failure) -> market tool -> model (`/api/chat`, same SSE path as before) -> guardrails.
* Offline / private mode: `localOnlyReply` gives the phone's own answer when there is one, else the existing plain offline reply
  plus the questions that do work offline, and "Live prices need a connection" for a market question.
* `lib/aryaGuardrails.ts`: `apply` untouched (still parity-tested). New `applyFigures(user, reply, known)` (phone-only, not in the
  website file): a sentence that states an amount *about the person* ("your net worth is...", "you have...") that matches no
  recorded figure gets one appended note. Skipped on purpose: advice and hypotheticals (if/could/set aside/aim/...), ranges
  ("₹10,000-₹15,000"), amounts under ₹1,000. Tolerance 1.5%, 8% when the sentence says about/around. Only per-month amounts may
  be quoted per year. Found and fixed through a live run: a real model reply with a suggested range first produced a false note.
* `app/(tabs)/arya.tsx`: first four suggestion chips are questions answered on the phone; header links to Pulse and Memory.

## 2. The 27 website PULSE sections

(The website renders 27 ranked widgets; "24 sections" in earlier notes is the count without the 3 orientation/insight/score blocks.)

| id | website section | phone | why |
|---|---|---|---|
| crossPageHUD | Cross-page HUD | ported | "Your money today": net worth, savings rate, emergency months, health score, only recorded ones |
| smartInsightCards | Smart insight cards | ported | "Worth acting on": `lib/alerts` + `lib/nudges` |
| moneyScore | Money Score | ported | saved score; invitation when not taken |
| netWorthTimeline | Net worth timeline | not ported | phone keeps no net-worth history; "since your last visit" covers the change |
| wealthFingerprint | Wealth fingerprint | not ported | composite radar with invented weights and a default age |
| pageActivityMatrix | Page activity matrix | not ported | counts website page visits; the phone does not track screen visits |
| behavioralDNA | Behavioural DNA | ported | five DNA scores once the quiz is taken |
| wealthChart | Wealth trajectory | not ported | 8/12/16% curves to an assumed age 60; Retirement planner does it with own inputs |
| goalCards | Goal cards | ported | Goals tracker: progress, monthly need |
| indiaFinCalendar | India financial calendar | ported | next 30 days from the financial calendar |
| portfolioStressTest | Portfolio stress test | ported | -20/-30/-40% on the recorded holdings value (says it is the whole value) |
| compoundRace | Compound race | not ported | assumed returns and default age; SIP calculators answer it |
| savingsRateMeter | Savings rate meter | ported | recorded income and spending |
| taxDashboard | Tax dashboard | ported | `taxcore` on the Tax planner income; says salary-only |
| debtFreedomPlanner | Debt freedom planner | ported | Debt optimizer inputs; payoff only when every loan has balance, rate, EMI |
| scenarioLab | Scenario lab | not ported | sliders over assumed rates; calculators hub |
| inflationEroder | Inflation eroder | not ported | slider toy with a ₹1L default and 6%; calculator in the hub |
| monteCarlo | Monte Carlo | not ported | needs age/retire age/target; Retirement planner runs it seeded |
| timeMachine | Time machine | not ported | replays an assumed return series |
| peerBenchmark | Peer benchmark | not ported | hard-coded estimated peer table, not verifiable |
| transactionAnalyzer | Transaction analyzer | ported | this month's logged spending by category |
| wealthXRay | Wealth X-ray | ported | Net Worth assets by place |
| taxOptimizer | Tax optimizer | ported | 80C room, only when 80C used is recorded |
| insuranceGap | Insurance gap | ported | Insurance tracker vs the 2x / 15x guides (same rule as the tracker) |
| wealthVelocity | Wealth velocity | not ported | needs net-worth history |
| goalProbabilityMatrix | Goal probability matrix | not ported | needs a return model; Goals card shows the monthly amount |
| newsWidget | News widget | not ported | live headlines; Markets tab has them; the ranker puts it last |

14 ported, 13 not ported. Not on the ranked list and not ported: `buildPulseView` (five pillars with defaults age 30 / retire 60 / 12%:
the phone's Health score is the equivalent), the Debate section (multi-agent LLM).

## 3. Storage keys (every new one)

| key | what | synced? | notes |
|---|---|---|---|
| `finos_session_arya_memory_v1` | notes and topics | **no** (`finos_session_` prefix is in `NEVER_PREFIX` of `trackerSync.ts`; a test asserts it) | exported/backed up/erased with the rest (`finos_*`) |
| `finos_session_arya_prefs_v1` | the five switches | no | |
| `finos_session_arya_life_v1` | declared life events | no | |
| `finos_pulse_snapshot` | last PULSE snapshot (website's key and shape) | yes, like the website | holds net worth, debt, SIP, savings rate, emergency months, counts, score |

## 4. Entries for the shared files (not edited by me)

**`lib/search.ts` SCREENS** (the search guard test covers `app/tools`/`app/tracker` only, so this is not required by a test, but
the three screens are otherwise unfindable):
```ts
e('/pulse', 'PULSE', 'What matters for you today, ranked', 'Main', 'insights ranked since last visit recommended', '🧭'),
e('/pulse/memory', 'What Arya remembers', 'See, edit, delete; what will be sent', 'Account', 'memory notes privacy online switch told', '🧠'),
e('/pulse/life', 'Life events', 'Marriage, child, home, job change', 'Main', 'marriage baby wedding home job windfall education', '🎉'),
```
**`lib/privacy.ts`**
* `DATA_ITEMS`: `{ key: 'finos_session_arya_memory_v1', label: 'What Arya remembers', kind: 'list' }`,
  `{ key: 'finos_session_arya_life_v1', label: 'Life events you declared', kind: 'list' }`,
  `{ key: 'finos_session_arya_prefs_v1', label: 'Arya privacy switches', kind: 'value' }`,
  `{ key: 'finos_pulse_snapshot', label: 'Last PULSE snapshot', kind: 'value' }`.
* The `arya` flow's `sent` text should add: "optionally, up to 3 topics and 4 notes you gave Arya, and the type and month of life
  events you declared; both are off until you turn them on in What Arya remembers. You can switch the online model off entirely."
  and `control`: "What Arya remembers shows exactly what will be sent before you ask."
* No new host, permission or fetch caller (`hooks/useAryaChat.ts` was already listed), so the guards are unchanged.

**Dashboard / Track / Settings**: a link to `/pulse` (PULSE) and `/pulse/memory` would make the feed discoverable beyond the Arya header.

**`lib/storageKeys.ts` / erase registry** (exist only in the main tree, not in this worktree): register the four keys above.

**Hindi (`lib/i18nHi.ts`)**: nothing added by me; all new strings are English (the `<Text>` patch only translates registered
strings). The feed's reason sentences keep the website's `{n}`/`{amt}` template keys (`reasonT`, `textT`) so existing `hi.js`
entries and a native-reviewed Hindi pass can be wired in `pulseCards`/`PulseCard` later. First-pass Hindi still needs a native review.

**`mobile/.expo/types/router.d.ts`**: regenerated by `expo start`; I restored it. It will pick up `/pulse`, `/pulse/memory`, `/pulse/life`.

## 5. Verification done

* `npm test`: **430 pass, 0 fail** (353 existing + 77 new). `npx tsc --noEmit` clean.
* Mutation checks (break the code, see a test fail, restore): memory "never send local notes", instruction filter, secret refusal,
  guardrail "only sentences about you", context switch honoured, matcher's general-question rule, reason cap of three, empty-phone
  card suppression, known-figure default exclusion. All 8 killed.
* Playwright (Chromium, 430x900, dark and light, a real `node_modules` clone, outside network blocked):
  `smoke-routes.py /pulse /pulse/memory /pulse/life /arya` -> 0 problems (16 runs); `theme-audit.py` same four -> 0 low-contrast.
  Flows driven and read: PULSE with populated data (14 cards, since-last-visit, waiting list); Memory: preview, add note, OTP refused
  with reason, switches; Life events: declare marriage, prompts with "because"; Arya chat in four modes:
  * **online (real arya-ai on :7475)**: local answers for net worth / SIP, real model reply with context body inspected (only
    name, income, spending, net worth, portfolio, health score; memory and life events absent because off), real `get_quote`
    through `/api/tool`.
  * **offline** (7475 aborted): local answers still work; other questions get the plain reply plus the list that works; a price
    question says live prices need a connection.
  * **private** (online switch off): no request at all to :7475 (checked in the request log).
  * **mocked server**: buy-call reply gets the website note, an invented net worth gets the figure note, tool result is worded.
* Not done: a physical device or simulator run (no Xcode in this environment); Hindi review; the Memory preview is not yet linked
  from Settings (integration item).

## 6. Honest limits

* The intent matcher is words-only. "How much have I got in gold?" or Hindi/Hinglish phrasing falls through to the model (or the offline
  reply). It errs towards not claiming a question.
* Numbers in a local answer are only as good as what is recorded; every answer says "only what you have recorded".
* `applyFigures` is a heuristic (regex over sentences). It will miss a wrong figure phrased without "you/your", and a recorded figure
  within 1.5% of an invented one passes (one such coincidence happened in testing: ₹99 lakh vs a ₹1 crore policy).
* The model still sees the question text itself (it must). The memory preview says so.
* "Topics" are keyword-matched labels, so a question can be labelled with a topic it only brushed.
* PULSE reads facts on each focus (about 15 AsyncStorage reads); no caching layer.
* `loadAlerts` writes `finos_alerts_last_networth` as a side effect (existing behaviour, same as the alerts screen).
* The backend `/api/chat` ignores unknown context keys except as "k: v" lines in the system prompt, so memory and life-event
  lines reach the model as profile text; there is no server-side tool loop on `/api/chat` (the website's agent loop is client side).
  I did not change `arya-ai/`.

## 7. Tests and how to run them

```
cd mobile && npm test && npx tsc --noEmit
# one file:
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./__tests__/register-aliases.mjs --test __tests__/aryaTools.test.mts
# screens (needs a real node_modules in the folder you run Expo from):
npx expo start --web --port 8082 &  python3 scripts/smoke-routes.py /pulse /pulse/memory /pulse/life /arya
python3 scripts/theme-audit.py /pulse /pulse/memory /pulse/life /arya
```
New tests: `pulseRank.parity`, `pulseCards`, `aryaTools`, `aryaMemory`, `lifeEvents`, `aryaContext`, `aryaGuardrailsFigures`,
`pulseStorage`. One existing test edited: `aryaOffline.test.mts` ("the chat hook uses this reply") now accepts the hook going
through `localOnlyReply`, which wraps `offlineReply`, and checks `aryaTools.ts` calls `offlineReply(`.

## 8. Commit

Prerequisite: the alerts work (`lib/alerts.ts`, `lib/alertsStorage.ts`, `__tests__/alerts.test.mts` and its screen) committed first.

```
git add -- \
  docs/agent-notes/arya-pulse.md \
  mobile/lib/pulseRank.ts mobile/lib/pulseCards.ts mobile/lib/pulseStorage.ts \
  mobile/lib/aryaFacts.ts mobile/lib/aryaFactsStorage.ts mobile/lib/aryaContext.ts mobile/lib/aryaTools.ts \
  mobile/lib/aryaMemory.ts mobile/lib/aryaMemoryStorage.ts mobile/lib/lifeEvents.ts mobile/lib/lifeEventsStorage.ts \
  mobile/lib/aryaGuardrails.ts mobile/hooks/useAryaChat.ts "mobile/app/(tabs)/arya.tsx" \
  mobile/app/pulse/index.tsx mobile/app/pulse/memory.tsx mobile/app/pulse/life.tsx mobile/components/PulseCard.tsx \
  mobile/__tests__/pulseRank.parity.test.mts mobile/__tests__/pulseCards.test.mts mobile/__tests__/aryaTools.test.mts \
  mobile/__tests__/aryaMemory.test.mts mobile/__tests__/lifeEvents.test.mts mobile/__tests__/aryaContext.test.mts \
  mobile/__tests__/aryaGuardrailsFigures.test.mts mobile/__tests__/pulseStorage.test.mts mobile/__tests__/aryaOffline.test.mts

git commit -F - <<'EOF'
feat(mobile): PULSE feed, Arya memory and life events, local Arya tools

PULSE: lib/pulseRank.ts ports js/arya-pulse-rank.js (parity-tested on 600 random contexts);
lib/pulseCards.ts shows the 14 website sections whose inputs the phone really has as cards that
each say where their numbers come from, lists what is missing for the rest, and keeps the
13 not-ported sections (assumption-driven or history-dependent) in a documented table.
Since-your-last-visit uses the website's finos_pulse_snapshot key and rule.

Memory and life events: on-device notes and topics (never the question text), refusal of
PAN/Aadhaar/card/OTP, per-note never-send switch, instruction-lookalike text never sent;
seven life-event types with lead and window and pure rules over recorded facts. Keys use the
finos_session_ prefix so tracker sync never uploads them. lib/aryaContext.ts builds the one
request body; the Memory screen shows exactly what will be sent, with switches (online,
figures, memory, life events, topics), memory and life events off by default.

Agent tools: deterministic intent matcher answers net worth, savings rate, emergency months,
goals, dues, spending, score, insurance, debt, tax and SIP/EMI sums from the same cores as the
screens, with a source line; public market questions go to /api/tool when online. The offline
and private-mode replies stay coherent. aryaGuardrails gains applyFigures: a model sentence
that states an amount about the person that matches no recorded figure gets a note (advice,
ranges and hypotheticals are skipped). apply() is untouched and still parity-tested.

Fixes an adopted file: aryaMemory.ts contained raw U+2028/U+2029 in a regex literal.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```
