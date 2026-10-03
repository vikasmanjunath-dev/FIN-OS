# FIN-OS — Market Requirements Document (MRD)

Oct 3, 2026 · @Vikas

> Exported from the living Claude Doc: https://claude.ai/artifact/Gz1aZWyxSgE1oMxpaXbz87 — edit there and re-export to refresh this copy.

Describes the market needs, customer problems, and opportunity FIN-OS is built against, in the Indian personal-finance category.

## Market problem

Indian retail investors and savers face three compounding problems:

1. **Fragmentation:** a user's real financial picture is split across a bank app, a broker terminal, a mutual fund platform, an insurance policy PDF, and a tax filing tool — none of which talk to each other.
2. **Myth-driven decisions:** SIP timing myths, gold-vs-equity folklore, insurance-as-investment confusion (ULIPs sold as SIPs), and social-media "hot tip" culture substitute for actual numbers.
3. **Generic tooling:** most calculators and finance apps are either too simplistic (a single EMI/SIP calculator with no context) or built for a US/global audience and only shallowly localized (currency symbol swapped, tax rules not).

The result is a large population that is earning and saving but not confidently *deciding* — the gap FIN-OS's calculators → trackers → Arya AI pipeline is built to close.

## Target market segments

| Segment (= product persona) | Financial behavior | Core unmet need |
| --- | --- | --- |
| Starter | First job, no SIPs/investments yet | Plain-language basics, first budget, emergency fund |
| Builder | 1–5 yrs of SIPs, building habits | Goal tracking, tax-saving basics, consistency |
| Investor | Active MF/equity portfolio | Real analytics, tax optimization, insurance gaps |
| Power User | Trades F&O, tracks everything | Institutional-grade tools, quant/options intelligence |

All four sit within India's broadly English-speaking, smartphone-first, increasingly digital-investing population — the same pool driving SIP account and demat account growth industry-wide.

## Competitive landscape

At a category level (general knowledge, not sourced to specific current market-share data — verify before using in an external pitch):

| Category | Who plays there | FIN-OS's gap to fill |
| --- | --- | --- |
| Broker terminals (Zerodha Console, Groww, Upstox) | Execution-first, portfolio view is secondary | No AI copilot, no cross-account tracking, no education layer |
| Personal finance trackers (ET Money, INDmoney) | Aggregation-focused | Limited depth per calculator, no persistent AI memory of the user |
| Standalone calculators (bank/AMC sites) | Single-purpose, no continuity | No tracker, no personalization, disconnected from the rest of the user's finances |
| Generic AI chat (ChatGPT for finance questions) | Broad but stateless | No access to the user's actual numbers, no Indian-tax-aware persistence |

FIN-OS's differentiation is the combination — calculators, trackers, and an AI copilot sharing one data layer — rather than any single feature being unique in isolation.

## Market opportunity & timing

- **RBI Account Aggregator framework:** bank, MF, and insurance data becoming programmatically consent-shareable — FIN-OS's Phase 16 roadmap item turns this into automatic profile enrichment instead of manual data entry.
- **UPI as default rail:** enables in-context execution hand-off (`upi-execute.js`) without FIN-OS needing to become a payments company.
- **Rising SIP/demat participation:** a structurally growing base of users who now need ongoing guidance, not just an account-opening flow.
- **Local AI feasibility:** on-device/local LLM inference (Ollama qwen3:14b) makes an always-available AI copilot possible without per-user cloud inference cost — a timing advantage while cloud AI costs remain a barrier for free products.
