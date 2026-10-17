# backend-security: defensive review of the backends (Oct 2026)

Scope: `arya-ai/`, `alerts/`, `api/`, `gateway/`, `voiceagent/`, `supabase/`, `nginx-gateway.conf`, `docker-compose.yml`.
Not touched: `rag-engine/`, `mobile/`, `js/`, `html/`, `css/`, `calculators/`. No SQL was run against any database (the SQL files were parsed with pglast and read);
no paid or personal-account API was called; nothing was committed, added or stashed. Docker was not run; nginx was not run.

## Findings (severity, location, exploit, status)

| # | Sev | Where | Exploit | Status |
|---|---|---|---|---|
| 1 | Critical | `alerts/alert-engine.py` (every `/alerts/{id}`, `/health-score/{id}`, `/benchmark/{id}`, `/couple/*`, `PUT /alerts/preferences`) | The engine uses the Supabase **service-role key** (bypasses RLS) and had **no authentication**. Anyone who reached port 8001 (or `/api/alerts/` on the gateway) could read any user's alerts, health score, income/spend and couple data by putting a UUID in the URL, mark their alerts read, change their preferences, dissolve their couple link. | Fixed: Supabase session token required, must match `user_id`; `X-Admin-Key` for servers. See "Breaking change". |
| 2 | Critical | `alerts/alert-engine.py` `POST /alerts/subscribe` | Register an attacker device under a victim's `user_id`, and every alert (with amounts) is pushed to the attacker. | Fixed (token must match `user_id`). |
| 3 | High | same, push `endpoint` | The server POSTs to the stored push endpoint, and the endpoint was any string: blind SSRF to `http://169.254.169.254/`, Ollama, internal services. | Fixed: https + known push-service hosts only (FCM, Mozilla, Windows, Apple). |
| 4 | High | `alerts/schema.sql` couple policies (`FOR ALL`) | A signed-in user could INSERT/UPDATE their own `couple_links` row with `user_b` = any user and `status='active'` through the public API; `/couple/overview` then returned that person's finances. | Fixed in the SQL file (SELECT-only policies; writes go through the engine). **Must be re-run in the project.** |
| 5 | High | `alerts/alert-engine.py` `_get_couple` | `user_id` was pasted into a PostgREST `or=(...)` filter: a comma/parenthesis in the id rewrites the filter. | Fixed (UUID only). |
| 6 | High | `alerts/schema.sql` `profiles.plan` | `profiles_own` lets a user write their whole row, so `PATCH /rest/v1/profiles {"plan":"pro"}` with their own login passes the engine's paid-plan checks. | Fixed with a `BEFORE INSERT OR UPDATE` trigger (`profiles_protect_plan`). **Must be re-run in the project.** |
| 7 | High | `api/chat.js` | Public, CORS `*`, caller chose `model` (any OpenRouter model, e.g. an expensive one), `max_tokens`, message count and size: anyone can spend the owner's OpenRouter credit. | Fixed in code (model allow-list = default model, token cap 1024, size caps, role/content only, CORS allow-list, error text not passed on, best-effort rate limit). A real quota is an owner decision (below). |
| 8 | High | `arya-ai/server.py` CORS | `allow_origins=[... "*"]` with `allow_credentials=True`: Starlette then echoes **any** origin as allowed. | Fixed (explicit list + localhost regex, no credentials; `*` in `ARYA_CORS` ignored). |
| 9 | High | `arya-ai` `GET /api/read`, tool `read_url` | SSRF: fetched any URL (Ollama on localhost, `alert-engine:8001` which had no auth, cloud metadata), followed redirects, no size cap, error text revealed reachability. | Fixed: `arya-ai/netguard.py` (public IPs only, redirects re-checked, port/content-type/size limits, plain-http connections pinned to the checked IP). Residual: DNS rebinding on https (below). |
| 10 | High | `docker-compose.yml` `frontend` | Mounted the **whole repo root** read-only on :3000: `arya-ai/.env`, `alerts/.env`, `voiceagent/.env`, `voiceagent/.finos_key.pem`, SQL and all backend source were downloadable. (It also mounted `nginx-frontend.conf`, which does not exist.) | Fixed: only the static site is mounted. |
| 11 | High | `docker-compose.yml` `ollama`, `voice-agent` | Ollama (no auth: run/pull/**delete** models) and the voice WebSocket published on all interfaces. | Fixed: bound to 127.0.0.1 (`VOICE_BIND` to change deliberately). |
| 12 | High | `voiceagent/agent.py` Ollama HTTPS proxy :8767 | Forwarded every path with `Access-Control-Allow-Origin: *`: any web page in the user's browser could pull/create/delete models and use the LLM. | Fixed: path allow-list (chat/generate/embed/tags/version), CORS only for local pages + production site. |
| 13 | High | `voiceagent/agent.py` WebSocket | No Origin check (cross-site WebSocket hijacking): any web page could connect, and the server (service-role key) loads/saves memory and writes goals/transactions/budgets for whatever `user_id` the client claims. | Origin check added. **The user_id is still unverified** (owner decision, below). |
| 14 | Medium | `voiceagent/.finos_key.pem` + `.finos_cert.pem` | A TLS **private key is committed** in git (tracked since `5aab322`). Self-signed, CN=127.0.0.1, valid to 2036; users are told to trust it. | Code now generates a per-machine key on first run; `*.pem` ignored. **Rotate (below).** |
| 15 | Medium | `arya-ai/server.py` `GET /api/kite/callback` | `{exc}` and Zerodha profile fields went into HTML/JS unescaped (reflected XSS), and the access token was `postMessage`d to `'*'`. | Fixed: escaped, JSON-in-script safe, targets limited to configured/local origins. |
| 16 | Medium | `arya-ai` expensive routes | No rate limits on `/api/chat` (LLM, up to 120 s streams), `/api/tts` (Microsoft service), `/api/read`, `/api/search`, reports, portfolio; no request body limit. | Fixed: per-client limiter + global limit + 64 KB body cap + at most 4 concurrent chat generations (`ratelimit.py`, `secmw.py`). In-process (per worker). |
| 17 | Medium | `arya-ai` `POST /api/cache/clear` | Anonymous; multiplies load on upstream sources. | Fixed: disabled unless `ARYA_ADMIN_TOKEN` is set; also blocked at the gateway. |
| 18 | Medium | `alerts` `GET /alerts/run` | If `ADMIN_API_KEY` was unset the route was open. Non-constant-time compare. | Fixed (fails closed, `hmac.compare_digest`). |
| 19 | Medium | `alerts` couple invite codes | `random.choices`, 8 chars, no rate limit on `/couple/accept`. | Fixed: `secrets`, 10 chars, 10/min, authenticated. |
| 20 | Medium | `alerts` all handlers | `HTTPException(500, str(e))` returned Supabase/PostgREST error text (tables, URL). | Fixed (generic body, detail in the log). |
| 21 | Medium | `alerts` `/metrics` | Label was the raw URL path: user ids leaked to the metrics endpoint and series count unbounded. | Fixed (route template). nginx already limits `/metrics` to internal ranges. |
| 22 | Medium | `alerts` benchmark | `402 upgrade_required` was swallowed by `except Exception` and returned as 500. | Fixed. |
| 23 | Medium | `arya-ai` portfolio export / reports | Generated xlsx (a user's holdings) and report files stayed in `reports/output/` forever; the hourly cleanup ran only once. | Fixed: deleted after sending, stale files purged, cleanup re-arms itself. |
| 24 | Medium | `arya-ai`, `alerts`, `voiceagent` Dockerfiles `COPY . .` | `.env` and `.pem` were copied into image layers. | Fixed: `.dockerignore` for all four services. |
| 25 | Medium | `supabase/delete_account.sql` | `SECURITY DEFINER` without `pg_temp`. | Decision: **add `pg_temp` last** (applied). |
| 26 | Medium | `alerts/schema.sql` `get_unread_alert_count` | `SECURITY DEFINER`, no search_path, callable by anyone: unread count of any user. | Fixed (INVOKER + search_path). |
| 27 | Low | `arya-ai/db/store.py` | Table/column names interpolated into SQL (constants today, public helpers). Values were always bound. | Hardened (table allow-list, identifier regex), tested. No injectable path existed. |
| 28 | Low | `arya-ai` input validation | `/api/history`, `/api/analyze` took any symbol/period/interval; unbounded query lengths; `limit` could be negative; cache keys grew without bound. | Fixed (allow-lists, caps, 400s, cache capped at 5,000 entries). |
| 29 | Low | `arya-ai` errors | Chat offline text named the model host/port; TTS/tool/read/portfolio errors echoed exception text and URLs. | Fixed. Yahoo/yfinance messages in `/api/history` and `/api/chart` are still passed through (one line, 200 chars, public-library text; `test_chart_endpoint.py` asserts it). |
| 30 | Low | `nginx-gateway.conf` | Any `*.vercel.app` was an allowed CORS origin; `X-Forwarded-For` kept client values; no `server_tokens off`; `/api/arya/docs` exposed. | Fixed. |
| 31 | Low | `voiceagent` | Unknown audio containers went straight to ffmpeg with all protocols enabled; 50 MB frames; `Audio error: {e}` echoed. | Fixed (sniff + 8 MB cap + `-protocol_whitelist file,pipe`, 16 MB frames). |
| 32 | Low | `alerts/README.md` | Documented `SUPABASE_SERVICE_ROLE_KEY`; the code reads `SUPABASE_SERVICE_KEY`. | Fixed in the README. |
| 33 | Info | `alerts/alert-engine.py` default Supabase URL | Hard-coded project URL as a default (the project is public in `js/auth.js`; not a secret, but it points a fresh install at a project the owner says is dead). | Not changed. |

### Per-route answers (arya-ai, the question asked in the brief)
- **Anonymous by design** (public market data): everything except `/api/portfolio/*` and `/api/kite/*`. Now bounded by a global per-client limit, a body cap and input allow-lists.
- **Token verification**: `/api/portfolio/summary|export` verify the Supabase token with Supabase Auth and require it to equal `user_id`; the cache is bounded; error text no longer echoes ids. `/api/kite/*` pass the user's own Zerodha token through (no FIN-OS identity is involved).
- **Per-user data isolation**: only the portfolio routes hold user data; RLS plus the token check cover them. `/api/chat` takes a profile in the request and stores nothing.
- **Logging**: no route logs amounts, tokens or profile values. `logging` of exceptions may include upstream URLs (server log only).
- **SQL injection**: none found; see #27.  **Path traversal**: none (report/xlsx names are built from validated symbol / sanitized id; no route serves caller-named files).

## Secrets (repo-wide scan, excluding `node_modules`, `.claude/worktrees`)
Scanner: regexes for JWTs, `sk-`/OpenRouter, AWS, Google, GitHub, Slack, Stripe/Razorpay, private-key blocks, and `password|secret|api_key|token = "<16+ chars>"` assignments, over text files.
- **Real secret committed: `voiceagent/.finos_key.pem:1` (starts `----`, a PEM private key), tracked in git.** Must be **rotated**: delete the files, re-run the agent (it now generates a new pair), and re-accept the cert once in browsers. Because it is in history, treat the old key as public; it only protects 127.0.0.1 TLS, so the damage is limited to local impersonation.
- JWTs found (23 places in tracked code, plus `arya-ai/.env:2`, `mobile/.env:3`): **all decode to `role: anon`** (project `oeapcyucnduhwpgxfknb`, first 4 chars `eyJh`). That is the public key, designed to ship in clients. **No `service_role` JWT, OpenRouter, Kite, VAPID or other key was found anywhere.**
- `.env` files exist on disk (`arya-ai`, `alerts`, `voiceagent`, `rag-engine`, `mobile`) and are git-ignored (not tracked). Their service-key fields hold placeholders or a non-key value (first 4 chars `http`/`your`), so nothing real was found there either. They were exposed by the compose `frontend` mount (fixed, #10).
- `alerts/README.md:119` mentions `-----BEGIN EC PRIVATE KEY-----...` as a placeholder text, not a key.
- Supabase **service-role usage**: `alerts/alert-engine.py` and `voiceagent/agent.py` (server side only; never in `js/`, `mobile/`, `api/`). Both are now guarded (engine auth; voice Origin check). `arya-ai` uses the anon key + the user's token (RLS applies).
- **Committed junk to remove** (owner): `voiceagent/.agent.pid`, `.server.pid` are tracked; `voiceagent/chroma_db/chroma.sqlite3` is tracked (voice memory content: check it holds no personal data before the repo is shared); `voiceagent/.arya_daily_brief.json` (written at runtime) holds a user id and brief text in plain text: now git/docker-ignored.

## Dependencies
- `pip-audit`, `safety`, `trufflehog`, `gitleaks`, `detect-secrets` are **not installed**; installing them would download files, so **Python advisories were NOT checked**.
- `npm audit`: nothing to audit. `package.json` at the root has no dependencies and no lockfile; `api/` has no `package.json`. (`mobile/` and `rag-engine/` are not mine.)
- Observations only (not verified against an advisory database): all four Python requirement files use open `>=` ranges with no lockfile or hashes, so builds are not reproducible; the machine's installed FastAPI is 0.115.0 with Starlette 0.38.6, which is old (I recall multipart-parsing DoS advisories for Starlette in that range; arya-ai has no form/upload routes, so it is probably not reachable, but upgrade FastAPI/Starlette). Owner: run `pip-audit -r <file>` for `arya-ai`, `alerts`, `gateway`, `voiceagent`, and pin.
- Containers all run as root and nothing sets `read_only`/`cap_drop` (recommendation; not changed because Docker could not be run here to verify a non-root build).

## Supabase SQL review
RLS enabled with `auth.uid()` policies on every user table: profiles, transactions, goals, budgets, holdings, tracker_snapshot, alerts, push_subscriptions, alert_preferences, health_score_history, memory_embeddings, user_behavior, document_ai_log, agent_memories, couple_* (tested by `tests/test_security_sql.py`). No `USING (true)`. Findings #4, #6, #25, #26 are SQL edits. `match_memories` is SECURITY INVOKER (RLS applies; the voice agent calls it with the service key). `delete_my_account()` keeps `REVOKE ... FROM anon` + `GRANT ... TO authenticated`.
**None of the SQL changes is live until the owner re-runs `alerts/schema.sql` and `supabase/delete_account.sql` in the Supabase SQL editor** (both re-runnable; neither drops data). The existing live project also still lacks RLS on `profiles` per `supabase/README.md`: run `profiles_rls.sql` first.

## Health score income window (item 6)
`alerts/health_score.py`: every "monthly" figure was `sum / 2` on the assumption of a 60-day window, and `fetch_user_data` fetched `last 60 days LIMIT 100`, so busy accounts were silently cut off and the maths was wrong for everyone else. Now:
- `MONTHLY_WINDOW_MONTHS = 3` (named constant, **product decision to confirm**): total over the last 3 **completed** calendar months divided by the number of those months from the person's first transaction month in the window (a person who started in September is not diluted by July). The current part-finished month is excluded so the figure does not move through the month; only if there is no completed month with data does it fall back to the current month so far (divisor 1, an under-estimate early in the month). Undated or future rows are not counted. Applies to income, expenses, EMI, the benchmark's investment figure and the couple category spend.
- `fetch_user_data` filters by date in the database from `window_start()` and reads 1,000 rows per page up to 5,000 (flag `transactions_truncated` if hit).
- Also fixed `_parse_dt`, which turned any ISO timestamp into 2000-01-01.
- Honest-label note: the website/phone should say "average of the last 3 months" where the number is shown; the API does not yet return the basis. `tests/test_health_income.py` had two tests that encoded the old halving; they were rewritten (and 9 window tests added).

## Breaking changes the owner/integrator must know
1. **Alert engine requires a session token** (`ALERTS_AUTH=required` is the default). The website files that call it send **no** `Authorization` header today: `js/finos-alerts.js` (lines ~686, 698, 720, 866), `js/finos-widget.js:701`, `js/health-sparkline.js:88`, `js/finos-context.js:675`, `js/finos-health-score.js:417/533` (via FinosAPI), `html/benchmarking.html:529`, `html/timeline.html:545`, `html/financial-report.html:686-687`, `html/money-ai.html:507`, `html/settings.html:922/967`, `html/couple-finance.html`, `voiceagent/index.html:2280`. They need `headers: { Authorization: 'Bearer ' + session.access_token }`. Until then the notification centre, health score, benchmark and couple pages get 401 on localhost; for a local session set `ALERTS_AUTH=off` in `alerts/.env` (the engine logs a CRITICAL warning). The voice agent already sends `X-Admin-Key` when `ADMIN_API_KEY` is in its environment.
2. **arya-ai CORS**: origins outside `ARYA_CORS` (default: localhost:7474, 127.0.0.1:7474, finos1.vercel.app) and localhost/127.0.0.1 on any port are refused. A phone web preview opened via a LAN IP (`http://192.168.x.x:8082`) is no longer allowed: add it to `ARYA_CORS`. Native phone requests are unaffected (CORS is browser-only).
3. `/api/cache/clear` needs `ARYA_ADMIN_TOKEN`; the Kite popup posts only to configured/localhost-on-common-ports origins (`ARYA_KITE_OPENER_PORTS`).
4. Voice audio in an unrecognised container (not WAV/WebM/Ogg/MP4/MP3) is refused; `Origin: null` pages (file://) cannot open the WebSocket (set `VOICE_ORIGINS` for others).
5. compose: Ollama and the voice agent are loopback-only; the frontend serves only the listed static paths.

## Needs an owner decision
- **HTTPS/hosting**: nothing here terminates TLS. The gateway speaks plain http on :8000; the phone's `http://` backend URLs are blocked by iOS ATS/Android in store builds (release-pack finding 4). Choose a host and put TLS (and HSTS, commented in the nginx file) in front.
- **Key rotation**: the committed voice TLS key (above). Nothing else real was found, but if any `.env` ever held a real service-role key while the compose frontend mount was in use, rotate it in Supabase.
- **Rate-limit policy**: the limits are defaults (chat 10/min, tts 20/min, fetch 20/min, reports 10/min, portfolio 30/min, tool 120/min, global 600/min, per client, per worker). They are not distributed; for production use the gateway (`limit_req` already exists there) or a shared store. For `api/chat.js` a real quota needs Vercel WAF rate limiting or a KV store, plus ideally requiring a Supabase session.
- **Voice agent identity**: `user_id` in the WebSocket `user_context` is trusted. Real fix: the page sends the Supabase access token, the agent verifies it (as arya-ai does) before loading/saving memory or writing goals/transactions. Needs a client change in `js/finos-widget.js`/`voiceagent/index.html`.
- **Alert engine in production**: either keep the service-role key and the token check (done) or move user routes to the user's own token + RLS so the key is not needed for them.
- Whether partners should be able to see each other's finances at all (couple overview reads both users' data with the service key); and the delete-account behaviour for couple links (release-pack/trust-platform decision).
- `finos1(-…).vercel.app` previews are allowed by the gateway CORS pattern; anyone can register a project named `finos1-something`. Replace with the real team slug.
- The health-score window constant (3 months, completed months only).
- DNS rebinding on https `read_url`: pin connections to the validated IP for https too, or block private egress at the network level (recommended).
- Voice data retention: audio is written to a temp file and deleted in `finally`; transcripts go to the client and the last turns are stored in Supabase `agent_memories` (cleared by `delete_my_account()`); `voiceagent/chroma_db/` and `.arya_daily_brief.json` are local plain-text stores with no expiry.

## Not verified / limits
- Python advisories (no tooling); nginx config syntax and Docker builds (not run); `slowapi` rate limits in the alert engine (library not installed here: a stand-in was used, so the decorator is untested); the real Supabase Auth verification path (stubbed; never called); `alerts/schema.sql` trigger and policies were parsed (pglast) but never executed, so `auth.role()` behaviour inside the trigger is unverified against a live project; the Kite popup flow end-to-end (needs a Zerodha app); the voice agent end to end (Whisper/Ollama not run: policy module unit-tested, `agent.py` only compiled and source-checked); Hindi/UX copy of the new error messages.
- `X-Real-IP` trust assumes nginx is the only client of arya-ai (true in compose; false if someone also publishes 7475).
- The whole `tests/test_*.py` suite and the browser tests were not re-run; I ran the backend set, `test_health_score`, `test_rules`, `test_arya_tools_eval`, `test_aa_safety` and `mobile/__tests__/deleteAccountSql.test.mts` (3/3).

## Tests
`python3 -m pytest tests/test_*backend*.py tests/test_chart_endpoint.py tests/test_health_income.py tests/test_sql_safety.py tests/test_arya_readme.py tests/test_security_*.py tests/test_health_score.py tests/test_rules.py -q` -> 293 passed.
New: `test_security_arya.py` (61), `test_security_alerts.py` (36), `test_security_sql.py` (27), `test_security_api_chat.py` (14), `test_security_voiceagent.py` (34), `test_security_infra.py` (5); `test_health_income.py` 7 -> 16.
Mutation checks (change the code, see the test fail, restore): CORS `*` and credentials; `is_global` check; read_url bypassing netguard; redirect re-check; chat rate-limit dependency; admin-token check; Kite `postMessage('*')`; script escaping; SQL table allow-list; export file deletion; alerts `_own`, push endpoint check, unsubscribe owner filter, `_get_couple` UUID check, couple membership, 402 passthrough, pagination; window constant and `/ 2`; SQL search_path and FOR ALL couple policy; model allow-list, CORS, rate limit, token cap in `chat.js`; voice origin and proxy path policy; compose ollama port and frontend mount. Survivors: the Content-Length shortcut in `secmw.py` (equivalent: the streamed byte counter catches the same case) and the `/alerts/run` "no key" branch (equivalent: it still fails closed through the key check).

## Files
New: `arya-ai/netguard.py`, `ratelimit.py`, `secmw.py`; `voiceagent/security_policy.py`; `.dockerignore` in `arya-ai`, `alerts`, `gateway`, `voiceagent`; `voiceagent/.gitignore`; the six test files.
Changed: `arya-ai/{server,config,auth}.py`, `data/{cache,market,news,portfolio}.py`, `db/store.py`, `.env.example`; `alerts/{alert-engine,health_score}.py`, `schema.sql`, `.env.example`, `README.md`; `api/chat.js`, `api/README.md`; `supabase/delete_account.sql`; `voiceagent/agent.py`; `docker-compose.yml`; `nginx-gateway.conf`; `tests/test_health_income.py`.
Owner git steps not done by me: `git rm --cached voiceagent/.finos_key.pem voiceagent/.finos_cert.pem voiceagent/.agent.pid voiceagent/.server.pid`, and delete the key pair locally so a new one is generated.

## Commit
```
git add -- arya-ai/netguard.py arya-ai/ratelimit.py arya-ai/secmw.py arya-ai/server.py arya-ai/config.py arya-ai/auth.py \
  arya-ai/data/cache.py arya-ai/data/market.py arya-ai/data/news.py arya-ai/data/portfolio.py arya-ai/db/store.py \
  arya-ai/.env.example arya-ai/.dockerignore alerts/alert-engine.py alerts/health_score.py alerts/schema.sql alerts/.env.example \
  alerts/README.md alerts/.dockerignore gateway/.dockerignore api/chat.js api/README.md supabase/delete_account.sql \
  voiceagent/security_policy.py voiceagent/agent.py voiceagent/.gitignore voiceagent/.dockerignore docker-compose.yml nginx-gateway.conf \
  tests/test_health_income.py tests/test_security_arya.py tests/test_security_alerts.py tests/test_security_sql.py \
  tests/test_security_api_chat.py tests/test_security_voiceagent.py tests/test_security_infra.py docs/agent-notes/backend-security.md
git commit -F - <<'MSG'
Backend security review: authenticated alert engine, SSRF/CORS/rate limits, hardened SQL, calendar-month health score

- alert engine: Supabase session token (or X-Admin-Key) required and bound to user_id on every user route; push endpoints limited
  to real browser push services (SSRF); couple writes need membership; PostgREST filter injection closed; secrets-based invite
  codes; generic 500s; CORS allow-list; metrics labels by route template; 402 no longer turned into 500
- arya-ai: no wildcard CORS with credentials; SSRF guard for read_url; per-route rate limits, body cap, chat concurrency cap;
  cache clear needs an admin token; Kite callback escaped and posts only to trusted origins; input allow-lists; generated
  files deleted after sending; SQL identifier allow-list
- api/chat.js: fixed model, token and size caps, CORS allow-list, no provider error pass-through
- SQL: couple tables read-only via the API, profiles.plan protected by trigger, definer functions pin search_path (pg_temp last)
- compose/nginx: no repo-root mount, Ollama and voice loopback-only, operator routes blocked, tighter CORS and IP headers
- voice agent: WebSocket Origin check, Ollama proxy path/CORS allow-list, audio sniff and size caps, per-machine TLS key
- health score: monthly figures are real calendar-month averages (MONTHLY_WINDOW_MONTHS=3, completed months), transactions
  fetched by date and paged instead of 60 days / 100 rows halved
- tests: 177 new (6 files), mutation-checked

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
MSG
```

## Website now sends the token (Oct 2026)
Item 1 of "Breaking changes" is done on the website side. `js/finos-api.js`: the `alerts` service is `auth: 'required'`; `FinosAPI.request('alerts', ...)` and the new `FinosAPI.alertsFetch(path, init)` take the access token from the existing `FINOS_SB` session (same helper as before) and send `Authorization: Bearer <token>`. With no session they throw `signed_out` and make no call (no bare `user_id` fallback). All former raw `fetch` calls (notification centre, health score, sparkline, benchmark, couple, timeline, report, money-ai, settings) go through it. `voiceagent/index.html` has no Supabase session, so it no longer calls the engine unless `window.FINOS_ALERT_TOKEN` is set. See `docs/agent-notes/alerts-auth-web.md`.
