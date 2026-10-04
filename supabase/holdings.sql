-- Cloud sync for portfolio holdings (mobile app: mobile/lib/holdingsStore.ts).
--
-- Uses the SAME `holdings` table the website (js/finos-context.js) and the Arya backend
-- (arya-ai/data/portfolio.py) already read — columns user_id, symbol, quantity, avg_price,
-- current_price, asset_type — so a holding added in the app shows up everywhere.
--
-- Purely additive: creates the table only if it doesn't exist, otherwise just adds the new
-- columns. Safe to run more than once. Run it in the Supabase SQL editor for your project.
--
-- asset_type values the app writes: 'equity' (NSE stock), 'mutual_fund', 'elss'.
-- symbol = NSE ticker for equity, AMFI scheme code for mutual funds / ELSS.
-- Rows with any other asset_type (gold, futures, options, …) are never read or modified by the app.

CREATE TABLE IF NOT EXISTS holdings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol        text NOT NULL,
  asset_type    text NOT NULL DEFAULT 'equity',
  quantity      numeric NOT NULL DEFAULT 0,
  avg_price     numeric NOT NULL DEFAULT 0,
  current_price numeric
);

-- New columns used by the app (no-ops if the table already has them)
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS name        text;
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS sip_monthly numeric;
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

-- Needed for upsert(onConflict: user_id,asset_type,symbol). If this statement fails, the table
-- already has duplicate (user_id, asset_type, symbol) rows — merge or delete them, then re-run.
UPDATE holdings SET asset_type = 'equity' WHERE asset_type IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS holdings_user_asset_symbol_uq
  ON holdings (user_id, asset_type, symbol);

-- Row-level security: a user can only see and change their own rows
-- (same idiom as supabase/tracker_snapshot.sql and alerts/schema.sql).
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "holdings_own" ON holdings;
CREATE POLICY "holdings_own" ON holdings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
