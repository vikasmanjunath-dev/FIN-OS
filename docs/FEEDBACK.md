# Feedback loop (private by design)

Lets the team learn what to fix without any tracking: feedback and usage counts are kept **on the person's device**, redacted, visible and deletable. Nothing leaves unless the person gave consent **and** an inbox has been configured. The inbox is `null` today, so nothing leaves.

| Piece | File |
|---|---|
| Core, storage, prompt UI (`FinosFeedback`) | `js/finos-feedback.js` |
| Feedback page (give, review, delete, download, usage counts) | `html/feedback.html`, linked from Settings and search |
| "Did your Money Score feel right?" prompt | result page of `html/money-score.html` |
| Opt-in usage counter loader | block in `js/pwa-init.js` (downloads nothing unless the `usage` consent is on) |
| Team-side summary | `scripts/summarize-feedback.js` |
| Tests | `tests/feedback.test.js` (unit and the script as a real process), `tests/test_feedback_ui.py` (browser, network-level) |

## What is kept, and what is never kept

- Feedback item: `{ day, page, topic, rating, comment }`. No user id, no device id, no time finer than a day, no query string. `page` is a site path (`html/money-score.html`) or `unknown`; only `html/`, `calculators/`, `index.html` and `login.html` count.
- **Redaction happens before storage** (`redact`): amounts (`₹1,50,000`, `Rs 5 lakh`, `12 lakh`, `5k`), any number with 4 or more digits (even glued to letters), emails, links, PAN and Aadhaar-style IDs. Short numbers such as `8.75` and `3` survive so ordinary feedback stays readable. A random-input test asserts no 4-digit run or email can survive.
- It is applied again when a report is built and again by `summarize`, so an old stored comment, a tampered file or a forged report cannot put personal data in front of the team.
- Usage counts: `{ day: { path: count } }` for the last 90 days, paths only. They are recorded **only if the `usage` consent is on**; otherwise the counting code is never even downloaded.
- Keys: `finos_feedback_log` (last 50), `finos_usage`, `finos_consents` (see `docs/PRIVACY.md`).

## Sending

`send(report, { consent, fetch, endpoint })` is the only code that could send anything:
1. Each section needs its own consent (`feedback`, `usage`); a section without consent is stripped from the body even if it was in the report.
2. Without an `https` endpoint it returns `no-endpoint` and never calls `fetch`.
3. The request is `POST`, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, and carries only the report fields.
4. Every outcome is shown honestly to the person ("Saved on this device. Nothing was sent, because the team has not set up an inbox yet.").

To switch sending on later: choose an inbox, call `FinosFeedback.configure({ endpoint: 'https://…' })` at startup, and **add that host to `FLOWS` in `js/finos-privacy.js`**. The privacy host-coverage test fails until you do, so the notice cannot fall behind.

## Using it without a server

People download a report from the Feedback page (`finos-feedback-YYYY-MM-DD.json`) and send it to the team. Then:

```bash
node scripts/summarize-feedback.js reports/          # a folder of downloaded reports
node scripts/summarize-feedback.js --json a.json b.json
```

It prints positive/negative counts by topic and page, the newest comments (deduplicated), and opt-in usage by page. Invalid files are skipped with a message; it exits 1 if nothing valid was read.

## Hindi

The Feedback page and the prompt card show Hindi when the person's language is Hindi, and redraw in place when it changes (what was typed and which rating was picked are kept). The prompt translates the question it is given, so callers pass the English template. Guards: `tests/test_i18n_import_feedback.py` and `tests/i18n-coverage.test.js`. The comment a person writes is never translated or changed.

## Not done

An actual inbox (needs a decision and a host, and then its entry in the privacy registry), a retention rule for what the team receives, and a policy for replying to people (there is no contact detail on purpose).
