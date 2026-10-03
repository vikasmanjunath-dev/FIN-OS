# Supabase schemas

SQL migrations for the cloud tables FIN·OS reads and writes. Run them in the Supabase **SQL Editor** of your project.
Both are idempotent-friendly and enable row-level security so users only see their own rows (`auth.uid() = user_id`).

| File | Table | Used by |
| --- | --- | --- |
| `holdings.sql` | `holdings` — one row per stock / mutual fund / ELSS holding | Mobile app (`mobile/lib/holdingsStore.ts`), website (`js/finos-context.js`), Arya backend (`arya-ai/data/portfolio.py`) |
| `tracker_snapshot.sql` | `tracker_snapshot` — one JSONB blob of all `finos_*` tracker keys per user | Website (`js/finos-tracker-sync.js`) |

## Order and caveats

1. Create a Supabase project and enable email auth. Both tables reference `auth.users`.
2. Run `holdings.sql`. It creates the table if missing, otherwise adds `name`, `sip_monthly`, `updated_at`, and a unique index on
   `(user_id, asset_type, symbol)`. If the index step fails, the table has duplicate rows — merge them, then re-run.
   `asset_type` values written by the app: `equity`, `mutual_fund`, `elss` (symbol = NSE ticker or AMFI scheme code).
3. Run `tracker_snapshot.sql` once. It is **not** safe to re-run as written: the `CREATE POLICY` has no `DROP POLICY IF EXISTS`,
   so a second run errors on the existing policy.
4. Put the project URL + anon key in `mobile/.env`, `js/auth.js` and `arya-ai/.env`.

## Current status

The project these files were written for (`oeapcyucnduhwpgxfknb.supabase.co`, still referenced in `js/auth.js` and in a
comment in `tracker_snapshot.sql`) no longer resolves, and neither file has been run on any live project. The website
runs in guest mode until a new project is configured. See `../docs/MOBILE_APP.md` § Known gaps.

## Other schemas in the repo
- `../alerts/schema.sql` — alerts, push subscriptions, preferences, couple-planning tables, health-score history, behaviour log, document-AI log, memory embeddings.
- `../TradeJournal/supabase_setup.sql` — TradeBook vault tables (separate Supabase project chosen by the user; see `../TradeJournal/README.md`).
