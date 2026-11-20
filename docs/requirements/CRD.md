# FIN-OS — Customer Requirements Document (CRD)

Oct 3, 2026 · @Vikas

> Exported from the living Claude Doc: https://claude.ai/artifact/V5LjksnXemwaqwY1gmd43K — edit there and re-export to refresh this copy.

Records the requirements gathered from FIN-OS's target customer — the Indian retail saver/investor — as expressed through the product's own design standards.

## Customer profile

As a solo-founder product without a formal research team, FIN-OS's customer requirements are captured through the founder's explicit product standard: **"make every screen feel personally built for that specific user, not a generic finance tool."**

The implied customer is an Indian earner who:

- thinks in ₹, L, and Cr — not raw digits or $
- already knows SIP/EMI/80C/NPS as everyday terms, not jargon to define from scratch
- wants a tool that remembers their numbers between visits instead of re-entering data every time
- expects the interface to work equally well in dark or light mode, on mobile or desktop
- is willing to talk to an AI copilot (voice or chat) but doesn't want it acting on their money without confirmation

## Customer-stated needs

- "Don't make me re-type my numbers on every page."
- "Show me ₹, lakhs, and crores — not raw numbers."
- "I want the calculator to explain the result, not just show a number."
- "Let me track this over time, not just calculate it once."
- "Match my system theme — don't force dark mode on me in daylight."
- "If your AI is going to suggest something, tell me why, using my own data."

## Traceability: need → requirement

| Customer need | Product requirement | Implemented by |
| --- | --- | --- |
| Don't re-type my numbers | Auto pre-fill calculators from profile | `calc-prefill.js` |
| Show ₹/L/Cr, not raw digits | Indian number formatting everywhere | `INR()` helpers across modules |
| Explain the result | Plain-language explanation per calculator output | `calc-explainer.js` |
| Track over time, not once | Persistent trackers, not one-shot forms | 29 Command Hub trackers |
| Match my system theme | Dark/light theme with no FOUC | `theme-init.js`, anti-FOUC IIFE, 95 design tokens |
| Explain AI suggestions using my data | Nudges/insights sourced from live user data | `FinosPersona.renderNudges()`, `computeNudges()` |

## Acceptance criteria (examples)

**Auto pre-fill:** Given a user has a saved profile with income and age, when they open any calculator that uses those fields, then the fields are pre-populated and the user can still edit them before calculating.

**Theme match:** Given a user's OS is set to light mode, when they load any FIN-OS page for the first time, then the page renders in light mode with no visible flash of the wrong theme (no FOUC).

**Explained nudge:** Given a user has an active goal that is behind schedule, when they view their dashboard, then a nudge appears naming the goal, the shortfall amount, and a link to act — never a generic "you should save more" message.
