# web-a11y-leftovers: contrast, landmarks, headings, keyboard, reflow (Oct 15-16 2026)

Scope: html/*.html (not news.html), calculators/**, css/**, and (after the other agent finished) js/finos-a11y.js. Nothing was committed or staged by this pass.

IMPORTANT for the commit step: most of this pass's edits were already swept into commit `3410b72` ("October 2026 build ...") by an earlier commit of the shared tree. What is still uncommitted is only the delta listed under "Commit" at the end.

## Method
- axe-core 4.x in Chromium (playwright), every html page + calculator + index/login = 215 pages x dark and light = 430 page-themes.
- Main measurement: `prefers-reduced-motion: reduce` emulated, 1.5 s settle (scroll-reveal animations finished). A second pass with motion on (page scrolled top to bottom, 2 s settle) was used to confirm.
- "Before" = the tree at the start of this pass (copy in the session scratchpad); "after" = final tree. Harness scripts were throwaway; their findings are encoded in `tests/a11y-leftovers.test.js` and `tests/test_a11y_leftovers.py`.

## axe: before / after (nodes; 430 page-themes, reduced motion)
| rule | before | after | note |
|---|---|---|---|
| region | 2,430 (214 pages) | 7 (4 pages) | injected widgets landmarked in js/finos-a11y.js; own-content fixes in html |
| color-contrast | 261 (26 pages) | 2 | 1 artefact (stock-platform), 1 in index.html (not mine) |
| heading-order | 210 (52 pages) | 12 (5 pages) | rest are JS-generated headings or index.html |
| scrollable-region-focusable | 28 | 0 | tabindex="0" on the scrollers |
| page-has-heading-one | 16 | 0 | |
| listitem | 10 | 4 | the 4 left are in js/simulator-guide.js |
| landmark-unique | 8 | 0 | |
| aria-hidden-focus | 8 | 2 | index.html #sticky-cta (not mine); simulator-landing drawer fixed |
| link-in-text-block | 7 | 0 | |
| landmark-one-main / no-duplicate-main / main-is-top-level | 4 / 2 / 2 | 0 | |
| empty-heading / empty-table-header | 4 / 2 | 0 | |
| aria-allowed-role | 2 | 2 | login.html (not mine) |

Other measurements:
- Tab stops that are invisible/parked (closed drawers, sheets, pop-ups, collapsed search bar), counted over all 215 pages at 1280 px: **3,077 before, 18 after**. The 18 left are opacity:0 custom checkbox/radio inputs that are the real control behind a styled switch (settings toggles, loan toggles), index.html #sticky-cta, and one parked element on a redirect page. On home.html this removed 28 hidden tab stops (63 -> 32 focusable elements).
- Keyboard walk on the 16 key pages (index, home, dashboard, tools, calculators, net-worth, tax, settings, budget-forecast, goal-optimizer, track-finances, foundations, insurance-hub, mf-intelligence, markets, money-ai) x 2 themes: elements without a visible focus indicator **52 before, 0 after** (the Arya floating button in every page+theme, and the header search toggle/input in light theme); unreachable-by-Tab elements 0 before and after.
- Dialogs/panels, real keyboard (Enter on the opener, Tab x25, Escape) on the key pages: search bar, Arya side panel, voice popup, alerts drawer, mobile nav (390 px). **72 of 72 applicable combinations pass** after the js/finos-a11y.js change (focus moves in, Tab cannot leave, Esc closes, focus returns to the opener). Before: focus never moved into the panel, Tab walked out into the page behind, Esc left focus on `<body>` for search; the health-score chip and insight-card modal had the same problem (home/dashboard probe). 8 combinations have no opener on that page (index.html has none of these widgets; search is not loaded on insurance-hub, mf-intelligence, money-ai).
- Reflow: 16 key pages x 2 themes x (320 px and 640 px = 200 % zoom of 1280): **no horizontal scroll and no clipped controls** after; before, money-ai's chat textarea, mic and send buttons were clipped (not scrollable) at every width, 1280 px included.

## The 47 contrast nodes were not a fade artefact
web-qa assumed the learn-* / *detail failures came from the scroll-reveal fade. They do not: those pages dim every chapter except the one being read to `opacity: .2` (CSS) / `.3` (inline, set by markets-deep.js) and leave it there, so the text measures 1.3-2.5:1 on a settled page; on a settled page measured with reduced motion it was 261 nodes over 26 pages (not 47: web-qa also only looked at one theme state). Fix is a token: `--chapter-dim: 0.9` in design-tokens.css, used by the 10 chapter stylesheets, plus an attribute rule that overrides the inline 0.3 so the dim stays readable (0.8 still left light-theme text at 4.1-4.4:1). Other contrast fixes, all by token or page CSS: `.bowl` labels in light theme (white on lime/red/yellow 1.1-2.7:1), `.flow-step` inactive opacity .55 -> .7, `.chapter-badge` and itr-summary / windfall inline accent text -> `--accent-ink`, disabled-looking buttons (trader-roadmap, fear-roadmap) now really `disabled`, life-wealth unstyled button got a transparent face (UA dark face #6b6b6b), tax `.bun-bottom` and light `.warning-text`, system-leak light counter (white on pale, 1.07:1) and footnote.

Artefacts / not fixed, with evidence:
- stock-platform `.qs-tiny.pulse` "live": axe samples the background at the glow of the animated dot (`box-shadow: 0 0 10px #C7F000`); the real background is #0b0d12 and the text is #c7f000.
- know-your-finances `.term-status` (motion on only): the element pulses its opacity; with motion reduced it passes.
- trading-simulator (flaky depending on load/network): styled at runtime by cdn.tailwindcss.com; before that script has applied, buttons carry the browser's own face (#6b6b6b). Excluded from the contrast part of the playwright test, named in the test.
- index.html `.illustration-note` (opacity .75, light) is in a file owned elsewhere.

## What was changed (all uncommitted work is listed under Commit)
Shared CSS (css/base.css, layout.css, insight-cards.css, settings.css, design-tokens.css, components.css, + 10 chapter css, etfdetail, tax, system-leak):
- Closed off-canvas widgets get `visibility:hidden` until open (the exit transition still plays): alerts drawer, quick-capture sheet, voice popup, health-score panel, header search bar, qft drawer, insight modal, mobile sidebar (<=900 px), simulator-landing's Arya panel and readiness modal.
- Two-tone focus ring for `#finos-fab` and `#fs-toggle` (their `outline:none` ID rules beat the generic ring); settings switches get an outline on the track; `.sr-only` utility.
- Tokens: `--chapter-dim`.
html:
- 39 floating back links now sit in `<nav aria-label="Back">`; decorative canvases `aria-hidden`; `tabindex="0"` on scroll regions; heading levels via `aria-level` on 51 pages (no visual change); `role="heading" aria-level="1"` on six pages whose title was a `<div>`; trading-brain has one `<main>`; labelled asides/regions on trading-simulator; onboarding and sip-optimizer have `<main>`; market-visualizer `<main>`; mfdetail list in a `<ul>`; empty th / h1 given text; money-ai chat row min-width fix (`.content-wrapper{width:100%}`), quick-chips focusable scroller; net-worth, fd-tracker, financial-calendar now load mobile-nav.js (they had the sidebar but no way to open it at <=900 px).
js/finos-a11y.js (applied directly now that its owner has finished; +~5 KB):
- `landmarkWidgets`: role + name for the injected widgets (alerts drawer, quick capture, fixed controls, Arya knowledge bar, qft, Arya calc panels, xp toast).
- `managePanels`: one observer for the panels that toggle `open` / `mob-open` (+ search `active`): move focus in on open, wrap Tab, restore focus to the opener on close.
- `keyboardWidgets`: the `#finos-hs-trigger` div becomes role=button, tabindex 0, Enter/Space.
- tests/perf_budget.json: sip.html and emi.html critical/total budgets 255 -> 265 KB (they were at 253-254; this file adds ~5 KB and finos-context grew ~1 KB). Conscious raise.

## Tests (new)
- `tests/a11y-leftovers.test.js` (node, 14 tests; all 14 fail on the pre-pass tree, pass now): chapter-dim token, bowl colours, closed-widget CSS, focus ring, back-link nav, h1 roles, landmarks, scroll regions, disabled buttons, list markup, finos-a11y landmark/focus functions, onboarding/simulator landmarks, mobile-nav on every sidebar page.
- `tests/test_a11y_leftovers.py` (playwright): settled-page axe (27 pages x 2 themes, structure + contrast rules), no tabbable controls in closed widgets, alert drawer and search reachable when opened, mobile drawer links hidden until opened, focus ring on fab/search in both themes, 320 px / 640 px no horizontal scroll on the 16 key pages, money-ai input row inside viewport, dialog trap/restore for 5 widgets, widget landmarks + health chip keyboard. The widget/ring/reflow/money-ai tests fail on the pre-pass tree (11 of 12 checked directly; the dialog tests need the js change).
- Last runs: `node --test tests/*.test.js` 484 pass; `python3 tests/static_audit.py` 7/7; `python3 tests/perf_budget.py` exit 0; `pytest tests/test_a11y_leftovers.py tests/test_a11y.py tests/test_a11y_helper.py` 41 pass (the first run of the leftovers file had two load-related failures: trading-simulator contrast while Tailwind loaded and a 30 s goto timeout; the test now excludes that one contrast case and waits 60 s). `tests/smoke_pages.py` on the 368 touched/matching page loads: clean before the last few edits; re-smoke of onboarding, trading-simulator, net-worth, fd-tracker, financial-calendar, money-ai, home, simulator-landing, tax: 20/20 clean.

## What remains and why
- heading-order (12 nodes): headings generated by JS (financial-calendar month title, impact-detail, know-your-finances wizard step, subscription-tracker empty state) and index.html. Fix in the generating JS (needs the template to use the right level).
- listitem (4): `<li>` outside a list inside js/simulator-guide.js templates.
- region (7): `#finos-hs-trigger` (role=button) on insurance-directory, stock-platform, trading-brain (axe flags it there, not on home; reason not found), and index.html `.finos-logo`.
- index.html / login.html (not mine): aria-hidden-focus on #sticky-cta, aria-allowed-role (role=tabpanel on a form), index heading-order, no skip link on index.html, `.illustration-note` contrast.
- Mouse-only controls found while reading, not fixed (outside the 16 key pages): the assessment wizards (fear-roadmap, trader-roadmap, traditional-roadmap) and trading-brain nav tabs use `<div onclick>`; a generic role=button/tabindex/Enter helper in finos-a11y.js would fix them.
- Esc typed while focus is inside the voice popup's `<iframe>` does not reach the parent page (the iframe page must postMessage it).
- Search is not loaded on insurance-hub, mf-intelligence, money-ai (feature absent, not an a11y defect).
- The base.css / layout.css edits are cached by the service worker (`./css/base.css` is in the precache list, `CACHE_NAME = finos-2026-10-14-1`): returning visitors keep the old CSS until sw.js bumps `CACHE_NAME` (sw.js not touched).

## Not verified
- No real screen reader (VoiceOver/NVDA) run; names/roles checked only with axe and DOM probes.
- 200 % zoom was emulated as a 640 px viewport, not real browser zoom; only the 16 key pages were walked at 320/640 and by keyboard, the other ~200 pages only by axe.
- Focus-ring contrast was checked for presence/width (>=2 px, not `none`), not measured numerically against every background.
- Windows high-contrast / forced-colors mode, Safari and Firefox not tried; iOS touch behaviour not tried.
- Full pytest (~20 min) was not run; only the files named above plus the smoke on touched pages.

## Commit
Already committed in `3410b72` (earlier sweep): the css/*, calculators/*, 80 html files and the first versions of the two test files. Still to commit (delta):
```
git add -- js/finos-a11y.js tests/perf_budget.json \
  tests/a11y-leftovers.test.js tests/test_a11y_leftovers.py \
  tests/fixtures/a11y-leftovers-finos-a11y.proposed.js docs/agent-notes/web-a11y-leftovers-finos-a11y.diff \
  html/fd-tracker.html html/financial-calendar.html html/net-worth.html html/onboarding.html html/trading-simulator.html \
  docs/agent-notes/web-a11y-leftovers.md
git commit -F - <<'MSG'
Accessibility leftovers: landmarks and focus management for injected widgets, mobile nav on 3 pages

- js/finos-a11y.js: role + name for the floating widgets that sit outside every landmark (axe "region" 2,430 -> 7),
  one observer that moves focus into slide-in panels, wraps Tab and returns focus to the opener on close/Esc,
  and makes the health-score chip keyboard operable.
- net-worth, fd-tracker and financial-calendar now load mobile-nav.js (the sidebar was off-canvas with no way to open it).
- onboarding gets a <main>; trading-simulator gets labelled regions, a page h1 and a dialog role on its welcome overlay.
- perf budget for sip.html / emi.html raised 255 -> 265 KB (finos-a11y.js grew about 5 KB).
- Tests: a11y-leftovers.test.js (static) and test_a11y_leftovers.py (settled axe, closed widgets, focus rings, reflow, dialogs).
- Notes: docs/agent-notes/web-a11y-leftovers.md (before/after counts, what remains).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
MSG
```
The two `docs/.../*.diff` and `tests/fixtures/*.proposed.js` paths in the `git add` were committed earlier and deleted in this pass; adding them stages the deletions.
