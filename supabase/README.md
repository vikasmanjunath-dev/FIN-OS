# Supabase schemas

SQL migrations for the cloud tables FIN·OS reads and writes. Run them in the Supabase **SQL Editor** of your project.
Every file in this folder, `../alerts/schema.sql` and `../voiceagent/schema.sql` is idempotent (safe to run more than once, and none of them drops a table or deletes rows) and ends with row-level security so users only see their own rows. `tests/test_sql_safety.py` fails if that stops being true.

| File | What it does | Used by |
| --- | --- | --- |
| `profiles_rls.sql` | **Run first.** Switches row-level security on for `profiles` and (re)creates the "own row only" policy | everything that reads `profiles` |
| `core_tables.sql` | `transactions`, `goals`, `budgets` (+ any missing `profiles` columns), each with RLS | Website (`js/finos-context.js`, Arya, health score) |
| `holdings.sql` | `holdings` — one row per stock / mutual fund / ELSS holding | Mobile app (`mobile/lib/holdingsStore.ts`), website (`js/finos-context.js`), Arya backend (`arya-ai/data/portfolio.py`) |
| `delete_account.sql` | `delete_my_account()` — lets a signed-in person delete their own account from the app. Deleting `auth.users` alone is **not** enough (the alert, push, couple, health-history, memory and log tables have no foreign key to it), so the function deletes the caller's rows from each of those tables explicitly and then the account. Tables that do not exist are skipped. | Mobile app → Privacy & your data → Delete my account |
| `tracker_snapshot.sql` | `tracker_snapshot` — one JSONB blob of all `finos_*` tracker keys per user | Website (`js/finos-tracker-sync.js`) and mobile app (`mobile/lib/trackerSyncStore.ts`) |

## Order and caveats

1. Create a Supabase project and enable email auth. The tables reference `auth.users`.
2. Run `profiles_rls.sql`. Without it, anyone holding the public anon key (it ships in `js/auth.js`) can read every `profiles` row.
3. Run `core_tables.sql`, then `holdings.sql`, then `tracker_snapshot.sql`.
   - `holdings.sql` creates the table if missing, otherwise adds `name`, `sip_monthly`, `updated_at`, and a unique index on
     `(user_id, asset_type, symbol)`. If the index step fails, the table has duplicate rows — merge them, then re-run.
     `asset_type` values written by the app: `equity`, `mutual_fund`, `elss` (symbol = NSE ticker or AMFI scheme code).
4. Run `../alerts/schema.sql` (alert engine, couples, health-score history …) and `../voiceagent/schema.sql` (voice memory). Both are re-runnable;
   `memory_embeddings` needs the `vector` extension enabled first (Database → Extensions).
5. Run `delete_account.sql` **last** (after every table above exists; it also works if run earlier, because it checks for each table when called).
   Without it the app's "Delete my account" shows "not set up on the server yet" and deletes nothing. It is not a data migration: it only
   installs the function, nothing is deleted until a signed-in person calls it for their own account.
6. Put the project URL + anon key in `mobile/.env`, `js/auth.js` and `arya-ai/.env` (restart the Arya backend after editing it).
7. Check from outside the app, with only the anon key, that each table returns `[]` rather than rows:
   `curl "$URL/rest/v1/<table>?select=id" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"`.

## Current status

Checked Oct 11 2026 against the project in `js/auth.js` (`oeapcyucnduhwpgxfknb.supabase.co`): reachable, email + Google auth on, but only
`profiles` (13 rows), `alerts`, `push_subscriptions`, `alert_preferences` and `agent_memories` existed. `transactions`, `goals`, `budgets`,
`holdings`, `tracker_snapshot`, `user_context`, the couple tables, `health_score_history`, `memory_embeddings`, `user_behavior` and `document_ai_log`
did **not**, and **row-level security was off on `profiles`** — all 13 rows were readable with the public anon key. Cause: `alerts/schema.sql` created
a policy on `profiles` but never ran `ENABLE ROW LEVEL SECURITY` (now fixed in that file and in `profiles_rls.sql`; the live project still needs the SQL run).
Until the tables exist, the website and the mobile app fall back to on-device storage and the tracker sync reports the table as missing.

### How `tracker_snapshot` is used
One row per user; `data` is `{ "finos_key": "raw string" }`. The website (`js/finos-tracker-sync.js`) and the mobile app (`mobile/lib/trackerSync.ts`)
both do a three-way merge against it and write with compare-and-set on `updated_at`. Details and the list of keys that never leave a device:
`../docs/MOBILE_APP.md` § Tracker sync.

## Other schemas in the repo
- `../alerts/schema.sql` — alerts, push subscriptions, preferences, couple-planning tables, health-score history, behaviour log, document-AI log, memory embeddings.
- `../TradeJournal/supabase_setup.sql` — TradeBook vault tables (separate Supabase project chosen by the user; see `../TradeJournal/README.md`).
