-- Core app tables the website reads for cloud features (docs/DATABASE.md "Core App Tables").
--
-- Why this file exists: no CREATE TABLE for these was ever kept in the repo — they were made by hand in the Supabase
-- UI. On Oct 11 2026 the live project had `profiles` but NOT `transactions`, `goals` or `budgets`, so every page
-- that reads them fell back to local storage. Everything here is idempotent (IF NOT EXISTS) and every table gets
-- row-level security with an "own rows only" policy.
--
-- Run order for a fresh project:
--   1. profiles_rls.sql      (urgent: closes the open `profiles` table)
--   2. core_tables.sql       (this file)
--   3. holdings.sql
--   4. tracker_snapshot.sql  (website + mobile tracker sync)
--   5. ../alerts/schema.sql  (alert engine, couples, health-score history, …)
--   6. ../voiceagent/schema.sql if agent_memories is missing

-- ── profiles: add any documented column the existing table lacks (never drops or changes data) ──────────────
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name              text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email                  text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age                    int;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS income_range           text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS life_stage             text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city                   text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS financial_dna          text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mindset                text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS interests              jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_home_loan          boolean;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_car_loan           boolean;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_credit_card_debt   boolean;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_sip                boolean;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_ppf                boolean;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_nps                boolean;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_term_insurance     boolean;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_health_insurance   boolean;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_fund_months  numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fire_number            numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fire_progress          numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monthly_savings        numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS net_worth              numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sip_amount             numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at             timestamptz DEFAULT now();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at             timestamptz DEFAULT now();
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_own" ON profiles;
CREATE POLICY "profiles_own" ON profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ── transactions ────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount     numeric NOT NULL,                      -- always positive
  type       text,                                  -- income | expense
  category   text,
  note       text,
  date       date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_user_date ON transactions (user_id, date DESC);
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "transactions_own" ON transactions;
CREATE POLICY "transactions_own" ON transactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── goals ───────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           text NOT NULL,
  target_amount  numeric,
  current_amount numeric DEFAULT 0,
  target_date    date,
  category       text,                              -- emergency | house | education | retirement | travel | other
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS goals_user ON goals (user_id);
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "goals_own" ON goals;
CREATE POLICY "goals_own" ON goals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── budgets ─────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category   text NOT NULL,
  amount     numeric NOT NULL,
  month      date,                                  -- first day of the budget month
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS budgets_user_month ON budgets (user_id, month);
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "budgets_own" ON budgets;
CREATE POLICY "budgets_own" ON budgets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
