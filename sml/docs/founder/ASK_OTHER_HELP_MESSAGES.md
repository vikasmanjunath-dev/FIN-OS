# Three more messages for you to send (drafts, 2026-11-10; nobody contacted)

## 1. Native Hindi reader (5 minutes)
Hi <name>, could you read two Hindi lines from my money app and tell me if they sound natural and correct for a polite assistant with a female voice? Please change anything that sounds wrong.

1. मैं टैक्स या क़ानूनी नियमों से बचने के तरीक़े नहीं बता सकती। चाहें तो मैं क़ानूनी विकल्प समझा सकती हूँ।
   (Meaning: "I can't help with ways around tax or legal rules. I can explain the legal options instead.")
2. Anything else you notice: tone, spelling, words an everyday user would not use.

Reply with OK / change this to ... . Thank you!
(Two AI reviews already suggested "से बचने" instead of "टालने"; your check is the real one.)

## 2. Usage-test volunteers (only after you are happy with the privacy wording)
Hi <name>, would you use FIN-OS normally for a week with one setting turned on? It only counts which PULSE cards were shown and tapped (ids and positions, no amounts, no text), stays in your browser, and sends nothing anywhere. You can read it any time and delete it with one command.

Setting (browser console): `localStorage.setItem('finos_pulse_counters_on','1')`
Read it: `AryaSidebar.pulseStats()` and `AryaSidebar.pulseEvents()`. Delete: `AryaSidebar.smlReset()`.
After a week, paste me the output of `AryaSidebar.smlExport()` if you are comfortable.

Do NOT ask them to turn on `finos_pulse_explore_on` yet. That changes which card is shown first, and the privacy copy still needs a line for it.

## 3. You: approve or change the feedback-consent wording (PR #4)
Open `sml/docs/founder/FEEDBACK_CONSENT_DRAFT.md`. Reply with one of: "approved as is", "approved with these edits: ...", or "drop it". PR #4 stays a draft until then. If counsel should see it first, `sml/docs/founder/COUNSEL_QUESTIONS.md` lists the questions.
