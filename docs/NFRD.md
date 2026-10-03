# FIN-OS — Non-Functional Requirements Document (NFRD)

Oct 3, 2026 · @Vikas

> Exported from the living Claude Doc: https://claude.ai/artifact/K6kHSHakGUsznX79dToFHi — edit there and re-export to refresh this copy.

Covers performance, security, scalability, reliability, and usability requirements that apply across all of FIN-OS, independent of any single feature.

## Performance

- No visible flash of unstyled/wrong-theme content (FOUC) on any page — enforced by the anti-FOUC IIFE running before any stylesheet.
- Theme toggle and hover interactions must feel instant — transitions capped at 0.2–0.25s (`base.css`/`animations.css`).
- The Arya agent loop caps at MAX=8 tool-call steps per request so a single query cannot hang indefinitely.
- PULSE tab must not re-render on every tab switch — `_pulseRendered` flag ensures a one-time render per page load.
- Large single-file apps (Portfolio.AI at 22,570 lines, Arya panel at 8,086 lines) load as a single script each; acceptable today but the largest lever if initial load time becomes a complaint.
- The Arya panel (about half of all JavaScript) is lazy-loaded, cutting DOMContentLoaded by 36% under 4x CPU throttling on slow 4G; a page-performance budget script guards regressions.
- The service worker serves JS and CSS stale-while-revalidate so returning users receive updates without a manual cache bump.

## Security

- **Headers on every Vercel route:** CSP, `X-Frame-Options: DENY`, HSTS, COOP, Permissions-Policy.
- **Local-data protection:** an optional passcode lock (AES-256-GCM, PBKDF2-SHA256 600k iterations) and encrypted backups; a forgotten passcode cannot be recovered, and the lock does not cover Portfolio Analyser, TradeJournal or the voice agent.
- **CSP:** `unsafe-eval` has been removed and every page loads violation-free under the production policy; `unsafe-inline` scripts are still allowed until inline scripts move to files or nonces.
- **Gateway and CI:** the nginx gateway rate-limits per IP (stricter on LLM routes) and allow-lists origins; CI runs a secrets scan and a CSP conformance crawl.
- **Supabase anon key handling:** never duplicated into new files — always read through `window.FINOS_USER_CONTEXT` or `finos-personalization.js`'s import, backed by the single centralized `supabase-config.js` client. Row-level security (RLS) on Supabase tables is the actual data boundary; the anon key alone must never be treated as sufficient protection.
- **No execution of trades or money movement:** FIN-OS calculates and advises only; UPI deep-links hand off actual execution to the user's own bank/broker app, keeping FIN-OS out of the custody/execution security surface entirely.
- **Local backends are unauthenticated by default:** since they run only on the user's own machine (not exposed to the internet), this is an acceptable risk today but must be revisited before any backend is ever deployed publicly.

## Scalability & reliability

- **Frontend scales for free** via Vercel's static CDN — the 120-page frontend is not the bottleneck at any realistic user count.
- **Local backends do not scale to multiple concurrent users** by design — each runs on the individual user's/developer's machine, not as a shared multi-tenant service; this is fine for a single-founder dev workflow but is a hard blocker before any backend-dependent feature (voice, live alerts) can serve the whole user base centrally.
- **Port conflicts:** the old chatbot-brain vs. stock-engine clash on 8000 is gone (stock engine now on 8003), and the gateway's aggregated /health endpoint reports which services are down.
- **Supabase availability** is the single point of failure for all personalized/tracked features; calculators alone remain usable if Supabase is unreachable. Today the project the site points to no longer resolves, so the site runs in guest mode.

## Usability & accessibility

- Dark and light theme parity required on 100% of pages, with zero hardcoded colors that break in either mode.
- Every screen should read as personalized (greeting, real numbers, tailored nudges) rather than generic — this is a usability requirement, not just a personalization feature.
- Voice interaction supports English and Hindi/Hinglish, reflecting the actual language mix of the target user base.
- Progressive complexity (Starter → Power User) so a beginner is never shown F&O/quant tooling before they're ready, and a power user is never blocked behind beginner-level simplification.
- Accessibility is measured: axe contrast failures fell from 596 to 29 nodes, no page scrolls sideways at 375px (0 of 207), and a ceiling is enforced in `tests/test_a11y.py`.
- A Hindi UI layer (about 150 strings, first pass) exists and needs native-speaker review; other languages need only a `js/i18n/<code>.js` file.

## Compliance considerations

- **No unlicensed investment advisory claims:** outputs are framed as educational calculations and tracking, not personalized SEBI-regulated advice.
- **RBI Account Aggregator readiness (Phase 16):** any future integration with Finvu/OneMoney/Perfios/CAMS MF must follow the AA consent-and-purpose model — data pulled only with explicit, scoped, revocable user consent.
- **Data residency/handling:** financial data currently lives in Supabase; before any AA integration ships, data retention and deletion policy needs to be explicit (not assumed).
- **Tax content accuracy:** 80C/80D/CCD, HRA, and capital gains content must track current-year Indian tax rules — stale tax-year assumptions in calculators are a compliance/trust risk, not just a bug. A shared FY2025-26 tax core (finos-taxcore.js) now backs the ITR summary and salary optimizer under a consistency test. The tax-saving tracker in tax.html and the Tax Planner (finos-tax-calc.js) were brought onto the same rules on Oct 3, 2026 (₹12L rebate with marginal relief; old-regime deductions measured against the better regime) and are covered by tests/tax-consistency.test.js and tests/test_tax_tracker_ui.py.
