# FIN-OS — Business Requirements Document (BRD)

Oct 3, 2026 · @Vikas

> Exported from the living Claude Doc: https://claude.ai/artifact/HNxbCJRVgsLiwrTe12Qfnx — edit there and re-export to refresh this copy.

Captures the business goals, needs, and expected outcomes behind FIN-OS — an India-focused financial platform built and operated by a single founder.

## Business goal & rationale

India's retail investor base has grown sharply (SIP accounts, demat accounts) faster than financial literacy has — creating demand for a product that combines calculation tools, ongoing tracking, and AI-guided decisions in one place, in Indian units and Indian tax/regulatory language, rather than importing a US-style personal-finance app.

**Why now:** RBI's Account Aggregator framework is making bank/MF/insurance data programmatically available, UPI is the default payment rail, and SEBI/RBI compliance expectations are rising — an India-first platform that treats these as native inputs (not bolted-on integrations) has a structural advantage over generic finance apps.

**Business model direction:** currently a free, ungated platform focused on depth of engagement (calculators → trackers → AI copilot) to prove retention before layering monetization (e.g. premium Arya features, broker/AA partnerships, or a subscription tier) — this BRD assumes pre-monetization stage unless stated otherwise.

## Stakeholders

| Stakeholder | Interest |
| --- | --- |
| Founder / solo developer | Product-market fit, sustainable scope for a one-person team across 9 backends |
| End users (4 personas: Starter/Builder/Investor/Power User) | Trustworthy, India-specific financial clarity and tools |
| Future data partners (AA providers: Finvu, OneMoney, Perfios, CAMS MF) | Clean integration surface once Phase 16 (AA integration) begins |
| Regulators (SEBI, RBI) | Compliant handling of financial data, no unlicensed advisory claims |
| Hosting/infra providers (Vercel, Supabase) | Platform stays within their service terms as usage scales |

## Business requirements

| Requirement | Driver | Priority |
| --- | --- | --- |
| Every screen must feel personally built for that user | Founder standard — differentiation from generic finance apps | High |
| Indian units/terms mandatory everywhere (₹, L/Cr, SIP/EMI/80C) | Core market fit — non-negotiable | High |
| No unlicensed personalized investment advice | Regulatory exposure (SEBI) | High |
| Data never leaves the user's control without consent | Trust; precondition for AA integration (Phase 16) | High |
| Platform must run without paid infra scaling until monetized | Solo-founder cost constraint (Vercel static + local backends) | Medium |
| Product must support graduation from free tools to a paid tier | Long-term sustainability | Medium (future) |

## Expected outcomes & KPIs

- **Engagement depth:** rising share of users with filled trackers (not just calculator one-offs) — the PULSE tab's Page Activity Matrix is the internal proxy.
- **Retention:** `finos_streak` consecutive-day usage trending up release over release.
- **Coverage:** personalization live on more of the 120 pages over time (12 today).
- **Data trust:** zero incidents of credential/key exposure (the Supabase anon key policy below is a direct control for this).
- **Readiness for monetization:** AA integration (Phase 16) and auth-on-all-pages (Phase 15) complete before any paid tier is considered.

## Constraints

- **Solo founder:** one person owns product, 9 backends, a mobile app and 132 JS modules — scope must stay achievable without a team.
- **Local-only AI/backends:** Ollama, voice agent, and most Python services run locally, not on Vercel — no cloud AI inference cost today, but also no server-side AI for users unless self-hosted.
- **Static hosting only:** Vercel serves static files; anything needing a live backend (voice, alerts, live market data) depends on the user's own machine running those services.
- **Free tier only, no revenue today:** every business requirement above assumes a pre-revenue phase.
- **No live cloud project today:** the Supabase project the site points to no longer resolves, so accounts and cross-device sync are unavailable until a new project is set up; the site and mobile app run in guest mode on local storage.
