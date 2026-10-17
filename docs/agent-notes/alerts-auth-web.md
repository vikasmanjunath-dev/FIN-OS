# Website sends the alert-engine token (Oct 2026)

- `js/finos-api.js`: `alerts` service requires a session; new `FinosAPI.alertsFetch(path, init)`; `signed_out` error, no network call without a session.
- Callers switched: `js/finos-alerts.js`, `js/finos-widget.js`, `js/finos-health-score.js`, `js/health-sparkline.js`, `html/{benchmarking,couple-finance,money-ai,financial-report,timeline,settings}.html` (these load `finos-api.js` in the head now, after `supabase-config.js`, because their load-time code calls it), `voiceagent/index.html` (no call without a token).
- Unchanged on purpose: `/market`, `/vapid-public-key`, `/health` are unauthenticated routes; `html/financial-hub.html` `AL_URL` is unused.
- Tests: `tests/api.test.js` (node), `tests/test_alerts_auth_web.py` (playwright: header present on 5 pages; no session means no call).

## Commit
```
git add js/finos-api.js js/finos-alerts.js js/finos-widget.js js/finos-health-score.js js/health-sparkline.js \
  html/benchmarking.html html/couple-finance.html html/money-ai.html html/financial-report.html html/timeline.html html/settings.html \
  voiceagent/index.html tests/api.test.js tests/test_alerts_auth_web.py \
  docs/agent-notes/backend-security.md docs/agent-notes/alerts-auth-web.md
git commit -m "Send Supabase session token to the alert engine from the website

FinosAPI alerts service now requires a session and adds the bearer token;
no session means no call. Switch raw fetches (notifications, health score,
benchmark, couple, timeline, report, settings) to FinosAPI.alertsFetch.
Add node and playwright tests.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
