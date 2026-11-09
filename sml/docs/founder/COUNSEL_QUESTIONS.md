# For counsel: questions before any public launch of the SML features (F7)

Source: SML Blueprint, section 10.9, plus what has been built since. Nothing below is legal advice; it is the list to put in front of a securities / data-protection lawyer. A one-off written opinion is enough to start.

## The blueprint's six questions
1. Does any feature, as designed in 10.1, require SEBI IA or RA registration, and under what wording would it not?
2. Is FIN-OS a data fiduciary for data processed only on the user's device?
3. What is the correct age-assurance mechanism for an 18+ gate?
4. Are explanations of insurance needs or loan terms "intermediary" activity?
5. What must the AI-disclosure and "not advice" text say in Hindi and English?
6. Does a cloud escalation to a foreign model vendor trigger any cross-border transfer notice?

## Added by the build (2026-10-26)
7. **Router note on advice requests.** The router can append "Arya isn't a SEBI-registered adviser; general education, not personalised investment advice" when a message asks for a personal financial decision. Is that wording sufficient, in English and Hindi, and does appending it change FIN-OS's regulatory position either way?
8. **Refusing and steering evasion requests.** For requests to evade tax or forge documents, the app already refuses (`js/arya-guardrails.js`). Any duty to report, or wording to avoid?
9. **Collecting real messages.** The plan stores (a) counters only, (b) optionally up to 100 redacted messages on the founder's own device, (c) later, user-previewed redacted examples sent to a FIN-OS inbox. What consent text, retention period and deletion path does each stage need under the DPDP Act? (Draft in `sml/docs/founder/FEEDBACK_CONSENT_DRAFT.md`.)
10. **Statement rows for a categoriser.** Redacted transaction descriptions with the person's own category, contributed by a few people to train a model: consent, anonymisation standard, and whether a redacted merchant string is still personal data.
11. **Tax figures.** The app states limits and rates (see `CA_REVIEW_TAX_NOTES.md`). Is a visible "as of date / verify with a professional" line required next to them?
12. **Model output disclaimers.** Where must the "AI-generated" disclosure appear (every answer, first use, settings)?
