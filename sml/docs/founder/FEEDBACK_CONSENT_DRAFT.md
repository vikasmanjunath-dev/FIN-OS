# Feedback, consent and retention: DRAFT for the founder and counsel (F2)

DRAFT. Not legal text. Written so counsel has something concrete to mark up. Nothing here is live; no endpoint exists.

## Stages (each needs its own explicit opt-in; each can be switched off and deleted)
| Stage | What leaves the device | What is stored where | Status |
|---|---|---|---|
| L0 | nothing | counters and corrections on the device | built (shadow counters) |
| L1 | aggregate counters only (counts, no text) | FIN-OS inbox or the founder's email by hand | draft |
| L2 | user-previewed, redacted example messages | FIN-OS inbox | draft; needs F2 endpoint + this text |
| manual | a redacted report file the user downloads and sends themselves | wherever the user sends it | cheapest first step: no server needed |

**Built 2026-10-26 (local-only, default off, not linked):** `html/help-improve.html` shows this wording, keeps up to 50 redacted examples of flagged questions on the person's own device and lets them download a file to send by hand. No server, no network. Caveat stated plainly: the old `js/finos-feedback.js` `redact()` has known leaks (docs/PENDING.md #14) and is NOT used; the stricter masking in `js/sml/sample-capture.js` is, and it cannot find names, so the person must read each example before sending.

## Consent text, English (draft)
> **Help improve Arya (optional).** If you switch this on, Arya can send FIN-OS short examples of your questions so we can check where it gets things wrong. Before anything is sent you will see exactly what it is, with names, phone numbers, account numbers, e-mail addresses and UPI IDs already removed. You can delete any example, and you can turn this off at any time. We keep examples for 90 days, use them only to test and improve Arya, and never sell them or use them for ads. Your financial data and answers stay on your device.

## Consent text, Hindi (draft, to be checked by a native reader)
> **Arya को बेहतर बनाने में मदद करें (वैकल्पिक)।** इसे चालू करने पर Arya आपके कुछ सवालों के छोटे उदाहरण FIN-OS को भेज सकता है, ताकि हम देख सकें कि वह कहाँ गलती करता है। कुछ भी भेजने से पहले आप ठीक वही देखेंगे जो भेजा जाएगा, जिसमें नाम, फ़ोन नंबर, खाता नंबर, ई-मेल और UPI ID पहले ही हटा दिए गए होंगे। आप किसी भी उदाहरण को मिटा सकते हैं और जब चाहें इसे बंद कर सकते हैं। हम उदाहरणों को 90 दिन रखते हैं, केवल Arya को जाँचने और सुधारने में इस्तेमाल करते हैं, और उन्हें कभी बेचते या विज्ञापन में इस्तेमाल नहीं करते। आपका वित्तीय डेटा और जवाब आपके डिवाइस पर ही रहते हैं।

## Retention and deletion (proposal)
- Retention: 90 days, then automatic deletion; a monthly job lists what was deleted (counts only).
- Deletion path: a "delete my examples" button in the same settings screen; the inbox keeps a random install id, no account, so deletion works from the device.
- Redaction: the stricter rules in `sml/categoriser/harness.py` / `js/sml/sample-capture.js` (long digit runs, e-mail, UPI handle, PAN, Aadhaar-like groups, non-ASCII digits), NOT the older `js/finos-feedback.js` `redact()` (known leaks, docs/PENDING.md #14).
- Access: founder only; labelled copies go to the repo's `sml/data/incoming/` only after a second person has reviewed the labels.

## What the founder must decide
Inbox host (a form service, a small endpoint on the Mac, or manual email), the retention number, and whether Hindi text needs the wording above checked. Until then the product stays at L0 and the manual route.
